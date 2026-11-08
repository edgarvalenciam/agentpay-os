import { open,writeFile,rename,unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { checkPrivateConfig,hiddenInput } from './private-pey-config.js';
try{
 const apiKey=await hiddenInput('API key de OpenAI (entrada oculta): ');
 const model=await hiddenInput('Nombre del modelo compatible con Structured Outputs (entrada oculta): ');
 if(!apiKey||apiKey.length>4096||/[\s\x00-\x1f\x7f]/.test(apiKey)||!/^[-a-zA-Z0-9_.:]{1,128}$/.test(model))throw new Error('INVALID_CONFIGURATION');
 const path=resolve('.env.openai.local');
 try{const file=await open(path,'wx',0o600);await file.close();}catch(error){if(!(error&&typeof error==='object'&&'code' in error&&error.code==='EEXIST'))throw error;}
 await checkPrivateConfig(path);const temporary=path+'.'+randomUUID()+'.tmp';
 try{await writeFile(temporary,'OPENAI_API_KEY='+JSON.stringify(apiKey)+'\nOPENAI_MODEL='+JSON.stringify(model)+'\n',{flag:'wx',mode:0o600});await rename(temporary,path);}finally{await unlink(temporary).catch(()=>undefined);}
 console.log('Configuracion OpenAI guardada de forma privada. No se activo el agente, no se llamo a OpenAI ni se generaron cobros.');
}catch{console.error('No se guardo la configuracion. Revisa la clave, modelo y permisos del archivo privado.');process.exitCode=1;}
