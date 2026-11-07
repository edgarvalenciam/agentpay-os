import { lstat,readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { Webhook } from '@agentpay/integrations';
export interface PeyReceiverConfig { signingSecret:string|null; encryptionKey:Buffer }
export async function loadPeyReceiverConfig(path:string):Promise<PeyReceiverConfig>{
  const stat=await lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw new Error('PRIVATE_CONFIG_REQUIRED');
  const env=parseEnv(await readFile(path,'utf8'));
  const hex=env.PEY_INBOX_ENCRYPTION_KEY;
  if(!hex||!/^([a-f0-9]{64})$/i.test(hex))throw new Error('PRIVATE_INBOX_KEY_REQUIRED');
  const signingSecret=env.PEY_WEBHOOK_SECRET?.trim()||null;
  if(signingSecret)new Webhook(signingSecret);
  return {signingSecret,encryptionKey:Buffer.from(hex,'hex')};
}
