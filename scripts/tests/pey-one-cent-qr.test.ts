import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe,it,expect } from 'vitest';
import { createOneCentQr,qrProbeConsent } from '../pey-one-cent-qr.js';
const fixture={apiKey:'fixture-key',consent:qrProbeConsent};
async function isolated(fn:(statePath:string)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'qr-probe-test-'));try{await fn(join(dir,'state.json'));}finally{await rm(dir,{recursive:true,force:true});}}
const receipt={id:'fixture-qr',qrString:'fixture-payload',qrImage:Buffer.from('89504e470d0a1a0a','hex').toString('base64')};
describe('one authorized fixed-price QR',()=>{
 it('persists before exactly one POST and blocks recreation',()=>isolated(async statePath=>{let calls=0;const transport:typeof fetch=async(url,init)=>{calls++;expect(JSON.parse(await readFile(statePath,'utf8')).status).toBe('SUBMISSION_UNKNOWN');expect(String(url)).toBe('https://api.pey.mx/codi/qr');expect(init?.method).toBe('POST');expect(init?.redirect).toBe('error');const body=JSON.parse(String(init?.body));expect(body.amount).toBe(0.01);expect(body.generateImage).toBe(true);expect(body.expiration).toBe(900);expect(body.bankAccountId).toBeUndefined();expect(body.phoneNumber).toBeUndefined();return new Response(JSON.stringify(receipt),{status:201});};expect((await createOneCentQr({...fixture,statePath,transport})).status).toBe('QR_CREATED_UNPAID');await expect(createOneCentQr({...fixture,statePath,transport})).rejects.toThrow();expect(calls).toBe(1);expect(await readFile(statePath,'utf8')).not.toContain(fixture.apiKey);}));
 for(const status of [400,503,302])it(`does not retry ${status}`,()=>isolated(async statePath=>{let count=0;const r=await createOneCentQr({...fixture,statePath,transport:async()=>{count++;return new Response('private',{status});}});expect(r.status).toBe('SUBMISSION_UNKNOWN');expect(count).toBe(1);expect(await readFile(statePath,'utf8')).not.toContain('private');}));
 it('preserves ambiguity on transport failure',()=>isolated(async statePath=>{expect((await createOneCentQr({...fixture,statePath,transport:async()=>{throw new Error();}})).status).toBe('SUBMISSION_UNKNOWN');}));
 it('preserves created QR with missing image for offline rendering',()=>isolated(async statePath=>{const r=await createOneCentQr({...fixture,statePath,transport:async()=>new Response(JSON.stringify({...receipt,qrImage:null}),{status:201})});expect(r.status).toBe('QR_CREATED_UNPAID');expect(JSON.parse(await readFile(statePath,'utf8')).qrId).toBe('fixture-qr');}));
 it('does not return non-PNG data as an image',()=>isolated(async statePath=>{const r=await createOneCentQr({...fixture,statePath,transport:async()=>new Response(JSON.stringify({...receipt,qrImage:'<html>no</html>'}),{status:201})});expect('image' in r).toBe(false);}));
 it('requires specific consent before network or recording',()=>isolated(async statePath=>{await expect(createOneCentQr({...fixture,statePath,consent:''})).rejects.toThrow('QR_PROBE_NOT_AUTHORIZED');}));
});
