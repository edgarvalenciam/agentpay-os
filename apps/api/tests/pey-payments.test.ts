import { beforeEach,afterEach,describe,it,expect } from 'vitest';
import { mkdtemp,writeFile,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Database } from '@agentpay/database';
import { PeyCodiPushGateway,Webhook,type RealPaymentGrant } from '@agentpay/integrations';
import { buildApp,type Credential } from '../src/index.js';
import { seedDemo } from '../../../packages/database/src/seed.js';
import { PeyPaymentService,type PeyPaymentOptions } from '../src/pey-payment-service.js';
import { PeyInboxProcessor } from '../src/pey-inbox-processor.js';
import { buildPeyWebhookReceiver } from '../src/pey-webhook-receiver.js';
import { OutboxDispatcher } from '../src/outbox.js';
import { loadPeyPaymentOptions } from '../src/pey-payment-config.js';
let dir:string,db:Database,inbox:Database,app:ReturnType<typeof buildApp>,receiver:ReturnType<typeof buildPeyWebhookReceiver>,config:PeyPaymentOptions,now:string,processor:PeyInboxProcessor;
let submission:Record<string,unknown>|null,calls:{method:string;path:string}[],scenario:'OK'|'TIMEOUT'|'503'|'PENDING_BANK'|'BAD_RECEIPT',paid:boolean,queryMissing:boolean;
let queryPatch:Record<string,unknown>;
let beforeReceipt:(()=>Promise<void>)|undefined;
const bankId='fixture-bank',apiId='fixture-api',bankName='Fixture Merchant',phone='5500000000',clabe='000000000000000000';
const signingSecret='whsec_'+randomBytes(32).toString('base64'),encryptionKey=randomBytes(32);
const credentials:Credential[]=[{token:'fixture-pey-buyer-token-not-real',actor:{role:'BUYER',id:'buyer-demo'}},{token:'fixture-pey-merchant-token-not-real',actor:{role:'MERCHANT',id:'merchant-demo'}},{token:'fixture-pey-foreign-token-not-real',actor:{role:'BUYER',id:'buyer-other'}}];
const headers=(actor=0,key='fixture-payment-key')=>({authorization:'Bearer '+credentials[actor]!.token,'idempotency-key':key});
function transactionId(){return 'fixture-tx-'+String((submission?.metadata as Record<string,string>|undefined)?.paymentAttemptId??'unknown');}
const transport:typeof fetch=async(url,init)=>{
 const path=new URL(String(url)).pathname;calls.push({method:init?.method??'GET',path});
 if(path.startsWith('/bank-account/'))return new Response(JSON.stringify({id:bankId,name:bankName,clabe,codiStatus:scenario==='PENDING_BANK'?'PENDING':'ACTIVE'}));
 if(path==='/codi/pn'){
  submission=JSON.parse(String(init?.body));await beforeReceipt?.();
  if(scenario==='TIMEOUT')throw new Error('fixture lost response');
  return new Response(JSON.stringify(scenario==='BAD_RECEIPT'?{}:{transactionId:transactionId(),codiId:'12345678901234567890'}),{status:scenario==='503'?503:200});
 }
 if(path.startsWith('/transaction/')){
  if(queryMissing)return new Response('{}',{status:404});
  return new Response(JSON.stringify({id:transactionId(),status:paid?'PAID':'PENDING',amount:submission?.amount??850,currency:'MXN',paymentMethod:'CODI',payableType:'API_CODI_PN',...(paid?{datePaid:Math.floor(Date.parse(now)/1000)}:{}),metadata:{clabe,externalMetadata:submission?.metadata??{}},amountBreakdown:{base:submission?.amount??850,fee:0,tip:0},applicationFee:0,...queryPatch}));
 }
 throw new Error('unexpected fixture path');
};
function gateway(grant:RealPaymentGrant|null=null,allow=false){return new PeyCodiPushGateway({apiKey:'fixture-api-key-never-real',transport,grant,allowRealPayments:allow,clock:()=>now});}
function options(){return {db,credentials,clock:()=>now,peyPayments:config};}
async function order(){
 const created=await app.inject({method:'POST',url:'/v1/intents',headers:headers(0,'fixture-intent-key'),payload:{originalText:'fixture purchase',productId:'coffee',category:'specialty',quantity:2,unit:'kg',maxAmountMinor:100000,currency:'MXN',deliveryDeadline:'2026-11-09T00:00:00Z',timezone:'America/Mexico_City'}});expect(created.statusCode).toBe(201);
 const proposal=await app.inject({method:'POST',url:`/v1/intents/${created.json().id}/proposals`,headers:headers(0,'fixture-proposal-key'),payload:{offerId:'coffee-850'}});expect(proposal.statusCode).toBe(201);
 const result=await app.inject({method:'POST',url:'/v1/orders',headers:headers(0,'fixture-order-key'),payload:{approved:true,proposalId:proposal.json().id,snapshotHash:proposal.json().snapshotHash}});expect(result.statusCode).toBe(201);return result.json<{id:string;snapshotHash:string}>();
}
function arm(o:{id:string;snapshotHash:string}){config.gateway=gateway({id:'fixture-grant',orderId:o.id,snapshotHash:o.snapshotHash,amountMinor:85000,bankAccountId:bankId,phoneNumber:phone,expiresAt:'2026-11-07T19:00:00Z'},true);}
async function request(o:{id:string;snapshotHash:string},key='fixture-payment-key',actor=0){return app.inject({method:'POST',url:`/v1/orders/${o.id}/payment-requests`,headers:headers(actor,key),payload:{approved:true,snapshotHash:o.snapshotHash}});}
async function submitted(){const o=await order();arm(o);const r=await request(o);expect(r.statusCode).toBe(202);return {o,attemptId:r.json<{id:string}>().id};}
function wire(){return {type:'codi.pn.payment_received',amount:submission!.amount,apiKeyId:apiId,bankAccountId:bankId,numRef:submission!.numRef,transactionId:transactionId(),datePaid:Math.floor(Date.parse(now)/1000),metadata:{externalMetadata:submission!.metadata}};}
async function deliver(body:unknown=wire(),id='fixture-pey-event'){const raw=JSON.stringify(body),timestamp=new Date();return receiver.inject({method:'POST',url:'/v1/webhooks/pey',headers:{'content-type':'application/json','webhook-id':id,'webhook-timestamp':String(Math.floor(timestamp.getTime()/1000)),'webhook-signature':new Webhook(signingSecret).sign(id,timestamp,raw)},payload:raw});}
beforeEach(async()=>{
 dir=await mkdtemp(join(tmpdir(),'agentpay-pey-g4-'));now='2026-11-07T18:00:00.123Z';submission=null;calls=[];scenario='OK';paid=false;queryMissing=false;beforeReceipt=undefined;queryPatch={};
 for(const name of ['commerce','inbox']){const path=join(dir,name+'.db');await writeFile(path,'',{mode:0o600});execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--schema','packages/database/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:'file:'+path},stdio:'pipe'});}
 db=new Database('file:'+join(dir,'commerce.db'));inbox=new Database('file:'+join(dir,'inbox.db'));await seedDemo(db,now);
 await db.client.merchantPaymentAccount.update({where:{id:'account-demo'},data:{provider:'pey',providerBankAccountId:bankId,beneficiaryDisplayName:bankName}});
 config={gateway:gateway(),apiKeyId:apiId,bankAccountId:bankId,beneficiaryDisplayName:bankName,buyerPhone:phone};app=buildApp(options());
 receiver=buildPeyWebhookReceiver({db:inbox,loadConfig:async()=>({signingSecret,encryptionKey})});processor=new PeyInboxProcessor(inbox,new PeyPaymentService(db,()=>now,config),async()=>encryptionKey,()=>now);
},30000);
afterEach(async()=>{await app?.close();await receiver?.close();await db?.close();await inbox?.close();await rm(dir,{recursive:true,force:true});});
describe('G4 real adapter wired with fixture transport; no bank calls',()=>{
 it('keeps default flags blocked without storing attempts or using credentials over HTTP',async()=>{
  const o=await order();expect((await request(o)).statusCode).toBe(403);expect(calls).toHaveLength(0);expect(await db.client.paymentAttempt.count()).toBe(0);expect((await app.inject({url:'/health'})).json().realPaymentsEnabled).toBe(false);
 });
 it('persists first, leaves HTTP 200 pending, then reconciles encrypted signed inbox and notifies once',async()=>{
  beforeReceipt=async()=>{expect(await db.client.paymentAttempt.count()).toBe(1);expect(await db.client.idempotencyRecord.count({where:{route:{contains:'payment-requests'}}})).toBe(1);};
  const {o,attemptId}=await submitted();expect((await db.client.order.findUniqueOrThrow({where:{id:o.id}})).status).toBe('PAYMENT_PENDING');expect(await db.client.providerTransaction.count()).toBe(0);
  expect((await deliver()).statusCode).toBe(200);await processor.drain();await new OutboxDispatcher(db,()=>now).drain();
  expect((await db.client.paymentAttempt.findUniqueOrThrow({where:{id:attemptId}})).status).toBe('CONFIRMED');expect((await db.client.order.findUniqueOrThrow({where:{id:o.id}})).status).toBe('PAID');expect(await db.client.merchantNotification.count()).toBe(1);
  expect((await db.client.providerTransaction.findFirstOrThrow()).datePaid).not.toBeNull();
  const state=await app.inject({url:`/v1/orders/${o.id}/payments`,headers:headers()});expect(state.json().label).toBe('REAL');expect(state.body).not.toMatch(/fixture-api-key|5500000000|clabe/);
 });
 it('submits once under concurrent replay and never submits again with another key',async()=>{
  const o=await order();arm(o);const r=await Promise.all(Array.from({length:6},()=>request(o)));expect(r.every(x=>x.statusCode===202)).toBe(true);expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);expect((await request(o,'different-pey-key')).statusCode).toBe(409);
 });
 it.each(['TIMEOUT','503','BAD_RECEIPT'] as const)('keeps %s uncertain and resolves only from signed evidence',async s=>{
  scenario=s;const {o,attemptId}=await submitted();expect((await db.client.paymentAttempt.findUniqueOrThrow({where:{id:attemptId}})).status).toBe('SUBMISSION_UNKNOWN');await request(o);expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);
  await deliver();await processor.drain();expect((await db.client.paymentAttempt.findUniqueOrThrow({where:{id:attemptId}})).status).toBe('CONFIRMED');expect(await db.client.providerTransaction.count()).toBe(1);
 });
 it('does not send POST if authenticated bank verification is not ACTIVE',async()=>{
  scenario='PENDING_BANK';const {attemptId}=await submitted();expect(calls.filter(c=>c.method==='POST')).toHaveLength(0);expect((await db.client.paymentAttempt.findUniqueOrThrow({where:{id:attemptId}})).status).toBe('CANCELLED_LOCALLY');expect(await db.client.reservation.count({where:{status:'RELEASED'}})).toBe(1);
 });
 it('handles a signed callback before the HTTP receipt and later records codiId without downgrading PAID',async()=>{
  beforeReceipt=async()=>{await deliver();await processor.drain();};const {o,attemptId}=await submitted();const a=await db.client.paymentAttempt.findUniqueOrThrow({where:{id:attemptId}});expect(a.status).toBe('CONFIRMED');expect(a.codiId).toBe('12345678901234567890');expect((await db.client.order.findUniqueOrThrow({where:{id:o.id}})).status).toBe('PAID');
 });
 it.each(['amount','apiKeyId','bankAccountId','numRef','transactionId','orderId','datePaid'])('holds signed %s mismatch without financial effects',async field=>{
  const {o}=await submitted();const event=wire();
  if(field==='amount')event.amount=849.99;if(field==='apiKeyId')event.apiKeyId='foreign';if(field==='bankAccountId')event.bankAccountId='foreign';if(field==='numRef')event.numRef='9999999';if(field==='transactionId')event.transactionId='foreign';if(field==='datePaid')event.datePaid-=3600;if(field==='orderId')event.metadata.externalMetadata={...(submission!.metadata as object),orderId:'foreign'};
  await deliver(event);await processor.drain();expect(await db.client.providerTransaction.count()).toBe(0);expect((await db.client.order.findUniqueOrThrow({where:{id:o.id}})).status).toBe('EXCEPTION');expect(await db.client.merchantNotification.count()).toBe(0);
 });
 it('deduplicates delivery and effect across distinct IDs and restarts',async()=>{
  const {o}=await submitted();await deliver();await processor.drain();await deliver(wire(),'fixture-second-event');await processor.drain();await new OutboxDispatcher(db,()=>now).drain();
  await app.close();await db.close();db=new Database('file:'+join(dir,'commerce.db'));app=buildApp(options());processor=new PeyInboxProcessor(inbox,new PeyPaymentService(db,()=>now,config),async()=>encryptionKey,()=>now);
  await deliver(wire(),'fixture-third-event');await processor.drain();await request(o);await new OutboxDispatcher(db,()=>now).drain();expect(await db.client.providerTransaction.count()).toBe(1);expect(await db.client.merchantNotification.count()).toBe(1);expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);
 });
 it('recovers an inbox acknowledgement failure after the business commit without double effects',async()=>{
  await submitted();await deliver();let fail=true;const broken=new PeyInboxProcessor(inbox,new PeyPaymentService(db,()=>now,config),async()=>encryptionKey,()=>now,async()=>{if(fail){fail=false;throw new Error('fixture crash');}});
  await broken.drain();expect(await db.client.providerTransaction.count()).toBe(1);expect((await inbox.client.peyWebhookInbox.findFirstOrThrow()).status).toBe('RETRY');now='2026-11-07T18:01:00Z';await processor.drain();expect(await db.client.providerTransaction.count()).toBe(1);expect((await inbox.client.peyWebhookInbox.findFirstOrThrow()).status).toBe('PROCESSED');
 });
 it('rejects altered encrypted evidence and preserves it for retry without confirming payment',async()=>{
  await submitted();await deliver();const row=await inbox.client.peyWebhookInbox.findFirstOrThrow();await inbox.client.peyWebhookInbox.update({where:{id:row.id},data:{authTag:'0'.repeat(32)}});await processor.drain();expect(await db.client.providerTransaction.count()).toBe(0);expect((await inbox.client.peyWebhookInbox.findFirstOrThrow()).status).toBe('RETRY');
 });
 it('records a late genuine-shaped payment and alerts fulfillment exception without consuming reassigned inventory',async()=>{
  const {o,attemptId}=await submitted();now='2026-11-07T18:31:00Z';await deliver();await processor.drain();expect((await db.client.paymentAttempt.findUniqueOrThrow({where:{id:attemptId}})).status).toBe('CONFIRMED');expect((await db.client.order.findUniqueOrThrow({where:{id:o.id}})).fulfillmentStatus).toBe('FULFILLMENT_EXCEPTION');expect((await db.client.product.findUniqueOrThrow({where:{id:'coffee'}})).stock).toBe(10);
 });
 it('uses authenticated transaction query plus bank identity to recover a missing webhook; PENDING/404 never mean failed',async()=>{
  const {o,attemptId}=await submitted();const path=`/v1/orders/${o.id}/reconcile`;
  expect((await app.inject({method:'POST',url:path,headers:headers(),payload:{}})).json().orderStatus).toBe('PAYMENT_PENDING');queryMissing=true;expect((await app.inject({method:'POST',url:path,headers:headers(),payload:{}})).statusCode).toBe(503);queryMissing=false;paid=true;
  expect((await app.inject({method:'POST',url:path,headers:headers(),payload:{}})).json().orderStatus).toBe('PAID');expect((await db.client.paymentAttempt.findUniqueOrThrow({where:{id:attemptId}})).status).toBe('CONFIRMED');expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);
 });
 it('requires local consent/binding and prevents other actors and mock controls in the pey profile',async()=>{
  const o=await order();arm(o);expect((await request(o,'foreign-key',2)).statusCode).toBe(404);expect((await request(o,'merchant-key',1)).statusCode).toBe(403);
  await db.client.buyer.update({where:{id:'buyer-demo'},data:{phoneNumber:'5599999999'}});expect((await request(o)).statusCode).toBe(409);expect(calls).toHaveLength(0);
  expect((await app.inject({method:'POST',url:'/v1/test-only/mock-payments/x/confirm',headers:headers(),payload:{}})).statusCode).toBe(404);
 });
 it('loads only fixture private config with double flags false and does not contact pey',async()=>{
  const path=join(dir,'.env.pey.local'),grantPath=join(dir,'absent-grant.json');await writeFile(path,'PEY_API_KEY=fixture-only\nPEY_API_KEY_ID=fixture-api\nPEY_BANK_ACCOUNT_ID=fixture-bank\nPEY_BENEFICIARY_NAME="Fixture Merchant"\nPEY_BUYER_PHONE=5500000000\nALLOW_REAL_PAYMENTS=false\n',{mode:0o600});
  const loaded=await loadPeyPaymentOptions(path,grantPath);expect(loaded.gateway.allowRealPayments).toBe(false);expect(loaded.gateway.grant).toBeNull();expect(calls).toHaveLength(0);expect((await readFile(path,'utf8'))).toContain('ALLOW_REAL_PAYMENTS=false');
 });
 it.each(['clabe','fee','currency','method','payable','amount'])('does not confirm an authenticated query with wrong %s',async field=>{
  const {o}=await submitted();paid=true;
  if(field==='clabe')queryPatch={metadata:{clabe:'111111111111111111',externalMetadata:submission!.metadata}};
  if(field==='fee')queryPatch={amountBreakdown:{base:849,fee:1,tip:0}};
  if(field==='currency')queryPatch={currency:'USD'};
  if(field==='method')queryPatch={paymentMethod:'CARD'};
  if(field==='payable')queryPatch={payableType:'PAYMENT_LINK'};
  if(field==='amount')queryPatch={amount:849.99};
  const r=await app.inject({method:'POST',url:`/v1/orders/${o.id}/reconcile`,headers:headers(),payload:{}});expect([200,503]).toContain(r.statusCode);expect(await db.client.providerTransaction.count()).toBe(0);expect(await db.client.merchantNotification.count()).toBe(0);expect((await db.client.order.findUniqueOrThrow({where:{id:o.id}})).status).not.toBe('PAID');
 });

 it('recovers a crash before finalization as UNKNOWN and still reconciles after sending is disabled',async()=>{
  scenario='TIMEOUT';const {o,attemptId}=await submitted();await db.client.paymentAttempt.update({where:{id:attemptId},data:{status:'SUBMISSION_PENDING'}});
  await app.close();await db.close();db=new Database('file:'+join(dir,'commerce.db'));config.gateway=gateway();app=buildApp(options());await app.ready();
  expect((await db.client.paymentAttempt.findUniqueOrThrow({where:{id:attemptId}})).status).toBe('SUBMISSION_UNKNOWN');
  expect((await request(o)).statusCode).toBe(202);expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);
  processor=new PeyInboxProcessor(inbox,new PeyPaymentService(db,()=>now,config),async()=>encryptionKey,()=>now);await deliver();await processor.drain();
  expect((await db.client.paymentAttempt.findUniqueOrThrow({where:{id:attemptId}})).status).toBe('CONFIRMED');expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);
 });

});
