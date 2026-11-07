import Fastify, { type FastifyRequest } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ZodError, z } from 'zod';
import { ApiError, CommerceService, type Actor } from './service.js';
import { CreateIntentSchema, ProposeSchema, CreateOrderSchema, EvaluateSchema, IdempotencyKeySchema, RequestPaymentSchema } from '@agentpay/contracts';
import type { UnitOfWork } from '@agentpay/database';
import { PaymentService, type MockPaymentOptions } from './payment-service.js';
import { OutboxDispatcher } from './outbox.js';
export interface Credential { token:string; actor:Actor }
export function buildApp(options:{db:UnitOfWork;credentials:Credential[];clock?:()=>string;mockPayments?:MockPaymentOptions}){
  if(!options.credentials.length || options.credentials.some(c=>c.token.length<24) || new Set(options.credentials.map(c=>c.token)).size!==options.credentials.length)throw new Error('UNIQUE_LOCAL_TOKENS_MIN_24_REQUIRED');
  const mock=options.mockPayments;
  if(mock&&(process.env.NODE_ENV==='production'||process.env.ALLOW_REAL_PAYMENTS==='true'||(process.env.PAYMENT_PROVIDER&&process.env.PAYMENT_PROVIDER!=='mock')||mock.gateway.environment!=='mock'||mock.gateway.provider!=='mock'||mock.gateway.method!=='CODI_PUSH'))throw new Error('MOCK_ONLY');
  if(mock&&(mock.webhookSecret.length<32||!mock.apiKeyId.startsWith('mock-')||(mock.controlToken&&(mock.controlToken.length<24||options.credentials.some(c=>c.token===mock.controlToken)))||options.credentials.some(c=>c.token===mock.webhookSecret)||mock.controlToken===mock.webhookSecret))throw new Error('INVALID_MOCK_CONFIGURATION');
  const app=Fastify({logger:false,bodyLimit:16384,disableRequestLogging:true});
  const service=new CommerceService(options.db,options.clock??(()=>new Date().toISOString()));
  const actors=new WeakMap<FastifyRequest,Actor>();
  const credentials=options.credentials.map(c=>({digest:createHash('sha256').update(c.token).digest(),actor:c.actor}));
  app.addHook('onRequest',async req=>{
    if(req.routeOptions.url==='/health')return;
    if(mock&&req.routeOptions.url==='/v1/test-only/mock-webhook')return;
    if(mock?.controlToken&&req.routeOptions.url?.startsWith('/v1/test-only/')){
      const token=req.headers['x-mock-control-token'];
      if(typeof token!=='string'||!timingSafeEqual(createHash('sha256').update(token).digest(),createHash('sha256').update(mock.controlToken).digest()))throw new ApiError(401,'MOCK_CONTROL_REQUIRED');
      return;
    }

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
  app.get('/health',async()=>({status:'ok',phase:'G3',paymentsEnabled:false,realPaymentsEnabled:false,mockPaymentsEnabled:Boolean(mock)}));
  app.post('/v1/intents',async(req,reply)=>{const r=await service.createIntent(actor(req),key(req),CreateIntentSchema.parse(req.body));return reply.code(r.status).send(r.body);});
  app.get('/v1/intents/:id',async req=>service.getIntent(actor(req),params(req)));
  app.get('/v1/intents/:id/offers',async req=>service.listOffers(actor(req),params(req)));
  app.post('/v1/intents/:id/proposals',async(req,reply)=>{const r=await service.propose(actor(req),params(req),key(req),ProposeSchema.parse(req.body));return reply.code(r.status).send(r.body);});
  app.post('/v1/offers/:id/evaluate',async req=>service.evaluate(actor(req),EvaluateSchema.parse(req.body).intentId,params(req)));
  app.post('/v1/orders',async(req,reply)=>{const r=await service.createOrder(actor(req),key(req),CreateOrderSchema.parse(req.body));return reply.code(r.status).send(r.body);});
  app.get('/v1/orders/:id',async req=>service.getOrder(actor(req),params(req)));
  app.get('/v1/orders/:id/events',async req=>service.getEvents(actor(req),params(req)));
  app.get('/v1/merchants/:id/orders',async req=>service.merchantOrders(actor(req),params(req)));
  if(mock){
    const clock=options.clock??(()=>new Date().toISOString());
    const payments=new PaymentService(options.db,clock,mock),outbox=new OutboxDispatcher(options.db,clock);
    app.addHook('onReady',async()=>{await payments.recoverUncertain();});
    app.addContentTypeParser('application/mock-event+json',{parseAs:'buffer'},(_req,body,done)=>{done(null,body);});
    app.post('/v1/orders/:id/payment-requests',async(req,reply)=>{const r=await payments.request(actor(req),params(req),key(req),RequestPaymentSchema.parse(req.body));return reply.code(r.status).send(r.body);});
    app.get('/v1/orders/:id/payments',async req=>payments.list(actor(req),params(req)));
    app.post('/v1/orders/:id/reconcile',async req=>{z.object({}).strict().parse(req.body);return payments.poll(actor(req),params(req));});
    app.post('/v1/test-only/mock-webhook',async req=>{if(!Buffer.isBuffer(req.body))throw new ApiError(415,'RAW_MOCK_EVENT_REQUIRED');return payments.receive(req.body,req.headers);});
    app.get('/v1/merchants/:id/notifications',async req=>{
      const a=actor(req),id=params(req);if(a.role!=='MERCHANT'||a.id!==id)throw new ApiError(403,'MERCHANT_REQUIRED');
      return options.db.read(async tx=>(await tx.merchantNotification.findMany({where:{merchantId:id},orderBy:[{createdAt:'asc'},{id:'asc'}],take:100})).map(e=>({id:e.id,orderId:e.orderId,type:e.type,environment:'mock',label:'SIMULADO',payload:JSON.parse(e.payload)})));
    });
    if(mock.controlToken){
      app.post('/v1/test-only/mock-payments/:id/confirm',async req=>{z.object({}).strict().parse(req.body);return payments.simulate(params(req),true);});
      app.post('/v1/test-only/mock-payments/:id/reject',async req=>{z.object({}).strict().parse(req.body);return payments.simulate(params(req),false);});
      app.post('/v1/test-only/outbox/dispatch',async req=>{z.object({}).strict().parse(req.body);return outbox.drain();});
    }
    if(mock.dispatchIntervalMs!==undefined){
      if(mock.dispatchIntervalMs<100)throw new Error('INVALID_DISPATCH_INTERVAL');
      let timer:ReturnType<typeof setInterval>|undefined,running:Promise<unknown>|undefined;
      app.addHook('onReady',async()=>{timer=setInterval(()=>{if(!running)running=outbox.drain().catch(()=>undefined).finally(()=>{running=undefined;});},mock.dispatchIntervalMs);timer.unref();});
      app.addHook('onClose',async()=>{if(timer)clearInterval(timer);await running;});
    }
  }
  return app;
}
