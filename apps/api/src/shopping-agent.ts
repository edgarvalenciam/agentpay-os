import { randomUUID } from 'node:crypto';
import { fingerprint,groundShoppingIntent,type CatalogProduct,type MissingField } from '@agentpay/core';
import { IntentModelError,type IntentInterpreter } from '@agentpay/integrations';
import type { UnitOfWork } from '@agentpay/database';
import { ApiError,CommerceService,type Actor,type Result } from './service.js';
export interface ShoppingAgentOptions {interpreter:IntentInterpreter;productAliases?:Record<string,string[]>}
const questions:Record<MissingField,string>={product:'¿Qué producto del catálogo quieres comprar?',quantity:'¿Qué cantidad entera necesitas?',unit:'¿En qué unidad necesitas esa cantidad?',budget:'¿Cuál es tu presupuesto máximo en MXN?',delivery:'¿Qué día necesitas la entrega? Indica hoy, mañana o una fecha YYYY-MM-DD; los horarios específicos requieren aclaración.',currency:'¿Puedes indicar el presupuesto en pesos mexicanos (MXN)?',constraints:'Hay condiciones que esta versión no puede verificar. Reformula indicando solo producto del catálogo, cantidad entera, presupuesto máximo y día de entrega, o solicita revisión de esas condiciones.'};
/** These are the only commerce capabilities reachable from the shopping orchestrator. */
export interface ShoppingTools {
 listCatalog():Promise<CatalogProduct[]>;
 listOffers(intentId:string):ReturnType<CommerceService['listOffers']>;
 getOffer(intentId:string,offerId:string):ReturnType<CommerceService['evaluate']>;
 proposeOrder(intentId:string,offerId:string,key:string):Promise<Result>;
}
export class ShoppingAgentService {
 constructor(private db:UnitOfWork,private clock:()=>string,private config:ShoppingAgentOptions){}
 async recoverInterrupted(){await this.db.write(tx=>tx.agentRun.updateMany({where:{status:'PROCESSING'},data:{status:'FAILED',statusCode:409,response:JSON.stringify({error:{code:'AGENT_RUN_INTERRUPTED_REVIEW_REQUIRED'}}),completedAt:new Date(this.clock())}}));}
 private tools(actor:Actor):ShoppingTools{
  const commerce=new CommerceService(this.db,this.clock);
  return Object.freeze({
   listCatalog:()=>this.db.read(async tx=>(await tx.product.findMany({select:{id:true,category:true,unit:true},orderBy:{id:'asc'},take:100})).map(p=>({...p,aliases:[p.id,...(this.config.productAliases?.[p.id]??[])]}))),
   listOffers:(intentId:string)=>commerce.listOffers(actor,intentId),
   getOffer:(intentId:string,offerId:string)=>commerce.evaluate(actor,intentId,offerId),
   proposeOrder:(intentId:string,offerId:string,key:string)=>commerce.propose(actor,intentId,key,{offerId,method:'CODI_PUSH'}),
  });
 }
 async propose(actor:Actor,key:string,input:{text:string;timezone:string}):Promise<Result>{
  if(actor.role!=='BUYER')throw new ApiError(403,'BUYER_REQUIRED');
  const run=await this.db.write(async tx=>{
   if(!await tx.buyer.findUnique({where:{id:actor.id}}))throw new ApiError(404,'NOT_FOUND');
   const hash=fingerprint(input),old=await tx.agentRun.findUnique({where:{buyerId_key:{buyerId:actor.id,key}}});
   if(old){if(old.requestHash!==hash)throw new ApiError(409,'IDEMPOTENCY_CONFLICT');if(old.status==='PROCESSING')throw new ApiError(409,'AGENT_RUN_IN_PROGRESS');return {id:old.id,now:old.createdAt.toISOString(),replay:{status:old.statusCode!,body:JSON.parse(old.response!)}};}
   const id=randomUUID(),now=this.clock();await tx.agentRun.create({data:{id,buyerId:actor.id,key,requestHash:hash,status:'PROCESSING',createdAt:new Date(now)}});return {id,now,replay:null};
  });
  if(run.replay)return run.replay;
  let result:Result;
  try{
   const tools=this.tools(actor),catalog=await tools.listCatalog();
   const fragments=await this.config.interpreter.extract(input.text);
   const grounded=groundShoppingIntent(input.text,fragments,catalog,run.now,input.timezone);
   const base={agentProvider:this.config.interpreter.provider,paymentsInitiated:false,requiresBuyerApproval:false};
   if(grounded.status==='NEEDS_CLARIFICATION')result={status:200,body:{...base,...grounded,questions:grounded.missingFields.map(f=>questions[f])}};
   else{
    // The model cannot choose buyer identity, create consent, approve an order or request payment.
    const commerce=new CommerceService(this.db,()=>run.now);
    const created=await commerce.createIntent(actor,'agent_'+run.id+'_intent',grounded.intent);
    const intentId=(created.body as {id:string}).id;
    const offers=(await tools.listOffers(intentId)).filter(o=>o.productId===grounded.intent.productId&&o.quantity===grounded.intent.quantity&&o.unit===grounded.intent.unit).sort((a,b)=>a.amountMinor-b.amountMinor||a.id.localeCompare(b.id));
    const evaluations:{offerId:string;reasons:string[]}[]=[];let chosen:string|undefined;
    for(const offer of offers){const evaluation=await tools.getOffer(intentId,offer.id);evaluations.push({offerId:offer.id,reasons:evaluation.reasons});if(evaluation.status==='ELIGIBLE'){chosen=offer.id;break;}}
    if(!chosen)result={status:200,body:{...base,status:'NO_ELIGIBLE_OFFER',intentId,evaluations}};
    else{
     const proposal=await tools.proposeOrder(intentId,chosen,'agent_'+run.id+'_proposal');
     result={status:200,body:proposal.status===201?{...base,status:'PROPOSED',intentId,...proposal.body as object,proposalId:(proposal.body as {id:string}).id,requiresBuyerApproval:true}:{...base,status:'NO_ELIGIBLE_OFFER',intentId,evaluations:[...evaluations,{offerId:chosen,reasons:['OFFER_CHANGED_DURING_PROPOSAL']}]}};
    }
   }
  }catch(error){
   const code=error instanceof IntentModelError?error.code:error instanceof ApiError?error.code:error instanceof Error&&['AGENT_INVALID_OUTPUT','AGENT_UNGROUNDED_OUTPUT'].includes(error.message)?error.message:'AGENT_UNAVAILABLE';
   result={status:error instanceof IntentModelError&&error.code==='AGENT_MODEL_REFUSED'?422:503,body:{error:{code}}};
  }
  await this.db.write(tx=>tx.agentRun.update({where:{id:run.id},data:{status:result.status<400?'COMPLETED':'FAILED',statusCode:result.status,response:JSON.stringify(result.body),completedAt:new Date(this.clock())}}));
  return result;
 }
}
