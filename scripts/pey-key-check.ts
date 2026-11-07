/** Read-only credential check. No returned financial data or provider errors escape this boundary. */
export async function checkPeyKey(apiKey:string,transport:typeof fetch=fetch){
 if(!apiKey||/[\s\x00-\x1f\x7f]/.test(apiKey))throw new Error('PRIVATE_KEY_REQUIRED');
 try{
  const response=await transport('https://api.pey.mx/transaction/api-key',{method:'GET',headers:{Authorization:`Bearer ${apiKey}`},redirect:'error',signal:AbortSignal.timeout(10000)});
  // Discard the financial response without logging or storing it.
  await response.body?.cancel();
  return {accessConfirmed:response.status===200,authenticationRejected:response.status===401||response.status===403,chargesGenerated:0 as const};
 }catch{throw new Error('PEY_READ_ONLY_CHECK_UNAVAILABLE');}
}
