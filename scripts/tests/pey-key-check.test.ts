import { describe,it,expect } from 'vitest';
import { checkPeyKey } from '../pey-key-check.js';
describe('read-only pey access check',()=>{
 it('uses only the documented GET with no IDs or financial mutations',async()=>{
  let calls=0,cancelled=false;
  const transport:typeof fetch=async(url,init)=>{
   calls++;expect(String(url)).toBe('https://api.pey.mx/transaction/api-key');expect(init?.method).toBe('GET');expect(init?.body).toBeUndefined();expect(init?.redirect).toBe('error');
   expect(init?.headers).toEqual({Authorization:'Bearer fixture-secret'});
   return new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:200});
  };
  expect(await checkPeyKey('fixture-secret',transport)).toEqual({accessConfirmed:true,authenticationRejected:false,chargesGenerated:0});expect(calls).toBe(1);expect(cancelled).toBe(true);
 });
 for(const status of [401,403,404,429,500])it(`does not claim access on ${status}`,async()=>{
  const result=await checkPeyKey('fixture',async()=>new Response('private financial data',{status}));
  expect(result.accessConfirmed).toBe(false);expect(result.authenticationRejected).toBe([401,403].includes(status));expect(result.chargesGenerated).toBe(0);
 });
 it('sanitizes failure without retry',async()=>{let count=0;await expect(checkPeyKey('fixture',async()=>{count++;throw new Error('sensitive-provider-details');})).rejects.toThrow('PEY_READ_ONLY_CHECK_UNAVAILABLE');expect(count).toBe(1);});
 it('rejects missing or invalid keys before transport',async()=>{for(const key of ['', 'bad\nkey'])await expect(checkPeyKey(key,async()=>{throw new Error('must not call');})).rejects.toThrow('PRIVATE_KEY_REQUIRED');});
});
