import { z } from 'zod';
const id = z.string().min(1);
export const instant = z.string().datetime({ offset: true });
export const minor = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const PaymentMethodSchema = z.enum(['CODI_PUSH', 'CODI_QR', 'PAYMENT_LINK']);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
export const PurchaseIntentSchema = z.object({
  id, buyerId: id, version: z.number().int().positive(), originalText: id,
  productId: id, category: id, quantity: z.number().int().positive(), unit: id,
  maxAmountMinor: minor, currency: z.string().length(3), deliveryDeadline: instant,
  timezone: z.string().refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } }),
}).strict();
export const OfferSchema = z.object({
  id, version: z.number().int().positive(), merchantId: id, productId: id, category: id,
  quantity: z.number().int().positive(), unit: id, amountMinor: minor,
  currency: z.string().length(3), stock: z.number().int().nonnegative(),
  deliveryAt: instant.nullable(), validUntil: instant, beneficiaryAccountId: id,
}).strict();
export const MerchantSchema = z.object({ id, status: z.enum(['ACTIVE', 'INACTIVE']), canFulfill: z.boolean() }).strict();
export const MerchantPaymentAccountSchema = z.object({
  id, merchantId: id, provider: z.enum(['mock', 'pey']), providerBankAccountId: id.nullable(),
  codiStatus: z.enum(['PENDING', 'PROCESSING', 'ACTIVE', 'ERROR', 'UNKNOWN']), beneficiaryDisplayName: id,
}).strict();
export const ReservationSchema = z.object({
  id, orderId: id, offerId: id, offerVersion: z.number().int().positive(), merchantId: id,
  quantity: z.number().int().positive(), validUntil: instant, status: z.enum(['RESERVED', 'RELEASED']),
}).strict();
export const ContextSchema = z.object({
  now: instant, orderId: id, merchant: MerchantSchema, account: MerchantPaymentAccountSchema,
  reservation: ReservationSchema.nullable(), method: PaymentMethodSchema,
  phoneNumber: z.string().regex(/^\d{10}$/),
  paymentWindowSeconds: z.number().int().min(360), reserveMarginSeconds: z.number().int().nonnegative(),
  qrAmountMode: z.enum(['FIXED', 'OPEN']), hasTip: z.boolean(),
}).strict();
export type PurchaseIntent = z.infer<typeof PurchaseIntentSchema>;
export type Offer = z.infer<typeof OfferSchema>;
export type Merchant = z.infer<typeof MerchantSchema>;
export type MerchantPaymentAccount = z.infer<typeof MerchantPaymentAccountSchema>;
export type Reservation = z.infer<typeof ReservationSchema>;
export type EvaluationContext = z.infer<typeof ContextSchema>;
export const OrderSnapshotSchema = z.object({
  orderId: id, version: z.number().int().positive(), policyVersion: id, intent: PurchaseIntentSchema,
  offer: OfferSchema, merchant: MerchantSchema, account: MerchantPaymentAccountSchema,
  reservation: ReservationSchema, method: PaymentMethodSchema, phoneNumber: z.string().regex(/^\d{10}$/),
  paymentWindowSeconds: z.number().int().min(360), reserveMarginSeconds: z.number().int().nonnegative(),
  qrAmountMode: z.enum(['FIXED', 'OPEN']), hasTip: z.boolean(),
}).strict();
export type OrderSnapshot = z.infer<typeof OrderSnapshotSchema>;
export const ConsentRecordSchema = z.object({
  actorId: id, orderId: id, snapshotHash: z.string().regex(/^[a-f0-9]{64}$/), snapshotVersion: z.number().int().positive(),
  acceptedAt: instant, amountMinor: minor, beneficiaryAccountId: id, action: z.literal('REQUEST_PAYMENT'),
}).strict();
export type ConsentRecord = z.infer<typeof ConsentRecordSchema>;
export type PaymentAttemptStatus = 'CREATED' | 'SUBMISSION_PENDING' | 'SUBMISSION_UNKNOWN' | 'SUBMITTED' | 'PAYMENT_PENDING' | 'CONFIRMED' | 'RECONCILIATION_EXCEPTION' | 'CANCELLED_LOCALLY';
export interface PaymentIntent { orderId: string; method: PaymentMethod; amountMinor: number; currency: 'MXN'; beneficiaryAccountId: string }
export interface PaymentAttempt extends PaymentIntent { id: string; idempotencyKey: string; status: PaymentAttemptStatus }

export const PolicyEvaluationSchema = z.object({
  status: z.enum(['ELIGIBLE', 'REJECTED']), policyVersion: id,
  checks: z.array(z.object({code:id,passed:z.boolean()}).strict()), reasons:z.array(id),
}).strict();
export const PaymentIntentSchema = z.object({orderId:id,method:PaymentMethodSchema,amountMinor:minor,currency:z.literal('MXN'),beneficiaryAccountId:id}).strict();
export type FulfillmentStatus = 'RESERVED' | 'READY_FOR_PREPARATION' | 'PREPARING' | 'COMPLETED' | 'FULFILLMENT_EXCEPTION';
