import { Webhook } from 'standardwebhooks';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
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

export function openPeyPayload(row:{ciphertext:string;iv:string;authTag:string;keyFingerprint:string;payloadHash:string},key:Buffer):Buffer {
 if(key.length!==32||createHash('sha256').update(key).digest('hex')!==row.keyFingerprint)throw new Error('INBOX_KEY_MISMATCH');
 const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(row.iv,'hex'));decipher.setAuthTag(Buffer.from(row.authTag,'hex'));
 const raw=Buffer.concat([decipher.update(Buffer.from(row.ciphertext,'base64')),decipher.final()]);
 if(createHash('sha256').update(raw).digest('hex')!==row.payloadHash)throw new Error('INBOX_CONTENT_MISMATCH');return raw;
}
