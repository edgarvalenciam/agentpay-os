import { z } from 'zod';
import { minorToMxn,mxnToMinor,type PaymentGateway,type PushSubmission,type PushReceipt } from '@agentpay/core';
const id=z.string().min(1).max(255);
const money=z.union([z.string(),z.number()]).transform(v=>mxnToMinor(v));
const external=z.object({orderId:id,paymentAttemptId:id,environment:z.literal('real')}).passthrough();
const receiptSchema=z.object({transactionId:id,codiId:z.string().regex(/^[0-9a-fA-F]{20}$/)});
const bankSchema=z.object({id,name:z.string().min(1),clabe:z.string().regex(/^\d{18}$/),codiStatus:z.enum(['PENDING','PROCESSING','ACTIVE','ERROR'])}).passthrough();
const transactionSchema=z.discriminatedUnion('status',[
 z.object({id,status:z.literal('PENDING')}).passthrough(),
 z.object({id,status:z.literal('PAID'),amount:money,currency:z.literal('MXN'),paymentMethod:z.literal('CODI'),payableType:z.literal('API_CODI_PN'),datePaid:z.number().int().nonnegative(),metadata:z.object({clabe:z.string().regex(/^\d{18}$/).optional(),externalMetadata:external}).passthrough(),amountBreakdown:z.object({base:money.optional(),tip:money.optional(),fee:money.optional()}).optional(),applicationFee:money.nullable().optional()}).passthrough(),
]);
const pushSchema=z.object({type:z.literal('codi.pn.payment_received'),amount:money,apiKeyId:id,bankAccountId:id,transactionId:id,numRef:z.string().regex(/^\d{1,7}$/),datePaid:z.number().int().nonnegative(),currency:z.literal('MXN').optional(),metadata:z.object({externalMetadata:external}).passthrough()}).passthrough();
export type PeyTransaction=z.infer<typeof transactionSchema>;
export type PeyBankAccount=z.infer<typeof bankSchema>;
export type PeyPaidPush=z.infer<typeof pushSchema>;
/** Preserve the literal decimal amount, including excess precision that JSON.parse would otherwise round away. Requires Node 22+. */
export function decodePeyJson(raw:string):unknown{
 const monetary=new Set(['amount','base','tip','fee','applicationFee']);
 return JSON.parse(raw,(key:string,value:unknown,context?:{source?:string})=>{
  if(typeof value==='number'&&monetary.has(key)){if(!context?.source)throw new Error('EXACT_JSON_RUNTIME_REQUIRED');return context.source;}return value;
 });
}
export function decodePeyPaidPush(raw:string):PeyPaidPush{return pushSchema.parse(decodePeyJson(raw));}
export class PeyReadError extends Error { constructor(public readonly code:string,public readonly status?:number){super(code);} }
export class PeyPreflightError extends Error {constructor(public readonly code:string){super(code);}}
export class PeySubmissionUnknown extends Error {constructor(){super('PEY_SUBMISSION_UNKNOWN');}}
export interface RealPaymentGrant {id:string;orderId:string;snapshotHash:string;amountMinor:number;bankAccountId:string;phoneNumber:string;expiresAt:string}
export interface PeyGatewayOptions {apiKey:string;allowRealPayments?:boolean;grant?:RealPaymentGrant|null;transport?:typeof fetch;timeoutMs?:number;clock?:()=>string}
export class PeyCodiPushGateway implements PaymentGateway {
 readonly provider='pey' as const;readonly environment='real' as const;readonly method='CODI_PUSH' as const;
 #apiKey:string;
 private transport:typeof fetch;private timeoutMs:number;private clock:()=>string;
 readonly allowRealPayments:boolean;readonly grant:RealPaymentGrant|null;
 constructor(options:PeyGatewayOptions){
  if(!options.apiKey||/[\s\x00-\x1f\x7f]/.test(options.apiKey))throw new PeyPreflightError('PEY_API_KEY_REQUIRED');
  this.#apiKey=options.apiKey;this.transport=options.transport??fetch;this.timeoutMs=options.timeoutMs??10000;this.clock=options.clock??(()=>new Date().toISOString());this.allowRealPayments=options.allowRealPayments===true;this.grant=options.grant??null;
  if(!Number.isInteger(this.timeoutMs)||this.timeoutMs<1||this.timeoutMs>30000)throw new PeyPreflightError('INVALID_TIMEOUT');
 }
 assertAuthorized(input:PushSubmission){
  const g=this.grant;
  if(!this.allowRealPayments||!g||!g.id||g.orderId!==input.orderId||g.snapshotHash!==input.snapshotHash||g.amountMinor!==input.amountMinor||g.bankAccountId!==input.providerBankAccountId||g.phoneNumber!==input.phoneNumber||!Number.isFinite(Date.parse(g.expiresAt))||Date.parse(g.expiresAt)<=Date.parse(this.clock()))throw new PeyPreflightError('REAL_PAYMENT_NOT_AUTHORIZED');
  if(input.orderId.length>500||input.attemptId.length>500||!input.providerBankAccountId||!input.beneficiaryDisplayName||!input.snapshotHash||input.currency!=='MXN'||!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0||input.amountMinor>100000000||!/^\d{10}$/.test(input.phoneNumber)||!/^\d{1,7}$/.test(input.numRef)||!Number.isInteger(input.expirationSeconds)||input.expirationSeconds! < 360)throw new PeyPreflightError('INVALID_PUSH_INPUT');
 }
 private async call(method:'GET'|'POST',path:string,body?:string):Promise<unknown>{
  try{
   const response=await this.transport('https://api.pey.mx'+path,{method,headers:{authorization:'Bearer '+this.#apiKey,accept:'application/json',...(body?{'content-type':'application/json'}:{})},...(body?{body}:{}),redirect:'error',signal:AbortSignal.timeout(this.timeoutMs)});
   if(response.status!==200)throw new PeyReadError('PEY_HTTP_ERROR',response.status);
   let size=0;const chunks:Uint8Array[]=[];const reader=response.body?.getReader();if(!reader)throw new PeyReadError('EMPTY_PROVIDER_RESPONSE');
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw new PeyReadError('PROVIDER_RESPONSE_TOO_LARGE');}chunks.push(value);}
   return decodePeyJson(Buffer.concat(chunks).toString('utf8'));
  }catch(error){if(method==='POST')throw new PeySubmissionUnknown();if(error instanceof PeyReadError)throw error;throw new PeyReadError('PEY_READ_UNAVAILABLE');}
 }
 async getBankAccount(bankAccountId:string):Promise<PeyBankAccount>{
  if(!bankAccountId)throw new PeyReadError('BANK_ACCOUNT_ID_REQUIRED');
  try{const bank=bankSchema.parse(await this.call('GET','/bank-account/'+encodeURIComponent(bankAccountId)));if(bank.id!==bankAccountId)throw new Error();return bank;}catch(error){if(error instanceof PeyReadError)throw error;throw new PeyReadError('INVALID_BANK_RESPONSE');}
 }
 async getTransaction(transactionId:string):Promise<PeyTransaction>{
  if(!transactionId)throw new PeyReadError('TRANSACTION_ID_REQUIRED');
  try{const result=transactionSchema.parse(await this.call('GET','/transaction/'+encodeURIComponent(transactionId)));if(result.id!==transactionId)throw new Error();return result;}catch(error){if(error instanceof PeyReadError)throw error;throw new PeyReadError('INVALID_TRANSACTION_RESPONSE');}
 }
 async submit(input:PushSubmission):Promise<PushReceipt>{
  this.assertAuthorized(input);
  try{const bank=await this.getBankAccount(input.providerBankAccountId!);if(bank.codiStatus!=='ACTIVE'||bank.name!==input.beneficiaryDisplayName)throw new PeyPreflightError('BENEFICIARY_NOT_READY');}
  catch(error){if(error instanceof PeyPreflightError)throw error;throw new PeyPreflightError('BENEFICIARY_CHECK_UNAVAILABLE');}
  this.assertAuthorized(input);
  const rest={phoneNumber:input.phoneNumber,concept:'AgentPay '+input.orderId.slice(0,12),expiration:input.expirationSeconds,numRef:input.numRef,bankAccountId:input.providerBankAccountId,metadata:{orderId:input.orderId,paymentAttemptId:input.attemptId,environment:'real'}};
  const body='{"amount":'+minorToMxn(input.amountMinor)+','+JSON.stringify(rest).slice(1);
  try{return receiptSchema.parse(await this.call('POST','/codi/pn',body));}catch{throw new PeySubmissionUnknown();}
 }
}
