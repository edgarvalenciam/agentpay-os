import { readFileSync } from 'node:fs';
import { createContext,runInContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { describe,it,expect } from 'vitest';

// Exercise the actual browser client with a minimal DOM and controlled network failures.
// Financial admission/replay is covered separately against the real API + SQLite.
class Element {
 textContent='';value='';checked=false;disabled=false;dataset:Record<string,string>={};
 children:Element[]=[];listeners=new Map<string,()=>unknown>();classes=new Set<string>();
 classList={toggle:(name:string,force?:boolean)=>{const add=force??!this.classes.has(name);if(add)this.classes.add(name);else this.classes.delete(name);}};
 addEventListener(name:string,fn:()=>unknown){this.listeners.set(name,fn);}
 append(...els:Element[]){this.children.push(...els);}
 replaceChildren(...els:Element[]){this.children=els;}
 scrollIntoView(){} focus(){} remove(){} querySelector(){return null;}
 async click(){await this.listeners.get('click')?.();}
}
type Call={path:string;method:string;headers:Record<string,string>;body:unknown};
const order={id:'order-test',snapshotHash:'a'.repeat(64),snapshot:{amountMinor:85000,productId:'coffee',quantity:2,unit:'kg',beneficiaryDisplayName:'Comercio SIMULADO',deliveryAt:'2026-11-08T18:00:00Z'}};
async function client(options:{stored?:object;post?:(call:Call)=>unknown;storageBlocked?:boolean;demoSession?:string}={}){
 const elements=new Map<string,Element>(),calls:Call[]=[],intervals:(()=>Promise<void>)[]=[];
 const el=(id:string)=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)!;};
 el('timezone').value='America/Mexico_City';
 const roles=['BUYER','MERCHANT','OPERATOR'].map(role=>{const e=new Element();e.dataset.role=role;return e;});
 let attempts:object[]=[],saved=JSON.stringify(options.stored??{order,orderId:order.id,paymentKey:'original-payment-key',requestStarted:false});
 const context=createContext({
  Intl,Date,JSON,Boolean,Number,Error,encodeURIComponent,crypto:{randomUUID},
  document:{getElementById:el,createElement:()=>new Element(),querySelector:el,querySelectorAll:(selector:string)=>selector==='[data-role]'?roles:[]},
  sessionStorage:{getItem:()=>saved,setItem:(_key:string,value:string)=>{if(options.storageBlocked)throw new Error('storage blocked');saved=value;}},
  setInterval:(fn:()=>Promise<void>)=>{intervals.push(fn);},
  fetch:async(path:string,init:{method:string;headers:Record<string,string>;body?:string})=>{
   const call={path,method:init.method,headers:init.headers,body:init.body?JSON.parse(init.body):undefined};calls.push(call);
   let body:unknown;
   if(path==='/ui-api/session')body={csrf:'local-csrf',role:'BUYER',environment:'mock',agentProvider:'fixture',demoSession:options.demoSession};
   else if(init.method==='POST')body=options.post?await options.post(call):{};
   else if(path.endsWith('/payments'))body={environment:'mock',orderStatus:attempts.length?'PAYMENT_PENDING':'APPROVED',fulfillmentStatus:'RESERVED',attempts};
   else if(path.endsWith('/events'))body=[];
   else throw new Error('Unexpected request');
   return {ok:true,json:async()=>body};
  },
 });
 runInContext(readFileSync(new URL('../../web/public/client.js',import.meta.url),'utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));
 return {el,calls,intervals,context,setAttempts:(value:object[])=>{attempts=value;},stored:()=>JSON.parse(saved)};
}
describe('browser recovery without duplicate financial operations',()=>{
 it('keeps an uncertain request after network failure and recovers only on a click with its original key',async()=>{
  let submissions=0;const ui=await client({post:call=>{if(call.path.endsWith('/payment-requests')){submissions++;if(submissions===1)throw new Error('connection lost');ui.setAttempts([{id:'attempt-test',status:'PAYMENT_PENDING'}]);}return {};}});
  ui.el('payment-check').checked=true;await ui.el('payment-button').click();
  expect(ui.stored().requestStarted).toBe(true);expect(ui.el('payment-title').textContent).toBe('Solicitud por verificar');
  for(const tick of ui.intervals)await tick();expect(submissions).toBe(1);
  await ui.el('recover-payment').click();
  const posts=ui.calls.filter(c=>c.path.endsWith('/payment-requests'));
  expect(posts).toHaveLength(2);expect(posts[1]!.headers['idempotency-key']).toBe('original-payment-key');expect(posts[1]!.body).toEqual(posts[0]!.body);
  expect(ui.el('payment-title').textContent).toBe('Solicitud registrada');expect(ui.el('recover-payment').classes.has('hidden')).toBe(true);
 });
 it('recovers a committed request by reading its attempt without another POST',async()=>{
  const ui=await client({post:call=>{if(call.path.endsWith('/payment-requests')){ui.setAttempts([{id:'attempt-committed',status:'PAYMENT_PENDING'}]);throw new Error('response lost');}return {};}});
  ui.el('payment-check').checked=true;await ui.el('payment-button').click();await ui.el('recover-payment').click();
  expect(ui.calls.filter(c=>c.path.endsWith('/payment-requests'))).toHaveLength(1);
  expect(ui.el('payment-title').textContent).toBe('Solicitud registrada');
 });
 it('waits for release acknowledgement before clearing a proposal, retrying the same release key',async()=>{
  let releases=0;const proposal={proposalId:'proposal-test',snapshot:order.snapshot};
  const ui=await client({stored:{proposal,runKey:'run-test'},post:call=>{if(call.path.endsWith('/release')&&++releases===1)throw new Error('response lost');return {status:'RELEASED'};}});
  await ui.el('edit-request').click();expect(ui.stored().proposal).toEqual(proposal);
  await ui.el('edit-request').click();expect(ui.stored().proposal).toBeNull();
  const posts=ui.calls.filter(c=>c.path.endsWith('/release'));expect(posts).toHaveLength(2);expect(posts[1]!.headers['idempotency-key']).toBe(posts[0]!.headers['idempotency-key']);
 });
 it('continues safely in memory when browser storage is unavailable',async()=>{
  const ui=await client({storageBlocked:true,post:()=>({})});ui.el('payment-check').checked=true;await ui.el('payment-button').click();
  expect(ui.calls.filter(c=>c.path.endsWith('/payment-requests'))).toHaveLength(1);
  expect(ui.el('global-error').textContent).toContain('Mantén esta pestaña abierta');
  await ui.el('payment-button').click();expect(ui.calls.filter(c=>c.path.endsWith('/payment-requests'))).toHaveLength(1);
 });
 it('never restores cached financial confirmation as paid before backend verification',async()=>{
  const ui=await client({stored:{order,orderId:order.id,requestStarted:true,payment:{environment:'mock',attempts:[{status:'CONFIRMED'}]}}});
  expect(ui.el('paid-result').classes.has('hidden')).toBe(true);
  expect(ui.el('payment-title').textContent).toBe('Solicitud por verificar');
 });
 it('shows the actual rejected alternative and available budget margin from the decision',async()=>{
  const ui=await client({stored:{proposal:{snapshot:{...order.snapshot,currency:'MXN'},decision:{budgetMinor:100000,currency:'MXN',selectedOfferId:'coffee-850',evaluations:[{offerId:'coffee-850',amountMinor:85000,currency:'MXN',status:'ELIGIBLE',reasons:[],checks:[{code:'BUDGET',passed:true}]},{offerId:'coffee-1200',amountMinor:120000,currency:'MXN',status:'REJECTED',reasons:['BUDGET'],checks:[{code:'BUDGET',passed:false}]}]}}}});
  const content=(e:Element):string=>e.textContent+' '+e.children.map(content).join(' ');
  const proof=content(ui.el('decision-proof'));expect(proof).toContain('Margen disponible: $150.00');expect(proof).toContain('$1,200.00');expect(proof).toContain('Supera el presupuesto');expect(proof).not.toContain('descuento');
 });
 it('discards a previous contest purchase when a new isolated rehearsal starts, without financial requests',async()=>{
  const ui=await client({demoSession:'contest-new-session',stored:{demoSession:'contest-old-session',order,orderId:order.id,requestStarted:true,paymentKey:'old-payment-key'}});
  expect(ui.stored().orderId).toBeNull();expect(ui.stored().demoSession).toBe('contest-new-session');
  expect(ui.calls.map(c=>c.path)).toEqual(['/ui-api/session']);expect(ui.el('global-error').textContent).toContain('Ensayo nuevo');
 });
});
