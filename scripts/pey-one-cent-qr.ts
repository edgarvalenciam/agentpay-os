import { createHash,randomUUID } from 'node:crypto';
import { mkdir,open,rename,writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
export const qrProbeConsent='ONE_CENT_MXN_QR_TO_PEY_RAMON_TEST_ACCOUNT';
/** One authorized diagnostic QR; never enables the commercial QR provider. */
export async function createOneCentQr(options:{apiKey:string;consent:string;statePath:string;transport?:typeof fetch}){
 if(options.consent!==qrProbeConsent||!options.apiKey||/[\s\x00-\x1f\x7f]/.test(options.apiKey))throw new Error('QR_PROBE_NOT_AUTHORIZED');
 const id=randomUUID(),record={id,kind:'ISOLATED_QR_CONNECTIVITY_PROBE',amountMinor:1,currency:'MXN',beneficiary:'PEY_PUBLISHED_RAMON_TEST_ACCOUNT',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+900000).toISOString(),credentialFingerprint:createHash('sha256').update(options.apiKey).digest('hex')};
 await mkdir(dirname(options.statePath),{recursive:true,mode:0o700});
 const file=await open(options.statePath,'wx',0o600);
 try{await file.writeFile(JSON.stringify({...record,status:'SUBMISSION_UNKNOWN'})+'\n');await file.sync();}finally{await file.close();}
 const save=async(data:object)=>{const temp=options.statePath+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify({...record,...data})+'\n',{flag:'wx',mode:0o600});await rename(temp,options.statePath);};
 try{
  const response=await (options.transport??fetch)('https://api.pey.mx/codi/qr',{method:'POST',headers:{authorization:'Bearer '+options.apiKey,'content-type':'application/json',accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000),body:JSON.stringify({amount:0.01,concept:'AGENTPAY PRUEBA QR 1 CENTAVO',expiration:900,numRef:'2',generateImage:true,metadata:{orderId:id,paymentAttemptId:id,environment:'real',purpose:'isolated-one-cent-qr-probe'}})});
  if(response.status!==201){await response.body?.cancel();await save({status:'SUBMISSION_UNKNOWN',httpStatus:response.status});return {status:'SUBMISSION_UNKNOWN' as const,httpStatus:response.status};}
  const reader=response.body?.getReader();if(!reader)throw new Error();let size=0;const chunks:Uint8Array[]=[];
  for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>2097152){await reader.cancel();throw new Error();}chunks.push(next.value);}
  const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(typeof parsed?.id!=='string'||!parsed.id||parsed.id.length>255||typeof parsed.qrString!=='string'||!parsed.qrString||parsed.qrString.length>65536)throw new Error();
  // Save the upstream resource before any image rendering; image failure never creates a new QR.
  await save({status:'QR_CREATED_UNPAID',qrId:parsed.id,qrString:parsed.qrString});
  let image:Buffer|undefined;
  if(typeof parsed.qrImage==='string'){
   const encoded=parsed.qrImage.replace(/^data:image\/png;base64,/,'');
   if(/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)){
    const decoded=Buffer.from(encoded,'base64');if(decoded.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))image=decoded;
   }
  }
  return {status:'QR_CREATED_UNPAID' as const,...(image?{image}:{})};
 }catch{ // Existing resource evidence, if saved, must remain intact.
  return {status:'SUBMISSION_UNKNOWN' as const};
 }
}
