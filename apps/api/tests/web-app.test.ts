import { beforeEach,afterEach,describe,it,expect } from 'vitest';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import Fastify from 'fastify';
import { Database } from '@agentpay/database';
import { MockCodiPushGateway } from '@agentpay/integrations';
import { seedDemo } from '../../../packages/database/src/seed.js';
import { buildApp } from '../src/index.js';
import { buildWebApp } from '../src/web-app.js';
import { webDemoInterpreter } from '../src/web-demo-interpreter.js';
import { OutboxDispatcher } from '../src/outbox.js';
let dir:string,db:Database,api:ReturnType<typeof buildApp>,web:ReturnType<typeof buildWebApp>,cookie:string,csrf:string;
const now='2026-11-07T18:00:00Z',host='127.0.0.1:3002',origin='http://'+host;
const buyerToken='fixture-web-buyer-token-1234567',merchantToken='fixture-web-merchant-token-12345',controlToken='fixture-web-operator-token-12345';
const config=()=>({api,origin,buyerToken,merchantToken,controlToken});
const call=(url:string,method:'GET'|'POST'='GET',body:Record<string,unknown>={},key='fixture-web-action-key')=>web.inject({url,method,headers:{host,cookie,'x-ui-csrf':csrf,'idempotency-key':key},...(method==='POST'?{payload:body}:{})});
async function role(value:string){const r=await call('/ui-api/role','POST',{role:value});expect(r.statusCode).toBe(200);}
async function order(){const proposal=await call('/ui-api/proposals','POST',{text:'Compra 2 kg de café por máximo $1,000 mañana',timezone:'America/Mexico_City'},'fixture-web-proposal');expect(proposal.statusCode).toBe(200);expect(proposal.json().status).toBe('PROPOSED');const p=proposal.json();const r=await call('/ui-api/orders','POST',{proposalId:p.proposalId,snapshotHash:p.snapshotHash,approved:true},'fixture-web-approve');expect(r.statusCode).toBe(201);return r.json<{id:string;snapshotHash:string}>();}
async function requested(){const o=await order();const r=await call(`/ui-api/orders/${o.id}/payment-requests`,'POST',{approved:true,snapshotHash:o.snapshotHash},'fixture-web-payment');expect(r.statusCode).toBe(202);return {o,attemptId:r.json<{id:string}>().id};}
beforeEach(async()=>{
 dir=await mkdtemp(join(tmpdir(),'agentpay-web-test-'));const path=join(dir,'commerce.db');await writeFile(path,'',{mode:0o600});execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--schema','packages/database/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:'file:'+path},stdio:'pipe'});
 db=new Database('file:'+path);await seedDemo(db,now);api=buildApp({db,clock:()=>now,credentials:[{token:buyerToken,actor:{role:'BUYER',id:'buyer-demo'}},{token:merchantToken,actor:{role:'MERCHANT',id:'merchant-demo'}},{token:'fixture-web-other-buyer-token-12345',actor:{role:'BUYER',id:'buyer-other'}}],shoppingAgent:{interpreter:webDemoInterpreter,productAliases:{coffee:['café','cafe']}},mockPayments:{gateway:new MockCodiPushGateway(db,()=>now),webhookSecret:'fixture-web-signing-secret-minimum-32-characters',apiKeyId:'mock-web-fixture',controlToken}});
 web=buildWebApp(config());const s=await web.inject({url:'/ui-api/session',headers:{host}});cookie=String(s.headers['set-cookie']).split(';')[0]!;csrf=s.json().csrf;
},30000);
afterEach(async()=>{await web?.close();await api?.close();await db?.close();await rm(dir,{recursive:true,force:true});});
describe('G6 local web BFF',()=>{
 it('serves frontend assets with CSP and never exposes private upstream tokens',async()=>{for(const path of ['/','/client.js','/styles.css']){const r=await call(path);expect(r.statusCode).toBe(200);expect(r.body).not.toContain(buyerToken);expect(r.body).not.toContain(merchantToken);expect(r.body).not.toContain(controlToken);expect(r.headers['content-security-policy']).toContain("connect-src 'self'");expect(r.headers['content-security-policy']).not.toContain('unsafe-inline');expect(r.headers['cache-control']).toBe('no-store');}expect((await call('/')).body).toContain('SIMULADO');});
 it('uses HttpOnly SameSite cookies and does not return a Bearer credential in session data',async()=>{const r=await web.inject({url:'/ui-api/session',headers:{host}});expect(String(r.headers['set-cookie'])).toContain('HttpOnly');expect(String(r.headers['set-cookie'])).toContain('SameSite=Strict');expect(r.json()).toMatchObject({role:'BUYER',environment:'mock',agentProvider:'fixture'});expect(r.body).not.toMatch(/fixture-web-.*token|Bearer/);});
 it('isolates cookies between the ordinary demo and contest ports on the same host',async()=>{
  await role('MERCHANT');expect(cookie).toMatch(/^agentpay_demo_3002=/);
  const other=buildWebApp({...config(),origin:'http://127.0.0.1:3003'});
  try{const session=await other.inject({url:'/ui-api/session',headers:{host:'127.0.0.1:3003',cookie}});
   expect(session.json().role).toBe('BUYER');expect(String(session.headers['set-cookie'])).toMatch(/^agentpay_demo_3003=/);
   expect((await call('/ui-api/session')).json().role).toBe('MERCHANT');
  }finally{await other.close();}
 });
 it('rejects cross-origin and hostile Host headers before any mutations',async()=>{for(const headers of [{host,origin:'https://attacker.example',cookie,'x-ui-csrf':csrf},{host:'attacker.example',cookie,'x-ui-csrf':csrf}])expect((await web.inject({url:'/ui-api/role',method:'POST',headers,payload:{role:'OPERATOR'}})).statusCode).toBe(403);expect(await db.client.order.count()).toBe(0);});
 it('rejects missing session or CSRF even with supplied upstream Authorization',async()=>{expect((await web.inject({url:'/ui-api/orders',method:'POST',headers:{host,authorization:'Bearer '+buyerToken},payload:{}})).statusCode).toBe(401);expect((await web.inject({url:'/ui-api/orders',method:'POST',headers:{host,cookie},payload:{}})).statusCode).toBe(403);});
 it('does not proxy arbitrary API, provider, secrets or operator paths',async()=>{for(const path of ['/.env.pey.local','/.env.openai.local','/v1/orders','/ui-api/codi/pn','/ui-api/test-only/mock-payments/x/confirm','/packages/database/schema.prisma'])expect((await call(path)).statusCode).toBe(404);});
 it('keeps proposal, approval, payment request and operator confirmation distinct',async()=>{
  const {o,attemptId}=await requested();expect((await call(`/ui-api/orders/${o.id}/payments`)).json().orderStatus).toBe('PAYMENT_PENDING');expect(await db.client.providerTransaction.count()).toBe(0);expect((await db.client.product.findUniqueOrThrow({where:{id:'coffee'}})).stock).toBe(10);
  expect((await call(`/ui-api/simulation/${attemptId}/confirm`,'POST')).statusCode).toBe(403);
  await role('MERCHANT');expect((await call(`/ui-api/merchant/orders/${o.id}/preparation`,'POST')).statusCode).toBe(409);
  await role('OPERATOR');expect((await call(`/ui-api/simulation/${attemptId}/confirm`,'POST')).statusCode).toBe(200);await new OutboxDispatcher(db,()=>now).drain();
  await role('BUYER');const payment=(await call(`/ui-api/orders/${o.id}/payments`)).json();expect(payment.orderStatus).toBe('PAID');expect(payment.attempts[0].status).toBe('CONFIRMED');expect((await db.client.product.findUniqueOrThrow({where:{id:'coffee'}})).stock).toBe(8);
  await role('MERCHANT');expect((await call('/ui-api/merchant/notifications')).json()).toHaveLength(1);expect((await call('/ui-api/merchant/orders')).json()[0]).toMatchObject({amountMinor:85000,quantity:2,unit:'kg',productId:'coffee'});
  const prepared=await call(`/ui-api/merchant/orders/${o.id}/preparation`,'POST',{},'fixture-prepare-once');expect(prepared.statusCode).toBe(200);expect(prepared.json().fulfillmentStatus).toBe('PREPARING');expect((await call(`/ui-api/merchant/orders/${o.id}/preparation`,'POST',{},'fixture-prepare-once')).json()).toEqual(prepared.json());expect(await db.client.auditEvent.count({where:{orderId:o.id,type:'MERCHANT_PREPARATION_STARTED'}})).toBe(1);
 });
 it('replays a payment request idempotently and GET polling cannot mark it paid',async()=>{const {o}=await requested();const replay=await call(`/ui-api/orders/${o.id}/payment-requests`,'POST',{approved:true,snapshotHash:o.snapshotHash},'fixture-web-payment');expect(replay.statusCode).toBe(202);for(let i=0;i<3;i++)expect((await call(`/ui-api/orders/${o.id}/payments`)).json().orderStatus).toBe('PAYMENT_PENDING');expect(await db.client.mockSubmission.count()).toBe(1);expect(await db.client.providerTransaction.count()).toBe(0);});
 it('recovers a lost acceptance with the original key without submitting twice, even after confirmation',async()=>{
  const {o,attemptId}=await requested();
  await role('OPERATOR');await call(`/ui-api/simulation/${attemptId}/confirm`,'POST');await role('BUYER');
  const replay=await call(`/ui-api/orders/${o.id}/payment-requests`,'POST',{approved:true,snapshotHash:o.snapshotHash},'fixture-web-payment');
  expect(replay.statusCode).toBe(202);expect(replay.json().id).toBe(attemptId);
  expect((await call(`/ui-api/orders/${o.id}/payments`)).json().attempts[0].status).toBe('CONFIRMED');
  expect(await db.client.mockSubmission.count()).toBe(1);expect(await db.client.providerTransaction.count()).toBe(1);
 });
 it('releases an unapproved proposal idempotently, frees stock and rejects its stale approval',async()=>{
  const input={text:'Compra 2 kg de café por máximo $1,000 mañana',timezone:'America/Mexico_City'};
  const p=(await call('/ui-api/proposals','POST',input,'release-proposal-run')).json();
  expect(await db.client.reservation.count({where:{status:'RESERVED'}})).toBe(1);
  const release=await call(`/ui-api/proposals/${p.proposalId}/release`,'POST',{},'release-proposal-key');
  expect(release.statusCode).toBe(200);expect(release.json().status).toBe('RELEASED');
  expect((await call(`/ui-api/proposals/${p.proposalId}/release`,'POST',{},'release-proposal-key')).body).toBe(release.body);
  expect(await db.client.reservation.count({where:{status:'RESERVED'}})).toBe(0);
  expect((await call('/ui-api/orders','POST',{proposalId:p.proposalId,snapshotHash:p.snapshotHash,approved:true},'stale-approval-key')).statusCode).toBe(409);
  const next=(await call('/ui-api/proposals','POST',input,'new-proposal-run')).json();expect(next.status).toBe('PROPOSED');
  expect(await db.client.reservation.count({where:{status:'RESERVED'}})).toBe(1);
  expect(await db.client.order.count()).toBe(0);expect(await db.client.paymentAttempt.count()).toBe(0);
 });
 it('prevents release by another buyer or merchant and refuses nonempty bodies',async()=>{
  const p=(await call('/ui-api/proposals','POST',{text:'Compra 2 kg de café por máximo $1,000 mañana',timezone:'America/Mexico_City'})).json();
  const url=`/v1/proposals/${p.proposalId}/release`;
  for(const [token,status] of [['fixture-web-other-buyer-token-12345',404],[merchantToken,403]] as const){
   expect((await api.inject({url,method:'POST',headers:{authorization:'Bearer '+token,'idempotency-key':'foreign-release-key'},payload:{}})).statusCode).toBe(status);
  }
  expect((await call(`/ui-api/proposals/${p.proposalId}/release`,'POST',{cancelPayment:true})).statusCode).toBe(400);
  expect(await db.client.reservation.count({where:{status:'RESERVED'}})).toBe(1);
 });
 it('never releases the reservation or erases evidence of an approved or paid order',async()=>{
  const {o,attemptId}=await requested();const proposalId=(await db.client.order.findUniqueOrThrow({where:{id:o.id}})).proposalId;
  expect((await call(`/ui-api/proposals/${proposalId}/release`,'POST')).statusCode).toBe(409);
  expect((await db.client.reservation.findFirstOrThrow({where:{orderId:o.id}})).status).toBe('RESERVED');
  await role('OPERATOR');await call(`/ui-api/simulation/${attemptId}/confirm`,'POST');await role('BUYER');
  expect((await call(`/ui-api/proposals/${proposalId}/release`,'POST')).statusCode).toBe(409);
  expect((await db.client.reservation.findFirstOrThrow({where:{orderId:o.id}})).status).toBe('CONSUMED');
  expect(await db.client.orderSnapshot.count()).toBe(1);expect(await db.client.consentRecord.count()).toBe(1);
 });
 it('serializes a concurrent approval and release so they cannot both succeed',async()=>{
  const p=(await call('/ui-api/proposals','POST',{text:'Compra 2 kg de café por máximo $1,000 mañana',timezone:'America/Mexico_City'})).json();
  const results=await Promise.all([call(`/ui-api/proposals/${p.proposalId}/release`,'POST',{},'concurrent-release'),call('/ui-api/orders','POST',{proposalId:p.proposalId,snapshotHash:p.snapshotHash,approved:true},'concurrent-approve')]);
  expect(results.filter(r=>r.statusCode<300)).toHaveLength(1);expect(results.filter(r=>r.statusCode===409)).toHaveLength(1);
  const approved=await db.client.order.count(),reservation=await db.client.reservation.findUniqueOrThrow({where:{proposalId:p.proposalId}});
  expect(reservation.status).toBe(approved?'RESERVED':'RELEASED');
 });
 it('accepts a query string when bootstrapping a new session without bypassing protected routes',async()=>{
  expect((await web.inject({url:'/ui-api/session?refresh=1',headers:{host}})).statusCode).toBe(200);
  expect((await web.inject({url:'/ui-api/merchant/orders?refresh=1',headers:{host}})).statusCode).toBe(401);
 });
 it('requires explicit approval and the reviewed hash to create an order',async()=>{expect((await call('/ui-api/orders','POST',{proposalId:'made-up',snapshotHash:'a'.repeat(64)})).statusCode).toBe(400);expect(await db.client.order.count()).toBe(0);});
 it('rejects a changed price after presenting the explanation without consenting or requesting payment',async()=>{
  const p=(await call('/ui-api/proposals','POST',{text:'Compra 2 kg de café por máximo $1,000 mañana',timezone:'America/Mexico_City'})).json();
  expect(p.decision.evaluations.find((e:{offerId:string})=>e.offerId==='coffee-1200').reasons).toContain('BUDGET');
  await db.client.offer.update({where:{id:'coffee-850'},data:{amountMinor:95000,version:{increment:1}}});
  const approval=await call('/ui-api/orders','POST',{proposalId:p.proposalId,snapshotHash:p.snapshotHash,approved:true});expect(approval.statusCode).toBe(409);
  expect(await db.client.order.count()).toBe(0);expect(await db.client.consentRecord.count()).toBe(0);expect(await db.client.paymentAttempt.count()).toBe(0);
 });
 it('keeps operators and merchants away from buyer-only mutation paths',async()=>{await role('MERCHANT');expect((await call('/ui-api/orders','POST')).statusCode).toBe(403);await role('OPERATOR');expect((await call('/ui-api/proposals','POST')).statusCode).toBe(403);});
 it('requires the owning merchant and paid evidence for preparation',async()=>{const o=await order();expect((await api.inject({method:'POST',url:`/v1/orders/${o.id}/preparation`,headers:{authorization:'Bearer '+buyerToken,'idempotency-key':'fixture-buyer-prep'},payload:{}})).statusCode).toBe(403);await role('MERCHANT');expect((await call('/ui-api/merchant/orders/foreign/preparation','POST')).statusCode).toBe(404);expect((await call(`/ui-api/merchant/orders/${o.id}/preparation`,'POST')).statusCode).toBe(409);});
 it('does not treat a late paid order with fulfillment exception as ready for preparation',async()=>{const {o,attemptId}=await requested();await db.client.reservation.updateMany({where:{orderId:o.id},data:{status:'RELEASED'}});await role('OPERATOR');expect((await call(`/ui-api/simulation/${attemptId}/confirm`,'POST')).statusCode).toBe(200);await role('MERCHANT');expect((await call(`/ui-api/merchant/orders/${o.id}/preparation`,'POST')).statusCode).toBe(409);expect(await db.client.auditEvent.count({where:{type:'MERCHANT_PREPARATION_STARTED'}})).toBe(0);});
 it('does not release operator token via frontend or buyer events',async()=>{const o=await order();const events=await call(`/ui-api/orders/${o.id}/events`);expect(events.statusCode).toBe(200);expect(events.body).not.toMatch(/5500000000|Bearer|fixture-web/);});
 it('refuses real or non-fixture backends at startup',async()=>{for(const health of [{mockPaymentsEnabled:true,agentProvider:'fixture'},{realPaymentsEnabled:true,mockPaymentsEnabled:false,agentProvider:'fixture'},{realPaymentsEnabled:false,mockPaymentsEnabled:true,agentProvider:'openai'}]){const unsafe=Fastify();unsafe.get('/health',()=>health);const other=buildWebApp({...config(),api:unsafe});await expect(other.ready()).rejects.toThrow('WEB_FIXTURE_PROFILE_REQUIRED');await other.close().catch(()=>{});await unsafe.close();}});
 it('refuses non-loopback and credential-bearing origins',()=>{for(const value of ['http://0.0.0.0:3002','https://example.com','http://user@127.0.0.1:3002'])expect(()=>buildWebApp({...config(),origin:value})).toThrow('LOCAL_DEMO_ORIGIN_REQUIRED');});
});
