import { ContextSchema, PurchaseIntentSchema, OfferSchema, type PurchaseIntent, type Offer, type EvaluationContext } from './models.js';
export const POLICY_VERSION = '1.2.0';
export interface PolicyCheck { code: string; passed: boolean }
export interface PolicyEvaluation { status: 'ELIGIBLE' | 'REJECTED'; policyVersion: string; checks: PolicyCheck[]; reasons: string[] }
export function evaluateOffer(intentInput: PurchaseIntent, offerInput: Offer, contextInput: EvaluationContext): PolicyEvaluation {
  const i = PurchaseIntentSchema.safeParse(intentInput), o = OfferSchema.safeParse(offerInput), c = ContextSchema.safeParse(contextInput);
  if (!i.success || !o.success || !c.success) return { status: 'REJECTED', policyVersion: POLICY_VERSION, checks: [{code:'VALID_INPUT', passed:false}], reasons:['VALID_INPUT'] };
  const intent = i.data, offer = o.data, ctx = c.data, now = Date.parse(ctx.now);
  const horizon = now + (ctx.paymentWindowSeconds + ctx.reserveMarginSeconds) * 1000;
  const r = ctx.reservation;
  const rules: Record<string, boolean> = {
    CURRENCY: intent.currency === 'MXN' && offer.currency === 'MXN',
    BUDGET: offer.amountMinor > 0 && offer.amountMinor <= intent.maxAmountMinor,
    PRODUCT: offer.productId === intent.productId && offer.category === intent.category,
    QUANTITY: offer.quantity === intent.quantity && offer.unit === intent.unit,
    DELIVERY: offer.deliveryAt !== null && Date.parse(offer.deliveryAt) >= now && Date.parse(offer.deliveryAt) <= Date.parse(intent.deliveryDeadline),
    MERCHANT: ctx.merchant.id === offer.merchantId && ctx.merchant.status === 'ACTIVE' && ctx.merchant.canFulfill,
    BENEFICIARY: ctx.account.id === offer.beneficiaryAccountId && ctx.account.merchantId === offer.merchantId,
    ACCOUNT_ACTIVE: ctx.account.codiStatus === 'ACTIVE' && (ctx.account.provider !== 'pey' || ctx.account.providerBankAccountId !== null),
    STOCK: offer.stock >= offer.quantity,
    OFFER_VALID: Date.parse(offer.validUntil) > horizon,
    RESERVATION: r !== null && r.status === 'RESERVED' && r.orderId === ctx.orderId && r.offerId === offer.id && r.offerVersion === offer.version && r.merchantId === offer.merchantId && r.quantity >= offer.quantity && Date.parse(r.validUntil) > horizon,
    FIXED_AMOUNT: ctx.method !== 'CODI_QR' || ctx.qrAmountMode === 'FIXED',
    NO_TIPS: ctx.method !== 'PAYMENT_LINK' || !ctx.hasTip,
    METHOD_ENABLED: ctx.method === 'CODI_PUSH', // QR/links are modeled only; no operational support in G1.
  };
  const checks = Object.entries(rules).map(([code, passed]) => ({code, passed}));
  const reasons = checks.filter(c => !c.passed).map(c => c.code);
  return { status: reasons.length ? 'REJECTED' : 'ELIGIBLE', policyVersion: POLICY_VERSION, checks, reasons };
}
/** Resolves a calendar date, not a guessed delivery instant. Caller must supply a local delivery time. */
export function tomorrowLocalDate(now: string, timezone: string): string {
  PurchaseIntentSchema.shape.timezone.parse(timezone); ContextSchema.shape.now.parse(now);
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: timezone, year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
  const get = (key: string) => Number(parts.find(p => p.type === key)?.value);
  const date = new Date(Date.UTC(get('year'), get('month') - 1, get('day') + 1));
  return date.toISOString().slice(0,10);
}
