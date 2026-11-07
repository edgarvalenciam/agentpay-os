import type { FulfillmentStatus, PaymentAttemptStatus } from './models.js';
import { DomainError, fingerprint } from './orders.js';
const transitions: Record<PaymentAttemptStatus, PaymentAttemptStatus[]> = {
  CREATED:['SUBMISSION_PENDING','CANCELLED_LOCALLY'],
  SUBMISSION_PENDING:['SUBMITTED','SUBMISSION_UNKNOWN','CONFIRMED','RECONCILIATION_EXCEPTION'],
  SUBMISSION_UNKNOWN:['PAYMENT_PENDING','CONFIRMED','RECONCILIATION_EXCEPTION'],
  SUBMITTED:['PAYMENT_PENDING','CONFIRMED','RECONCILIATION_EXCEPTION'],
  PAYMENT_PENDING:['CONFIRMED','RECONCILIATION_EXCEPTION'],
  CONFIRMED:[], RECONCILIATION_EXCEPTION:['CONFIRMED'], CANCELLED_LOCALLY:[],
};
export function transitionPayment(from: PaymentAttemptStatus, to: PaymentAttemptStatus): PaymentAttemptStatus {
  if (!transitions[from].includes(to)) throw new DomainError('INVALID_PAYMENT_TRANSITION');
  return to;
}
export interface IdempotencyRecord { scope: string; key: string; requestHash: string; operationId: string }
/** Caller persists the returned record atomically with the operation in G2; no memory store is claimed durable. */
export function decideIdempotency(existing: IdempotencyRecord | null, input: {scope:string; key:string; request:unknown; operationId:string}): {kind:'NEW'|'REPLAY'; record:IdempotencyRecord} {
  if (!input.scope || !input.key || !input.operationId) throw new DomainError('INVALID_IDEMPOTENCY_INPUT');
  const requestHash = fingerprint(input.request);
  if (existing) {
    if (existing.scope !== input.scope || existing.key !== input.key || existing.requestHash !== requestHash) throw new DomainError('IDEMPOTENCY_CONFLICT');
    return {kind:'REPLAY',record:{...existing}};
  }
  return {kind:'NEW',record:{scope:input.scope,key:input.key,requestHash,operationId:input.operationId}};
}

export function transitionFulfillment(from: FulfillmentStatus, to: FulfillmentStatus, payment: PaymentAttemptStatus): FulfillmentStatus {
  const allowed: Record<FulfillmentStatus, FulfillmentStatus[]> = {
    RESERVED:['READY_FOR_PREPARATION','FULFILLMENT_EXCEPTION'],
    READY_FOR_PREPARATION:['PREPARING','FULFILLMENT_EXCEPTION'],
    PREPARING:['COMPLETED','FULFILLMENT_EXCEPTION'], COMPLETED:[], FULFILLMENT_EXCEPTION:[],
  };
  if (payment !== 'CONFIRMED' || !allowed[from].includes(to)) throw new DomainError('INVALID_FULFILLMENT_TRANSITION');
  return to;
}
