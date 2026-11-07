import { createHash,randomInt,randomUUID } from 'node:crypto';
import { OrderSnapshotSchema,fingerprint,transitionOrder,transitionPayment,type PushSubmission,type PaymentAttemptStatus } from '@agentpay/core';
import { PeyCodiPushGateway,PeyPreflightError,decodePeyPaidPush,type PeyTransaction,type PeyBankAccount } from '@agentpay/integrations';
import type { UnitOfWork,Tx } from '@agentpay/database';
import type { RequestPaymentSchema } from '@agentpay/contracts';
import type { z } from 'zod';
import { ApiError,CommerceService,type Actor,type Result } from './service.js';
import { confirmPaymentEffect } from './settlement.js';
export interface PeyPaymentOptions {gateway:PeyCodiPushGateway;apiKeyId:string;bankAccountId:string;beneficiaryDisplayName:string;buyerPhone:string;dispatchIntervalMs?:number}
export class PeyPaymentService {
 private commerce:CommerceService;
 constructor(private db:UnitOfWork,private clock:()=>string,private config:PeyPaymentOptions){
  this.commerce=new CommerceService(db,clock);
  if(!config.apiKeyId||!config.bankAccountId||!config.beneficiaryDisplayName||!/^\d{10}$/.test(config.buyerPhone))throw new Error('PEY_ACCOUNT_CONFIGURATION_REQUIRED');
 }
 private audit(tx:Tx,orderId:string,type:string,data:unknown){return tx.auditEvent.create({data:{id:randomUUID(),orderId,actorId:'pey-payment-service',type,data:JSON.stringify(data),createdAt:new Date(this.clock())}});}
 private async owned(tx:Tx,actor:Actor,orderId:string){const order=await tx.order.findFirst({where:{id:orderId,...(actor.role==='BUYER'?{buyerId:actor.id}:{merchantId:actor.id})},include:{snapshot:true}});if(!order)throw new ApiError(404,'NOT_FOUND');if(!order.snapshot||OrderSnapshotSchema.parse(JSON.parse(order.snapshot.data)).account.provider!=='pey')throw new ApiError(409,'PAYMENT_PROVIDER_MISMATCH');return order;}
 async recoverUncertain(){await this.db.write(async tx=>{for(const a of await tx.paymentAttempt.findMany({where:{provider:'pey',status:{in:['CREATED','SUBMISSION_PENDING']}}})){await tx.paymentAttempt.update({where:{id:a.id},data:{status:'SUBMISSION_UNKNOWN'}});await this.audit(tx,a.orderId,'PEY_SUBMISSION_UNKNOWN_AFTER_RESTART',{attemptId:a.id,environment:'real'});}});}
 async request(actor:Actor,orderId:string,key:string,input:z.infer<typeof RequestPaymentSchema>):Promise<Result>{
  if(actor.role!=='BUYER')throw new ApiError(403,'BUYER_REQUIRED');
  const prepared=await this.db.write(async tx=>{
   await this.owned(tx,actor,orderId);
   const actorId='BUYER:'+actor.id,route=`POST /v1/orders/${orderId}/payment-requests`,hash=fingerprint(input);
   const old=await tx.idempotencyRecord.findUnique({where:{actorId_route_key:{actorId,route,key}}});
   if(old){if(old.requestHash!==hash)throw new ApiError(409,'IDEMPOTENCY_CONFLICT');return {result:{status:old.statusCode,body:JSON.parse(old.response)},submission:null};}
   if(await tx.paymentAttempt.findFirst({where:{orderId}}))throw new ApiError(409,'PAYMENT_ATTEMPT_EXISTS');
   const now=this.clock(),{snapshot,consent}=await this.commerce.revalidateForPayment(tx,orderId,actor.id,now,input.snapshotHash,'pey');
   if(snapshot.account.providerBankAccountId!==this.config.bankAccountId||snapshot.account.beneficiaryDisplayName!==this.config.beneficiaryDisplayName||snapshot.phoneNumber!==this.config.buyerPhone)throw new ApiError(409,'PEY_ACCOUNT_BINDING_MISMATCH');
   const id=randomUUID();let numRef=String(randomInt(1,10000000));
   for(let i=0;await tx.paymentAttempt.findFirst({where:{numRef,activeSlot:{not:null}}});i++){if(i>=16)throw new ApiError(503,'REFERENCE_UNAVAILABLE');numRef=String(randomInt(1,10000000));}
   const submission:PushSubmission={attemptId:id,orderId,amountMinor:snapshot.offer.amountMinor,currency:'MXN',beneficiaryAccountId:snapshot.account.id,apiKeyId:this.config.apiKeyId,numRef,phoneNumber:snapshot.phoneNumber,providerBankAccountId:this.config.bankAccountId,beneficiaryDisplayName:this.config.beneficiaryDisplayName,expirationSeconds:snapshot.paymentWindowSeconds,snapshotHash:input.snapshotHash};
   try{this.config.gateway.assertAuthorized(submission);}catch{throw new ApiError(403,'REAL_PAYMENT_NOT_AUTHORIZED');}
   await tx.paymentAttempt.create({data:{id,orderId,method:'CODI_PUSH',provider:'pey',requestedAmountMinor:submission.amountMinor,currency:'MXN',status:'SUBMISSION_PENDING',activeSlot:orderId,idempotencyKey:fingerprint({actorId,route,key}),apiKeyId:this.config.apiKeyId,beneficiaryAccountId:snapshot.account.id,providerBankAccountId:this.config.bankAccountId,expectedSnapshotHash:input.snapshotHash,numRef,expiresAt:new Date(Date.parse(now)+snapshot.paymentWindowSeconds*1000),createdAt:new Date(now)}});
   await tx.order.update({where:{id:orderId},data:{status:transitionOrder('APPROVED','REQUEST_RECORDED',{snapshot,consent,now})}});
   await this.audit(tx,orderId,'PEY_PAYMENT_REQUEST_RECORDED',{attemptId:id,environment:'real',authorizationId:this.config.gateway.grant!.id});
   const result={status:202,body:{id,orderId,environment:'real',label:'REAL',statusUrl:`/v1/orders/${orderId}/payments`}};
   await tx.idempotencyRecord.create({data:{id:randomUUID(),actorId,route,key,requestHash:hash,response:JSON.stringify(result.body),statusCode:202,createdAt:new Date(now)}});
   return {result,submission};
  });
  if(!prepared.submission)return prepared.result;
  const submission=prepared.submission;
  try{
   const receipt=await this.config.gateway.submit(submission);
   await this.db.write(async tx=>{
    const a=await tx.paymentAttempt.findUniqueOrThrow({where:{id:submission.attemptId}});
    if(a.status==='CONFIRMED'){
     if(a.providerTransactionId===receipt.transactionId&&!a.codiId)await tx.paymentAttempt.update({where:{id:a.id},data:{codiId:receipt.codiId}});
     if(a.providerTransactionId!==receipt.transactionId)await this.audit(tx,a.orderId,'PEY_RECEIPT_CONFLICT',{attemptId:a.id,environment:'real'});
     return;
    }
    if(a.providerTransactionId&&a.providerTransactionId!==receipt.transactionId)throw new Error('RECEIPT_CONFLICT');
    await tx.paymentAttempt.update({where:{id:a.id},data:{providerTransactionId:receipt.transactionId,codiId:receipt.codiId,...(a.status==='SUBMISSION_PENDING'?{status:transitionPayment(transitionPayment('SUBMISSION_PENDING','SUBMITTED'),'PAYMENT_PENDING')}:{})}});
    const resource=await tx.providerResource.findUnique({where:{provider_resourceType_resourceId:{provider:'pey',resourceType:'PUSH_TRANSACTION',resourceId:receipt.transactionId}}});
    if(resource&&resource.attemptId!==a.id)throw new Error('RESOURCE_CONFLICT');
    if(!resource)await tx.providerResource.create({data:{id:randomUUID(),attemptId:a.id,provider:'pey',resourceType:'PUSH_TRANSACTION',resourceId:receipt.transactionId}});
   });
  }catch(error){
   await this.db.write(async tx=>{
    const a=await tx.paymentAttempt.findUniqueOrThrow({where:{id:submission.attemptId}});if(a.status!=='SUBMISSION_PENDING')return;
    if(error instanceof PeyPreflightError){await tx.paymentAttempt.update({where:{id:a.id},data:{status:transitionPayment('SUBMISSION_PENDING','CANCELLED_LOCALLY'),activeSlot:null}});await tx.order.update({where:{id:a.orderId},data:{status:'EXCEPTION'}});await tx.reservation.updateMany({where:{orderId:a.orderId,status:'RESERVED'},data:{status:'RELEASED'}});await this.audit(tx,a.orderId,'PEY_NOT_SUBMITTED',{attemptId:a.id,environment:'real',reason:error.code});}
    else{await tx.paymentAttempt.update({where:{id:a.id},data:{status:'SUBMISSION_UNKNOWN'}});await this.audit(tx,a.orderId,'PEY_SUBMISSION_UNKNOWN',{attemptId:a.id,environment:'real'});}
   });
  }
  return prepared.result;
 }
 list(actor:Actor,orderId:string){return this.db.read(async tx=>{const order=await this.owned(tx,actor,orderId);return {environment:'real',label:'REAL',orderStatus:order.status,fulfillmentStatus:order.fulfillmentStatus,attempts:(await tx.paymentAttempt.findMany({where:{orderId,provider:'pey'},orderBy:{createdAt:'asc'}})).map(a=>({id:a.id,status:a.status,amountMinor:a.requestedAmountMinor,currency:a.currency,expiresAt:a.expiresAt}))};});}
 /** Only a verified, encrypted inbox record or authenticated GET may enter reconciliation. */
 async reconcileVerifiedPush(raw:Buffer,deliveryId:string){
  let wire:ReturnType<typeof decodePeyPaidPush>;try{wire=decodePeyPaidPush(raw.toString('utf8'));}catch{return {outcome:'INVALID_EVENT'};}
  const ext=wire.metadata.externalMetadata,payloadHash=createHash('sha256').update(raw).digest('hex');
  return this.db.write(async tx=>{
   const previous=await tx.paymentEvent.findUnique({where:{provider_deliveryId:{provider:'pey',deliveryId}}});
   if(previous){if(previous.payloadHash!==payloadHash)throw new ApiError(409,'EVENT_ID_CONFLICT');return {outcome:previous.outcome,duplicate:true};}
   const a=await tx.paymentAttempt.findFirst({where:{id:ext.paymentAttemptId,provider:'pey'}});
   if(!a)return {outcome:'UNMATCHED'};
   const reasons:string[]=[];
   if(a.currency!=='MXN')reasons.push('CURRENCY_MISMATCH');
   if(a.method!=='CODI_PUSH')reasons.push('METHOD_MISMATCH');
   if(a.orderId!==ext.orderId)reasons.push('ORDER_MISMATCH');
   if(wire.apiKeyId!==a.apiKeyId||wire.apiKeyId!==this.config.apiKeyId)reasons.push('API_KEY_MISMATCH');
   if(wire.bankAccountId!==a.providerBankAccountId||wire.bankAccountId!==this.config.bankAccountId)reasons.push('BENEFICIARY_MISMATCH');
   if(wire.numRef!==a.numRef)reasons.push('REFERENCE_MISMATCH');
   if(wire.amount!==a.requestedAmountMinor)reasons.push('AMOUNT_MISMATCH');
   if(a.providerTransactionId&&a.providerTransactionId!==wire.transactionId)reasons.push('TRANSACTION_MISMATCH');
   if(wire.datePaid*1000<Math.floor(a.createdAt.getTime()/1000)*1000||wire.datePaid*1000>Date.parse(this.clock())+300000)reasons.push('PAYMENT_DATE_MISMATCH');
   if(!['SUBMISSION_PENDING','SUBMISSION_UNKNOWN','SUBMITTED','PAYMENT_PENDING','RECONCILIATION_EXCEPTION','CONFIRMED'].includes(a.status))reasons.push('ATTEMPT_NOT_SUBMITTED');
   return this.apply(tx,a.id,deliveryId,payloadHash,wire.transactionId,wire.amount,wire.datePaid,reasons,'WEBHOOK');
  });
 }
 private async apply(tx:Tx,attemptId:string,deliveryId:string,payloadHash:string,transactionId:string,amountMinor:number,datePaid:number,reasons:string[],source:'WEBHOOK'|'QUERY'){
  const a=await tx.paymentAttempt.findUniqueOrThrow({where:{id:attemptId}});let outcome:string;
  if(reasons.length){
   outcome='RECONCILIATION_EXCEPTION';
   if(a.status!=='CONFIRMED'&&a.status!=='CANCELLED_LOCALLY'){
    await tx.paymentAttempt.update({where:{id:a.id},data:{status:a.status==='RECONCILIATION_EXCEPTION'?a.status:transitionPayment(a.status as PaymentAttemptStatus,'RECONCILIATION_EXCEPTION')}});await tx.order.update({where:{id:a.orderId},data:{status:'EXCEPTION'}});
   }
   await this.audit(tx,a.orderId,'PEY_RECONCILIATION_EXCEPTION',{attemptId:a.id,reasons,environment:'real',source});
  }else{outcome=await confirmPaymentEffect(tx,{attemptId:a.id,provider:'pey',transactionId,amountMinor,currency:'MXN',codiId:a.codiId,datePaid:new Date(datePaid*1000).toISOString()},this.clock());}
  await tx.paymentEvent.create({data:{id:randomUUID(),attemptId:a.id,provider:'pey',deliveryId,payloadHash,type:source==='WEBHOOK'?'codi.pn.payment_received':'pey.transaction.query',outcome,createdAt:new Date(this.clock())}});
  return {outcome,duplicate:false};
 }
 async poll(actor:Actor,orderId:string){
  const attempts=await this.db.read(async tx=>{await this.owned(tx,actor,orderId);return tx.paymentAttempt.findMany({where:{orderId,provider:'pey',providerTransactionId:{not:null}}});});
  for(const a of attempts){
   let result:PeyTransaction,bank:PeyBankAccount;
   try{result=await this.config.gateway.getTransaction(a.providerTransactionId!);if(result.status!=='PAID')continue;bank=await this.config.gateway.getBankAccount(a.providerBankAccountId!);}catch{throw new ApiError(503,'PEY_TRANSACTION_UNAVAILABLE');}
   const reasons:string[]=[];
   if(a.currency!=='MXN')reasons.push('CURRENCY_MISMATCH');
   if(a.method!=='CODI_PUSH')reasons.push('METHOD_MISMATCH');
   if(result.metadata.externalMetadata.orderId!==a.orderId||result.metadata.externalMetadata.paymentAttemptId!==a.id)reasons.push('METADATA_MISMATCH');
   if(result.metadata.clabe!==bank.clabe||bank.id!==a.providerBankAccountId||bank.id!==this.config.bankAccountId||bank.name!==this.config.beneficiaryDisplayName)reasons.push('BENEFICIARY_MISMATCH');
   if(result.amount!==a.requestedAmountMinor||(result.amountBreakdown?.base!==undefined&&result.amountBreakdown.base!==a.requestedAmountMinor)||(result.amountBreakdown?.fee??0)!==0||(result.amountBreakdown?.tip??0)!==0||(result.applicationFee??0)!==0)reasons.push('AMOUNT_MISMATCH');
   if(a.apiKeyId!==this.config.apiKeyId)reasons.push('API_KEY_MISMATCH');
   if(result.datePaid===undefined||result.datePaid*1000<Math.floor(a.createdAt.getTime()/1000)*1000||result.datePaid*1000>Date.parse(this.clock())+300000)reasons.push('PAYMENT_DATE_MISMATCH');
   const payloadHash=fingerprint({id:result.id,status:result.status,amount:result.amount,metadata:result.metadata.externalMetadata,datePaid:result.datePaid??null,bankId:bank.id,reasons});
   const deliveryId='query-'+payloadHash;
   await this.db.write(async tx=>{
    if(await tx.paymentEvent.findUnique({where:{provider_deliveryId:{provider:'pey',deliveryId}}}))return;
    const current=await tx.paymentAttempt.findUniqueOrThrow({where:{id:a.id}});
    if(!['SUBMISSION_PENDING','SUBMISSION_UNKNOWN','SUBMITTED','PAYMENT_PENDING','RECONCILIATION_EXCEPTION','CONFIRMED'].includes(current.status))return;
    await this.apply(tx,a.id,deliveryId,payloadHash,result.id,result.amount,result.datePaid??0,reasons,'QUERY');
   });
  }
  return this.list(actor,orderId);
 }
}
