import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Database } from '../packages/database/src/index.js';
import { MockCodiPushGateway,signMockEvent } from '../packages/integrations/src/index.js';
import { buildApp } from '../apps/api/src/index.js';
import { webDemoInterpreter } from '../apps/api/src/web-demo-interpreter.js';
import { seedDemo } from '../packages/database/src/seed.js';

if(process.env.NODE_ENV==='production'||process.env.ALLOW_REAL_PAYMENTS==='true'||(process.env.PAYMENT_PROVIDER&&process.env.PAYMENT_PROVIDER!=='mock'))throw new Error('CONTEST_MOCK_ONLY');
const checks:string[]=[];
const text=(budget='1,000')=>`Compra 2 kg de café por máximo $${budget} mañana`;
async function scenario(mode:'happy'|'timeout'|'mismatch'|'late'){
 const dir=await mkdtemp(join(tmpdir(),'agentpay-contest-')),path=join(dir,'fixture.db');let db:Database|undefined,app:ReturnType<typeof buildApp>|undefined;
 try{
  await writeFile(path,'',{mode:0o600});
  execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--schema','packages/database/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:'file:'+path},stdio:'pipe'});
  db=new Database('file:'+path);let now=new Date().toISOString();const clock=()=>now;await seedDemo(db,now);
  const buyer=randomBytes(32).toString('hex'),merchant=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex'),control=randomBytes(32).toString('hex');
  const gateway=new MockCodiPushGateway(db,clock,mode==='timeout'?'TIMEOUT_AFTER_ACCEPT':'ACCEPT');
  const config=()=>({db:db!,clock,credentials:[{token:buyer,actor:{role:'BUYER' as const,id:'buyer-demo'}},{token:merchant,actor:{role:'MERCHANT' as const,id:'merchant-demo'}}],shoppingAgent:{interpreter:webDemoInterpreter,productAliases:{coffee:['café','cafe']}},mockPayments:{gateway,webhookSecret:secret,apiKeyId:'mock-contest-key',controlToken:control}});
  app=buildApp(config());let address=await app.listen({host:'127.0.0.1',port:0});
  async function call(url:string,body?:object,key='contest-default-key',token=buyer){const response=await fetch(address+url,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'idempotency-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
  if(mode==='happy'){
   const blocked=await call('/v1/agent/proposals',{text:text('800'),timezone:'America/Mexico_City'},'contest-over-budget');
   assert.equal(blocked.body.status,'NO_ELIGIBLE_OFFER');assert.ok(blocked.body.decision.evaluations.every((e:{reasons:string[]})=>e.reasons.includes('BUDGET')));
   assert.equal(await db.client.reservation.count(),0);assert.equal(await db.client.paymentAttempt.count(),0);checks.push('budget_rejection_without_order_or_payment');
  }
  const proposalBody={text:text(),timezone:'America/Mexico_City'},proposal=await call('/v1/agent/proposals',proposalBody,'contest-proposal');
  assert.equal(proposal.body.status,'PROPOSED');assert.equal(proposal.body.snapshot.amountMinor,85000);
  const rejected=proposal.body.decision.evaluations.find((e:{offerId:string})=>e.offerId==='coffee-1200');assert.ok(rejected.reasons.includes('BUDGET'));
  assert.equal((await call('/v1/agent/proposals',proposalBody,'contest-proposal')).body.proposalId,proposal.body.proposalId);
  assert.equal(await db.client.reservation.count({where:{status:'RESERVED'}}),1);
  assert.equal(await db.client.order.count(),0);assert.equal(await db.client.paymentAttempt.count(),0);
  const approve={proposalId:proposal.body.proposalId,snapshotHash:proposal.body.snapshotHash,approved:true};
  const order=await call('/v1/orders',approve,'contest-approval');assert.equal(order.status,201);
  if(mode==='happy'){
   assert.equal((await call(`/v1/orders/${order.body.id}/preparation`,{},'contest-early-preparation',merchant)).status,409);checks.push('merchant_preparation_blocked_before_payment');
  }
  const input={snapshotHash:order.body.snapshotHash,approved:true},url=`/v1/orders/${order.body.id}/payment-requests`;
  const [first,replay]=await Promise.all([call(url,input,'contest-payment'),call(url,input,'contest-payment')]);assert.equal(first.status,202);assert.equal(replay.status,202);assert.equal(first.body.id,replay.body.id);
  const attemptId=first.body.id,paymentsUrl=`/v1/orders/${order.body.id}/payments`;
  const waiting=await call(paymentsUrl);assert.equal(waiting.body.orderStatus,'PAYMENT_PENDING');assert.notEqual(waiting.body.attempts[0].status,'CONFIRMED');
  assert.equal(await db.client.mockSubmission.count(),1);assert.equal(await db.client.providerTransaction.count(),0);
  if(mode==='timeout'){assert.equal(waiting.body.attempts[0].status,'SUBMISSION_UNKNOWN');checks.push('timeout_no_resubmission_or_false_failure');}
  if(mode==='late')now=new Date(Date.parse(now)+40*60000).toISOString();
  const wire=await gateway.notice(attemptId,true);
  const event=mode==='mismatch'?{...wire,amount:'0.01'}:wire,raw=Buffer.from(JSON.stringify(event));
  async function webhook(id:string,signed=true){return fetch(address+'/v1/test-only/mock-webhook',{method:'POST',headers:{'content-type':'application/mock-event+json',...(signed?signMockEvent(raw,secret,id,String(Math.floor(Date.parse(now)/1000))):{})},body:raw});}
  if(mode==='happy'){assert.equal((await webhook('mock-event-forged',false)).status,401);assert.equal(await db.client.providerTransaction.count(),0);checks.push('unsigned_webhook_rejected');}
  const confirmed=await webhook('mock-event-contest-one');assert.equal(confirmed.status,200);
  assert.equal((await (await webhook('mock-event-contest-one')).json() as {duplicate:boolean}).duplicate,true);
  await webhook('mock-event-contest-two');
  if(mode==='mismatch'){
   assert.equal((await call(paymentsUrl)).body.orderStatus,'EXCEPTION');assert.equal(await db.client.providerTransaction.count(),0);assert.equal((await db.client.product.findUniqueOrThrow({where:{id:'coffee'}})).stock,10);
   assert.equal(await db.client.merchantNotification.count(),0);checks.push('wrong_amount_does_not_confirm_or_consume_stock');return;
  }
  await fetch(address+'/v1/test-only/outbox/dispatch',{method:'POST',headers:{'content-type':'application/json','x-mock-control-token':control},body:'{}'});
  const paid=await call(paymentsUrl);assert.equal(paid.body.attempts[0].status,'CONFIRMED');assert.equal(await db.client.providerTransaction.count(),1);assert.equal(await db.client.merchantNotification.count(),1);
  assert.equal((await db.client.product.findUniqueOrThrow({where:{id:'coffee'}})).stock,mode==='late'?10:8);
  const preparation=await call(`/v1/orders/${order.body.id}/preparation`,{},'contest-prepare',merchant);
  assert.equal(preparation.status,mode==='late'?409:200);
  if(mode==='late'){assert.equal(paid.body.fulfillmentStatus,'FULFILLMENT_EXCEPTION');checks.push('late_money_preserved_without_preparing_expired_stock');}
  else checks.push(mode==='timeout'?'unknown_attempt_reconciled_without_another_submission':'full_purchase_to_merchant_preparation_with_single_effect');
  if(mode==='happy'){
   await app.close();app=buildApp(config());address=await app.listen({host:'127.0.0.1',port:0});
   assert.equal((await call(paymentsUrl)).body.fulfillmentStatus,'PREPARING');assert.equal((await call(url,input,'contest-payment')).body.id,attemptId);
   assert.equal(await db.client.mockSubmission.count(),1);assert.equal(await db.client.merchantNotification.count(),1);checks.push('restart_preserves_order_payment_and_idempotency');
   checks.push('duplicate_delivery_and_transaction_have_one_effect');
  }
 }finally{await app?.close();await db?.close();await rm(dir,{recursive:true,force:true});}
}
for(const mode of ['happy','timeout','mismatch','late'] as const)await scenario(mode);
const report={profile:'SIMULADO',status:'PASSED',generatedAt:new Date().toISOString(),scenarios:4,checks,realOpenAICalls:0,realBankCalls:0};
await mkdir('work',{recursive:true,mode:0o700});await writeFile('work/contest-report.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
