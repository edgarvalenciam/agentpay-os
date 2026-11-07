import { loadPeyPaymentOptions } from '../apps/api/src/pey-payment-config.js';
try{
 const options=await loadPeyPaymentOptions();
 // This operator command performs exactly one authenticated GET, never a POST.
 const bank=await options.gateway.getBankAccount(options.bankAccountId);
 const active=bank.codiStatus==='ACTIVE',beneficiaryMatches=bank.name===options.beneficiaryDisplayName;
 console.log(JSON.stringify({apiKeyAceptadaParaConsulta:true,cuentaActiva:active,beneficiarioCoincide:beneficiaryMatches,cobrosGenerados:0}));
 if(!active||!beneficiaryMatches)process.exitCode=1;
}catch{console.error('No se pudo verificar la cuenta. Revisa configuracion local, IDs compatibles con la API y disponibilidad de pey. No se genero ningun cobro.');process.exitCode=1;}
