import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PurchaseIntentSchema, OfferSchema, MerchantSchema, MerchantPaymentAccountSchema, OrderSnapshotSchema, createSnapshot, evaluateOffer, fingerprint, recordConsent, transitionOrder, ConsentRecordSchema, canRequestPayment, type EvaluationContext, type OrderSnapshot, type PurchaseIntent, transitionFulfillment,type FulfillmentStatus } from '@agentpay/core';
import type { UnitOfWork, Tx } from '@agentpay/database';
import { CreateIntentSchema, ProposeSchema, CreateOrderSchema } from '@agentpay/contracts';
export type Actor = {role:'BUYER';id:string} | {role:'MERCHANT';id:string};
export class ApiError extends Error { constructor(public status:number,public code:string) { super(code); } }
export interface Result { status:number; body:unknown }
function buyer(actor: Actor) { if (actor.role !== 'BUYER') throw new ApiError(403,'BUYER_REQUIRED'); return actor.id; }
function missing(): never { throw new ApiError(404,'NOT_FOUND'); }
function summary(snapshot: OrderSnapshot) {
  return {environment:snapshot.account.provider==='mock'?'mock':'real',label:snapshot.account.provider==='mock'?'SIMULADO':'REAL',orderId:snapshot.orderId,version:snapshot.version,method:snapshot.method,merchantId:snapshot.merchant.id,
    productId:snapshot.offer.productId,quantity:snapshot.offer.quantity,unit:snapshot.offer.unit,
    amountMinor:snapshot.offer.amountMinor,currency:snapshot.offer.currency,deliveryAt:snapshot.offer.deliveryAt,
    beneficiaryAccountId:snapshot.account.id,beneficiaryDisplayName:snapshot.account.beneficiaryDisplayName,
    reservationValidUntil:snapshot.reservation.validUntil};
}
export class CommerceService {
  constructor(private db: UnitOfWork, private clock:()=>string) {}
  private async expire(tx: Tx, now: Date) {
    const expired = await tx.reservation.findMany({where:{status:'RESERVED',validUntil:{lte:now}}});
    for (const r of expired) {
      await tx.reservation.update({where:{id:r.id},data:{status:'RELEASED'}});
      const order = await tx.order.findUnique({where:{id:r.orderId}});
      if (order) await tx.auditEvent.create({data:{id:randomUUID(),orderId:order.id,actorId:'system',type:'RESERVATION_EXPIRED',data:'{}',createdAt:now}});
    }
  }
  private async ownedIntent(tx: Tx, id:string, actor:Actor) {
    const buyerId=buyer(actor), row=await tx.purchaseIntent.findFirst({where:{id,buyerId}});
    if (!row) missing(); return PurchaseIntentSchema.parse(JSON.parse(row.data));
  }
  private async context(tx:Tx,intent:PurchaseIntent,offerId:string,orderId:string,now:string,method:EvaluationContext['method'],reservationId?:string) {
    const row=await tx.offer.findUnique({where:{id:offerId},include:{merchant:true,account:true,product:true}});
    if (!row) missing();
    const reservations=await tx.reservation.aggregate({where:{productId:row.productId,status:'RESERVED',validUntil:{gt:new Date(now)},...(reservationId?{id:{not:reservationId}}:{})},_sum:{quantity:true}});
    const offer=OfferSchema.parse({id:row.id,version:row.version,merchantId:row.merchantId,productId:row.productId,category:row.category,quantity:row.quantity,unit:row.unit,amountMinor:row.amountMinor,currency:row.currency,stock:Math.max(0,row.product.stock-(reservations._sum.quantity??0)),deliveryAt:row.deliveryAt?.toISOString()??null,validUntil:row.validUntil.toISOString(),beneficiaryAccountId:row.beneficiaryAccountId});
    const merchant=MerchantSchema.parse({id:row.merchant.id,status:row.merchant.status,canFulfill:row.merchant.canFulfill});
    const account=MerchantPaymentAccountSchema.parse({id:row.account.id,merchantId:row.account.merchantId,provider:row.account.provider,providerBankAccountId:row.account.providerBankAccountId,codiStatus:row.account.codiStatus,beneficiaryDisplayName:row.account.beneficiaryDisplayName});
    const b=await tx.buyer.findUnique({where:{id:intent.buyerId}}); if(!b) missing();
    // Controlled merchant reservation, not a claim of external fulfillment integration.
    const existing=reservationId?await tx.reservation.findUnique({where:{id:reservationId}}):null;
    const reservation={id:existing?.id??randomUUID(),orderId,offerId:offer.id,offerVersion:existing?.offerVersion??offer.version,merchantId:offer.merchantId,quantity:existing?.quantity??offer.quantity,validUntil:existing?.validUntil.toISOString()??new Date(new Date(now).getTime()+1800000).toISOString(),status:(existing?.status??'RESERVED') as 'RESERVED'|'RELEASED'};
    const ctx:EvaluationContext={now,orderId,merchant,account,reservation,method,phoneNumber:b.phoneNumber,paymentWindowSeconds:600,reserveMarginSeconds:60,qrAmountMode:'FIXED',hasTip:false};
    return {offer,ctx};
  }
  private async mutate(actor:Actor,route:string,key:string,request:unknown,operation:(tx:Tx,now:string)=>Promise<Result>):Promise<Result> {
    return this.db.write(async tx=>{
      const requestHash=fingerprint(request), actorId=actor.role+':'+actor.id;
      const existing=await tx.idempotencyRecord.findUnique({where:{actorId_route_key:{actorId,route,key}}});
      if(existing){if(existing.requestHash!==requestHash)throw new ApiError(409,'IDEMPOTENCY_CONFLICT');return {status:existing.statusCode,body:JSON.parse(existing.response)};}
      const now=this.clock(); await this.expire(tx,new Date(now));
      const result=await operation(tx,now);
      await tx.idempotencyRecord.create({data:{id:randomUUID(),actorId,route,key,requestHash,response:JSON.stringify(result.body),statusCode:result.status,createdAt:new Date(now)}});
      return result;
    });
  }
  createIntent(actor:Actor,key:string,input:z.infer<typeof CreateIntentSchema>) {
    const buyerId=buyer(actor);
    return this.mutate(actor,'POST /v1/intents',key,input,async(tx)=>{
      if(!await tx.buyer.findUnique({where:{id:buyerId}}))missing();
      const intent=PurchaseIntentSchema.parse({...input,id:randomUUID(),buyerId,version:1});
      await tx.purchaseIntent.create({data:{id:intent.id,buyerId,version:1,data:JSON.stringify(intent)}});
      return {status:201,body:intent};
    });
  }
  getIntent(actor:Actor,id:string){return this.db.read(tx=>this.ownedIntent(tx,id,actor));}
  listOffers(actor:Actor,intentId:string){return this.db.read(async tx=>{await this.ownedIntent(tx,intentId,actor);return tx.offer.findMany({select:{id:true,version:true,merchantId:true,productId:true,quantity:true,unit:true,amountMinor:true,currency:true,deliveryAt:true,validUntil:true},take:100,orderBy:{id:'asc'}});});}
  evaluate(actor:Actor,intentId:string,offerId:string){return this.db.read(async tx=>{const intent=await this.ownedIntent(tx,intentId,actor);const {offer,ctx}=await this.context(tx,intent,offerId,'evaluation-only',this.clock(),'CODI_PUSH');return {...evaluateOffer(intent,offer,ctx),reservation:'HYPOTHETICAL_NOT_RESERVED'};});}
  propose(actor:Actor,intentId:string,key:string,input:z.infer<typeof ProposeSchema>){
    buyer(actor);
    return this.mutate(actor,`POST /v1/intents/${intentId}/proposals`,key,input,async(tx,now)=>{
      const intent=await this.ownedIntent(tx,intentId,actor),orderId=randomUUID(),id=randomUUID();
      if(await tx.order.findUnique({where:{intentId}}))throw new ApiError(409,'INTENT_ALREADY_ORDERED');
      const {offer,ctx}=await this.context(tx,intent,input.offerId,orderId,now,input.method);
      const evaluation=evaluateOffer(intent,offer,ctx);
      const snapshot=evaluation.status==='ELIGIBLE'?createSnapshot(intent,offer,ctx):null;
      await tx.proposal.create({data:{id,intentId,offerId:offer.id,orderId,snapshot:JSON.stringify(snapshot),snapshotHash:snapshot?fingerprint(snapshot):'',createdAt:new Date(now)}});
      await tx.policyEvaluation.create({data:{id:randomUUID(),proposalId:id,result:JSON.stringify(evaluation),createdAt:new Date(now)}});
      if(snapshot)await tx.reservation.create({data:{id:snapshot.reservation.id,proposalId:id,productId:offer.productId,orderId,offerVersion:offer.version,quantity:offer.quantity,status:'RESERVED',validUntil:new Date(snapshot.reservation.validUntil)}});
      return {status:snapshot?201:422,body:{id,evaluation,snapshotHash:snapshot?fingerprint(snapshot):null,snapshot:snapshot?summary(snapshot):null}};
    });
  }
  createOrder(actor:Actor,key:string,input:z.infer<typeof CreateOrderSchema>){
    const buyerId=buyer(actor);
    return this.mutate(actor,'POST /v1/orders',key,input,async(tx,now)=>{
      const proposal=await tx.proposal.findUnique({where:{id:input.proposalId},include:{reservation:true}});
      if(!proposal)missing();
      const intent=await this.ownedIntent(tx,proposal.intentId,actor);
      if(await tx.order.findUnique({where:{proposalId:proposal.id}}))throw new ApiError(409,'PROPOSAL_ALREADY_ORDERED');
      if(await tx.order.findUnique({where:{intentId:intent.id}}))throw new ApiError(409,'INTENT_ALREADY_ORDERED');
      if(!proposal.reservation||!proposal.snapshotHash)throw new ApiError(409,'PROPOSAL_NOT_ELIGIBLE');
      if(input.snapshotHash!==proposal.snapshotHash)throw new ApiError(409,'SNAPSHOT_CHANGED');
      const original=OrderSnapshotSchema.parse(JSON.parse(proposal.snapshot));
      const {offer,ctx}=await this.context(tx,intent,proposal.offerId,proposal.orderId,now,original.method,proposal.reservation.id);
      if(evaluateOffer(intent,offer,ctx).status!=='ELIGIBLE')throw new ApiError(409,'REVALIDATION_FAILED');
      // Stock is a live availability check, not a commercial price term. Preserve signed stock field after verifying live stock.
      const current=createSnapshot(intent,{...offer,stock:original.offer.stock},ctx);
      if(fingerprint(current)!==proposal.snapshotHash)throw new ApiError(409,'SNAPSHOT_CHANGED');
      const consent=recordConsent(current,buyerId,now);
      const status=transitionOrder('AWAITING_BUYER_CONFIRMATION','APPROVE',{snapshot:current,consent,now});
      await tx.order.create({data:{id:proposal.orderId,buyerId,merchantId:offer.merchantId,intentId:intent.id,proposalId:proposal.id,reservationId:proposal.reservation.id,status,createdAt:new Date(now)}});
      await tx.reservation.updateMany({where:{proposal:{intentId:intent.id},orderId:{not:proposal.orderId},status:'RESERVED'},data:{status:'RELEASED'}});
      await tx.orderSnapshot.create({data:{orderId:proposal.orderId,version:current.version,hash:proposal.snapshotHash,data:JSON.stringify(current)}});
      await tx.consentRecord.create({data:{id:randomUUID(),orderId:proposal.orderId,actorId:buyerId,snapshotHash:consent.snapshotHash,acceptedAt:new Date(now),data:JSON.stringify(consent)}});
      await tx.auditEvent.createMany({data:['POLICY_REVALIDATED','RESERVATION_HELD','BUYER_CONSENT_RECORDED','ORDER_APPROVED'].map(type=>({id:randomUUID(),orderId:proposal.orderId,actorId:buyerId,type,data:JSON.stringify({snapshotHash:proposal.snapshotHash,policyVersion:current.policyVersion}),createdAt:new Date(now)}))});
      await tx.outboxEvent.create({data:{id:randomUUID(),orderId:proposal.orderId,type:'ORDER_APPROVED_INTERNAL',payload:JSON.stringify({orderId:proposal.orderId}),createdAt:new Date(now),availableAt:new Date(now)}});
      return {status:201,body:{id:proposal.orderId,status,snapshotHash:proposal.snapshotHash,snapshot:summary(current)}};
    });
  }
  private async ownedOrder(tx:Tx,id:string,actor:Actor){
    const row=await tx.order.findFirst({where:{id,...(actor.role==='BUYER'?{buyerId:actor.id}:{merchantId:actor.id})},include:{snapshot:true}});
    if(!row||!row.snapshot)missing(); return row;
  }
  getOrder(actor:Actor,id:string){return this.db.read(async tx=>{const order=await this.ownedOrder(tx,id,actor);return {id:order.id,status:order.status,snapshotHash:order.snapshot!.hash,snapshot:summary(OrderSnapshotSchema.parse(JSON.parse(order.snapshot!.data)))};});}
  getEvents(actor:Actor,id:string){return this.db.read(async tx=>{await this.ownedOrder(tx,id,actor);const events=await tx.auditEvent.findMany({where:{orderId:id},orderBy:[{createdAt:'asc'},{id:'asc'}],take:100});return events.map(e=>({id:e.id,type:e.type,data:JSON.parse(e.data),createdAt:e.createdAt}));});}
  merchantOrders(actor:Actor,merchantId:string){if(actor.role!=='MERCHANT'||actor.id!==merchantId)throw new ApiError(403,'MERCHANT_REQUIRED');return this.db.read(async tx=>(await tx.order.findMany({where:{merchantId},select:{id:true,status:true,fulfillmentStatus:true,createdAt:true,snapshot:{select:{data:true}}},take:100,orderBy:{createdAt:'desc'}})).map(row=>{const snapshot=row.snapshot?OrderSnapshotSchema.parse(JSON.parse(row.snapshot.data)):null;const simulated=snapshot?.account.provider==='mock';return {id:row.id,status:row.status,fulfillmentStatus:row.fulfillmentStatus,createdAt:row.createdAt,...(snapshot?{productId:snapshot.offer.productId,quantity:snapshot.offer.quantity,unit:snapshot.offer.unit,amountMinor:snapshot.offer.amountMinor,currency:snapshot.offer.currency}:{}),environment:simulated?'mock':'real',label:simulated?'SIMULADO':'REAL'};}));}
  startPreparation(actor:Actor,orderId:string,key:string){
    if(actor.role!=='MERCHANT')throw new ApiError(403,'MERCHANT_REQUIRED');
    return this.mutate(actor,`POST /v1/orders/${orderId}/preparation`,key,{},async(tx,now)=>{
      const order=await this.ownedOrder(tx,orderId,actor);
      const paid=await tx.paymentAttempt.findFirst({where:{orderId,status:'CONFIRMED',resources:{some:{transactions:{some:{status:'PAID'}}}}}});
      if(order.status!=='PAID'||order.fulfillmentStatus!=='READY_FOR_PREPARATION'||!paid)throw new ApiError(409,'CONFIRMED_PAYMENT_REQUIRED');
      const fulfillmentStatus=transitionFulfillment(order.fulfillmentStatus as FulfillmentStatus,'PREPARING','CONFIRMED');
      await tx.order.update({where:{id:orderId},data:{fulfillmentStatus}});
      await tx.auditEvent.create({data:{id:randomUUID(),orderId,actorId:actor.id,type:'MERCHANT_PREPARATION_STARTED',data:JSON.stringify({fulfillmentStatus}),createdAt:new Date(now)}});
      return {status:200,body:{id:orderId,status:order.status,fulfillmentStatus}};
    });
  }
  /** Must be called inside the payment admission transaction with a trusted buyer identity. */
  async revalidateForPayment(tx:Tx,orderId:string,buyerId:string,now:string,hash:string,provider:'mock'|'pey'='mock'){
    const row=await tx.order.findFirst({where:{id:orderId,buyerId},include:{snapshot:true,consent:true}});
    if(!row||!row.snapshot||!row.consent)missing();
    if(row.status!=='APPROVED')throw new ApiError(409,'ORDER_NOT_PAYABLE');
    if(row.snapshot.hash!==hash)throw new ApiError(409,'SNAPSHOT_CHANGED');
    const original=OrderSnapshotSchema.parse(JSON.parse(row.snapshot.data));
    const intent=await this.ownedIntent(tx,row.intentId,{role:'BUYER',id:buyerId});
    const {offer,ctx}=await this.context(tx,intent,original.offer.id,orderId,now,original.method,row.reservationId);
    if(evaluateOffer(intent,offer,ctx).status!=='ELIGIBLE')throw new ApiError(409,'REVALIDATION_FAILED');
    const current=createSnapshot(intent,{...offer,stock:original.offer.stock},ctx);
    const consent=ConsentRecordSchema.parse(JSON.parse(row.consent.data));
    if(fingerprint(current)!==row.snapshot.hash||!canRequestPayment(current,consent,now))throw new ApiError(409,'SNAPSHOT_CHANGED');
    if(current.account.provider!==provider)throw new ApiError(409,'PAYMENT_PROVIDER_MISMATCH');
    return {row,snapshot:current,consent};
  }
  /** Explicit local maintenance, also invoked before writes; no timer or financial action. */
  releaseExpired(){return this.db.write(async tx=>{await this.expire(tx,new Date(this.clock()));});}
}
