import Fastify from 'fastify';
import { createHash,randomUUID } from 'node:crypto';
import { verifyPeySignature,sealPeyPayload,InvalidPeySignature } from '@agentpay/integrations';
import type { UnitOfWork } from '@agentpay/database';
import type { PeyReceiverConfig } from './pey-webhook-config.js';
const eventTypes=new Set(['codi.pn.payment_received','codi.qr.payment_received','payment_link.status_updated','bank.account.updated']);
export function buildPeyWebhookReceiver(options:{db:UnitOfWork;loadConfig:()=>Promise<PeyReceiverConfig>;requestsPerMinute?:number}){
  const app=Fastify({logger:false,disableRequestLogging:true,bodyLimit:65536,requestTimeout:10000,connectionTimeout:10000,trustProxy:false});
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json',{parseAs:'buffer'},(_req,body,done)=>done(null,body));
  let windowStart=Date.now(),requests=0;
  app.addHook('onRequest',async(req,reply)=>{
    if(req.method==='POST'&&req.routeOptions.url==='/v1/webhooks/pey'){
      if(Date.now()-windowStart>=60000){windowStart=Date.now();requests=0;}
      if(++requests>(options.requestsPerMinute??120))return reply.code(429).header('retry-after','60').send({error:{code:'RATE_LIMITED'}});
    }
  });
  app.setErrorHandler((_error,_req,reply)=>reply.code(400).send({error:{code:'INVALID_REQUEST'}}));
  app.setNotFoundHandler((_req,reply)=>reply.code(404).send({error:{code:'NOT_FOUND'}}));
  app.get('/health',async()=>{
    let configured=false;try{configured=Boolean((await options.loadConfig()).signingSecret);}catch{}
    return {status:configured?'ready':'waiting_for_webhook_secret',service:'pey-webhook-inbox',realPaymentsEnabled:false};
  });
  app.post('/v1/webhooks/pey',async(req,reply)=>{
    let config:PeyReceiverConfig;
    try{config=await options.loadConfig();}catch{return reply.code(503).send({error:{code:'WEBHOOK_NOT_CONFIGURED'}});}
    if(!config.signingSecret)return reply.code(503).send({error:{code:'WEBHOOK_NOT_CONFIGURED'}});
    if(!Buffer.isBuffer(req.body))return reply.code(415).send({error:{code:'JSON_RAW_BODY_REQUIRED'}});
    const raw=req.body;
    let deliveryId:string;
    try{deliveryId=verifyPeySignature(raw,req.headers,config.signingSecret);}catch(error){return reply.code(error instanceof InvalidPeySignature?401:503).send({error:{code:error instanceof InvalidPeySignature?'INVALID_WEBHOOK_SIGNATURE':'WEBHOOK_NOT_CONFIGURED'}});}
    let eventType:string;
    try{
      const parsed:unknown=JSON.parse(raw.toString('utf8'));
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||!('type' in parsed)||typeof parsed.type!=='string')throw new Error();
      eventType=eventTypes.has(parsed.type)?parsed.type:'UNSUPPORTED_EVENT';
    }catch{return reply.code(400).send({error:{code:'INVALID_WEBHOOK_PAYLOAD'}});}
    const payloadHash=createHash('sha256').update(raw).digest('hex');
    try{
      const outcome=await options.db.write(async tx=>{
        const previous=await tx.peyWebhookInbox.findUnique({where:{deliveryId}});
        if(previous)return previous.payloadHash===payloadHash?'DUPLICATE':'CONFLICT';
        await tx.peyWebhookInbox.create({data:{id:randomUUID(),deliveryId,payloadHash,eventType,...sealPeyPayload(raw,config.encryptionKey)}});
        return 'RECEIVED';
      });
      if(outcome==='CONFLICT')return reply.code(409).send({error:{code:'WEBHOOK_ID_CONFLICT'}});
      return reply.code(200).send({received:true,duplicate:outcome==='DUPLICATE',status:'PENDING_RECONCILIATION'});
    }catch{return reply.code(503).send({error:{code:'WEBHOOK_STORAGE_UNAVAILABLE'}});}
  });
  return app;
}
