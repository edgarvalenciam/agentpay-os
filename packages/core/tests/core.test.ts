import { describe, it, expect } from 'vitest';
import * as core from '../src/index.js';
function fixture() {
  const intent: core.PurchaseIntent = {id:'i1',buyerId:'buyer1',version:1,originalText:'2 kg café, máximo $1,000, mañana',productId:'coffee',category:'specialty',quantity:2,unit:'kg',maxAmountMinor:100000,currency:'MXN',deliveryDeadline:'2026-11-08T20:00:00-06:00',timezone:'America/Mexico_City'};
  const offer: core.Offer = {id:'o1',version:1,merchantId:'m1',productId:'coffee',category:'specialty',quantity:2,unit:'kg',amountMinor:85000,currency:'MXN',stock:2,deliveryAt:'2026-11-08T12:00:00-06:00',validUntil:'2026-11-07T20:00:00-06:00',beneficiaryAccountId:'a1'};
  const context: core.EvaluationContext = {now:'2026-11-07T12:00:00-06:00',orderId:'order1',merchant:{id:'m1',status:'ACTIVE',canFulfill:true},account:{id:'a1',merchantId:'m1',provider:'pey',providerBankAccountId:'provider-account-fixture',codiStatus:'ACTIVE',beneficiaryDisplayName:'Comercio de prueba'},reservation:{id:'r1',orderId:'order1',offerId:'o1',offerVersion:1,merchantId:'m1',quantity:2,validUntil:'2026-11-07T20:00:00-06:00',status:'RESERVED'},method:'CODI_PUSH',phoneNumber:'5500000000',paymentWindowSeconds:600,reserveMarginSeconds:60,qrAmountMode:'FIXED',hasTip:false};
  return {intent,offer,context};
}
describe('deterministic policies', () => {
  it('allows $850 under $1,000 and emits every check without side effects', () => {
    const f=fixture(), before=JSON.stringify(f);
    const result=core.evaluateOffer(f.intent,f.offer,f.context);
    expect(result.status).toBe('ELIGIBLE'); expect(result.checks.every(check => check.passed)).toBe(true); expect(JSON.stringify(f)).toBe(before);
    expect(Object.keys(core).some(k => /submit|gateway|fetch/i.test(k))).toBe(false);
  });
  const negatives: [string,(f:ReturnType<typeof fixture>)=>void,string][] = [
    ['over budget',f=>{f.offer.amountMinor=120000;},'BUDGET'],
    ['zero',f=>{f.offer.amountMinor=0;},'BUDGET'],
    ['currency',f=>{f.offer.currency='USD';},'CURRENCY'],
    ['quantity',f=>{f.offer.quantity=1;},'QUANTITY'],
    ['product',f=>{f.offer.productId='other';},'PRODUCT'],
    ['late delivery',f=>{f.offer.deliveryAt='2026-11-09T12:00:00-06:00';},'DELIVERY'],
    ['unknown delivery',f=>{f.offer.deliveryAt=null;},'DELIVERY'],
    ['expired offer',f=>{f.offer.validUntil=f.context.now;},'OFFER_VALID'],
    ['inactive merchant',f=>{f.context.merchant.status='INACTIVE';},'MERCHANT'],
    ['no capacity',f=>{f.context.merchant.canFulfill=false;},'MERCHANT'],
    ['no stock',f=>{f.offer.stock=0;},'STOCK'],
    ['pending account',f=>{f.context.account.codiStatus='PENDING';},'ACCOUNT_ACTIVE'],
    ['error account',f=>{f.context.account.codiStatus='ERROR';},'ACCOUNT_ACTIVE'],
    ['wrong beneficiary',f=>{f.context.account.id='other';},'BENEFICIARY'],
    ['wrong merchant account',f=>{f.context.account.merchantId='other';},'BENEFICIARY'],
    ['missing provider account',f=>{f.context.account.providerBankAccountId=null;},'ACCOUNT_ACTIVE'],
    ['no reservation',f=>{f.context.reservation=null;},'RESERVATION'],
    ['short reservation',f=>{f.context.reservation!.validUntil='2026-11-07T12:11:00-06:00';},'RESERVATION'],
    ['other order reservation',f=>{f.context.reservation!.orderId='other';},'RESERVATION'],
    ['stale offer version',f=>{f.context.reservation!.offerVersion=2;},'RESERVATION'],
    ['open QR',f=>{f.context.method='CODI_QR';f.context.qrAmountMode='OPEN';},'FIXED_AMOUNT'],
    ['tips',f=>{f.context.method='PAYMENT_LINK';f.context.hasTip=true;},'NO_TIPS'],
    ['unimplemented method',f=>{f.context.method='PAYMENT_LINK';},'METHOD_ENABLED'],
  ];
  it.each(negatives)('rejects %s',(_,mutate,code)=>{const f=fixture();mutate(f);const r=core.evaluateOffer(f.intent,f.offer,f.context);expect(r.status).toBe('REJECTED');expect(r.reasons).toContain(code);});
  it.each([NaN,Infinity,85000.1,Number.MAX_SAFE_INTEGER+1,-1])('rejects invalid money %s',amount=>{const f=fixture();f.offer.amountMinor=amount;expect(core.evaluateOffer(f.intent,f.offer,f.context).reasons).toContain('VALID_INPUT');});
  it('fails closed on missing critical data',()=>{const f=fixture();expect(core.evaluateOffer(f.intent,{} as core.Offer,f.context).status).toBe('REJECTED');});
  it('uses local calendar tomorrow across UTC boundary and leap year',()=>{
    expect(core.tomorrowLocalDate('2026-11-08T02:00:00Z','America/Mexico_City')).toBe('2026-11-08');
    expect(core.tomorrowLocalDate('2024-02-28T12:00:00Z','UTC')).toBe('2024-02-29');
    expect(()=>core.tomorrowLocalDate('2026-11-07T00:00:00Z','bad/timezone')).toThrow();
  });
});
describe('snapshots and consent',()=>{
  function approved(){const f=fixture();const s=core.createSnapshot(f.intent,f.offer,f.context);return {f,s,c:core.recordConsent(s,'buyer1',f.context.now)};}
  it('deep freezes a detached snapshot',()=>{const {f,s}=approved();f.offer.amountMinor=1;expect(s.offer.amountMinor).toBe(85000);expect(()=>{s.offer.amountMinor=1;}).toThrow();});
  it.each(['price','product','delivery','beneficiary','phone','intent','method','version'])('invalidates consent on changed %s',field=>{
    const {s,c,f}=approved();const changed=JSON.parse(JSON.stringify(s)) as core.OrderSnapshot;
    if(field==='price')changed.offer.amountMinor=86000;
    if(field==='product')changed.offer.productId='other';
    if(field==='delivery')changed.offer.deliveryAt='2026-11-08T13:00:00-06:00';
    if(field==='beneficiary')changed.account.id='other';
    if(field==='phone')changed.phoneNumber='5511111111';
    if(field==='intent')changed.intent.maxAmountMinor=80000;
    if(field==='method')changed.method='CODI_QR';
    if(field==='version')changed.version=2;
    expect(core.canRequestPayment(changed,c,f.context.now)).toBe(false);
  });
  it('requires correct actor and valid reservation at approval and request time',()=>{
    const {s,c,f}=approved();expect(()=>core.recordConsent(s,'attacker',f.context.now)).toThrow();
    expect(core.canRequestPayment(s,c,'2026-11-07T19:59:00-06:00')).toBe(false);
    expect(core.consentMatches(s,{...c,acceptedAt:'2026-11-08T00:00:00Z'},f.context.now)).toBe(false);
  });
  it('cannot snapshot a rejected offer',()=>{const f=fixture();f.offer.amountMinor=120000;expect(()=>core.createSnapshot(f.intent,f.offer,f.context)).toThrow('POLICY_REJECTED');});
  it('requires consent and keeps commercial and payment states separate',()=>{
    const {s,c,f}=approved();expect(core.transitionOrder('DRAFT','PRESENT')).toBe('AWAITING_BUYER_CONFIRMATION');
    expect(()=>core.transitionOrder('AWAITING_BUYER_CONFIRMATION','APPROVE')).toThrow('CONSENT_REQUIRED');
    const auth={snapshot:s,consent:c,now:f.context.now};
    expect(core.transitionOrder('AWAITING_BUYER_CONFIRMATION','APPROVE',auth)).toBe('APPROVED');
    expect(core.transitionOrder('APPROVED','REQUEST_RECORDED',auth)).toBe('PAYMENT_PENDING');
    expect(()=>core.transitionOrder('APPROVED','PAYMENT_RECONCILED')).toThrow();
    expect(()=>core.transitionOrder('PAYMENT_PENDING','COMPLETE')).toThrow();
    expect(core.transitionOrder('PAYMENT_PENDING','PAYMENT_RECONCILED')).toBe('PAID');
  });
});
describe('idempotency and uncertain submission',()=>{
  it('replays identical canonical content and rejects conflicting content',()=>{
    const input={scope:'buyer1/request/order1',key:'key',operationId:'attempt1',request:{amountMinor:85000,orderId:'order1'}};
    const first=core.decideIdempotency(null,input);expect(first.kind).toBe('NEW');
    const replay=core.decideIdempotency(first.record,{...input,operationId:'attempt2',request:{orderId:'order1',amountMinor:85000}});
    expect(replay.kind).toBe('REPLAY');expect(replay.record.operationId).toBe('attempt1');
    expect(()=>core.decideIdempotency(first.record,{...input,request:{amountMinor:120000}})).toThrow('IDEMPOTENCY_CONFLICT');
    expect(()=>core.decideIdempotency(first.record,{...input,scope:'buyer2'})).toThrow('IDEMPOTENCY_CONFLICT');
  });
  it('blocks automatic resubmission and false confirmation from CREATED',()=>{
    expect(core.transitionPayment('SUBMISSION_PENDING','SUBMISSION_UNKNOWN')).toBe('SUBMISSION_UNKNOWN');
    expect(()=>core.transitionPayment('SUBMISSION_UNKNOWN','SUBMISSION_PENDING')).toThrow();
    expect(()=>core.transitionPayment('CREATED','CONFIRMED')).toThrow();
    expect(core.transitionPayment('SUBMISSION_UNKNOWN','CONFIRMED')).toBe('CONFIRMED');
    expect(()=>core.transitionPayment('CONFIRMED','PAYMENT_PENDING')).toThrow();
  });
  it('refuses ambiguous request serialization',()=>{expect(()=>core.fingerprint({amount:undefined})).toThrow();});
});

it('prevents fulfillment before payment and preserves late-payment exception',()=>{
  expect(()=>core.transitionFulfillment('RESERVED','READY_FOR_PREPARATION','PAYMENT_PENDING')).toThrow();
  expect(core.transitionFulfillment('RESERVED','READY_FOR_PREPARATION','CONFIRMED')).toBe('READY_FOR_PREPARATION');
  expect(core.transitionFulfillment('RESERVED','FULFILLMENT_EXCEPTION','CONFIRMED')).toBe('FULFILLMENT_EXCEPTION');
});
