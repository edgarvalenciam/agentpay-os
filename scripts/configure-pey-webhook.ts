import { resolve } from 'node:path';
import { Webhook } from '../packages/integrations/src/index.js';
import { checkPrivateConfig,hiddenInput,savePrivateSetting } from './private-pey-config.js';
try{
  const path=resolve('.env.pey.local');await checkPrivateConfig(path);
  const secret=await hiddenInput('Pega el secreto de webhook del portal pey (entrada oculta): ');
  new Webhook(secret);await savePrivateSetting(path,'PEY_WEBHOOK_SECRET',secret);
  console.log('Secreto guardado en configuracion privada. El receptor lo toma sin reiniciar la URL. No se genero ningun cobro.');
}catch{console.error('No se guardo el secreto. Ejecuta desde una terminal local y verifica el secreto del webhook y los permisos de configuracion.');process.exitCode=1;}
