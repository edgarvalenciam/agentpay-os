import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
type Role='BUYER'|'MERCHANT'|'OPERATOR';
interface Session {csrf:string;role:Role;expires:number}
/** Loopback-only demo BFF: browser never receives upstream Bearer/operator tokens. Not production authentication. */
export function buildWebApp(options:{api:FastifyInstance;origin:string;buyerToken:string;merchantToken:string;controlToken:string;demoSession?:string}){
 const origin=new URL(options.origin);
 if(origin.protocol!=='http:'||origin.hostname!=='127.0.0.1'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password||process.env.NODE_ENV==='production')throw new Error('LOCAL_DEMO_ORIGIN_REQUIRED');
 const cookieName='agentpay_demo_'+origin.port;
 const app=Fastify({logger:false,disableRequestLogging:true,bodyLimit:16384}),sessions=new Map<string,Session>();
 app.addHook('onReady',async()=>{const response=await options.api.inject({url:'/health'}),health=response.json();if(response.statusCode!==200||health.realPaymentsEnabled!==false||health.mockPaymentsEnabled!==true||health.agentProvider!=='fixture')throw new Error('WEB_FIXTURE_PROFILE_REQUIRED');});
 app.addHook('onRequest',async(req,reply)=>{
  reply.header('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  reply.header('x-content-type-options','nosniff').header('referrer-policy','no-referrer').header('cache-control','no-store').header('x-frame-options','DENY');
  if(req.headers.host!==origin.host||(req.headers.origin&&req.headers.origin!==origin.origin))return reply.code(403).send({error:{code:'SAME_ORIGIN_REQUIRED'}});
 });
 app.setErrorHandler((_err,_req,reply)=>reply.code(400).send({error:{code:'INVALID_REQUEST'}}));
 function session(cookie:string|undefined){const id=cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);const value=id?sessions.get(id):undefined;if(!value||value.expires<Date.now())return null;return value;}
 const assets:Record<string,[string,string]>={'/':['index.html','text/html; charset=utf-8'],'/styles.css':['styles.css','text/css; charset=utf-8'],'/client.js':['client.js','application/javascript; charset=utf-8']};
 for(const [path,[file,type]] of Object.entries(assets))app.get(path,async(_req,reply)=>reply.type(type).send(await readFile(fileURLToPath(new URL('../../web/public/'+file,import.meta.url)))));
 app.get('/health',async()=>({status:'ready',service:'agentpay-web-demo',realPaymentsEnabled:false,agentProvider:'fixture',demoSession:options.demoSession??'persistent'}));
 app.get('/ui-api/session',async(req,reply)=>{
  let value=session(req.headers.cookie);
  if(!value){for(const [id,s] of sessions)if(s.expires<Date.now())sessions.delete(id);if(sessions.size>=200)return reply.code(503).send({error:{code:'DEMO_SESSION_LIMIT'}});
   const id=randomBytes(32).toString('hex');value={csrf:randomBytes(32).toString('hex'),role:'BUYER',expires:Date.now()+7200000};sessions.set(id,value);reply.header('set-cookie',`${cookieName}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200`);
  }
  return {csrf:value.csrf,role:value.role,environment:'mock',agentProvider:'fixture',demoSession:options.demoSession??'persistent'};
 });
 app.addHook('preHandler',async(req,reply)=>{
  if(!req.url.startsWith('/ui-api/')||req.routeOptions.url==='/ui-api/session')return;
  const s=session(req.headers.cookie);if(!s)return reply.code(401).send({error:{code:'DEMO_SESSION_REQUIRED'}});
  if(req.method!=='GET'&&req.headers['x-ui-csrf']!==s.csrf)return reply.code(403).send({error:{code:'CSRF_REQUIRED'}});
 });
 app.post('/ui-api/role',async(req,reply)=>{const role=(req.body as {role?:unknown}|undefined)?.role;if(!['BUYER','MERCHANT','OPERATOR'].includes(String(role)))return reply.code(400).send({error:{code:'INVALID_ROLE'}});const s=session(req.headers.cookie)!;s.role=role as Role;return {role:s.role};});
 const routes:[string,'GET'|'POST',Role,(params:Record<string,string>)=>string][]=[
  ['/ui-api/proposals','POST','BUYER',()=>'/v1/agent/proposals'],
  ['/ui-api/proposals/:id/release','POST','BUYER',p=>`/v1/proposals/${encodeURIComponent(p.id!)}/release`],
  ['/ui-api/orders','POST','BUYER',()=>'/v1/orders'],
  ['/ui-api/orders/:id','GET','BUYER',p=>`/v1/orders/${encodeURIComponent(p.id!)}`],
  ['/ui-api/orders/:id/payment-requests','POST','BUYER',p=>`/v1/orders/${encodeURIComponent(p.id!)}/payment-requests`],
  ['/ui-api/orders/:id/payments','GET','BUYER',p=>`/v1/orders/${encodeURIComponent(p.id!)}/payments`],
  ['/ui-api/orders/:id/reconcile','POST','BUYER',p=>`/v1/orders/${encodeURIComponent(p.id!)}/reconcile`],
  ['/ui-api/orders/:id/events','GET','BUYER',p=>`/v1/orders/${encodeURIComponent(p.id!)}/events`],
  ['/ui-api/merchant/orders','GET','MERCHANT',()=>'/v1/merchants/merchant-demo/orders'],
  ['/ui-api/merchant/notifications','GET','MERCHANT',()=>'/v1/merchants/merchant-demo/notifications'],
  ['/ui-api/merchant/orders/:id/events','GET','MERCHANT',p=>`/v1/orders/${encodeURIComponent(p.id!)}/events`],
  ['/ui-api/merchant/orders/:id/preparation','POST','MERCHANT',p=>`/v1/orders/${encodeURIComponent(p.id!)}/preparation`],
  ['/ui-api/simulation/:id/confirm','POST','OPERATOR',p=>`/v1/test-only/mock-payments/${encodeURIComponent(p.id!)}/confirm`],
 ];
 for(const [url,method,role,path] of routes)app.route({url,method,handler:async(req,reply)=>{
  if(session(req.headers.cookie)!.role!==role)return reply.code(403).send({error:{code:'ROLE_REQUIRED'}});
  const headers:Record<string,string>={...(role==='OPERATOR'?{'x-mock-control-token':options.controlToken}:{authorization:'Bearer '+(role==='BUYER'?options.buyerToken:options.merchantToken)})};
  const idem=req.headers['idempotency-key'];if(typeof idem==='string')headers['idempotency-key']=idem;
  const target=path(req.params as Record<string,string>);
  const r=await options.api.inject({url:target,method,headers,...(method==='POST'?{payload:JSON.stringify(req.body??{})}:{}),...(method==='POST'?{headers:{...headers,'content-type':'application/json'}}:{})});
  return reply.code(r.statusCode).type('application/json').send(r.body);
 }});
 return app;
}
