import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { Database } from '../packages/database/src/index.js';
import { seedDemo } from '../packages/database/src/seed.js';
import { PeyCodiPushGateway,Webhook } from '../packages/integrations/src/index.js';
import { buildApp } from '../apps/api/src/index.js';
import { buildPeyWebhookReceiver } from '../apps/api/src/pey-webhook-receiver.js';
import { PeyPaymentService,type PeyPaymentOptions } from '../apps/api/src/pey-payment-service.js';
import { PeyInboxProcessor } from '../apps/api/src/pey-inbox-processor.js';
import { OutboxDispatcher } from '../apps/api/src/outbox.js';
const recoverMode=process.argv.includes('--lost-receipt');
const dir=await mkdtemp(join(tmpdir(),'agentpay-pey-contract-')),clock=()=>new Date().toISOString();
for(const name of ['commerce','inbox']){const path=join(dir,name+'.db');await writeFile(path,'',{mode:0o600});execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--schema','packages/database/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:'file:'+path},stdio:'pipe'});}
const db=new Database('file:'+join(dir,'commerce.db')),inbox=new Database('file:'+join(dir,'inbox.db'));
const bankId='fixture-bank',name='Fixture Beneficiary',phone='5500000000',apiKeyId='fixture-api';
let submitted:Record<string,unknown>|undefined,transportCalls=0,submitCalls=0;
const fixtureTransport:typeof fetch=async(url,init)=>{
 transportCalls++;
 if(String(url).includes('/bank-account/'))return new Response(JSON.stringify({id:bankId,name,clabe:'000000000000000000',codiStatus:'ACTIVE'}));
 const transaction={id:'fixture-transaction',status:'PAID',amount:850,currency:'MXN',paymentMethod:'CODI',payableType:'API_CODI_PN',datePaid:Math.floor(Date.now()/1000),metadata:{clabe:'000000000000000000',externalMetadata:submitted?.metadata??{}}};
 if(String(url)==='https://api.pey.mx/transaction/api-key')return new Response(JSON.stringify({items:[transaction],nextToken:null}));
 if(String(url)==='https://api.pey.mx/transaction/fixture-transaction')return new Response(JSON.stringify(transaction));
 assert.equal(String(url),'https://api.pey.mx/codi/pn');assert.equal(init?.method,'POST');submitted=JSON.parse(String(init?.body));submitCalls++;
 if(recoverMode)throw new Error('fixture receipt lost after provider acceptance');
 return new Response(JSON.stringify({transactionId:'fixture-transaction',codiId:'abcdef0123abcdef0123'}));
};
const config:PeyPaymentOptions={gateway:new PeyCodiPushGateway({apiKey:'fixture-only-no-real-key',transport:fixtureTransport}),apiKeyId,bankAccountId:bankId,beneficiaryDisplayName:name,buyerPhone:phone};
const merchantToken=randomBytes(32).toString('hex');
const token=randomBytes(32).toString('hex'),secret='whsec_'+randomBytes(32).toString('base64'),encryptionKey=randomBytes(32);
const app=buildApp({db,credentials:[{token,actor:{role:'BUYER',id:'buyer-demo'}},{token:merchantToken,actor:{role:'MERCHANT',id:'merchant-demo'}}],peyPayments:config});
const receiver=buildPeyWebhookReceiver({db:inbox,loadConfig:async()=>({signingSecret:secret,encryptionKey})});
try{
 await seedDemo(db,clock());await db.client.merchantPaymentAccount.update({where:{id:'account-demo'},data:{provider:'pey',providerBankAccountId:bankId,beneficiaryDisplayName:name}});
 const address=await app.listen({host:'127.0.0.1',port:0}),webhookAddress=await receiver.listen({host:'127.0.0.1',port:0});
 const headers={authorization:'Bearer '+token,'content-type':'application/json'};
 async function post(path:string,payload:unknown,key:string){const r=await fetch(address+path,{method:'POST',headers:{...headers,'idempotency-key':key},body:JSON.stringify(payload)});assert.ok(r.status>=200&&r.status<300);return r.json() as Promise<{id:string;snapshotHash:string}>;}
 const intent=await post('/v1/intents',{originalText:'Compra contractual de fixture',productId:'coffee',category:'specialty',quantity:2,unit:'kg',maxAmountMinor:100000,currency:'MXN',deliveryDeadline:new Date(Date.now()+2*86400000).toISOString(),timezone:'America/Mexico_City'},'fixture-intent');
 const proposal=await post(`/v1/intents/${intent.id}/proposals`,{offerId:'coffee-850'},'fixture-proposal');
 const order=await post('/v1/orders',{proposalId:proposal.id,snapshotHash:proposal.snapshotHash,approved:true},'fixture-order');
 config.gateway=new PeyCodiPushGateway({apiKey:'fixture-only-no-real-key',transport:fixtureTransport,allowRealPayments:true,grant:{id:'fixture-grant',orderId:order.id,snapshotHash:order.snapshotHash,amountMinor:85000,bankAccountId:bankId,phoneNumber:phone,expiresAt:new Date(Date.now()+3600000).toISOString()}});
 await post(`/v1/orders/${order.id}/payment-requests`,{snapshotHash:order.snapshotHash,approved:true},'fixture-payment');assert.equal(transportCalls,2);assert.equal(await db.client.providerTransaction.count(),0);
 if(recoverMode){
  assert.equal((await db.client.paymentAttempt.findFirstOrThrow()).status,'SUBMISSION_UNKNOWN');
  await post(`/v1/orders/${order.id}/reconcile`,{},'fixture-reconcile');
  assert.equal((await db.client.order.findUniqueOrThrow({where:{id:order.id}})).status,'PAID');
 }
 const raw=JSON.stringify({type:'codi.pn.payment_received',transactionId:'fixture-transaction',amount:850,apiKeyId,bankAccountId:bankId,numRef:submitted!.numRef,datePaid:Math.floor(Date.now()/1000),metadata:{externalMetadata:submitted!.metadata}}),date=new Date();
 const eventHeaders={'content-type':'application/json','webhook-id':'fixture-event','webhook-timestamp':String(Math.floor(date.getTime()/1000)),'webhook-signature':new Webhook(secret).sign('fixture-event',date,raw)};
 assert.equal((await fetch(webhookAddress+'/v1/webhooks/pey',{method:'POST',headers:eventHeaders,body:raw})).status,200);
 const processor=new PeyInboxProcessor(inbox,new PeyPaymentService(db,clock,config),async()=>encryptionKey,clock);await processor.drain();await new OutboxDispatcher(db,clock).drain();
 assert.equal((await db.client.order.findUniqueOrThrow({where:{id:order.id}})).status,'PAID');assert.equal(await db.client.merchantNotification.count(),1);
 await post(`/v1/orders/${order.id}/payment-requests`,{snapshotHash:order.snapshotHash,approved:true},'fixture-payment');assert.equal(submitCalls,1);
 const notifications=await fetch(address+'/v1/merchants/merchant-demo/notifications',{headers:{authorization:'Bearer '+merchantToken}});assert.equal(notifications.status,200);const notices=await notifications.json() as {orderId:string;label:string}[];assert.equal(notices.length,1);assert.equal(notices[0]!.orderId,order.id);assert.equal(notices[0]!.label,'REAL');
 assert.equal((await db.client.product.findUniqueOrThrow({where:{id:'coffee'}})).stock,8);assert.equal((await db.client.order.findUniqueOrThrow({where:{id:order.id}})).fulfillmentStatus,'READY_FOR_PREPARATION');
 console.log('G4-CONTRATO'+(recoverMode?' RECUPERACION SIN REENVIO':'')+': adaptador pey con transporte sustituido, firma Standard Webhooks, inbox cifrada, conciliacion y una notificacion verificados. Credenciales reales utilizadas: 0. Cobros bancarios: 0.');
}finally{await app.close();await receiver.close();await db.close();await inbox.close();await rm(dir,{recursive:true,force:true});}
