import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { checkPrivateConfig,hiddenInput,savePrivateSettings } from './private-pey-config.js';
try{
 const path=resolve('.env.pey.local');await checkPrivateConfig(path);
 const apiKeyId=await hiddenInput('ID de la API key en pey (no la API key; entrada oculta): ');
 const bankAccountId=await hiddenInput('bankAccountId receptor de pey (no CLABE; entrada oculta): ');
 const beneficiaryName=await hiddenInput('Nombre legal exacto del beneficiario en pey (entrada oculta): ');
 const current=parseEnv(await readFile(path,'utf8'));
 if(!/^[-_a-zA-Z0-9]{1,255}$/.test(apiKeyId)||!/^[-_a-zA-Z0-9]{1,255}$/.test(bankAccountId)||/^\d{18}$/.test(bankAccountId)||apiKeyId===current.PEY_API_KEY||apiKeyId.startsWith('whsec_')||!beneficiaryName||beneficiaryName.length>255)throw new Error();
 await savePrivateSettings(path,{PEY_API_KEY_ID:apiKeyId,PEY_BANK_ACCOUNT_ID:bankAccountId,PEY_BENEFICIARY_NAME:beneficiaryName});
 console.log('Datos receptores guardados localmente. No se verificaron contra pey, no se activaron pagos ni se genero ningun cobro.');
}catch{console.error('No se guardaron datos. Usa IDs de pey compatibles con su API, no la key ni CLABE, y el nombre legal del beneficiario.');process.exitCode=1;}
