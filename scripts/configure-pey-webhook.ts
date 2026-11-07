import { readFile,writeFile,rename,lstat } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Webhook } from '../packages/integrations/src/index.js';
async function hiddenInput():Promise<string>{
  if(!process.stdin.isTTY)throw new Error('TERMINAL_REQUIRED');
  process.stdout.write('Pega el secreto de webhook del portal pey (entrada oculta): ');
  return new Promise((resolveValue,reject)=>{
    let value='';process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
    const finish=(error?:Error)=>{process.stdin.setRawMode(false);process.stdin.pause();process.stdin.off('data',onData);process.stdout.write('\n');if(error)reject(error);else resolveValue(value.trim());};
    const onData=(chunk:string)=>{
      for(const char of chunk){if(char==='\u0003'){finish(new Error('CANCELLED'));return;}if(char==='\r'||char==='\n'){finish();return;}if(char==='\u007f'){value=value.slice(0,-1);continue;}if(char>=' ')value+=char;if(value.length>4096){finish(new Error('TOO_LONG'));return;}}
    };process.stdin.on('data',onData);
  });
}
try{
  const path=resolve('.env.pey.local'),stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw new Error('PRIVATE_CONFIGURATION_REQUIRED');
  const values=parseEnv(await readFile(path,'utf8')),secret=await hiddenInput();
  new Webhook(secret);values.PEY_WEBHOOK_SECRET=secret;
  const temporary=path+'.'+randomUUID()+'.tmp';await writeFile(temporary,Object.entries(values).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{flag:'wx',mode:0o600});await rename(temporary,path);
  console.log('Secreto guardado en configuracion privada. El receptor lo toma sin reiniciar la URL. No se genero ningun cobro.');
}catch{console.error('No se guardo el secreto. Ejecuta desde una terminal local y verifica el secreto del webhook y los permisos de configuracion.');process.exitCode=1;}
