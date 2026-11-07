import { Webhook } from 'standardwebhooks';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
export { Webhook };
export class InvalidPeySignature extends Error {}
export function verifyPeySignature(raw:Buffer,headers:Record<string,unknown>,secret:string):string {
  const normalized:Record<string,string>={};
  for(const key of ['webhook-id','webhook-timestamp','webhook-signature']){
    const value=headers[key];
    if(typeof value!=='string'||!value||value.length>2048)throw new InvalidPeySignature();normalized[key]=value;
  }
  if(normalized['webhook-id']!.length>255||!/^\d{10}$/.test(normalized['webhook-timestamp']!))throw new InvalidPeySignature();
  try{new Webhook(secret).verify(raw,normalized,{jsonParse:false});}catch{throw new InvalidPeySignature();}
  return normalized['webhook-id']!;
}
export function sealPeyPayload(raw:Buffer,key:Buffer){
  if(key.length!==32)throw new Error('INVALID_INBOX_KEY');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const ciphertext=Buffer.concat([cipher.update(raw),cipher.final()]);
  return {ciphertext:ciphertext.toString('base64'),iv:iv.toString('hex'),authTag:cipher.getAuthTag().toString('hex'),keyFingerprint:createHash('sha256').update(key).digest('hex')};
}
