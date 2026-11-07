import { resolve } from 'node:path';
import { checkPrivateConfig,hiddenInput,savePrivateSetting,checkApiKeyInput } from './private-pey-config.js';
try{
  const path=resolve('.env.pey.local');await checkPrivateConfig(path);
  const key=await hiddenInput('Pega solo la API key de pey, sin Bearer (entrada oculta): ');
  checkApiKeyInput(key);await savePrivateSetting(path,'PEY_API_KEY',key);
  console.log('API key guardada en configuracion privada. No se envio a pey, no se valido y no se activaron cobros.');
}catch{
  console.error('No se guardo la API key. Usa una terminal local y pega solo la key, sin espacios ni Bearer; no uses el secreto del webhook. Verifica los permisos privados de configuracion.');process.exitCode=1;
}
