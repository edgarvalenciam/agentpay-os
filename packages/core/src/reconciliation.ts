import { DomainError } from './orders.js';
export interface PushSubmission {
  attemptId:string; orderId:string; amountMinor:number; currency:'MXN';
  beneficiaryAccountId:string; apiKeyId:string; numRef:string; phoneNumber:string;
}
export interface PushReceipt { transactionId:string; codiId:string }
export interface PaymentGateway {
  readonly provider:'mock'|'pey'; readonly environment:'mock'|'real'; readonly method:'CODI_PUSH';
  submit(input:PushSubmission):Promise<PushReceipt>;
}
export interface PaymentExpectation {
  attemptId:string; orderId:string; amountMinor:number; currency:string;
  beneficiaryAccountId:string; apiKeyId:string; numRef:string; transactionId:string;
}
export interface PaymentNotice extends PaymentExpectation { environment:'mock'; type:'mock.codi.push.paid'|'mock.codi.push.unconfirmed'; datePaid:string|null }
/** Decimal text is normalized exactly; never round provider amounts. */
export function mxnToMinor(value:string|number):number {
  const text=String(value);
  if(!/^\d+(\.\d{1,2})?$/.test(text))throw new DomainError('INVALID_MONEY_PRECISION');
  const [whole,fraction='']=text.split('.');
  const result=BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0'));
  if(result>BigInt(Number.MAX_SAFE_INTEGER))throw new DomainError('MONEY_OVERFLOW');
  return Number(result);
}
export function minorToMxn(value:number):string {
  if(!Number.isSafeInteger(value)||value<0)throw new DomainError('INVALID_MONEY');
  const n=BigInt(value);return `${n/100n}.${String(n%100n).padStart(2,'0')}`;
}
export function reconcileNotice(expected:PaymentExpectation,notice:PaymentNotice):{matched:boolean;reasons:string[]} {
  const keys=(['attemptId','orderId','amountMinor','currency','beneficiaryAccountId','apiKeyId','numRef','transactionId'] as const);
  const reasons=keys.filter(key=>notice[key]!==expected[key]).map(key=>'MISMATCH_'+key);
  return {matched:reasons.length===0,reasons};
}
