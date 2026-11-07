import { randomUUID } from 'node:crypto';
import type { UnitOfWork } from '@agentpay/database';
/** A local durable inbox simulates merchant delivery. No email, HTTP or third-party messaging. */
export class OutboxDispatcher {
  constructor(private db:UnitOfWork,private clock:()=>string,private afterDelivery?:()=>Promise<void>){}
  async dispatchOne(){
    const token=randomUUID();
    const event=await this.db.write(async tx=>{
      const now=new Date(this.clock());
      const row=await tx.outboxEvent.findFirst({where:{OR:[{status:'PENDING',availableAt:{lte:now}},{status:'PROCESSING',leaseUntil:{lte:now}}]},orderBy:[{createdAt:'asc'},{id:'asc'}]});
      if(!row)return null;
      return tx.outboxEvent.update({where:{id:row.id},data:{status:'PROCESSING',attempts:{increment:1},leaseToken:token,leaseUntil:new Date(now.getTime()+30000)}});
    });
    if(!event)return {processed:false};
    try{
      if(event.type==='MOCK_ORDER_PAID'||event.type==='MOCK_FULFILLMENT_EXCEPTION'){
        await this.db.write(async tx=>{
          const order=await tx.order.findUniqueOrThrow({where:{id:event.orderId}});
          const previous=await tx.merchantNotification.findUnique({where:{eventId:event.id}});
          if(!previous)await tx.merchantNotification.create({data:{id:randomUUID(),eventId:event.id,orderId:order.id,merchantId:order.merchantId,type:event.type,payload:event.payload,createdAt:new Date(this.clock())}});
        });
        await this.afterDelivery?.();
      }else if(event.type!=='ORDER_APPROVED_INTERNAL')throw new Error('UNSUPPORTED_OUTBOX_EVENT');
      await this.db.write(tx=>tx.outboxEvent.updateMany({where:{id:event.id,leaseToken:token},data:{status:'DELIVERED',deliveredAt:new Date(this.clock()),leaseToken:null,leaseUntil:null,lastError:null}}));
      return {processed:true,delivered:true};
    }catch{
      await this.db.write(tx=>tx.outboxEvent.updateMany({where:{id:event.id,leaseToken:token},data:{status:'PENDING',leaseToken:null,leaseUntil:null,lastError:'DELIVERY_FAILED',availableAt:new Date(Date.parse(this.clock())+Math.min(60,2**Math.min(event.attempts,6))*1000)}}));
      return {processed:true,delivered:false};
    }
  }
  async drain(limit=100){let count=0;for(;count<limit;count++){if(!(await this.dispatchOne()).processed)break;}return {processed:count};}
}
