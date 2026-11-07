import { z } from 'zod';
import { PurchaseIntentSchema, PaymentMethodSchema } from '@agentpay/core';
export const CreateIntentSchema = PurchaseIntentSchema.omit({id:true,buyerId:true,version:true}).extend({originalText:z.string().min(1).max(4000)}).strict();
export const ProposeSchema = z.object({offerId:z.string().min(1),method:PaymentMethodSchema.default('CODI_PUSH')}).strict();
export const CreateOrderSchema = z.object({proposalId:z.string().min(1),snapshotHash:z.string().regex(/^[a-f0-9]{64}$/),approved:z.literal(true)}).strict();
export const EvaluateSchema = z.object({intentId:z.string().min(1)}).strict();
export const IdempotencyKeySchema = z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/);
export const RequestPaymentSchema=z.object({snapshotHash:z.string().regex(/^[a-f0-9]{64}$/),approved:z.literal(true),method:z.literal('CODI_PUSH').default('CODI_PUSH')}).strict();
