import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { minorToMxn, mxnToMinor, type PaymentGateway, type PaymentNotice, type PushReceipt, type PushSubmission } from '@agentpay/core';
import type { UnitOfWork } from '@agentpay/database';
export type MockScenario='ACCEPT'|'TIMEOUT_BEFORE_ACCEPT'|'TIMEOUT_AFTER_ACCEPT';
const id=z.string().min(1).max(128);
export const MockNoticeSchema=z.object({environment:z.literal('mock'),type:z.enum(['mock.codi.push.paid','mock.codi.push.unconfirmed']),attemptId:id,orderId:id,amount:z.union([z.string().max(32),z.number()]),currency:z.string().length(3),beneficiaryAccountId:id,apiKeyId:id,numRef:z.string().regex(/^\d{1,7}$/),transactionId:id,datePaid:z.string().datetime({offset:true}).nullable()}).strict();
export type MockWireNotice=z.infer<typeof MockNoticeSchema>;
export class MockSignatureError extends Error {}
/** AgentPay development protocol; deliberately NOT a pey/Standard Webhooks implementation. */
export function signMockEvent(raw:Buffer,secret:string,deliveryId:string,timestamp:string):Record<string,string> {
  const signature=createHmac('sha256',secret).update(deliveryId+'.'+timestamp+'.').update(raw).digest('hex');
  return {'mock-event-id':deliveryId,'mock-event-timestamp':timestamp,'mock-event-signature':'mock-v1='+signature};
}
export function verifyMockEvent(raw:Buffer,headers:Record<string,unknown>,secret:string,now:string):{deliveryId:string;notice:PaymentNotice} {
  const deliveryId=headers['mock-event-id'],timestamp=headers['mock-event-timestamp'],signature=headers['mock-event-signature'];
  if(typeof deliveryId!=='string'||!/^mock-event-[a-zA-Z0-9_-]{1,100}$/.test(deliveryId)||typeof timestamp!=='string'||!/^\d{10}$/.test(timestamp)||typeof signature!=='string'||!/^mock-v1=[a-f0-9]{64}$/.test(signature)||Math.abs(Date.parse(now)/1000-Number(timestamp))>300)throw new MockSignatureError('INVALID_MOCK_SIGNATURE');
  const expected=signMockEvent(raw,secret,deliveryId,timestamp)['mock-event-signature']!;
  if(!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))throw new MockSignatureError('INVALID_MOCK_SIGNATURE');
  const wire=MockNoticeSchema.parse(JSON.parse(raw.toString('utf8')));
  if(wire.type==='mock.codi.push.paid'&&(!wire.datePaid||Date.parse(wire.datePaid)>Date.parse(now)+300000))throw new MockSignatureError('INVALID_MOCK_EVENT_DATE');
  const {amount,...rest}=wire;
  return {deliveryId,notice:{...rest,amountMinor:mxnToMinor(amount)}};
}
export class MockCodiPushGateway implements PaymentGateway {
  readonly provider='mock' as const;readonly environment='mock' as const;readonly method='CODI_PUSH' as const;
  constructor(private db:UnitOfWork,private clock:()=>string,private scenario:MockScenario='ACCEPT'){}
  async submit(input:PushSubmission):Promise<PushReceipt> {
    if(this.scenario==='TIMEOUT_BEFORE_ACCEPT')throw new Error('MOCK_TRANSPORT_TIMEOUT');
    const transactionId='mock-tx-'+randomUUID(),codiId='mock-codi-'+randomUUID();
    // Not idempotent by design: the orchestrator must ensure this is called only once.
    await this.db.write(tx=>tx.mockSubmission.create({data:{id:randomUUID(),attemptId:input.attemptId,transactionId,codiId,orderId:input.orderId,apiKeyId:input.apiKeyId,beneficiaryAccountId:input.beneficiaryAccountId,amountMinor:input.amountMinor,currency:input.currency,numRef:input.numRef,status:'PENDING',createdAt:new Date(this.clock())}}));
    if(this.scenario==='TIMEOUT_AFTER_ACCEPT')throw new Error('MOCK_TRANSPORT_TIMEOUT');
    return {transactionId,codiId};
  }
  async notice(attemptId:string,paid:boolean):Promise<MockWireNotice> {
    return this.db.write(async tx=>{
      const rows=await tx.mockSubmission.findMany({where:{attemptId}});
      if(rows.length!==1)throw new Error('MOCK_SUBMISSION_NOT_UNIQUE');const row=rows[0]!;
      if(paid&&row.status!=='PAID')await tx.mockSubmission.update({where:{id:row.id},data:{status:'PAID',datePaid:new Date(this.clock())}});
      const datePaid=paid?(row.datePaid?.toISOString()??this.clock()):null;
      return {environment:'mock',type:paid?'mock.codi.push.paid':'mock.codi.push.unconfirmed',attemptId:row.attemptId,orderId:row.orderId,amount:minorToMxn(row.amountMinor),currency:row.currency,beneficiaryAccountId:row.beneficiaryAccountId,apiKeyId:row.apiKeyId,numRef:row.numRef,transactionId:row.transactionId,datePaid};
    });
  }
}
export * from './pey-webhook.js';
export * from './pey-codi-push.js';
export * from './openai-intent.js';
