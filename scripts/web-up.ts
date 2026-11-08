import { spawn } from 'node:child_process';
import { mkdir,open,writeFile,unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
const port=Number(process.env.WEB_PORT??3002),root=process.cwd(),runtime=resolve('work/web-runtime');
if(process.env.NODE_ENV==='production'||!Number.isInteger(port)||port<1024||port>65535)throw new Error('LOCAL_DEMO_REQUIRED');
const origin=`http://127.0.0.1:${port}`;
async function ready(){try{const r=await fetch(origin+'/health',{signal:AbortSignal.timeout(1000)});const data=await r.json() as {service?:string;realPaymentsEnabled?:boolean};return r.ok&&data.service==='agentpay-web-demo'&&data.realPaymentsEnabled===false;}catch{return false;}}
if(await ready()){console.log(origin);process.exit(0);}
await mkdir(runtime,{recursive:true,mode:0o700});const launchPath=resolve(runtime,'launch.lock'),lock=await open(launchPath,'wx',0o600);
try{
 if(await ready()){console.log(origin);process.exitCode=0;}
 else{
  const log=await open(resolve(runtime,'web.log'),'a',0o600);
  const child=spawn(process.execPath,['--import','tsx',resolve('apps/api/src/web-server.ts')],{cwd:root,detached:true,stdio:['ignore',log.fd,log.fd],env:{...process.env,PAYMENT_PROVIDER:'mock',ALLOW_REAL_PAYMENTS:'false',AGENT_PROVIDER:'fixture',WEB_PORT:String(port)}});let failed=false;child.once('error',()=>{failed=true;});child.unref();await log.close();
  let started=false;for(let i=0;i<60&&!failed;i++){if(await ready()){started=true;break;}await new Promise(r=>setTimeout(r,200));}
  if(!started)throw new Error('WEB_START_UNAVAILABLE');
  await writeFile(resolve(runtime,'state.json'),JSON.stringify({pid:child.pid,origin,root,profile:'mock-fixture',startedAt:new Date().toISOString()}),{mode:0o600});console.log(origin);
 }
}finally{await lock.close();await unlink(launchPath);}
