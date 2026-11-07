import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { Database } from '../packages/database/src/index.js';
import { seedDemo } from '../packages/database/src/seed.js';
import { buildApp } from '../apps/api/src/index.js';
let address='';
async function request(input:{method?:string;url:string;headers:Record<string,string>;payload?:unknown}){
  const response=await fetch(address+input.url,{method:input.method??'GET',headers:{...input.headers,'content-type':'application/json'},...(input.payload!==undefined?{body:JSON.stringify(input.payload)}:{})});
  const body=await response.text();return {statusCode:response.status,json:<T=unknown>()=>JSON.parse(body) as T};
}
const dir=await mkdtemp(join(tmpdir(),'agentpay-demo-')),url='file:'+join(dir,'demo.db');
await writeFile(join(dir,'demo.db'),'',{mode:0o600});
execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--schema','packages/database/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});
let db=new Database(url);let app:ReturnType<typeof buildApp>|undefined;
try{
  const now=new Date().toISOString();await seedDemo(db,now);const credentials=[{token:randomBytes(32).toString('hex'),actor:{role:'BUYER' as const,id:'buyer-demo'}}];
  const headers={authorization:'Bearer '+credentials[0]!.token,'idempotency-key':'demo-intent-key'};
  app=buildApp({db,credentials});address=await app.listen({host:'127.0.0.1',port:0});
  const response=await request({method:'POST',url:'/v1/intents',headers,payload:{originalText:'2 kg café, máximo $1,000',productId:'coffee',category:'specialty',quantity:2,unit:'kg',maxAmountMinor:100000,currency:'MXN',deliveryDeadline:new Date(Date.parse(now)+2*86400000).toISOString(),timezone:'America/Mexico_City'}});assert.equal(response.statusCode,201);const intent=response.json<{id:string}>();
  const proposed=await request({method:'POST',url:`/v1/intents/${intent.id}/proposals`,headers:{...headers,'idempotency-key':'demo-proposal-key'},payload:{offerId:'coffee-850'}});assert.equal(proposed.statusCode,201);const p=proposed.json<{id:string;snapshotHash:string}>();
  const payload={proposalId:p.id,snapshotHash:p.snapshotHash,approved:true};const orderHeaders={...headers,'idempotency-key':'demo-order-key'};
  const created=await request({method:'POST',url:'/v1/orders',headers:orderHeaders,payload});assert.equal(created.statusCode,201);const order=created.json<{id:string;status:string}>();assert.equal(order.status,'APPROVED');
  const replay=await request({method:'POST',url:'/v1/orders',headers:orderHeaders,payload});assert.deepEqual(replay.json(),created.json());
  await app.close();await db.close();db=new Database(url);app=buildApp({db,credentials});address=await app.listen({host:'127.0.0.1',port:0});
  const recovered=await request({url:`/v1/orders/${order.id}`,headers});assert.deepEqual(recovered.json(),created.json());
  const events=await request({url:`/v1/orders/${order.id}/events`,headers});assert.equal(events.json<unknown[]>().length,4);
  assert.equal(await db.client.paymentAttempt.count(),0);
  console.log('G2: orden de $850 aprobada, repetición idempotente, reinicio y auditoría verificados. Pagos enviados: 0.');
}finally{await app?.close();await db.close();await rm(dir,{recursive:true,force:true});}
