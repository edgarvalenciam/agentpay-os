import { afterEach,beforeEach,describe,it,expect } from 'vitest';
import { randomBytes,createDecipheriv } from 'node:crypto';
import { mkdtemp,rm,writeFile,chmod } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { Database } from '@agentpay/database';
import { Webhook } from '@agentpay/integrations';
import { buildPeyWebhookReceiver } from '../src/pey-webhook-receiver.js';
import { loadPeyReceiverConfig,type PeyReceiverConfig } from '../src/pey-webhook-config.js';
let dir:string,db:Database,app:ReturnType<typeof buildPeyWebhookReceiver>,config:PeyReceiverConfig;
const secret='whsec_'+randomBytes(32).toString('base64');
const payload=JSON.stringify({type:'codi.pn.payment_received',amount:0.01,apiKeyId:'fixture-api-key',transactionId:'fixture-tx',numRef:'123',datePaid:1794070000,metadata:{clabe:'000000000000000000',externalMetadata:{orderId:'fixture-order'}}});
function signed(raw=payload,id='fixture-delivery',date=new Date(),signingSecret=secret){return {'content-type':'application/json','webhook-id':id,'webhook-timestamp':String(Math.floor(date.getTime()/1000)),'webhook-signature':new Webhook(signingSecret).sign(id,date,raw)};}
beforeEach(async()=>{dir=await mkdtemp(join(tmpdir(),'agentpay-pey-inbox-'));const path=join(dir,'test.db');await writeFile(path,'',{mode:0o600});execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--schema','packages/database/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:'file:'+path},stdio:'pipe'});db=new Database('file:'+path);config={signingSecret:secret,encryptionKey:randomBytes(32)};app=buildPeyWebhookReceiver({db,loadConfig:async()=>config});},30000);
afterEach(async()=>{await app?.close();await db?.close();await rm(dir,{recursive:true,force:true});});
describe('dedicated public pey receiver',()=>{
 it('verifies official Standard Webhooks over original bytes and stores encrypted evidence without payment effects',async()=>{
   const response=await app.inject({method:'POST',url:'/v1/webhooks/pey',headers:signed(),payload});expect(response.statusCode).toBe(200);expect(response.json().status).toBe('PENDING_RECONCILIATION');
   const row=await db.client.peyWebhookInbox.findFirstOrThrow();expect(row.status).toBe('VERIFIED_PENDING_RECONCILIATION');expect(JSON.stringify(row)).not.toContain('000000000000000000');
   const decipher=createDecipheriv('aes-256-gcm',config.encryptionKey,Buffer.from(row.iv,'hex'));decipher.setAuthTag(Buffer.from(row.authTag,'hex'));expect(Buffer.concat([decipher.update(Buffer.from(row.ciphertext,'base64')),decipher.final()]).toString()).toBe(payload);
   expect(await db.client.order.count()).toBe(0);expect(await db.client.providerTransaction.count()).toBe(0);expect(await db.client.paymentAttempt.count()).toBe(0);expect(await db.client.merchantNotification.count()).toBe(0);
 });
 it.each(['missing','tampered','wrong-secret','expired','future'])('rejects %s signature without storing payload',async mode=>{
   const date=new Date(Date.now()+(mode==='expired'?-301000:mode==='future'?301000:0));const headers=mode==='missing'?{'content-type':'application/json'}:signed(payload,'fixture-delivery',date,mode==='wrong-secret'?'whsec_'+randomBytes(32).toString('base64'):secret);
   const response=await app.inject({method:'POST',url:'/v1/webhooks/pey',headers,payload:mode==='tampered'?payload+' ':payload});expect(response.statusCode).toBe(401);expect(await db.client.peyWebhookInbox.count()).toBe(0);expect(response.body).not.toContain(secret);
 });
 it('rejects forged timestamp formats rather than relying on parseInt truncation',async()=>{const headers=signed();headers['webhook-timestamp']+='suffix';expect((await app.inject({method:'POST',url:'/v1/webhooks/pey',headers,payload})).statusCode).toBe(401);});
 it('deduplicates concurrent deliveries and rejects conflicting content under the same delivery ID',async()=>{
   const replies=await Promise.all(Array.from({length:5},()=>app.inject({method:'POST',url:'/v1/webhooks/pey',headers:signed(),payload})));expect(replies.every(r=>r.statusCode===200)).toBe(true);expect(await db.client.peyWebhookInbox.count()).toBe(1);
   const changed=payload.replace('0.01','0.02');expect((await app.inject({method:'POST',url:'/v1/webhooks/pey',headers:signed(changed),payload:changed})).statusCode).toBe(409);expect(await db.client.peyWebhookInbox.count()).toBe(1);
 });
 it('returns 503 while secret is missing and loads configuration again without restarting',async()=>{
   config={...config,signingSecret:null};expect((await app.inject({url:'/health'})).json().status).toBe('waiting_for_webhook_secret');expect((await app.inject({method:'POST',url:'/v1/webhooks/pey',headers:signed(),payload})).statusCode).toBe(503);expect(await db.client.peyWebhookInbox.count()).toBe(0);
   config={...config,signingSecret:secret};expect((await app.inject({method:'POST',url:'/v1/webhooks/pey',headers:signed(),payload})).statusCode).toBe(200);
 });
 it('has no orders, mock controls, financial commands, filesystem or inbox read endpoints',async()=>{
   for(const path of ['/v1/orders','/v1/test-only/outbox/dispatch','/.env.pey.local','/inbox','/v1/orders/x/payment-requests'])expect((await app.inject({method:'POST',url:path,payload:{}})).statusCode).toBe(404);
   expect((await app.inject({url:'/health'})).body).not.toMatch(/clabe|phone|PEY_BUYER|whsec_/);
 });
 it('preserves unsupported signed events for later handling, without copying arbitrary type content to metadata',async()=>{
   const raw=JSON.stringify({type:'unsupported-external-event',data:{sensitive:'fixture'}});expect((await app.inject({method:'POST',url:'/v1/webhooks/pey',headers:signed(raw),payload:raw})).statusCode).toBe(200);expect((await db.client.peyWebhookInbox.findFirstOrThrow()).eventType).toBe('UNSUPPORTED_EVENT');
 });
 it('does not acknowledge success when the durable store fails',async()=>{
   const broken=buildPeyWebhookReceiver({db:{read:work=>db.read(work),write:async()=>{throw new Error('private-diagnostic');},close:async()=>{}},loadConfig:async()=>config});
   const result=await broken.inject({method:'POST',url:'/v1/webhooks/pey',headers:signed(),payload});expect(result.statusCode).toBe(503);expect(result.body).not.toContain('private-diagnostic');await broken.close();
 });
 it('rejects signed invalid JSON and applies a bounded request budget',async()=>{
   const raw='{broken';expect((await app.inject({method:'POST',url:'/v1/webhooks/pey',headers:signed(raw),payload:raw})).statusCode).toBe(400);
   const limited=buildPeyWebhookReceiver({db,loadConfig:async()=>config,requestsPerMinute:1});expect((await limited.inject({method:'POST',url:'/v1/webhooks/pey',headers:signed(),payload})).statusCode).toBe(200);expect((await limited.inject({method:'POST',url:'/v1/webhooks/pey',headers:signed(),payload})).statusCode).toBe(429);await limited.close();
 });
 it('requires a private configuration file and reloads the secret without printing its values',async()=>{
   const path=join(dir,'.env.pey.local');await writeFile(path,'PEY_WEBHOOK_SECRET='+secret+'\nPEY_INBOX_ENCRYPTION_KEY='+config.encryptionKey.toString('hex')+'\n',{mode:0o600});expect((await loadPeyReceiverConfig(path)).signingSecret).toBe(secret);await chmod(path,0o644);await expect(loadPeyReceiverConfig(path)).rejects.toThrow('PRIVATE_CONFIG_REQUIRED');
 });
 it('retains deduplication after receiver and database restart',async()=>{
   await app.inject({method:'POST',url:'/v1/webhooks/pey',headers:signed(),payload});await app.close();await db.close();db=new Database('file:'+join(dir,'test.db'));app=buildPeyWebhookReceiver({db,loadConfig:async()=>config});expect((await app.inject({method:'POST',url:'/v1/webhooks/pey',headers:signed(),payload})).json().duplicate).toBe(true);expect(await db.client.peyWebhookInbox.count()).toBe(1);
 });
});
