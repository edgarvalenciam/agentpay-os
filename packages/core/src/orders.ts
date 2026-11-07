import { createHash } from 'node:crypto';
import { ConsentRecordSchema, OrderSnapshotSchema, type ConsentRecord, type OrderSnapshot, type PurchaseIntent, type Offer, type EvaluationContext } from './models.js';
import { evaluateOffer, POLICY_VERSION } from './policies.js';
export class DomainError extends Error { constructor(public readonly code: string) { super(code); } }
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical((value as Record<string,unknown>)[k])).join(',') + '}';
  throw new DomainError('INVALID_CANONICAL_VALUE');
}
export const fingerprint = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex');
function freeze<T>(value: T): Readonly<T> { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
export function createSnapshot(intent: PurchaseIntent, offer: Offer, ctx: EvaluationContext, version = 1): Readonly<OrderSnapshot> {
  if (evaluateOffer(intent,offer,ctx).status !== 'ELIGIBLE' || !ctx.reservation) throw new DomainError('POLICY_REJECTED');
  return freeze(OrderSnapshotSchema.parse({orderId:ctx.orderId,version,policyVersion:POLICY_VERSION,intent,offer,merchant:ctx.merchant,account:ctx.account,reservation:ctx.reservation,method:ctx.method,phoneNumber:ctx.phoneNumber,paymentWindowSeconds:ctx.paymentWindowSeconds,reserveMarginSeconds:ctx.reserveMarginSeconds,qrAmountMode:ctx.qrAmountMode,hasTip:ctx.hasTip}));
}
export function consentMatches(snapshotInput: OrderSnapshot, consentInput: ConsentRecord, now: string): boolean {
  const s = OrderSnapshotSchema.safeParse(snapshotInput), c = ConsentRecordSchema.safeParse(consentInput);
  if (!s.success || !c.success || !Number.isFinite(Date.parse(now))) return false;
  const snapshot = s.data, consent = c.data;
  return consent.actorId === snapshot.intent.buyerId && consent.orderId === snapshot.orderId && consent.snapshotVersion === snapshot.version && consent.snapshotHash === fingerprint(snapshot) && consent.amountMinor === snapshot.offer.amountMinor && consent.beneficiaryAccountId === snapshot.account.id && Date.parse(consent.acceptedAt) <= Date.parse(now);
}
export function recordConsent(snapshot: OrderSnapshot, actorId: string, acceptedAt: string): Readonly<ConsentRecord> {
  const consent = ConsentRecordSchema.parse({actorId,orderId:snapshot.orderId,snapshotHash:fingerprint(snapshot),snapshotVersion:snapshot.version,acceptedAt,amountMinor:snapshot.offer.amountMinor,beneficiaryAccountId:snapshot.account.id,action:'REQUEST_PAYMENT'});
  if (!canRequestPayment(snapshot,consent,acceptedAt)) throw new DomainError('INVALID_CONSENT');
  return freeze(consent);
}
export function canRequestPayment(s: OrderSnapshot, consent: ConsentRecord, now: string): boolean {
  if (!consentMatches(s,consent,now) || s.policyVersion !== POLICY_VERSION) return false;
  return evaluateOffer(s.intent,s.offer,{now,orderId:s.orderId,merchant:s.merchant,account:s.account,reservation:s.reservation,method:s.method,phoneNumber:s.phoneNumber,paymentWindowSeconds:s.paymentWindowSeconds,reserveMarginSeconds:s.reserveMarginSeconds,qrAmountMode:s.qrAmountMode,hasTip:s.hasTip}).status === 'ELIGIBLE';
}
export type OrderStatus = 'DRAFT' | 'AWAITING_BUYER_CONFIRMATION' | 'APPROVED' | 'PAYMENT_PENDING' | 'PAID' | 'FULFILLMENT_PENDING' | 'COMPLETED' | 'EXCEPTION';
export type OrderEvent = 'PRESENT' | 'APPROVE' | 'REQUEST_RECORDED' | 'PAYMENT_RECONCILED' | 'RELEASE_TO_FULFILLMENT' | 'COMPLETE' | 'RAISE_EXCEPTION';
const transitions: Partial<Record<OrderStatus, Partial<Record<OrderEvent, OrderStatus>>>> = {
  DRAFT:{PRESENT:'AWAITING_BUYER_CONFIRMATION'}, AWAITING_BUYER_CONFIRMATION:{APPROVE:'APPROVED'}, APPROVED:{REQUEST_RECORDED:'PAYMENT_PENDING'}, PAYMENT_PENDING:{PAYMENT_RECONCILED:'PAID',RAISE_EXCEPTION:'EXCEPTION'}, PAID:{RELEASE_TO_FULFILLMENT:'FULFILLMENT_PENDING',RAISE_EXCEPTION:'EXCEPTION'}, FULFILLMENT_PENDING:{COMPLETE:'COMPLETED',RAISE_EXCEPTION:'EXCEPTION'},
};
/** Pure transition rules. Verified financial evidence must be supplied by a trusted service in G3. */
export function transitionOrder(status: OrderStatus, event: OrderEvent, authorization?: {snapshot: OrderSnapshot; consent: ConsentRecord; now: string}): OrderStatus {
  const next = transitions[status]?.[event];
  if (!next) throw new DomainError('INVALID_ORDER_TRANSITION');
  if ((event === 'APPROVE' || event === 'REQUEST_RECORDED') && (!authorization || !canRequestPayment(authorization.snapshot,authorization.consent,authorization.now))) throw new DomainError('CONSENT_REQUIRED');
  return next;
}
