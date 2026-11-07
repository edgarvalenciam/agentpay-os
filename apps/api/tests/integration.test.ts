import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { Database } from '@agentpay/database';
import { seedDemo } from '../../../packages/database/src/seed.js';
import { buildApp, type Credential } from '../src/index.js';
import { CommerceService } from '../src/service.js';
const credentials:Credential[]=[
  {token:'test-buyer-token-not-for-production',actor:{role:'BUYER',id:'buyer-demo'}},
  {token:'test-other-buyer-not-for-production',actor:{role:'BUYER',id:'buyer-other'}},
  {token:'test-merchant-token-not-for-production',actor:{role:'MERCHANT',id:'merchant-demo'}},
  {token:'test-other-merchant-not-for-production',actor:{role:'MERCHANT',id:'merchant-other'}},
];
const intentBody={originalText:'2 kg café máximo $1,000',productId:'coffee',category:'specialty',quantity:2,unit:'kg',maxAmountMinor:100000,currency:'MXN',deliveryDeadline:'2026-11-09T00:00:00Z',timezone:'America/Mexico_City'};
let dir:string,url:string,db:Database,app:ReturnType<typeof buildApp>,now:string;
const headers=(actor=0,key='test-key-default')=>({authorization:'Bearer '+credentials[actor]!.token,'idempotency-key':key});
async function intent(key='intent-key-default'){
  const r=await app.inject({method:'POST',url:'/v1/intents',headers:headers(0,key),payload:intentBody});expect(r.statusCode).toBe(201);return r.json<{id:string}>().id;
}
async function proposal(intentId:string,key='proposal-key-default',offerId='coffee-850'){
  return app.inject({method:'POST',url:`/v1/intents/${intentId}/proposals`,headers:headers(0,key),payload:{offerId}});
}
async function orderFixture(){const i=await intent(),p=await proposal(i);expect(p.statusCode).toBe(201);const data=p.json<{id:string;snapshotHash:string}>();const payload={proposalId:data.id,snapshotHash:data.snapshotHash,approved:true};const order=await app.inject({method:'POST',url:'/v1/orders',headers:headers(),payload});expect(order.statusCode).toBe(201);return {i,p:data,payload,order:order.json<{id:string;status:string}>()};}
beforeEach(async()=>{
  dir=await mkdtemp(join(tmpdir(),'agentpay-g2-'));url='file:'+join(dir,'test.db');now='2026-11-07T18:00:00Z';await writeFile(join(dir,'test.db'),'',{mode:0o600});
  execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--schema','packages/database/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});
  db=new Database(url);await seedDemo(db,now);app=buildApp({db,credentials,clock:()=>now});
},30000);
afterEach(async()=>{await app?.close();await db?.close();await rm(dir,{recursive:true,force:true});});
describe('G2 HTTP and persistence',()=>{
  it('creates an approved commercial order and recovers snapshot and audit after restart',async()=>{
    const {order}=await orderFixture();expect(order.status).toBe('APPROVED');
    expect(await db.client.paymentAttempt.count()).toBe(0);
    expect(await db.client.consentRecord.count()).toBe(1);expect(await db.client.outboxEvent.count()).toBe(1);
    const before=await app.inject({url:`/v1/orders/${order.id}`,headers:headers()});
    await app.close();await db.close();db=new Database(url);app=buildApp({db,credentials,clock:()=>now});
    const after=await app.inject({url:`/v1/orders/${order.id}`,headers:headers()});expect(after.json()).toEqual(before.json());
    const events=await app.inject({url:`/v1/orders/${order.id}/events`,headers:headers()});expect(events.json()).toHaveLength(4);
    expect(JSON.stringify(events.json())).not.toMatch(/5500000000|phoneNumber|clabe|authorization/i);
    expect(after.body).not.toMatch(/phoneNumber|5500000000|originalText/);
  });
  it('requires authentication and never trusts buyerId, status or arbitrary fields',async()=>{
    expect((await app.inject({url:'/health'})).statusCode).toBe(200);
    expect((await app.inject({url:'/v1/intents/x'})).statusCode).toBe(401);
    expect((await app.inject({method:'POST',url:'/v1/intents',headers:headers(),payload:{...intentBody,buyerId:'buyer-other'}})).statusCode).toBe(400);
    expect((await app.inject({method:'POST',url:'/v1/intents',headers:headers(2),payload:intentBody})).statusCode).toBe(403);
    const {payload}=await orderFixture();expect((await app.inject({method:'POST',url:'/v1/orders',headers:headers(),payload:{...payload,status:'PAID'}})).statusCode).toBe(400);
  });
  it('isolates buyers and merchants on orders, audit, intents, proposals and listing',async()=>{
    const {i,order}=await orderFixture();
    for(const path of [`/v1/orders/${order.id}`,`/v1/orders/${order.id}/events`,`/v1/intents/${i}`,`/v1/intents/${i}/offers`])expect((await app.inject({url:path,headers:headers(1)})).statusCode).toBe(404);
    expect((await app.inject({url:`/v1/orders/${order.id}`,headers:headers(2)})).statusCode).toBe(200);
    expect((await app.inject({url:`/v1/orders/${order.id}`,headers:headers(3)})).statusCode).toBe(404);
    expect((await app.inject({url:`/v1/orders/${order.id}/events`,headers:headers(3)})).statusCode).toBe(404);
    expect((await app.inject({url:'/v1/merchants/merchant-demo/orders',headers:headers(3)})).statusCode).toBe(403);
    expect((await app.inject({url:'/v1/merchants/merchant-demo/orders',headers:headers(2)})).json()).toHaveLength(1);
    expect((await app.inject({method:'POST',url:`/v1/intents/${i}/proposals`,headers:headers(1),payload:{offerId:'coffee-850'}})).statusCode).toBe(404);
  });
  it('replays requests durably, including across restart, and rejects conflicting bodies',async()=>{
    const {payload,order}=await orderFixture();
    await app.close();await db.close();db=new Database(url);app=buildApp({db,credentials,clock:()=>now});
    const replay=await app.inject({method:'POST',url:'/v1/orders',headers:headers(),payload});expect(replay.statusCode).toBe(201);expect(replay.json<{id:string}>().id).toBe(order.id);
    expect((await app.inject({method:'POST',url:'/v1/orders',headers:headers(),payload:{...payload,snapshotHash:'a'.repeat(64)}})).statusCode).toBe(409);
    expect(await db.client.order.count()).toBe(1);expect(await db.client.auditEvent.count()).toBe(4);
  });
  it('concurrent identical order requests create one order, consent and outbox event',async()=>{
    const i=await intent(),p=(await proposal(i)).json<{id:string;snapshotHash:string}>();
    const replies=await Promise.all(Array.from({length:8},()=>app.inject({method:'POST',url:'/v1/orders',headers:headers(),payload:{proposalId:p.id,snapshotHash:p.snapshotHash,approved:true}})));
    expect(replies.every(r=>r.statusCode===201)).toBe(true);expect(new Set(replies.map(r=>r.json<{id:string}>().id)).size).toBe(1);
    expect(await db.client.order.count()).toBe(1);expect(await db.client.consentRecord.count()).toBe(1);expect(await db.client.outboxEvent.count()).toBe(1);
  });
  it('different keys cannot create two orders from a proposal',async()=>{
    const {payload}=await orderFixture();const r=await app.inject({method:'POST',url:'/v1/orders',headers:headers(0,'different-order-key'),payload});expect(r.statusCode).toBe(409);expect(await db.client.order.count()).toBe(1);
  });
  it('concurrent reservations cannot oversell the same product',async()=>{
    await db.client.product.update({where:{id:'coffee'},data:{stock:2}});const i=await intent();
    const replies=await Promise.all([proposal(i,'reservation-one'),proposal(i,'reservation-two')]);
    expect(replies.map(r=>r.statusCode).sort()).toEqual([201,422]);expect(await db.client.reservation.count({where:{status:'RESERVED'}})).toBe(1);
  });
  it('rejects $1,200 and persists rejection without reserving stock or creating an order',async()=>{
    const i=await intent();const p=await proposal(i,'expensive-key','coffee-1200');expect(p.statusCode).toBe(422);expect(p.json().evaluation.reasons).toContain('BUDGET');
    expect(await db.client.policyEvaluation.count()).toBe(1);expect(await db.client.reservation.count()).toBe(0);expect(await db.client.order.count()).toBe(0);
    const replay=await proposal(i,'expensive-key','coffee-1200');expect(replay.json()).toEqual(p.json());
  });
  it.each(['price','beneficiary','phone','offer-version','merchant','account-status'])('revalidates live %s before approval and rolls back all order effects',async change=>{
    const i=await intent(),p=(await proposal(i)).json<{id:string;snapshotHash:string}>();
    if(change==='price')await db.client.offer.update({where:{id:'coffee-850'},data:{amountMinor:86000}});
    if(change==='offer-version')await db.client.offer.update({where:{id:'coffee-850'},data:{version:2}});
    if(change==='beneficiary')await db.client.merchantPaymentAccount.update({where:{id:'account-demo'},data:{beneficiaryDisplayName:'Changed recipient'}});
    if(change==='phone')await db.client.buyer.update({where:{id:'buyer-demo'},data:{phoneNumber:'5599999999'}});
    if(change==='merchant')await db.client.merchant.update({where:{id:'merchant-demo'},data:{status:'INACTIVE'}});
    if(change==='account-status')await db.client.merchantPaymentAccount.update({where:{id:'account-demo'},data:{codiStatus:'ERROR'}});
    const r=await app.inject({method:'POST',url:'/v1/orders',headers:headers(),payload:{proposalId:p.id,snapshotHash:p.snapshotHash,approved:true}});expect(r.statusCode).toBe(409);
    expect(await db.client.order.count()).toBe(0);expect(await db.client.consentRecord.count()).toBe(0);expect(await db.client.outboxEvent.count()).toBe(0);
  });
  it('expires reservations deterministically, rejects stale approval and releases capacity',async()=>{
    await db.client.product.update({where:{id:'coffee'},data:{stock:2}});const i=await intent(),p=(await proposal(i)).json<{id:string;snapshotHash:string}>();now='2026-11-07T18:31:00Z';
    const r=await app.inject({method:'POST',url:'/v1/orders',headers:headers(),payload:{proposalId:p.id,snapshotHash:p.snapshotHash,approved:true}});expect(r.statusCode).toBe(409);
    await new CommerceService(db,()=>now).releaseExpired();expect(await db.client.reservation.count({where:{status:'RELEASED'}})).toBe(1);
    expect((await proposal(i,'new-reservation')).statusCode).toBe(201);
  });
  it('non-reserving evaluation and offer listing are available to the intent owner',async()=>{
    const i=await intent();expect((await app.inject({url:`/v1/intents/${i}/offers`,headers:headers()})).json()).toHaveLength(2);
    const r=await app.inject({method:'POST',url:'/v1/offers/coffee-850/evaluate',headers:headers(),payload:{intentId:i}});expect(r.json().status).toBe('ELIGIBLE');expect(r.json().reservation).toBe('HYPOTHETICAL_NOT_RESERVED');expect(await db.client.reservation.count()).toBe(0);
  });
  it('keeps the database unchanged when a mutation fails mid-transaction',async()=>{
    const {order}=await orderFixture();await expect(db.write(async tx=>{await tx.auditEvent.create({data:{id:'rollback-event',orderId:order.id,actorId:'system',type:'ROLLBACK_TEST',data:'{}',createdAt:new Date(now)}});throw new Error('forced');})).rejects.toThrow('forced');expect(await db.client.auditEvent.count()).toBe(4);
  });
  it('enforces a unique active payment slot and resource-to-many-transactions structure without sending payments',async()=>{
    const {order}=await orderFixture();
    await db.client.paymentAttempt.create({data:{id:'attempt1',orderId:order.id,method:'CODI_PUSH',provider:'mock',requestedAmountMinor:85000,currency:'MXN',status:'CREATED',activeSlot:order.id,idempotencyKey:'attempt-key1',createdAt:new Date(now)}});
    await expect(db.client.paymentAttempt.create({data:{id:'attempt2',orderId:order.id,method:'CODI_PUSH',provider:'mock',requestedAmountMinor:85000,currency:'MXN',status:'CREATED',activeSlot:order.id,idempotencyKey:'attempt-key2',createdAt:new Date(now)}})).rejects.toThrow();
    await db.client.providerResource.create({data:{id:'resource1',attemptId:'attempt1',provider:'mock',resourceType:'CODI_QR',resourceId:'synthetic-resource'}});
    for(const id of ['tx1','tx2'])await db.client.providerTransaction.create({data:{id,resourceId:'resource1',provider:'mock',transactionId:id,amountMinor:85000,currency:'MXN',status:'PAID'}});
    expect(await db.client.providerTransaction.count()).toBe(2);
    await expect(db.client.providerTransaction.create({data:{id:'tx3',resourceId:'resource1',provider:'mock',transactionId:'tx1',amountMinor:85000,currency:'MXN',status:'PAID'}})).rejects.toThrow();
  });
  it('never exposes payment or preparation actions in G2',async()=>{const {order}=await orderFixture();for(const path of [`/v1/orders/${order.id}/payment-requests`,`/v1/orders/${order.id}/prepare`])expect((await app.inject({method:'POST',url:path,headers:headers(),payload:{}})).statusCode).toBe(404);});
  it('rejects missing idempotency keys and malformed JSON without storing effects',async()=>{
    expect((await app.inject({method:'POST',url:'/v1/intents',headers:{authorization:'Bearer '+credentials[0]!.token},payload:intentBody})).statusCode).toBe(400);
    expect((await app.inject({method:'POST',url:'/v1/intents',headers:{...headers(),'content-type':'application/json'},payload:'{broken'})).statusCode).toBe(400);
    expect(await db.client.purchaseIntent.count()).toBe(0);
  });
  it('database rejects mutation of immutable snapshot, consent and audit evidence',async()=>{
    const {order}=await orderFixture();
    await expect(db.client.orderSnapshot.update({where:{orderId:order.id},data:{data:'{}'}})).rejects.toThrow();
    await expect(db.client.consentRecord.update({where:{orderId:order.id},data:{snapshotHash:'forged'}})).rejects.toThrow();
    const event=await db.client.auditEvent.findFirstOrThrow({where:{orderId:order.id}});
    await expect(db.client.auditEvent.delete({where:{id:event.id}})).rejects.toThrow();
    expect(await db.client.auditEvent.count()).toBe(4);
  });
  it('active attempt cannot bypass uniqueness by omitting its order slot',async()=>{
    const {order}=await orderFixture();
    await expect(db.client.paymentAttempt.create({data:{id:'invalid-attempt',orderId:order.id,method:'CODI_PUSH',provider:'mock',requestedAmountMinor:85000,currency:'MXN',status:'SUBMISSION_UNKNOWN',idempotencyKey:'invalid-slot-key',createdAt:new Date(now)}})).rejects.toThrow();
    expect(await db.client.paymentAttempt.count()).toBe(0);
  });
  it('a repeat seed preserves orders, inventory edits and original offer validity',async()=>{
    const {order}=await orderFixture();const before=await db.client.offer.findUniqueOrThrow({where:{id:'coffee-850'}});
    await db.client.product.update({where:{id:'coffee'},data:{stock:3}});await seedDemo(db,'2026-11-08T18:00:00Z');
    expect((await db.client.offer.findUniqueOrThrow({where:{id:'coffee-850'}})).validUntil).toEqual(before.validUntil);
    expect((await db.client.product.findUniqueOrThrow({where:{id:'coffee'}})).stock).toBe(3);
    expect(await db.client.order.findUnique({where:{id:order.id}})).not.toBeNull();
  });

  it('starts the CLI server on loopback, rejects a second instance and removes its lock on shutdown',async()=>{
    const args=[resolve('node_modules/tsx/dist/cli.mjs'),'apps/api/src/server.ts'];
    const env={...process.env,NODE_ENV:'test',DATABASE_URL:url,DEMO_BUYER_TOKEN:credentials[0]!.token,DEMO_MERCHANT_TOKEN:credentials[2]!.token,ALLOW_REAL_PAYMENTS:'false',PAYMENT_PROVIDER:'mock',PORT:'0'};
    const child=spawn(process.execPath,args,{env,stdio:['ignore','pipe','pipe']});
    try{
      const address=await new Promise<string>((resolveAddress,reject)=>{
        let output='';const timer=setTimeout(()=>reject(new Error('SERVER_START_TIMEOUT')),10000);
        child.stdout.on('data',chunk=>{output+=String(chunk);const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolveAddress(match[0]);}});
        child.once('exit',()=>{clearTimeout(timer);reject(new Error('SERVER_EXITED_BEFORE_READY'));});
      });
      expect((await fetch(address+'/health')).status).toBe(200);
      expect((await fetch(address+'/v1/intents/nope')).status).toBe(401);
      expect(()=>execFileSync(process.execPath,args,{env,stdio:'pipe',timeout:10000})).toThrow();
    }finally{const stopped=once(child,'exit');child.kill('SIGTERM');await stopped;}
    const {access}=await import('node:fs/promises');await expect(access(join(dir,'test.db.server.lock'))).rejects.toThrow();
  },20000);

  it('concurrent approvals of different proposals for one intent create only one order',async()=>{
    const i=await intent();
    const proposals=await Promise.all([proposal(i,'candidate-one'),proposal(i,'candidate-two')]);
    expect(proposals.every(p=>p.statusCode===201)).toBe(true);
    const replies=await Promise.all(proposals.map((p,index)=>{const data=p.json<{id:string;snapshotHash:string}>();return app.inject({method:'POST',url:'/v1/orders',headers:headers(0,'approval-key-'+index),payload:{proposalId:data.id,snapshotHash:data.snapshotHash,approved:true}});}));
    expect(replies.map(r=>r.statusCode).sort()).toEqual([201,409]);
    expect(await db.client.order.count()).toBe(1);expect(await db.client.reservation.count({where:{status:'RESERVED'}})).toBe(1);
    expect((await proposal(i,'after-order-proposal')).statusCode).toBe(409);
  });

});
