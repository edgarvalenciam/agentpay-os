import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe,it,expect } from 'vitest';
import { runOneCentProbe,probeConsent } from '../pey-one-cent-probe.js';
const fixture={apiKey:'fixture-only',phone:'5500000000',consent:probeConsent};
async function isolated(fn:(statePath:string)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'probe-test-'));try{await fn(join(dir,'state.json'));}finally{await rm(dir,{recursive:true,force:true});}}
describe('single authorized cent request',()=>{
 for(const codiId of ['abcdef0123abcdef0123','ABCDEF0123ABCDEF0123'])it('accepts a hexadecimal folio and persists pending, never paid',()=>isolated(async statePath=>{
  const result=await runOneCentProbe({...fixture,statePath,transport:async()=>new Response(JSON.stringify({transactionId:'fixture-tx',codiId}))});expect(result.status).toBe('PAYMENT_PENDING');expect(JSON.parse(await readFile(statePath,'utf8')).codiId).toBe(codiId);
 }));
 for(const codiId of ['zbcdef0123abcdef0123','abcdef0123abcdef012','abcdef0123abcdef01234','abcdef0123abcdef012 '])it('does not accept malformed folios or resend',()=>isolated(async statePath=>{
  let calls=0;const result=await runOneCentProbe({...fixture,statePath,transport:async()=>{calls++;return new Response(JSON.stringify({transactionId:'fixture-tx',codiId}));}});expect(result.status).toBe('SUBMISSION_UNKNOWN');expect(calls).toBe(1);
 }));

 it('persists before POST and blocks replay without exposing key/phone',()=>isolated(async statePath=>{
  let calls=0;const transport:typeof fetch=async(url,init)=>{calls++;expect(JSON.parse(await readFile(statePath,'utf8')).status).toBe('SUBMISSION_UNKNOWN');expect(String(url)).toBe('https://api.pey.mx/codi/pn');expect(init?.method).toBe('POST');expect(init?.redirect).toBe('error');const body=JSON.parse(String(init?.body));expect(body.amount).toBe(0.01);expect(body.expiration).toBe(360);expect(body.bankAccountId).toBeUndefined();return new Response(JSON.stringify({transactionId:'fixture-tx',codiId:'12345678901234567890'}));};
  expect((await runOneCentProbe({...fixture,statePath,transport})).status).toBe('PAYMENT_PENDING');await expect(runOneCentProbe({...fixture,statePath,transport})).rejects.toThrow();expect(calls).toBe(1);const state=await readFile(statePath,'utf8');expect(state).not.toContain(fixture.apiKey);expect(state).not.toContain(fixture.phone);
 }));
 for(const status of [400,503,302])it(`never retries ${status}`,()=>isolated(async statePath=>{let calls=0;const result=await runOneCentProbe({...fixture,statePath,transport:async()=>{calls++;return new Response('sensitive',{status});}});expect(result.status).toBe('SUBMISSION_UNKNOWN');expect(calls).toBe(1);expect(await readFile(statePath,'utf8')).not.toContain('sensitive');}));
 it('preserves unknown on timeout',()=>isolated(async statePath=>{expect((await runOneCentProbe({...fixture,statePath,transport:async()=>{throw new Error('secret');}})).status).toBe('SUBMISSION_UNKNOWN');}));
 it('rejects malformed receipt without replay',()=>isolated(async statePath=>{expect((await runOneCentProbe({...fixture,statePath,transport:async()=>new Response('{}')})).status).toBe('SUBMISSION_UNKNOWN');}));
 it('requires exact explicit consent before creating an attempt',()=>isolated(async statePath=>{await expect(runOneCentProbe({...fixture,statePath,consent:''})).rejects.toThrow('PROBE_NOT_AUTHORIZED');}));
 it('rejects invalid phone before any network',()=>isolated(async statePath=>{await expect(runOneCentProbe({...fixture,statePath,phone:'123'})).rejects.toThrow('PROBE_NOT_AUTHORIZED');}));
});
