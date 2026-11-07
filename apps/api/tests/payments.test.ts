import { afterEach,beforeEach,describe,it,expect } from 'vitest';
import { mkdtemp,rm,writeFile,mkdir,copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Database } from '@agentpay/database';
import { MockCodiPushGateway,signMockEvent,type MockScenario,type MockWireNotice } from '@agentpay/integrations';
import { seedDemo } from '../../../packages/database/src/seed.js';
import { buildApp,type Credential } from '../src/index.js';
import { OutboxDispatcher } from '../src/outbox.js';
const secret='test-mock-webhook-secret-never-production',control='test-control-token-never-production';
const credentials:Credential[]=[{token:'test-payment-buyer-token-000000',actor:{role:'BUYER',id:'buyer-demo'}},{token:'test-payment-other-buyer-000000',actor:{role:'BUYER',id:'buyer-other'}},{token:'test-payment-merchant-token-0000',actor:{role:'MERCHANT',id:'merchant-demo'}},{token:'test-payment-other-merchant-000',actor:{role:'MERCHANT',id:'merchant-other'}}];
let dir:string,url:string,db:Database,app:ReturnType<typeof buildApp>,gateway:MockCodiPushGateway,now:string;
function options(){return {db,credentials,clock:()=>now,mockPayments:{gateway,webhookSecret:secret,apiKeyId:'mock-api-key',controlToken:control}};}
const headers=(actor=0,key='payment-key-default')=>({authorization:'Bearer '+credentials[actor]!.token,'idempotency-key':key});
async function order(){
 const i=await app.inject({method:'POST',url:'/v1/intents',headers:headers(0,'intent-'+randomUUID()),payload:{originalText:'Café de prueba',productId:'coffee',category:'specialty',quantity:2,unit:'kg',maxAmountMinor:100000,currency:'MXN',deliveryDeadline:'2026-11-09T00:00:00Z',timezone:'America/Mexico_City'}});expect(i.statusCode).toBe(201);
 const p=await app.inject({method:'POST',url:`/v1/intents/${i.json().id}/proposals`,headers:headers(0,'proposal-'+randomUUID()),payload:{offerId:'coffee-850'}});expect(p.statusCode).toBe(201);
 const o=await app.inject({method:'POST',url:'/v1/orders',headers:headers(0,'order-'+randomUUID()),payload:{proposalId:p.json().id,snapshotHash:p.json().snapshotHash,approved:true}});expect(o.statusCode).toBe(201);return o.json<{id:string;snapshotHash:string}>();
}
async function request(o:{id:string;snapshotHash:string},key='payment-key-default',actor=0){return app.inject({method:'POST',url:`/v1/orders/${o.id}/payment-requests`,headers:headers(actor,key),payload:{snapshotHash:o.snapshotHash,approved:true}});}
async function submitted(){const o=await order(),r=await request(o);expect(r.statusCode).toBe(202);return {o,attemptId:r.json<{id:string}>().id};}
async function signed(wire:MockWireNotice,id='mock-event-'+randomUUID(),timestamp=String(Math.floor(Date.parse(now)/1000))){const raw=Buffer.from(JSON.stringify(wire));return app.inject({method:'POST',url:'/v1/test-only/mock-webhook',headers:{'content-type':'application/mock-event+json',...signMockEvent(raw,secret,id,timestamp)},payload:raw});}
async function controlCall(path:string){return app.inject({method:'POST',url:path,headers:{'x-mock-control-token':control},payload:{}});}
beforeEach(async()=>{dir=await mkdtemp(join(tmpdir(),'agentpay-g3-'));url='file:'+join(dir,'test.db');now='2026-11-07T18:00:00Z';await writeFile(join(dir,'test.db'),'',{mode:0o600});execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--schema','packages/database/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});db=new Database(url);await seedDemo(db,now);gateway=new MockCodiPushGateway(db,()=>now);app=buildApp(options());},30000);
afterEach(async()=>{await app?.close();await db?.close();await rm(dir,{recursive:true,force:true});});
describe('G3 simulated payment integrity',()=>{
 it('persists attempt before gateway invocation, then confirms and delivers exactly one local merchant notification',async()=>{
   const original=gateway.submit.bind(gateway);gateway.submit=async input=>{const a=await db.client.paymentAttempt.findUniqueOrThrow({where:{id:input.attemptId}});expect(a.status).toBe('SUBMISSION_PENDING');expect(await db.client.idempotencyRecord.count({where:{route:{contains:'payment-requests'}}})).toBe(1);return original(input);};
   const {o,attemptId}=await submitted();expect((await db.client.order.findUniqueOrThrow({where:{id:o.id}})).status).toBe('PAYMENT_PENDING');expect(await db.client.providerTransaction.count()).toBe(0);
   const confirmed=await controlCall(`/v1/test-only/mock-payments/${attemptId}/confirm`);expect(confirmed.statusCode).toBe(200);expect(confirmed.json().outcome).toBe('CONFIRMED');
   await controlCall('/v1/test-only/outbox/dispatch');await controlCall(`/v1/test-only/mock-payments/${attemptId}/confirm`);await controlCall('/v1/test-only/outbox/dispatch');
   expect(await db.client.merchantNotification.count()).toBe(1);expect(await db.client.providerTransaction.count()).toBe(1);
   const payments=await app.inject({url:`/v1/orders/${o.id}/payments`,headers:headers()});expect(payments.json().orderStatus).toBe('PAID');expect(payments.json().fulfillmentStatus).toBe('READY_FOR_PREPARATION');expect(payments.body).toContain('SIMULADO');expect(payments.body).not.toMatch(/5500000000|phoneNumber|secret|control-token/);
   const notifications=await app.inject({url:'/v1/merchants/merchant-demo/notifications',headers:headers(2)});expect(notifications.json()).toHaveLength(1);expect((await db.client.product.findUniqueOrThrow({where:{id:'coffee'}})).stock).toBe(8);
 });
 it('concurrent replay submits once, preserves response and rejects another key or payload',async()=>{
   const o=await order();const replies=await Promise.all(Array.from({length:8},()=>request(o)));expect(replies.every(r=>r.statusCode===202)).toBe(true);expect(new Set(replies.map(r=>r.body)).size).toBe(1);expect(await db.client.mockSubmission.count()).toBe(1);
   expect((await request(o,'another-payment-key')).statusCode).toBe(409);
   expect((await app.inject({method:'POST',url:`/v1/orders/${o.id}/payment-requests`,headers:headers(),payload:{approved:true,snapshotHash:'a'.repeat(64)}})).statusCode).toBe(409);
 });
 it.each(['TIMEOUT_BEFORE_ACCEPT','TIMEOUT_AFTER_ACCEPT'] as MockScenario[])('never resends after %s or restart',async scenario=>{
   await app.close();gateway=new MockCodiPushGateway(db,()=>now,scenario);app=buildApp(options());const {o,attemptId}=await submitted();
   expect((await db.client.paymentAttempt.findUniqueOrThrow({where:{id:attemptId}})).status).toBe('SUBMISSION_UNKNOWN');
   const count=scenario==='TIMEOUT_AFTER_ACCEPT'?1:0;expect(await db.client.mockSubmission.count()).toBe(count);
   await app.close();await db.close();db=new Database(url);gateway=new MockCodiPushGateway(db,()=>now);app=buildApp(options());
   expect((await request(o)).statusCode).toBe(202);expect((await request(o,'new-key-after-timeout')).statusCode).toBe(409);expect(await db.client.mockSubmission.count()).toBe(count);
   if(count){expect((await controlCall(`/v1/test-only/mock-payments/${attemptId}/confirm`)).json().outcome).toBe('CONFIRMED');}
 });
 it('recovers a crash between durable admission and submission as UNKNOWN without invoking the gateway',async()=>{
   const {o,attemptId}=await submitted();await db.client.paymentAttempt.update({where:{id:attemptId},data:{status:'SUBMISSION_PENDING'}});await app.close();await db.close();db=new Database(url);gateway=new MockCodiPushGateway(db,()=>now);let calls=0;gateway.submit=async()=>{calls++;throw new Error('must-not-submit');};app=buildApp(options());await app.ready();
   expect((await db.client.paymentAttempt.findUniqueOrThrow({where:{id:attemptId}})).status).toBe('SUBMISSION_UNKNOWN');await request(o);expect(calls).toBe(0);
   const recovered=await db.client.auditEvent.findFirstOrThrow({where:{orderId:o.id,type:'MOCK_SUBMISSION_UNKNOWN_AFTER_RESTART'}});expect(JSON.parse(recovered.data).environment).toBe('mock');
 });
 it.each(['price','beneficiary','phone','stock','expired','account','consent'])('rejects payment request after live %s changes',async change=>{
   const o=await order();
   if(change==='price')await db.client.offer.update({where:{id:'coffee-850'},data:{amountMinor:86000}});
   if(change==='beneficiary')await db.client.merchantPaymentAccount.update({where:{id:'account-demo'},data:{beneficiaryDisplayName:'Changed'}});
   if(change==='phone')await db.client.buyer.update({where:{id:'buyer-demo'},data:{phoneNumber:'5599999999'}});
   if(change==='stock')await db.client.product.update({where:{id:'coffee'},data:{stock:0}});
   if(change==='expired')now='2026-11-07T18:31:00Z';
   if(change==='account')await db.client.merchantPaymentAccount.update({where:{id:'account-demo'},data:{codiStatus:'PENDING'}});
   if(change==='consent')await db.client.consentRecord.delete({where:{orderId:o.id}});
   expect([404,409]).toContain((await request(o)).statusCode);expect(await db.client.paymentAttempt.count()).toBe(0);expect(await db.client.mockSubmission.count()).toBe(0);
 });
 it('does not let other buyers, merchants or ordinary credentials create/confirm payments or dispatch outbox',async()=>{
   const o=await order();expect((await request(o,'foreign-request-key',1)).statusCode).toBe(404);expect((await request(o,'merchant-request-key',2)).statusCode).toBe(403);
   const r=await request(o),id=r.json<{id:string}>().id;
   for(const path of [`/v1/test-only/mock-payments/${id}/confirm`,'/v1/test-only/outbox/dispatch'])expect((await app.inject({method:'POST',url:path,headers:headers(),payload:{}})).statusCode).toBe(401);
   expect((await app.inject({url:`/v1/orders/${o.id}/payments`,headers:headers(1)})).statusCode).toBe(404);
   expect((await app.inject({url:'/v1/merchants/merchant-demo/notifications',headers:headers(3)})).statusCode).toBe(403);
 });
 it.each(['missing','tampered','stale','future','wrong-secret'])('rejects %s signature before storing an event',async mode=>{
   const {attemptId}=await submitted(),wire=await gateway.notice(attemptId,true);const raw=Buffer.from(JSON.stringify(wire));let timestamp=String(Math.floor(Date.parse(now)/1000));if(mode==='stale')timestamp=String(Number(timestamp)-301);if(mode==='future')timestamp=String(Number(timestamp)+301);
   const sig=signMockEvent(raw,mode==='wrong-secret'?'different-secret':secret,'mock-event-signature-test',timestamp);
   const response=await app.inject({method:'POST',url:'/v1/test-only/mock-webhook',headers:{'content-type':'application/mock-event+json',...(mode==='missing'?{}:sig)},payload:mode==='tampered'?Buffer.from(raw.toString()+' '):raw});expect(response.statusCode).toBe(401);expect(await db.client.paymentEvent.count()).toBe(0);expect(await db.client.providerTransaction.count()).toBe(0);
 });
 it.each(['amount','currency','beneficiaryAccountId','apiKeyId','orderId','numRef','transactionId'] as const)('does not confirm a signed event with wrong %s',async field=>{
   const {o,attemptId}=await submitted();const wire=await gateway.notice(attemptId,true);
   if(field==='amount')wire.amount='849.99';else if(field==='currency')wire.currency='USD';else if(field==='numRef')wire.numRef='9999999';else wire[field]='different-id';
   const r=await signed(wire);expect(r.statusCode).toBe(200);expect(r.json().outcome).toBe('RECONCILIATION_EXCEPTION');expect((await db.client.order.findUniqueOrThrow({where:{id:o.id}})).status).toBe('EXCEPTION');expect(await db.client.providerTransaction.count()).toBe(0);expect(await db.client.merchantNotification.count()).toBe(0);
 });
 it('rejects precision errors and real environment labels without processing financial effects',async()=>{
   const {attemptId}=await submitted();const wire=await gateway.notice(attemptId,true);wire.amount='850.001';expect((await signed(wire)).statusCode).toBe(400);wire.amount='850.00';const raw=Buffer.from(JSON.stringify({...wire,environment:'real'}));expect((await app.inject({method:'POST',url:'/v1/test-only/mock-webhook',headers:{'content-type':'application/mock-event+json',...signMockEvent(raw,secret,'mock-event-real-label',String(Date.parse(now)/1000))},payload:raw})).statusCode).toBe(400);expect(await db.client.paymentEvent.count()).toBe(0);
 });
 it('deduplicates same delivery and same transaction across different deliveries, and rejects delivery-id conflicts',async()=>{
   const {attemptId}=await submitted(),wire=await gateway.notice(attemptId,true);const id='mock-event-dedup';expect((await signed(wire,id)).json().outcome).toBe('CONFIRMED');expect((await signed(wire,id)).json().duplicate).toBe(true);expect((await signed(wire)).json().outcome).toBe('ALREADY_CONFIRMED');
   expect((await signed({...wire,amount:'849.99'},id)).statusCode).toBe(409);expect(await db.client.paymentEvent.count()).toBe(2);expect(await db.client.providerTransaction.count()).toBe(1);expect(await db.client.outboxEvent.count({where:{type:'MOCK_ORDER_PAID'}})).toBe(1);
 });
 it('handles a paid webhook before the submission response without downgrading confirmation',async()=>{
   const original=gateway.submit.bind(gateway);gateway.submit=async input=>{const receipt=await original(input);expect((await signed(await gateway.notice(input.attemptId,true))).statusCode).toBe(200);return receipt;};const {attemptId}=await submitted();expect((await db.client.paymentAttempt.findUniqueOrThrow({where:{id:attemptId}})).status).toBe('CONFIRMED');
 });
 it('records unconfirmed/rejection simulation without assuming a bank failure and never downgrades PAID',async()=>{
   const {o,attemptId}=await submitted();expect((await controlCall(`/v1/test-only/mock-payments/${attemptId}/reject`)).json().outcome).toBe('UNCONFIRMED');expect((await db.client.order.findUniqueOrThrow({where:{id:o.id}})).status).toBe('PAYMENT_PENDING');
   await controlCall(`/v1/test-only/mock-payments/${attemptId}/confirm`);expect((await controlCall(`/v1/test-only/mock-payments/${attemptId}/reject`)).json().outcome).toBe('IGNORED_UNCONFIRMED');expect((await db.client.order.findUniqueOrThrow({where:{id:o.id}})).status).toBe('PAID');
 });
 it('records late money but enters fulfillment exception without preparing or returning funds',async()=>{
   const {o,attemptId}=await submitted();now='2026-11-07T18:31:00Z';const r=await controlCall(`/v1/test-only/mock-payments/${attemptId}/confirm`);expect(r.json().outcome).toBe('CONFIRMED_FULFILLMENT_EXCEPTION');
   expect((await db.client.paymentAttempt.findUniqueOrThrow({where:{id:attemptId}})).status).toBe('CONFIRMED');const orderRow=await db.client.order.findUniqueOrThrow({where:{id:o.id}});expect(orderRow.status).toBe('EXCEPTION');expect(orderRow.fulfillmentStatus).toBe('FULFILLMENT_EXCEPTION');expect((await db.client.product.findUniqueOrThrow({where:{id:'coffee'}})).stock).toBe(10);await controlCall('/v1/test-only/outbox/dispatch');expect((await db.client.merchantNotification.findFirstOrThrow()).type).toBe('MOCK_FULFILLMENT_EXCEPTION');
 });
 it('polls durable simulator state to recover a lost webhook, including after a reconciliation exception',async()=>{
   const {o,attemptId}=await submitted();const wire=await gateway.notice(attemptId,true);await signed({...wire,amount:'849.99'});
   const r=await app.inject({method:'POST',url:`/v1/orders/${o.id}/reconcile`,headers:headers(),payload:{}});expect(r.statusCode).toBe(200);expect(r.json().orderStatus).toBe('PAID');await app.inject({method:'POST',url:`/v1/orders/${o.id}/reconcile`,headers:headers(),payload:{}});expect(await db.client.providerTransaction.count()).toBe(1);
 });
 it('recovers outbox delivery after a failure between sink write and acknowledgement without double notification',async()=>{
   const {attemptId}=await submitted();await controlCall(`/v1/test-only/mock-payments/${attemptId}/confirm`);let fail=true;
   const outbox=new OutboxDispatcher(db,()=>now,async()=>{if(fail){fail=false;throw new Error('crash after delivery');}});await outbox.drain();expect(await db.client.merchantNotification.count()).toBe(1);expect(await db.client.outboxEvent.count({where:{type:'MOCK_ORDER_PAID',status:'PENDING'}})).toBe(1);
   await app.close();await db.close();db=new Database(url);now='2026-11-07T18:01:00Z';await new OutboxDispatcher(db,()=>now).drain();expect(await db.client.merchantNotification.count()).toBe(1);expect(await db.client.outboxEvent.count({where:{type:'MOCK_ORDER_PAID',status:'DELIVERED'}})).toBe(1);
 });
 it('reclaims an expired outbox lease and concurrent dispatchers deliver only once',async()=>{
   const {attemptId}=await submitted();await controlCall(`/v1/test-only/mock-payments/${attemptId}/confirm`);await db.client.outboxEvent.updateMany({where:{type:'MOCK_ORDER_PAID'},data:{status:'PROCESSING',leaseToken:'abandoned',leaseUntil:new Date(Date.parse(now)-1000)}});
   await Promise.all([new OutboxDispatcher(db,()=>now).drain(),new OutboxDispatcher(db,()=>now).drain()]);expect(await db.client.merchantNotification.count()).toBe(1);expect(await db.client.outboxEvent.count({where:{type:'MOCK_ORDER_PAID',status:'DELIVERED'}})).toBe(1);
 });
 it('does not notify merchants about an unpaid approved order',async()=>{await order();await controlCall('/v1/test-only/outbox/dispatch');expect(await db.client.merchantNotification.count()).toBe(0);});
 it('refuses mock endpoints in production and never registers a pey webhook',async()=>{
   const old=process.env.NODE_ENV;process.env.NODE_ENV='production';try{expect(()=>buildApp(options())).toThrow('MOCK_ONLY');}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}
   expect((await app.inject({method:'POST',url:'/v1/webhooks/pey',headers:headers(),payload:{}})).statusCode).toBe(404);
 });
 it('upgrades a G2 database with persisted order evidence without losing rows or immutable triggers',async()=>{
   const legacyDir=join(dir,'legacy');await mkdir(join(legacyDir,'migrations'),{recursive:true});
   await copyFile('packages/database/prisma/schema.prisma',join(legacyDir,'schema.prisma'));
   await copyFile('packages/database/prisma/migrations/migration_lock.toml',join(legacyDir,'migrations/migration_lock.toml'));
   for(const migration of ['202611070001_g2','202611070002_integrity','202611070003_one_order_per_intent']){
     await mkdir(join(legacyDir,'migrations',migration));await copyFile(`packages/database/prisma/migrations/${migration}/migration.sql`,join(legacyDir,'migrations',migration,'migration.sql'));
   }
   const legacyUrl='file:'+join(dir,'legacy.db');await writeFile(join(dir,'legacy.db'),'',{mode:0o600});
   const cli=resolve('node_modules/prisma/build/index.js');
   execFileSync(process.execPath,[cli,'migrate','deploy','--schema',join(legacyDir,'schema.prisma')],{env:{...process.env,DATABASE_URL:legacyUrl},stdio:'pipe'});
   const legacy=new Database(legacyUrl);
   try{
     const sql=[
       `INSERT INTO Buyer (id,phoneNumber) VALUES ('legacy-buyer','5500000000')`,
       `INSERT INTO Merchant (id,status,canFulfill) VALUES ('legacy-merchant','ACTIVE',1)`,
       `INSERT INTO MerchantPaymentAccount (id,merchantId,provider,codiStatus,beneficiaryDisplayName) VALUES ('legacy-account','legacy-merchant','mock','ACTIVE','SIMULADO')`,
       `INSERT INTO Product (id,merchantId,category,unit,stock) VALUES ('legacy-product','legacy-merchant','coffee','kg',10)`,
       `INSERT INTO Offer (id,version,merchantId,productId,category,quantity,unit,amountMinor,currency,validUntil,beneficiaryAccountId) VALUES ('legacy-offer',1,'legacy-merchant','legacy-product','coffee',2,'kg',85000,'MXN',0,'legacy-account')`,
       `INSERT INTO PurchaseIntent (id,buyerId,version,data) VALUES ('legacy-intent','legacy-buyer',1,'{}')`,
       `INSERT INTO Proposal (id,intentId,offerId,orderId,snapshot,snapshotHash,createdAt) VALUES ('legacy-proposal','legacy-intent','legacy-offer','legacy-order','legacy-snapshot','legacy-hash',0)`,
       `INSERT INTO Reservation (id,proposalId,productId,orderId,offerVersion,quantity,status,validUntil) VALUES ('legacy-reservation','legacy-proposal','legacy-product','legacy-order',1,2,'RESERVED',0)`,
       `INSERT INTO "Order" (id,buyerId,merchantId,intentId,proposalId,reservationId,status,createdAt) VALUES ('legacy-order','legacy-buyer','legacy-merchant','legacy-intent','legacy-proposal','legacy-reservation','APPROVED',0)`,
       `INSERT INTO OrderSnapshot (orderId,version,hash,data) VALUES ('legacy-order',1,'legacy-hash','legacy-snapshot')`,
       `INSERT INTO ConsentRecord (id,orderId,actorId,snapshotHash,acceptedAt,data) VALUES ('legacy-consent','legacy-order','legacy-buyer','legacy-hash',0,'legacy-consent-data')`,
       `INSERT INTO AuditEvent (id,orderId,actorId,type,data,createdAt) VALUES ('legacy-audit','legacy-order','legacy-buyer','ORDER_APPROVED','{}',0)`,
       `INSERT INTO OutboxEvent (id,orderId,type,payload,status,createdAt) VALUES ('legacy-outbox','legacy-order','ORDER_APPROVED_INTERNAL','{}','PENDING',0)`,
     ];
     for(const statement of sql)await legacy.client.$executeRawUnsafe(statement);
     await legacy.close();
     execFileSync(process.execPath,[cli,'migrate','deploy','--schema','packages/database/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:legacyUrl},stdio:'pipe'});
     const upgraded=new Database(legacyUrl);
     try{
       expect((await upgraded.client.order.findUniqueOrThrow({where:{id:'legacy-order'}})).fulfillmentStatus).toBe('RESERVED');
       expect((await upgraded.client.orderSnapshot.findUniqueOrThrow({where:{orderId:'legacy-order'}})).data).toBe('legacy-snapshot');
       expect((await upgraded.client.consentRecord.findUniqueOrThrow({where:{id:'legacy-consent'}})).data).toBe('legacy-consent-data');
       expect(await upgraded.client.auditEvent.count()).toBe(1);expect(await upgraded.client.outboxEvent.count()).toBe(1);
       expect(await upgraded.client.$queryRawUnsafe('PRAGMA foreign_key_check')).toEqual([]);
       await expect(upgraded.client.orderSnapshot.update({where:{orderId:'legacy-order'},data:{data:'modified'}})).rejects.toThrow();
       await expect(upgraded.client.auditEvent.delete({where:{id:'legacy-audit'}})).rejects.toThrow();
     }finally{await upgraded.close();}
   }finally{await legacy.close();}
 },30000);

});
