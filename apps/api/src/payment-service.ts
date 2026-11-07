import { createHash, randomInt, randomUUID } from 'node:crypto';
import { OrderSnapshotSchema, fingerprint, minorToMxn, reconcileNotice, transitionOrder, transitionPayment, transitionFulfillment, type PaymentAttemptStatus, type OrderStatus, type PushSubmission } from '@agentpay/core';
import type { UnitOfWork, Tx } from '@agentpay/database';
import { MockCodiPushGateway, signMockEvent, verifyMockEvent, MockSignatureError, type MockWireNotice } from '@agentpay/integrations';
import type { RequestPaymentSchema } from '@agentpay/contracts';
import type { z } from 'zod';
import { ApiError, CommerceService, type Actor, type Result } from './service.js';
export interface MockPaymentOptions { gateway:MockCodiPushGateway;webhookSecret:string;apiKeyId:string;controlToken?:string;dispatchIntervalMs?:number }
export class PaymentService {
  private commerce:CommerceService;
  constructor(private db:UnitOfWork,private clock:()=>string,private config:MockPaymentOptions){this.commerce=new CommerceService(db,clock);}
  async recoverUncertain(){
    await this.db.write(async tx=>{
      const attempts=await tx.paymentAttempt.findMany({where:{provider:'mock',status:{in:['CREATED','SUBMISSION_PENDING']}}});
      for(const a of attempts){await tx.paymentAttempt.update({where:{id:a.id},data:{status:'SUBMISSION_UNKNOWN'}});await this.audit(tx,a.orderId,'MOCK_SUBMISSION_UNKNOWN_AFTER_RESTART',{attemptId:a.id,environment:'mock'});}
    });
  }
  private audit(tx:Tx,orderId:string,type:string,data:unknown){return tx.auditEvent.create({data:{id:randomUUID(),orderId,actorId:'payment-service',type,data:JSON.stringify(data),createdAt:new Date(this.clock())}});}
  async request(actor:Actor,orderId:string,key:string,input:z.infer<typeof RequestPaymentSchema>):Promise<Result>{
    if(actor.role!=='BUYER')throw new ApiError(403,'BUYER_REQUIRED');
    const prepared=await this.db.write(async tx=>{
      if(!await tx.order.findFirst({where:{id:orderId,buyerId:actor.id}}))throw new ApiError(404,'NOT_FOUND');
      const actorId='BUYER:'+actor.id,route=`POST /v1/orders/${orderId}/payment-requests`,hash=fingerprint(input);
      const old=await tx.idempotencyRecord.findUnique({where:{actorId_route_key:{actorId,route,key}}});
      if(old){if(old.requestHash!==hash)throw new ApiError(409,'IDEMPOTENCY_CONFLICT');return {result:{status:old.statusCode,body:JSON.parse(old.response)},submission:null};}
      if(await tx.paymentAttempt.findFirst({where:{orderId}}))throw new ApiError(409,'PAYMENT_ATTEMPT_EXISTS');
      const now=this.clock();const {snapshot,consent}=await this.commerce.revalidateForPayment(tx,orderId,actor.id,now,input.snapshotHash);
      const id=randomUUID();let numRef=String(randomInt(1,10000000));
      for(let i=0;await tx.paymentAttempt.findFirst({where:{numRef,activeSlot:{not:null}}});i++){if(i>=16)throw new ApiError(503,'REFERENCE_UNAVAILABLE');numRef=String(randomInt(1,10000000));}
      await tx.paymentAttempt.create({data:{id,orderId,method:'CODI_PUSH',provider:'mock',requestedAmountMinor:snapshot.offer.amountMinor,currency:'MXN',status:'SUBMISSION_PENDING',activeSlot:orderId,idempotencyKey:fingerprint({actorId,route,key}),apiKeyId:this.config.apiKeyId,beneficiaryAccountId:snapshot.account.id,numRef,expiresAt:new Date(Date.parse(now)+snapshot.paymentWindowSeconds*1000),createdAt:new Date(now)}});
      const status=transitionOrder('APPROVED','REQUEST_RECORDED',{snapshot,consent,now});await tx.order.update({where:{id:orderId},data:{status}});
      await this.audit(tx,orderId,'MOCK_PAYMENT_REQUEST_RECORDED',{attemptId:id,environment:'mock'});
      const result={status:202,body:{id,orderId,environment:'mock',label:'SIMULADO',statusUrl:`/v1/orders/${orderId}/payments`}};
      await tx.idempotencyRecord.create({data:{id:randomUUID(),actorId,route,key,requestHash:hash,response:JSON.stringify(result.body),statusCode:202,createdAt:new Date(now)}});
      const submission:PushSubmission={attemptId:id,orderId,amountMinor:snapshot.offer.amountMinor,currency:'MXN',beneficiaryAccountId:snapshot.account.id,apiKeyId:this.config.apiKeyId,numRef,phoneNumber:snapshot.phoneNumber};
      return {result,submission};
    });
    if(!prepared.submission)return prepared.result;
    const inputForGateway=prepared.submission;
    try{
      const receipt=await this.config.gateway.submit(inputForGateway);
      await this.db.write(async tx=>{
        const attempt=await tx.paymentAttempt.findUniqueOrThrow({where:{id:inputForGateway.attemptId}});
        // A webhook may have confirmed while the submission response was in flight.
        if(attempt.status==='CONFIRMED')return;
        if(attempt.status!=='SUBMISSION_PENDING')return;
        const submitted=transitionPayment('SUBMISSION_PENDING','SUBMITTED');
        const pending=transitionPayment(submitted,'PAYMENT_PENDING');
        await tx.paymentAttempt.update({where:{id:attempt.id},data:{status:pending,providerTransactionId:receipt.transactionId,codiId:receipt.codiId}});
        await tx.providerResource.create({data:{id:randomUUID(),attemptId:attempt.id,provider:'mock',resourceType:'PUSH_TRANSACTION',resourceId:receipt.transactionId}});
      });
    }catch{
      await this.db.write(async tx=>{
        const attempt=await tx.paymentAttempt.findUniqueOrThrow({where:{id:inputForGateway.attemptId}});
        if(attempt.status==='SUBMISSION_PENDING'){await tx.paymentAttempt.update({where:{id:attempt.id},data:{status:transitionPayment('SUBMISSION_PENDING','SUBMISSION_UNKNOWN')}});await this.audit(tx,attempt.orderId,'MOCK_SUBMISSION_UNKNOWN',{attemptId:attempt.id,environment:'mock'});}
      });
    }
    return prepared.result;
  }
  private async owned(tx:Tx,actor:Actor,orderId:string){
    const order=await tx.order.findFirst({where:{id:orderId,...(actor.role==='BUYER'?{buyerId:actor.id}:{merchantId:actor.id})}});if(!order)throw new ApiError(404,'NOT_FOUND');return order;
  }
  list(actor:Actor,orderId:string){return this.db.read(async tx=>{const order=await this.owned(tx,actor,orderId);const rows=await tx.paymentAttempt.findMany({where:{orderId},orderBy:{createdAt:'asc'}});return {environment:'mock',label:'SIMULADO',orderStatus:order.status,fulfillmentStatus:order.fulfillmentStatus,attempts:rows.map(a=>({id:a.id,status:a.status,method:a.method,amountMinor:a.requestedAmountMinor,currency:a.currency,expiresAt:a.expiresAt,createdAt:a.createdAt}))};});}
  async receive(raw:Buffer,headers:Record<string,unknown>){
    let verified:ReturnType<typeof verifyMockEvent>;
    try{verified=verifyMockEvent(raw,headers,this.config.webhookSecret,this.clock());}catch(err){if(err instanceof MockSignatureError)throw new ApiError(401,'INVALID_MOCK_SIGNATURE');throw new ApiError(400,'INVALID_MOCK_EVENT');}
    const {deliveryId,notice}=verified,payloadHash=createHash('sha256').update(raw).digest('hex');
    return this.db.write(async tx=>{
      const existing=await tx.paymentEvent.findUnique({where:{provider_deliveryId:{provider:'mock',deliveryId}}});
      if(existing){if(existing.payloadHash!==payloadHash)throw new ApiError(409,'EVENT_ID_CONFLICT');return {environment:'mock',outcome:existing.outcome,duplicate:true};}
      const attempt=await tx.paymentAttempt.findUnique({where:{id:notice.attemptId},include:{order:{include:{snapshot:true,reservation:true}},mockSubmissions:true}});
      if(!attempt||attempt.provider!=='mock')throw new ApiError(404,'NOT_FOUND');
      const ledger=attempt.mockSubmissions.length===1?attempt.mockSubmissions[0]:null;
      const comparison=reconcileNotice({attemptId:attempt.id,orderId:attempt.orderId,amountMinor:attempt.requestedAmountMinor,currency:attempt.currency,beneficiaryAccountId:attempt.beneficiaryAccountId??'',apiKeyId:attempt.apiKeyId??'',numRef:attempt.numRef??'',transactionId:attempt.providerTransactionId??ledger?.transactionId??''},notice);
      if(!ledger||ledger.transactionId!==notice.transactionId)comparison.reasons.push('UNVERIFIED_MOCK_TRANSACTION');
      if(notice.type==='mock.codi.push.paid'&&notice.datePaid&&Date.parse(notice.datePaid)<attempt.createdAt.getTime())comparison.reasons.push('PAYMENT_BEFORE_ATTEMPT');
      const paid=notice.type==='mock.codi.push.paid';
      let outcome='UNCONFIRMED';
      if(comparison.reasons.length){
        outcome='RECONCILIATION_EXCEPTION';
        if(attempt.status!=='CONFIRMED'){
          await tx.paymentAttempt.update({where:{id:attempt.id},data:{status:attempt.status==='RECONCILIATION_EXCEPTION'?'RECONCILIATION_EXCEPTION':transitionPayment(attempt.status as PaymentAttemptStatus,'RECONCILIATION_EXCEPTION')}});
          await tx.order.update({where:{id:attempt.orderId},data:{status:'EXCEPTION'}});
        }
        await this.audit(tx,attempt.orderId,'MOCK_RECONCILIATION_EXCEPTION',{attemptId:attempt.id,reasons:comparison.reasons,environment:'mock'});
      }else if(paid){
        const previous=await tx.providerTransaction.findUnique({where:{provider_transactionId:{provider:'mock',transactionId:notice.transactionId}},include:{resource:true}});
        if(previous&&previous.resource.attemptId!==attempt.id)throw new ApiError(409,'TRANSACTION_ALREADY_USED');
        if(attempt.status==='CONFIRMED'||previous){outcome='ALREADY_CONFIRMED';}
        else{
          const snapshot=OrderSnapshotSchema.parse(JSON.parse(attempt.order.snapshot!.data));
          const reservation=attempt.order.reservation;
          const product=await tx.product.findUniqueOrThrow({where:{id:snapshot.offer.productId}});
          const other=await tx.reservation.aggregate({where:{productId:product.id,id:{not:reservation.id},status:'RESERVED',validUntil:{gt:new Date(this.clock())}},_sum:{quantity:true}});
          const merchant=await tx.merchant.findUniqueOrThrow({where:{id:attempt.order.merchantId}});
          const canFulfill=reservation.status==='RESERVED'&&reservation.validUntil.getTime()>Date.parse(this.clock())&&product.stock-(other._sum.quantity??0)>=snapshot.offer.quantity&&merchant.status==='ACTIVE'&&merchant.canFulfill;
          let resource=await tx.providerResource.findUnique({where:{provider_resourceType_resourceId:{provider:'mock',resourceType:'PUSH_TRANSACTION',resourceId:notice.transactionId}}});
          if(resource&&resource.attemptId!==attempt.id)throw new ApiError(409,'RESOURCE_ALREADY_USED');
          resource??=await tx.providerResource.create({data:{id:randomUUID(),attemptId:attempt.id,provider:'mock',resourceType:'PUSH_TRANSACTION',resourceId:notice.transactionId}});
          await tx.providerTransaction.create({data:{id:randomUUID(),resourceId:resource.id,provider:'mock',transactionId:notice.transactionId,amountMinor:notice.amountMinor,currency:notice.currency,status:'PAID'}});
          await tx.paymentAttempt.update({where:{id:attempt.id},data:{status:transitionPayment(attempt.status as PaymentAttemptStatus,'CONFIRMED'),activeSlot:null,providerTransactionId:notice.transactionId,codiId:ledger!.codiId}});
          const paidStatus=transitionOrder(attempt.order.status as OrderStatus,'PAYMENT_RECONCILED');
          const orderStatus=canFulfill?paidStatus:transitionOrder(paidStatus,'RAISE_EXCEPTION');
          await tx.order.update({where:{id:attempt.orderId},data:{status:orderStatus,fulfillmentStatus:transitionFulfillment('RESERVED',canFulfill?'READY_FOR_PREPARATION':'FULFILLMENT_EXCEPTION','CONFIRMED')}});
          if(canFulfill){await tx.product.update({where:{id:product.id},data:{stock:{decrement:snapshot.offer.quantity}}});await tx.reservation.update({where:{id:reservation.id},data:{status:'CONSUMED'}});}
          else if(reservation.status==='RESERVED')await tx.reservation.update({where:{id:reservation.id},data:{status:'RELEASED'}});
          outcome=canFulfill?'CONFIRMED':'CONFIRMED_FULFILLMENT_EXCEPTION';
          await this.audit(tx,attempt.orderId,'MOCK_PAYMENT_CONFIRMED',{attemptId:attempt.id,environment:'mock',fulfillment:canFulfill?'READY_FOR_PREPARATION':'FULFILLMENT_EXCEPTION'});
          await tx.outboxEvent.create({data:{id:randomUUID(),orderId:attempt.orderId,type:canFulfill?'MOCK_ORDER_PAID':'MOCK_FULFILLMENT_EXCEPTION',effectKey:'mock-paid:'+notice.transactionId,payload:JSON.stringify({orderId:attempt.orderId,environment:'mock',label:'SIMULADO',fulfillmentStatus:canFulfill?'READY_FOR_PREPARATION':'FULFILLMENT_EXCEPTION'}),createdAt:new Date(this.clock()),availableAt:new Date(this.clock())}});
        }
      }else{outcome=attempt.status==='CONFIRMED'?'IGNORED_UNCONFIRMED':'UNCONFIRMED';await this.audit(tx,attempt.orderId,'MOCK_PAYMENT_UNCONFIRMED',{attemptId:attempt.id,environment:'mock'});}
      await tx.paymentEvent.create({data:{id:randomUUID(),attemptId:attempt.id,provider:'mock',deliveryId,payloadHash,type:notice.type,outcome,createdAt:new Date(this.clock())}});
      return {environment:'mock',label:'SIMULADO',outcome,duplicate:false};
    });
  }
  async simulate(attemptId:string,paid:boolean){
    let wire:MockWireNotice;try{wire=await this.config.gateway.notice(attemptId,paid);}catch{throw new ApiError(409,'MOCK_SUBMISSION_UNAVAILABLE');}
    const raw=Buffer.from(JSON.stringify(wire)),deliveryId='mock-event-'+randomUUID();
    return this.receive(raw,signMockEvent(raw,this.config.webhookSecret,deliveryId,String(Math.floor(Date.parse(this.clock())/1000))));
  }
  async poll(actor:Actor,orderId:string){
    const ledger=await this.db.read(async tx=>{await this.owned(tx,actor,orderId);return tx.mockSubmission.findMany({where:{orderId,status:'PAID'}});});
    for(const row of ledger){
      const wire:MockWireNotice={environment:'mock',type:'mock.codi.push.paid',attemptId:row.attemptId,orderId:row.orderId,amount:minorToMxn(row.amountMinor),currency:row.currency,beneficiaryAccountId:row.beneficiaryAccountId,apiKeyId:row.apiKeyId,numRef:row.numRef,transactionId:row.transactionId,datePaid:row.datePaid!.toISOString()};
      const raw=Buffer.from(JSON.stringify(wire)),deliveryId='mock-event-poll-'+fingerprint(wire);
      await this.receive(raw,signMockEvent(raw,this.config.webhookSecret,deliveryId,String(Math.floor(Date.parse(this.clock())/1000))));
    }
    return this.list(actor,orderId);
  }
}
