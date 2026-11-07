import { it,expect } from 'vitest';
import { mkdtemp,writeFile,readFile,stat,chmod,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { savePrivateSetting,checkApiKeyInput } from '../private-pey-config.js';
it('saves an API key privately while preserving webhook, encryption, phone and disabled payment flags',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'agentpay-private-'));const path=join(dir,'.env.pey.local');
 try{
  const existing={PEY_WEBHOOK_SECRET:'whsec_fixture_only',PEY_INBOX_ENCRYPTION_KEY:'fixture-encryption',PEY_BUYER_PHONE:'5500000000',ALLOW_REAL_PAYMENTS:'false',PAYMENT_PROVIDER:'mock'};
  await writeFile(path,Object.entries(existing).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
  await savePrivateSetting(path,'PEY_API_KEY','fixture-api-key-not-real');
  expect(parseEnv(await readFile(path,'utf8'))).toEqual({...existing,PEY_API_KEY:'fixture-api-key-not-real'});expect((await stat(path)).mode&0o077).toBe(0);
  await chmod(path,0o644);await expect(savePrivateSetting(path,'PEY_API_KEY','must-not-save')).rejects.toThrow('PRIVATE_CONFIGURATION_REQUIRED');expect(parseEnv(await readFile(path,'utf8')).PEY_API_KEY).toBe('fixture-api-key-not-real');
 }finally{await rm(dir,{recursive:true,force:true});}
});
it.each(['','Bearer fixture-key','whsec_fixture-key','key\nsecond-line'])('rejects ambiguous key input without contacting the provider',value=>{expect(()=>checkApiKeyInput(value)).toThrow();});
