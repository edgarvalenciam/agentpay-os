import { loadOpenAIInterpreter } from './shopping-agent-config.js';
import { open, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Database } from '@agentpay/database';
import { buildApp } from './index.js';
import { loadPeyPaymentOptions } from './pey-payment-config.js';
import { loadPeyReceiverConfig } from './pey-webhook-config.js';
import { MockCodiPushGateway, type MockScenario } from '@agentpay/integrations';
// Local-only G3. Refuse financial flags and production instead of implying production auth readiness.
const provider=process.env.PAYMENT_PROVIDER??'mock';
if(process.env.NODE_ENV==='production'||!['mock','pey'].includes(provider)||(provider==='mock'&&process.env.ALLOW_REAL_PAYMENTS==='true'))throw new Error('LOCAL_PROFILE_REQUIRED');
const url=process.env.DATABASE_URL;
const buyerToken=process.env.DEMO_BUYER_TOKEN,merchantToken=process.env.DEMO_MERCHANT_TOKEN;
if(!url||!buyerToken||!merchantToken)throw new Error('DATABASE_URL_AND_DEMO_TOKENS_REQUIRED');
if(!url.startsWith('file:')||!url.slice(5).startsWith('/'))throw new Error('ABSOLUTE_SQLITE_FILE_URL_REQUIRED');
const dbPath=fileURLToPath(url);await mkdir(dirname(dbPath),{recursive:true});
const lock=await open(resolve(dbPath+'.server.lock'),'wx',0o600);
const db=new Database(url);
let inbox:Database|undefined;
try{
  const clock=()=>new Date().toISOString();
  const secret=process.env.MOCK_WEBHOOK_SECRET;
  const scenario=process.env.MOCK_SCENARIO??'ACCEPT';
  if(!['ACCEPT','TIMEOUT_BEFORE_ACCEPT','TIMEOUT_AFTER_ACCEPT'].includes(scenario))throw new Error('INVALID_MOCK_SCENARIO');
  const agentProvider=process.env.AGENT_PROVIDER??'disabled';
  if(!['disabled','openai'].includes(agentProvider))throw new Error('INVALID_AGENT_PROVIDER');
  const shoppingAgent=agentProvider==='openai'?{interpreter:await loadOpenAIInterpreter(),productAliases:{coffee:['café','cafe']}}:undefined;
  const peyPayments=provider==='pey'?await loadPeyPaymentOptions():undefined;
  if(peyPayments){const inboxUrl=process.env.PEY_INBOX_DATABASE_URL??'file:'+resolve('work/webhook-runtime/inbox.db');inbox=new Database(inboxUrl);}
  const app=buildApp({db,...(shoppingAgent?{shoppingAgent}:{}),...(peyPayments?{peyPayments,peyInbox:{db:inbox!,getEncryptionKey:async()=>(await loadPeyReceiverConfig(resolve('.env.pey.local'))).encryptionKey}}:{}),...(provider==='mock'&&secret?{mockPayments:{gateway:new MockCodiPushGateway(db,clock,scenario as MockScenario),webhookSecret:secret,apiKeyId:'mock-api-key',dispatchIntervalMs:1000,...(process.env.MOCK_CONTROL_TOKEN?{controlToken:process.env.MOCK_CONTROL_TOKEN}:{})}}:{}),credentials:[{token:buyerToken,actor:{role:'BUYER',id:'buyer-demo'}},{token:merchantToken,actor:{role:'MERCHANT',id:'merchant-demo'}}]});
  let closing=false;
  const shutdown=async()=>{if(closing)return;closing=true;await app.close();await db.close();await inbox?.close();await lock.close();await import('node:fs/promises').then(fs=>fs.unlink(dbPath+'.server.lock'));};
  process.once('SIGINT',()=>{void shutdown();});process.once('SIGTERM',()=>{void shutdown();});
  const address=await app.listen({host:'127.0.0.1',port:Number(process.env.PORT??3001)});
  console.log(`AgentPay API local lista en ${address}; perfil local ${provider}; envio real sujeto a autorizacion exacta.`);
}catch(error){await db.close();await inbox?.close();await lock.close();await import('node:fs/promises').then(fs=>fs.unlink(dbPath+'.server.lock'));throw error;}
