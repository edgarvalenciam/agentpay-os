import { lstat,readFile,writeFile,rename,unlink } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
export async function checkPrivateConfig(path:string){
  const stat=await lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw new Error('PRIVATE_CONFIGURATION_REQUIRED');
}
export async function savePrivateSetting(path:string,key:'PEY_API_KEY'|'PEY_WEBHOOK_SECRET',value:string){
  await checkPrivateConfig(path);
  // Read only when saving, preserving any other configuration updated while the prompt was open.
  const values=parseEnv(await readFile(path,'utf8'));values[key]=value;
  const temporary=path+'.'+randomUUID()+'.tmp';
  try{await writeFile(temporary,Object.entries(values).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{flag:'wx',mode:0o600});await rename(temporary,path);}
  finally{await unlink(temporary).catch(()=>undefined);}
}
export async function hiddenInput(prompt:string):Promise<string>{
  if(!process.stdin.isTTY)throw new Error('TERMINAL_REQUIRED');
  process.stdout.write(prompt);
  return new Promise((resolveValue,reject)=>{
    let value='';process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
    const finish=(error?:Error)=>{process.stdin.setRawMode(false);process.stdin.pause();process.stdin.off('data',onData);process.stdout.write('\n');if(error)reject(error);else resolveValue(value.trim());};
    const onData=(chunk:string)=>{
      for(const char of chunk){if(char==='\u0003'){finish(new Error('CANCELLED'));return;}if(char==='\r'||char==='\n'){finish();return;}if(char==='\u007f'){value=value.slice(0,-1);continue;}if(char>=' ')value+=char;if(value.length>4096){finish(new Error('TOO_LONG'));return;}}
    };process.stdin.on('data',onData);
  });
}
export function checkApiKeyInput(value:string){
  if(!value||value.length>4096||/[\s\x00-\x1f\x7f]/.test(value)||value.startsWith('whsec_'))throw new Error('API_KEY_INPUT_REQUIRED');
  // No network verification, prefix assumption or financial activation.
}
