import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { Database } from '../packages/database/src/index.js';
import { seedDemo } from '../packages/database/src/seed.js';
import { OpenAIIntentInterpreter } from '../packages/integrations/src/openai-intent.js';
import { buildApp } from '../apps/api/src/index.js';
const dir=await mkdtemp(join(tmpdir(),'agentpay-g5-demo-')),databaseUrl='file:'+join(dir,'demo.db');
await writeFile(join(dir,'demo.db'),'',{mode:0o600});
execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--schema','packages/database/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:databaseUrl},stdio:'pipe'});
const db=new Database(databaseUrl),now='2026-11-07T18:00:00Z',token=randomBytes(32).toString('hex');let calls=0;
// Exercises the real Responses wire adapter with a substituted transport; never uses a private config or native provider HTTP.
const interpreter=new OpenAIIntentInterpreter({apiKey:'fixture-key-only',model:'fixture-model',transport:async(url,init)=>{
 calls++;assert.equal(String(url),'https://api.openai.com/v1/responses');const body=JSON.parse(String(init?.body));assert.deepEqual(body.tools,[]);
 return new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({productText:'café',quantityText:'2',unitText:'kg',budgetText:'$1,000',deliveryText:'mañana'})}]}]}));
}});
const app=buildApp({db,clock:()=>now,credentials:[{token,actor:{role:'BUYER',id:'buyer-demo'}}],shoppingAgent:{interpreter,productAliases:{coffee:['café']}}});
try{
 await seedDemo(db,now);const address=await app.listen({host:'127.0.0.1',port:0});
 const request={text:'Compra 2 kg de café por máximo $1,000 mañana',timezone:'America/Mexico_City'};
 const headers={authorization:'Bearer '+token,'content-type':'application/json','idempotency-key':'fixture-agent-demo-key'};
 const response=await fetch(address+'/v1/agent/proposals',{method:'POST',headers,body:JSON.stringify(request)});assert.equal(response.status,200);const proposal=await response.json() as {status:string;requiresBuyerApproval:boolean;paymentsInitiated:boolean;proposalId:string;snapshotHash:string;snapshot:{amountMinor:number}};
 assert.equal(proposal.status,'PROPOSED');assert.equal(proposal.snapshot.amountMinor,85000);assert.equal(proposal.requiresBuyerApproval,true);assert.equal(proposal.paymentsInitiated,false);assert.equal(await db.client.order.count(),0);assert.equal(await db.client.consentRecord.count(),0);assert.equal(await db.client.paymentAttempt.count(),0);
 const replay=await fetch(address+'/v1/agent/proposals',{method:'POST',headers,body:JSON.stringify(request)});assert.equal(replay.status,200);assert.deepEqual(await replay.json(),proposal);assert.equal(calls,1);assert.equal(await db.client.reservation.count(),1);
 console.log(JSON.stringify({demo:'G5_CONTRATO_CON_RESPUESTA_FICTICIA',status:proposal.status,quantity:2,unit:'kg',maxAmountMinor:100000,proposedAmountMinor:85000,currency:'MXN',requiresBuyerApproval:true,modelCallsUsingFixtureTransport:calls,realOpenAICalls:0,realBankCalls:0,ordersApproved:0,paymentsInitiated:0}));
}finally{await app.close();await db.close();await rm(dir,{recursive:true,force:true});}
