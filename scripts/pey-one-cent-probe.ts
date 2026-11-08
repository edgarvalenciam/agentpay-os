import { createHash,randomUUID } from 'node:crypto';
import { mkdir,open,rename,writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
export const probeConsent='ONE_CENT_MXN_TO_PEY_RAMON_TEST_ACCOUNT';
/** Isolated operator diagnostic, not a commercial order or permission to enable the application. */
export async function runOneCentProbe(options:{apiKey:string;phone:string;consent:string;statePath:string;transport?:typeof fetch}){
 if(options.consent!==probeConsent||!options.apiKey||/[\s\x00-\x1f\x7f]/.test(options.apiKey)||!/^\d{10}$/.test(options.phone))throw new Error('PROBE_NOT_AUTHORIZED');
 const id=randomUUID(),now=new Date().toISOString();
 const record={id,kind:'ISOLATED_BANK_CONNECTIVITY_PROBE',amountMinor:1,currency:'MXN',beneficiary:'PEY_PUBLISHED_RAMON_TEST_ACCOUNT',accountSource:'API_KEY_LINKED_ACCOUNT_VERIFIED_IN_PORTAL',createdAt:now,expiresAt:new Date(Date.now()+360000).toISOString(),credentialFingerprint:createHash('sha256').update(options.apiKey).digest('hex'),phoneFingerprint:createHash('sha256').update(options.phone).digest('hex')};
 await mkdir(dirname(options.statePath),{recursive:true,mode:0o700});
 // O_EXCL, flushed before any HTTP: repeat invocations cannot submit again, even after a crash.
 const file=await open(options.statePath,'wx',0o600);
 try{await file.writeFile(JSON.stringify({...record,status:'SUBMISSION_UNKNOWN'})+'\n');await file.sync();}finally{await file.close();}
 const save=async(data:unknown)=>{const temp=options.statePath+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify({...record,...data as object})+'\n',{flag:'wx',mode:0o600});await rename(temp,options.statePath);};
 try{
  const response=await (options.transport??fetch)('https://api.pey.mx/codi/pn',{method:'POST',headers:{authorization:'Bearer '+options.apiKey,'content-type':'application/json',accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000),body:JSON.stringify({amount:0.01,phoneNumber:options.phone,concept:'AGENTPAY PRUEBA 1 CENTAVO',expiration:360,numRef:'1',metadata:{orderId:id,paymentAttemptId:id,environment:'real',purpose:'isolated-one-cent-probe'}})});
  if(response.status!==200){await response.body?.cancel();await save({status:'SUBMISSION_UNKNOWN',httpStatus:response.status});return {status:'SUBMISSION_UNKNOWN',httpStatus:response.status};}
  const reader=response.body?.getReader();if(!reader)throw new Error();let size=0;const chunks:Uint8Array[]=[];
  for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>65536){await reader.cancel();throw new Error();}chunks.push(next.value);}
  const parsed:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!parsed||typeof parsed!=='object'||!('transactionId' in parsed)||typeof parsed.transactionId!=='string'||parsed.transactionId.length<1||parsed.transactionId.length>255||!('codiId' in parsed)||typeof parsed.codiId!=='string'||!/^\d{20}$/.test(parsed.codiId))throw new Error();
  const receipt={transactionId:parsed.transactionId,codiId:parsed.codiId};
  await save({status:'PAYMENT_PENDING',...receipt});return {status:'PAYMENT_PENDING'};
 }catch{await save({status:'SUBMISSION_UNKNOWN'});return {status:'SUBMISSION_UNKNOWN'};}
}
