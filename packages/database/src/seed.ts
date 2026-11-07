import type { Database } from './index.js';
/** Controlled catalog only: synthetic identities, no financial setup or credentials. Existing data is never reset. */
export async function seedDemo(db: Database, now: string) {
  const start = new Date(now), deliveryAt = new Date(start.getTime()+86400000), validUntil = new Date(start.getTime()+2*86400000);
  await db.write(async tx => {
    for (const [id,phoneNumber] of [['buyer-demo','5500000000'],['buyer-other','5500000001']]) await tx.buyer.upsert({where:{id:id!},update:{},create:{id:id!,phoneNumber:phoneNumber!}});
    for (const id of ['merchant-demo','merchant-other']) await tx.merchant.upsert({where:{id},update:{},create:{id,status:'ACTIVE',canFulfill:true}});
    await tx.merchantPaymentAccount.upsert({where:{id:'account-demo'},update:{},create:{id:'account-demo',merchantId:'merchant-demo',provider:'mock',codiStatus:'ACTIVE',beneficiaryDisplayName:'Comercio demo SIMULADO'}});
    await tx.product.upsert({where:{id:'coffee'},update:{},create:{id:'coffee',merchantId:'merchant-demo',category:'specialty',unit:'kg',stock:10}});
    for (const [id,amountMinor] of [['coffee-850',85000],['coffee-1200',120000]] as const) await tx.offer.upsert({where:{id},update:{},create:{id,version:1,merchantId:'merchant-demo',productId:'coffee',category:'specialty',quantity:2,unit:'kg',amountMinor,currency:'MXN',deliveryAt,validUntil,beneficiaryAccountId:'account-demo'}});
  });
}
