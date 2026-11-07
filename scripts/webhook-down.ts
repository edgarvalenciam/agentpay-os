import { readFile,unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root=process.cwd(),statePath=resolve('work/webhook-runtime/state.json');
try{
 const state=JSON.parse(await readFile(statePath,'utf8')) as {receiverPid:number;tunnelPid:number;origin:string;root:string};
 if(state.root!==root)throw new Error('WRONG_PROJECT');
 for(const [pid,kind] of [[state.tunnelPid,'tunnel'],[state.receiverPid,'receiver']] as const){
   let command='';try{command=execFileSync('/bin/ps',['-p',String(pid),'-o','args='],{encoding:'utf8'});}catch(error){if(error&&typeof error==='object'&&'status' in error&&error.status===1)continue;throw new Error('PROCESS_INSPECTION_DENIED');}
   const matches=kind==='receiver'?command.includes(resolve('apps/api/src/pey-webhook-server.ts')):command.includes('cloudflared')&&command.includes(state.origin);
   if(!matches)throw new Error('PROCESS_IDENTITY_CHANGED');
   try{process.kill(-pid,'SIGTERM');}catch(error){if(!(error&&typeof error==='object'&&'code' in error&&error.code==='ESRCH'))throw new Error('PROCESS_STOP_DENIED');}
 }
 await unlink(statePath);console.log('Receptor y URL temporal detenidos.');
}catch{console.error('No se pudo verificar y detener el estado local. No se cerraron procesos de identidad desconocida.');process.exitCode=1;}
