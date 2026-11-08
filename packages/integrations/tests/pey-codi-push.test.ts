import { describe,it,expect } from 'vitest';
import { PeyCodiPushGateway,decodePeyPaidPush,decodePeyJson,PeySubmissionUnknown } from '../src/index.js';
import type { PushSubmission } from '@agentpay/core';
const now='2026-11-07T18:00:00Z';
const input:PushSubmission={attemptId:'fixture-attempt',orderId:'fixture-order',amountMinor:1,currency:'MXN',beneficiaryAccountId:'internal-account',providerBankAccountId:'fixture-bank',beneficiaryDisplayName:'Fixture Merchant',apiKeyId:'fixture-api',numRef:'123',phoneNumber:'5500000000',expirationSeconds:600,snapshotHash:'a'.repeat(64)};
const grant={id:'fixture-grant',orderId:input.orderId,amountMinor:1,bankAccountId:'fixture-bank',phoneNumber:input.phoneNumber,snapshotHash:input.snapshotHash!,expiresAt:'2026-11-07T19:00:00Z'};
const bank={id:'fixture-bank',name:'Fixture Merchant',clabe:'000000000000000000',codiStatus:'ACTIVE'};
function setup(response?: (url:string,init:RequestInit)=>Promise<Response>,options:Partial<{allowRealPayments:boolean;grant:typeof grant|null;timeoutMs:number}>={}){
 const calls:{url:string;method:string;body:string;headers:Headers;redirect:RequestRedirect|undefined}[]=[];
 const transport:typeof fetch=async(url,init)=>{
  const path=String(url);calls.push({url:path,method:init?.method??'GET',body:String(init?.body??''),headers:new Headers(init?.headers),redirect:init?.redirect});
  if(response)return response(path,init??{});
  return new Response(JSON.stringify(path.includes('/bank-account/')?bank:{transactionId:'fixture-transaction',codiId:'12345678901234567890'}),{status:200});
 };
 return {calls,gateway:new PeyCodiPushGateway({apiKey:'fixture-key-not-real',transport,clock:()=>now,allowRealPayments:true,grant,...options})};
}
describe('pey HTTP contract with injected transport only',()=>{
 it.each(['abcdef0123abcdef0123','ABCDEF0123ABCDEF0123'])('accepts a bank-observed hexadecimal folio without claiming payment: %s',async codiId=>{
  const {gateway,calls}=setup(async url=>new Response(JSON.stringify(url.includes('/bank-account/')?bank:{transactionId:'fixture-tx',codiId})));
  expect(await gateway.submit(input)).toEqual({transactionId:'fixture-tx',codiId});expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);
 });
 it.each(['zbcdef0123abcdef0123','abcdef0123abcdef012','abcdef0123abcdef01234','abcdef0123abcdef012 '])('keeps malformed folio uncertain: %s',async codiId=>{
  const {gateway,calls}=setup(async url=>new Response(JSON.stringify(url.includes('/bank-account/')?bank:{transactionId:'fixture-tx',codiId})));
  await expect(gateway.submit(input)).rejects.toThrow('PEY_SUBMISSION_UNKNOWN');expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);
 });

 it('sends explicit beneficiary, decimal money, phone and flat metadata once, with no invented idempotency header',async()=>{
  const {gateway,calls}=setup();expect(await gateway.submit(input)).toEqual({transactionId:'fixture-transaction',codiId:'12345678901234567890'});expect(calls).toHaveLength(2);
  expect(calls[0]!.url).toBe('https://api.pey.mx/bank-account/fixture-bank');const post=calls[1]!;expect(post.url).toBe('https://api.pey.mx/codi/pn');expect(post.body).toContain('"amount":0.01');
  expect(JSON.parse(post.body)).toMatchObject({amount:0.01,bankAccountId:'fixture-bank',expiration:600,phoneNumber:'5500000000',numRef:'123',metadata:{orderId:'fixture-order',paymentAttemptId:'fixture-attempt',environment:'real'}});
  expect(post.headers.get('authorization')).toBe('Bearer fixture-key-not-real');expect(post.headers.has('idempotency-key')).toBe(false);expect(post.redirect).toBe('error');
 });
 it.each(['disabled','no-grant','expired','amount','bank','phone','snapshot','order'])('blocks %s authorization before any HTTP request',async kind=>{
  const changed={...grant};if(kind==='expired')changed.expiresAt=now;if(kind==='amount')changed.amountMinor=2;if(kind==='bank')changed.bankAccountId='other';if(kind==='phone')changed.phoneNumber='5599999999';if(kind==='snapshot')changed.snapshotHash='b'.repeat(64);if(kind==='order')changed.orderId='other';
  const {gateway,calls}=setup(undefined,{allowRealPayments:kind!=='disabled',grant:kind==='no-grant'?null:changed});await expect(gateway.submit(input)).rejects.toThrow('REAL_PAYMENT_NOT_AUTHORIZED');expect(calls).toHaveLength(0);
 });
 it.each([400,500,503,302])('does not retry POST after HTTP %s',async status=>{
  const {gateway,calls}=setup(async url=>new Response(JSON.stringify(url.includes('/bank-account/')?bank:{error:{message:'must-not-leak-fixture-key-not-real'}}),{status:url.includes('/bank-account/')?200:status}));
  await expect(gateway.submit(input)).rejects.toThrow('PEY_SUBMISSION_UNKNOWN');expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);
 });
 it('times out an uncertain POST without replaying it',async()=>{
  const {gateway,calls}=setup(async(url,init)=>{if(url.includes('/bank-account/'))return new Response(JSON.stringify(bank));return new Promise((_resolve,reject)=>{init.signal!.addEventListener('abort',()=>reject(new Error('sensitive transport context')),{once:true});});},{timeoutMs:20});
  await expect(gateway.submit(input)).rejects.toBeInstanceOf(PeySubmissionUnknown);expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);
 });
 it.each(['PENDING','ERROR','wrong-name','wrong-id'])('refuses beneficiary %s before POST',async state=>{
  const {gateway,calls}=setup(async()=>new Response(JSON.stringify({...bank,...(state==='wrong-name'?{name:'Different Beneficiary'}:state==='wrong-id'?{id:'different-bank'}:{codiStatus:state})})));
  await expect(gateway.submit(input)).rejects.toThrow();expect(calls.filter(c=>c.method==='POST')).toHaveLength(0);
 });
 it.each([{transactionId:'only-one-id'},{transactionId:'tx',codiId:'not-20-digits'}])('keeps a malformed successful submission uncertain',async receipt=>{
  const {gateway}=setup(async url=>new Response(JSON.stringify(url.includes('/bank-account/')?bank:receipt)));await expect(gateway.submit(input)).rejects.toThrow('PEY_SUBMISSION_UNKNOWN');
 });
 it('maps queried id/status, preserves exact amount and does not treat a 404 as rejection',async()=>{
  const result={id:'query-tx',status:'PAID',amount:850,currency:'MXN',paymentMethod:'CODI',payableType:'API_CODI_PN',datePaid:1794074400,metadata:{clabe:bank.clabe,externalMetadata:{orderId:'fixture-order',paymentAttemptId:'fixture-attempt',environment:'real'}}};
  const {gateway,calls}=setup(async()=>new Response(JSON.stringify(result)));expect((await gateway.getTransaction('query-tx')).amount).toBe(85000);expect(calls[0]!.url).toBe('https://api.pey.mx/transaction/query-tx');
  const missing=setup(async()=>new Response('{}',{status:404}));await expect(missing.gateway.getTransaction('missing')).rejects.toMatchObject({code:'PEY_HTTP_ERROR',status:404});expect(missing.calls).toHaveLength(1);
 });
 it('does not silently round literal precision away while decoding vendor JSON',()=>{
  const wire={type:'codi.pn.payment_received',amount:1,apiKeyId:'fixture-api',bankAccountId:'fixture-bank',transactionId:'tx',numRef:'1',datePaid:1794074400,metadata:{externalMetadata:{orderId:'o',paymentAttemptId:'a',environment:'real'}}};
  const raw=JSON.stringify(wire).replace('"amount":1','"amount":1.000000000000000001');expect(()=>decodePeyPaidPush(raw)).toThrow();expect((decodePeyJson(raw) as {amount:string}).amount).toBe('1.000000000000000001');
 });
 it('rejects other methods, invented environment and insufficient webhook correlation',()=>{
  expect(()=>decodePeyPaidPush('{"type":"codi.qr.payment_received"}')).toThrow();
  expect(()=>decodePeyPaidPush('{"type":"codi.pn.payment_received","metadata":{"externalMetadata":{"environment":"mock"}}}')).toThrow();
 });
 it('accepts a minimal documented PENDING resource without inventing paid details',async()=>{
  const {gateway}=setup(async()=>new Response('{"id":"pending-id","status":"PENDING"}'));
  expect((await gateway.getTransaction('pending-id')).status).toBe('PENDING');
 });

});
