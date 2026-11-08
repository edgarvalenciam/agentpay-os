import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { checkPrivateConfig } from './private-pey-config.js';
import { runOneCentProbe } from './pey-one-cent-probe.js';
try{
 const path=resolve('.env.pey.local');await checkPrivateConfig(path);const env=parseEnv(await readFile(path,'utf8'));
 const result=await runOneCentProbe({apiKey:env.PEY_API_KEY??'',phone:env.PEY_BUYER_PHONE??'',consent:process.env.PEY_PROBE_CONSENT??'',statePath:resolve('work/pey-one-cent-probe/state.json')});
 console.log(JSON.stringify({...result,amountMinor:1,currency:'MXN',paidConfirmed:false,automaticRetries:0}));
}catch{console.error('Prueba no enviada por este intento: falta autorizacion/configuracion o ya existe un intento. No borrar el registro ni repetir el POST.');process.exitCode=1;}
