import { spawn,execFileSync } from 'node:child_process';
import { mkdir,open,readFile,writeFile,unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { loadPeyReceiverConfig } from '../apps/api/src/pey-webhook-config.js';
const root=process.cwd(),runtime=resolve('work/webhook-runtime'),statePath=resolve(runtime,'state.json');
const port=Number(process.env.PEY_WEBHOOK_PORT??3010),origin=`http://127.0.0.1:${port}`;
await loadPeyReceiverConfig(resolve('.env.pey.local'));
const privateEnv=parseEnv(await readFile(resolve('.env.pey.local'),'utf8'));
const executable=process.env.CLOUDFLARED_BIN??privateEnv.CLOUDFLARED_BIN??'cloudflared';
await mkdir(runtime,{recursive:true,mode:0o700});
const alive=(pid:number|undefined)=>{if(!pid)return false;try{process.kill(pid,0);return true;}catch(error){return Boolean(error&&typeof error==='object'&&'code' in error&&error.code==='EPERM');}};
let old:{receiverPid:number;tunnelPid:number;webhookUrl:string}|undefined;
try{old=JSON.parse(await readFile(statePath,'utf8'));}catch(error){if(!(error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT'))throw new Error('INVALID_RUNTIME_STATE');}
if(old){
  const receiverAlive=alive(old.receiverPid),tunnelAlive=alive(old.tunnelPid);
  if(receiverAlive||tunnelAlive){
    let healthy=false;try{healthy=(await fetch(origin+'/health',{signal:AbortSignal.timeout(3000)})).ok;}catch{}
    if(receiverAlive&&tunnelAlive&&healthy&&old.webhookUrl){console.log(old.webhookUrl);process.exit(0);}
    throw new Error('INCOMPLETE_RUNTIME_USE_WEBHOOK_DOWN_FIRST');
  }
  await unlink(statePath);
  try{await unlink(resolve(runtime,'inbox.db.receiver.lock'));}catch(error){if(!(error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT'))throw error;}
}
const dbPath=resolve(runtime,'inbox.db'),databaseUrl='file:'+dbPath;
const file=await open(dbPath,'a',0o600);await file.close();
execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--schema','packages/database/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:databaseUrl},stdio:'pipe'});
const receiverLog=await open(resolve(runtime,'receiver.log'),'w',0o600),tunnelLog=await open(resolve(runtime,'tunnel.log'),'w',0o600);
const receiver=spawn(process.execPath,[resolve('node_modules/tsx/dist/cli.mjs'),resolve('apps/api/src/pey-webhook-server.ts')],{cwd:root,detached:true,stdio:['ignore',receiverLog.fd,receiverLog.fd],env:{...process.env,PEY_INBOX_DATABASE_URL:databaseUrl,PEY_WEBHOOK_PORT:String(port)}});receiver.unref();
let tunnel:ReturnType<typeof spawn>|undefined;
try{
 let ready=false;for(let i=0;i<40;i++){if(!alive(receiver.pid))throw new Error('RECEIVER_FAILED');try{ready=(await fetch(origin+'/health',{signal:AbortSignal.timeout(500)})).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,250));}
 if(!ready)throw new Error('RECEIVER_NOT_READY');
 tunnel=spawn(executable,['--no-autoupdate','tunnel','--url',origin,'--protocol','http2','--metrics','127.0.0.1:0'],{cwd:root,detached:true,stdio:['ignore',tunnelLog.fd,tunnelLog.fd],env:process.env});tunnel.on('error',()=>{});tunnel.unref();
 let publicOrigin='';for(let i=0;i<90;i++){
   if(!alive(tunnel.pid))throw new Error('TUNNEL_FAILED');
   const log=await readFile(resolve(runtime,'tunnel.log'),'utf8');const match=log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match){publicOrigin=match[0];break;}
   await new Promise(r=>setTimeout(r,500));
 }
 if(!publicOrigin)throw new Error('TUNNEL_URL_UNAVAILABLE');
 const state={receiverPid:receiver.pid,tunnelPid:tunnel.pid,publicOrigin,webhookUrl:publicOrigin+'/v1/webhooks/pey',origin,root,startedAt:new Date().toISOString()};
 await writeFile(statePath,JSON.stringify(state,null,2)+'\n',{mode:0o600});
 console.log(state.webhookUrl);
}catch{
 if(alive(tunnel?.pid))process.kill(-tunnel!.pid!,'SIGTERM');if(alive(receiver.pid))process.kill(-receiver.pid!,'SIGTERM');
 console.error('No se pudo crear la URL. Revisa el estado local del receptor y del tunel; no se realizaron cobros.');process.exitCode=1;
}finally{await receiverLog.close();await tunnelLog.close();}
