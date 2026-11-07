import { randomUUID } from 'node:crypto';
import { OrderSnapshotSchema,fingerprint,transitionOrder,transitionPayment,transitionFulfillment,type PaymentAttemptStatus,type OrderStatus } from '@agentpay/core';
import type { Tx } from '@agentpay/database';
import { ApiError } from './service.js';
export async function confirmPaymentEffect(tx:Tx,input:{attemptId:string;provider:'mock'|'pey';transactionId:string;amountMinor:number;currency:string;codiId:string|null;datePaid?:string|null},now:string):Promise<string>{
 const attempt=await tx.paymentAttempt.findUniqueOrThrow({where:{id:input.attemptId},include:{order:{include:{snapshot:true,reservation:true}}}});
 if(attempt.provider!==input.provider||attempt.method!=='CODI_PUSH')throw new ApiError(409,'PAYMENT_PROVIDER_MISMATCH');
 if(attempt.requestedAmountMinor!==input.amountMinor||attempt.currency!==input.currency)throw new ApiError(409,'PAYMENT_AMOUNT_MISMATCH');
 const previous=await tx.providerTransaction.findUnique({where:{provider_transactionId:{provider:input.provider,transactionId:input.transactionId}},include:{resource:true}});
 if(previous&&previous.resource.attemptId!==attempt.id)throw new ApiError(409,'TRANSACTION_ALREADY_USED');
 if(attempt.status==='CONFIRMED'||previous)return 'ALREADY_CONFIRMED';
 const snapshot=OrderSnapshotSchema.parse(JSON.parse(attempt.order.snapshot!.data));
 if(input.provider==='pey'&&(!attempt.expectedSnapshotHash||fingerprint(snapshot)!==attempt.expectedSnapshotHash))throw new ApiError(409,'SNAPSHOT_EVIDENCE_CONFLICT');
 const reservation=attempt.order.reservation;
 const product=await tx.product.findUniqueOrThrow({where:{id:snapshot.offer.productId}});
 const other=await tx.reservation.aggregate({where:{productId:product.id,id:{not:reservation.id},status:'RESERVED',validUntil:{gt:new Date(now)}},_sum:{quantity:true}});
 const merchant=await tx.merchant.findUniqueOrThrow({where:{id:attempt.order.merchantId}});
 const canFulfill=reservation.status==='RESERVED'&&reservation.validUntil.getTime()>Date.parse(now)&&product.stock-(other._sum.quantity??0)>=snapshot.offer.quantity&&merchant.status==='ACTIVE'&&merchant.canFulfill;
 let resource=await tx.providerResource.findUnique({where:{provider_resourceType_resourceId:{provider:input.provider,resourceType:'PUSH_TRANSACTION',resourceId:input.transactionId}}});
 if(resource&&resource.attemptId!==attempt.id)throw new ApiError(409,'RESOURCE_ALREADY_USED');
 resource??=await tx.providerResource.create({data:{id:randomUUID(),attemptId:attempt.id,provider:input.provider,resourceType:'PUSH_TRANSACTION',resourceId:input.transactionId}});
 await tx.providerTransaction.create({data:{id:randomUUID(),resourceId:resource.id,provider:input.provider,transactionId:input.transactionId,amountMinor:input.amountMinor,currency:input.currency,status:'PAID',datePaid:input.datePaid?new Date(input.datePaid):null}});
 await tx.paymentAttempt.update({where:{id:attempt.id},data:{status:transitionPayment(attempt.status as PaymentAttemptStatus,'CONFIRMED'),activeSlot:null,providerTransactionId:input.transactionId,codiId:input.codiId}});
 const paidStatus=transitionOrder(attempt.order.status as OrderStatus,'PAYMENT_RECONCILED');
 await tx.order.update({where:{id:attempt.orderId},data:{status:canFulfill?paidStatus:transitionOrder(paidStatus,'RAISE_EXCEPTION'),fulfillmentStatus:transitionFulfillment('RESERVED',canFulfill?'READY_FOR_PREPARATION':'FULFILLMENT_EXCEPTION','CONFIRMED')}});
 if(canFulfill){await tx.product.update({where:{id:product.id},data:{stock:{decrement:snapshot.offer.quantity}}});await tx.reservation.update({where:{id:reservation.id},data:{status:'CONSUMED'}});}
 else if(reservation.status==='RESERVED')await tx.reservation.update({where:{id:reservation.id},data:{status:'RELEASED'}});
 const environment=input.provider==='mock'?'mock':'real',prefix=input.provider==='mock'?'MOCK':'PEY',label=input.provider==='mock'?'SIMULADO':'REAL';
 const fulfillment=canFulfill?'READY_FOR_PREPARATION':'FULFILLMENT_EXCEPTION';
 await tx.auditEvent.create({data:{id:randomUUID(),orderId:attempt.orderId,actorId:'payment-service',type:prefix+'_PAYMENT_CONFIRMED',data:JSON.stringify({attemptId:attempt.id,environment,fulfillment}),createdAt:new Date(now)}});
 await tx.outboxEvent.create({data:{id:randomUUID(),orderId:attempt.orderId,type:canFulfill?prefix+'_ORDER_PAID':prefix+'_FULFILLMENT_EXCEPTION',effectKey:input.provider+'-paid:'+input.transactionId,payload:JSON.stringify({orderId:attempt.orderId,environment,label,fulfillmentStatus:fulfillment}),createdAt:new Date(now),availableAt:new Date(now)}});
 return canFulfill?'CONFIRMED':'CONFIRMED_FULFILLMENT_EXCEPTION';
}
