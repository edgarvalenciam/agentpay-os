import { mkdir,open,unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Database } from '@agentpay/database';
import { MockCodiPushGateway } from '@agentpay/integrations';
import { buildApp } from './index.js';
import { buildWebApp } from './web-app.js';
import { webDemoInterpreter } from './web-demo-interpreter.js';
import { seedDemo } from '../../../packages/database/src/seed.js';
if(process.env.NODE_ENV==='production'||process.env.ALLOW_REAL_PAYMENTS==='true'||(process.env.PAYMENT_PROVIDER&&process.env.PAYMENT_PROVIDER!=='mock')||process.env.AGENT_PROVIDER==='openai')throw new Error('WEB_DEMO_ONLY');
const demoSession=process.env.WEB_DEMO_SESSION??'persistent';
if(demoSession!=='persistent'&&!/^contest-[0-9a-f-]{36}$/.test(demoSession))throw new Error('INVALID_DEMO_SESSION');
const root=demoSession==='persistent'?resolve('work/web-runtime'):resolve('work/contest-runtime/sessions',demoSession),port=Number(process.env.WEB_PORT??3002);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('INVALID_WEB_PORT');
await mkdir(root,{recursive:true,mode:0o700});const path=resolve(root,'commerce.db'),lockPath=path+'.web.lock',lock=await open(lockPath,'wx',0o600);let db:Database|undefined;
try{
 const file=await open(path,'a',0o600);await file.close();
 execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--schema','packages/database/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:'file:'+path},stdio:'pipe'});
 const clock=()=>new Date().toISOString();db=new Database('file:'+path);await seedDemo(db,clock());
 const buyerToken=randomBytes(32).toString('hex'),merchantToken=randomBytes(32).toString('hex'),controlToken=randomBytes(32).toString('hex');
 const api=buildApp({db,clock,credentials:[{token:buyerToken,actor:{role:'BUYER',id:'buyer-demo'}},{token:merchantToken,actor:{role:'MERCHANT',id:'merchant-demo'}}],shoppingAgent:{interpreter:webDemoInterpreter,productAliases:{coffee:['café','cafe']}},mockPayments:{gateway:new MockCodiPushGateway(db,clock),webhookSecret:randomBytes(32).toString('hex'),apiKeyId:'mock-web-key',controlToken,dispatchIntervalMs:1000}});
 const web=buildWebApp({api,origin:`http://127.0.0.1:${port}`,buyerToken,merchantToken,controlToken,demoSession});
 web.addHook('onClose',async()=>{await api.close();await db!.close();await lock.close();await unlink(lockPath);});
 let closing=false;const close=()=>{if(!closing){closing=true;void web.close();}};process.once('SIGINT',close);process.once('SIGTERM',close);
 await web.listen({host:'127.0.0.1',port});console.log(`AgentPay demo local: http://127.0.0.1:${port} (simulado, sin llamadas a OpenAI ni pey).`);
}catch{await db?.close();await lock.close();await unlink(lockPath).catch(()=>undefined);console.error('No se pudo iniciar la demo local. Revisa si el puerto o la base ya estan en uso.');process.exitCode=1;}
