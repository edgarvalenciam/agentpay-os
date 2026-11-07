import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';
import { PeyCodiPushGateway,type RealPaymentGrant } from '@agentpay/integrations';
import { checkPrivateConfig } from '../../../scripts/private-pey-config.js';
import type { PeyPaymentOptions } from './pey-payment-service.js';
const grantSchema=z.object({id:z.string().min(1),orderId:z.string().min(1),snapshotHash:z.string().regex(/^[a-f0-9]{64}$/),amountMinor:z.number().int().positive().max(100000000),bankAccountId:z.string().min(1),phoneNumber:z.string().regex(/^\d{10}$/),expiresAt:z.string().datetime({offset:true})}).strict();
export async function loadPeyPaymentOptions(path=resolve('.env.pey.local'),grantPath=resolve('.pey-payment-authorization.json')):Promise<PeyPaymentOptions>{
 await checkPrivateConfig(path);const env=parseEnv(await readFile(path,'utf8'));
 const fields=['PEY_API_KEY','PEY_API_KEY_ID','PEY_BANK_ACCOUNT_ID','PEY_BENEFICIARY_NAME','PEY_BUYER_PHONE'] as const;
 if(fields.some(k=>!env[k])||env.PEY_API_KEY_ID===env.PEY_API_KEY||!/^[-_a-zA-Z0-9]{1,255}$/.test(env.PEY_API_KEY_ID??'')||!/^[-_a-zA-Z0-9]{1,255}$/.test(env.PEY_BANK_ACCOUNT_ID??'')||/^\d{18}$/.test(env.PEY_BANK_ACCOUNT_ID??''))throw new Error('PEY_ACCOUNT_CONFIGURATION_REQUIRED');
 let grant:RealPaymentGrant|null=null;
 try{await checkPrivateConfig(grantPath);grant=grantSchema.parse(JSON.parse(await readFile(grantPath,'utf8')));}catch(error){if(!(error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT'))throw new Error('INVALID_PRIVATE_PAYMENT_AUTHORIZATION');}
 // Two explicit gates; saving an API key never changes these flags or creates a grant.
 const allowRealPayments=env.ALLOW_REAL_PAYMENTS==='true'&&process.env.ALLOW_REAL_PAYMENTS==='true';
 return {gateway:new PeyCodiPushGateway({apiKey:env.PEY_API_KEY!,allowRealPayments,grant}),apiKeyId:env.PEY_API_KEY_ID!,bankAccountId:env.PEY_BANK_ACCOUNT_ID!,beneficiaryDisplayName:env.PEY_BENEFICIARY_NAME!,buyerPhone:env.PEY_BUYER_PHONE!,dispatchIntervalMs:1000};
}
