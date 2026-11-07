import Fastify, { type FastifyRequest } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ZodError, z } from 'zod';
import { ApiError, CommerceService, type Actor } from './service.js';
import { CreateIntentSchema, ProposeSchema, CreateOrderSchema, EvaluateSchema, IdempotencyKeySchema } from '@agentpay/contracts';
import type { UnitOfWork } from '@agentpay/database';
export interface Credential { token:string; actor:Actor }
export function buildApp(options:{db:UnitOfWork;credentials:Credential[];clock?:()=>string}){
  if(!options.credentials.length || options.credentials.some(c=>c.token.length<24) || new Set(options.credentials.map(c=>c.token)).size!==options.credentials.length)throw new Error('UNIQUE_LOCAL_TOKENS_MIN_24_REQUIRED');
  const app=Fastify({logger:false,bodyLimit:16384,disableRequestLogging:true});
  const service=new CommerceService(options.db,options.clock??(()=>new Date().toISOString()));
  const actors=new WeakMap<FastifyRequest,Actor>();
  const credentials=options.credentials.map(c=>({digest:createHash('sha256').update(c.token).digest(),actor:c.actor}));
  app.addHook('onRequest',async req=>{
    if(req.routeOptions.url==='/health')return;
    const header=req.headers.authorization;
    if(!header?.startsWith('Bearer ')||header.length>1024)throw new ApiError(401,'UNAUTHENTICATED');
    const digest=createHash('sha256').update(header.slice(7)).digest();
    const found=credentials.find(c=>timingSafeEqual(c.digest,digest));
    if(!found)throw new ApiError(401,'UNAUTHENTICATED');actors.set(req,found.actor);
  });
  app.setErrorHandler((err,_req,reply)=>{
    if(err instanceof ApiError)return reply.code(err.status).send({error:{code:err.code}});
    if(err instanceof ZodError)return reply.code(400).send({error:{code:'INVALID_REQUEST'}});
    if(typeof err==='object'&&err!==null&&'statusCode' in err&&typeof err.statusCode==='number'&&err.statusCode>=400&&err.statusCode<500)return reply.code(err.statusCode).send({error:{code:'INVALID_REQUEST'}});
    return reply.code(500).send({error:{code:'INTERNAL_ERROR'}});
  });
  const actor=(req:FastifyRequest)=>{const a=actors.get(req);if(!a)throw new ApiError(401,'UNAUTHENTICATED');return a;};
  const params=(req:FastifyRequest)=>z.object({id:z.string().min(1)}).parse(req.params).id;
  const key=(req:FastifyRequest)=>IdempotencyKeySchema.parse(req.headers['idempotency-key']);
  app.get('/health',async()=>({status:'ok',phase:'G2',paymentsEnabled:false}));
  app.post('/v1/intents',async(req,reply)=>{const r=await service.createIntent(actor(req),key(req),CreateIntentSchema.parse(req.body));return reply.code(r.status).send(r.body);});
  app.get('/v1/intents/:id',async req=>service.getIntent(actor(req),params(req)));
  app.get('/v1/intents/:id/offers',async req=>service.listOffers(actor(req),params(req)));
  app.post('/v1/intents/:id/proposals',async(req,reply)=>{const r=await service.propose(actor(req),params(req),key(req),ProposeSchema.parse(req.body));return reply.code(r.status).send(r.body);});
  app.post('/v1/offers/:id/evaluate',async req=>service.evaluate(actor(req),EvaluateSchema.parse(req.body).intentId,params(req)));
  app.post('/v1/orders',async(req,reply)=>{const r=await service.createOrder(actor(req),key(req),CreateOrderSchema.parse(req.body));return reply.code(r.status).send(r.body);});
  app.get('/v1/orders/:id',async req=>service.getOrder(actor(req),params(req)));
  app.get('/v1/orders/:id/events',async req=>service.getEvents(actor(req),params(req)));
  app.get('/v1/merchants/:id/orders',async req=>service.merchantOrders(actor(req),params(req)));
  return app;
}
