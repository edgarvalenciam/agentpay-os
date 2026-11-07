import { randomUUID } from 'node:crypto';
import { openPeyPayload } from '@agentpay/integrations';
import type { UnitOfWork } from '@agentpay/database';
import type { PeyPaymentService } from './pey-payment-service.js';
/** Cross-DB delivery: commit business effects once, then acknowledge inbox; replay is deduplicated in the business DB. */
export class PeyInboxProcessor {
 constructor(private inbox:UnitOfWork,private payments:PeyPaymentService,private getEncryptionKey:()=>Promise<Buffer>,private clock:()=>string,private afterApplied?:()=>Promise<void>){}
 async processOne(){
  const token=randomUUID(),now=new Date(this.clock());
  const row=await this.inbox.write(async tx=>{
   const next=await tx.peyWebhookInbox.findFirst({where:{OR:[{status:'VERIFIED_PENDING_RECONCILIATION'},{status:'RETRY',nextAttemptAt:{lte:now}},{status:'PROCESSING',leaseUntil:{lte:now}}]},orderBy:{receivedAt:'asc'}});
   if(!next)return null;
   return tx.peyWebhookInbox.update({where:{id:next.id},data:{status:'PROCESSING',leaseUntil:new Date(now.getTime()+30000),leaseToken:token,processingAttempts:{increment:1}}});
  });
  if(!row)return {processed:false};
  try{
   const raw=openPeyPayload(row,await this.getEncryptionKey());
   const result=row.eventType==='codi.pn.payment_received'?await this.payments.reconcileVerifiedPush(raw,row.deliveryId):{outcome:'IGNORED_UNSUPPORTED'};
   await this.afterApplied?.();
   const status=['CONFIRMED','ALREADY_CONFIRMED','CONFIRMED_FULFILLMENT_EXCEPTION'].includes(result.outcome)?'PROCESSED':result.outcome;
   await this.inbox.write(tx=>tx.peyWebhookInbox.updateMany({where:{id:row.id,leaseToken:token},data:{status,processedAt:new Date(this.clock()),leaseToken:null,leaseUntil:null,lastError:null}}));
   return {processed:true,outcome:result.outcome};
  }catch{
   await this.inbox.write(tx=>tx.peyWebhookInbox.updateMany({where:{id:row.id,leaseToken:token},data:{status:'RETRY',leaseToken:null,leaseUntil:null,lastError:'PROCESSING_FAILED',nextAttemptAt:new Date(Date.parse(this.clock())+Math.min(60,2**Math.min(row.processingAttempts,6))*1000)}}));
   return {processed:true,outcome:'RETRY'};
  }
 }
 async drain(limit=100){let count=0;for(;count<limit;count++){if(!(await this.processOne()).processed)break;}return {processed:count};}
}
