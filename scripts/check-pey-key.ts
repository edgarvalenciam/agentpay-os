import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { checkPrivateConfig } from './private-pey-config.js';
import { checkPeyKey } from './pey-key-check.js';
try{
 const path=resolve('.env.pey.local');await checkPrivateConfig(path);
 const env=parseEnv(await readFile(path,'utf8'));
 const result=await checkPeyKey(env.PEY_API_KEY??'');
 console.log(JSON.stringify({accesoConfirmado:result.accessConfirmed,autenticacionRechazada:result.authenticationRejected,cobrosGenerados:result.chargesGenerated}));
 if(!result.accessConfirmed)process.exitCode=1;
}catch{console.error('No se pudo completar la consulta de solo lectura. No se generaron cobros ni se imprimieron credenciales.');process.exitCode=1;}
