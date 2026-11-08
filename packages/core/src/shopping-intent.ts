import { z } from 'zod';
import { mxnToMinor } from './reconciliation.js';
export const IntentFragmentsSchema=z.object({productText:z.string().min(1).max(160).nullable(),quantityText:z.string().min(1).max(32).nullable(),unitText:z.string().min(1).max(32).nullable(),budgetText:z.string().min(1).max(80).nullable(),deliveryText:z.string().min(1).max(80).nullable()}).strict();
export type IntentFragments=z.infer<typeof IntentFragmentsSchema>;
export interface CatalogProduct {id:string;category:string;unit:string;aliases:string[]}
export type MissingField='product'|'quantity'|'unit'|'budget'|'delivery'|'currency'|'constraints';
const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function parts(instant:string,timezone:string){const p=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));return Object.fromEntries(p.map(x=>[x.type,x.value]));}
/** End of requested LOCAL calendar day; no host timezone and no implicit 24-hour tomorrow. */
export function resolveDeliveryDay(text:string,now:string,timezone:string):string|null{
 try{
  if(!Number.isFinite(Date.parse(now)))return null;
  const local=parts(now,timezone),value=normalize(text);let day:Date;
  const offset=value==='hoy'?0:value==='manana'?1:value==='pasado manana'?2:null;
  if(offset!==null)day=new Date(Date.UTC(Number(local.year),Number(local.month)-1,Number(local.day)+offset));
  else{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;day=new Date(value+'T00:00:00.000Z');if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==value)return null;}
  const date=day.toISOString().slice(0,10),desired=Date.parse(date+'T23:59:59.999Z');let candidate=desired;
  for(let i=0;i<5;i++){const p=parts(new Date(candidate).toISOString(),timezone),asUtc=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second),999);const delta=desired-asUtc;if(delta===0){const result=new Date(candidate).toISOString();return Date.parse(result)>Date.parse(now)?result:null;}candidate+=delta;}
  return null;
 }catch{return null;}
}
export function groundShoppingIntent(text:string,fragments:unknown,catalog:CatalogProduct[],now:string,timezone:string){
 const parsed=IntentFragmentsSchema.safeParse(fragments);
 if(!parsed.success)throw new Error('AGENT_INVALID_OUTPUT');
 const f=parsed.data;
 if(Object.values(f).some(v=>v!==null&&!text.includes(v)))throw new Error('AGENT_UNGROUNDED_OUTPUT');
 const missing=new Set<MissingField>();
 // These supported forms are parsed independently of the model, including ambiguity detection.
 const quantities=[...text.matchAll(/(?<![\d.,-])\b(\d+(?:[.,]\d+)?)\s*(kg|kilogramos?|kilos?|g|gramos?|piezas?|unidades?)\b/giu)];
 const unitAliases:Record<string,string>={kg:'kg',kilogramo:'kg',kilogramos:'kg',kilo:'kg',kilos:'kg',g:'g',gramo:'g',gramos:'g',pieza:'piece',piezas:'piece',unidad:'piece',unidades:'piece'};
 const q=quantities[0];let quantity:number|undefined,unit:string|undefined;
 if(quantities.length!==1||!q||f.quantityText!==q[1]||!f.unitText||normalize(f.unitText)!==normalize(q[2]!)){missing.add('quantity');missing.add('unit');}
 else{quantity=Number(q[1]);unit=unitAliases[normalize(q[2]!)];if(!Number.isSafeInteger(quantity)||quantity<=0||quantity>100000)missing.add('quantity');if(!unit)missing.add('unit');}
 const normalized=normalize(text);
 const candidates=catalog.filter(p=>p.aliases.some(alias=>{const escaped=normalize(alias).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return escaped.length>0&&new RegExp('(?<![\\p{L}\\p{N}])'+escaped+'(?![\\p{L}\\p{N}])','u').test(normalized);}));
 const product=candidates.length===1?candidates[0]:undefined;
 if(!product||!f.productText||!product.aliases.some(a=>normalize(a)===normalize(f.productText!)))missing.add('product');
 const budgets=[...text.matchAll(/(?:m[aá]ximo|hasta|presupuesto(?:\s+de)?|l[ií]mite(?:\s+de)?)\s*(\$?\s*\d[\d,.]*(?:\s*(?:MXN|pesos))?)/giu)];
 const b=budgets[0];let maxAmountMinor:number|undefined;
 if(budgets.length!==1||!b||!f.budgetText||f.budgetText!==b[1]!.trim())missing.add('budget');
 else{
  const money=f.budgetText.replace(/^\$\s*/,'').replace(/\s*(?:MXN|pesos)$/iu,'').trim();
  if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(money))missing.add('budget');
  else try{maxAmountMinor=mxnToMinor(money.replace(/,/g,''));if(maxAmountMinor<=0||maxAmountMinor>100000000)missing.add('budget');}catch{missing.add('budget');}
 }
 if(/\b(?:USD|EUR|d[oó]lares?|euros?)\b/iu.test(text))missing.add('currency');
 const dates=[...text.matchAll(/\b(?:pasado\s+ma[nñ]ana|ma[nñ]ana|hoy|\d{4}-\d{2}-\d{2})\b/giu)];
 // Time-of-day constraints require clarification instead of silently replacing them with end-of-day.
 const hasTime=/\b(?:\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm)|a\s+las\s+\d{1,2})\b/iu.test(text);
 const deadline=dates.length===1&&f.deliveryText===dates[0]![0]&&!hasTime?resolveDeliveryDay(f.deliveryText,now,timezone):null;
 if(!deadline)missing.add('delivery');
 // Restrict this first version to a verifiable grammar; do not silently drop extra buyer constraints.
 let residue=text;
 for(const evidence of Object.values(f).filter((v):v is string=>v!==null).sort((a,b)=>b.length-a.length))residue=residue.split(evidence).join(' ');
 const allowed=new Set(['compra','comprar','quiero','necesito','busco','de','por','para','el','la','los','las','un','una','en','con','mi','maximo','hasta','presupuesto','limite','entrega','dia','total','favor','a','mxn','pesos']);
 if((normalize(residue).match(/[\p{L}\p{N}]+/gu)??[]).some(token=>!allowed.has(token)))missing.add('constraints');
 if(missing.size)return {status:'NEEDS_CLARIFICATION' as const,missingFields:[...missing]};
 return {status:'GROUNDED' as const,intent:{originalText:text,productId:product!.id,category:product!.category,quantity:quantity!,unit:unit!,maxAmountMinor:maxAmountMinor!,currency:'MXN' as const,deliveryDeadline:deadline!,timezone}};
}
