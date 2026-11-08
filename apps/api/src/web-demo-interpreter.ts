import type { IntentInterpreter } from '@agentpay/integrations';
/** Visible fixture profile for offline UI work. It is not an OpenAI model. Grounding/policies remain authoritative. */
export const webDemoInterpreter:IntentInterpreter={provider:'fixture',async extract(text){
 const q=/(?<![\d.,-])\b(\d+(?:[.,]\d+)?)\s*(kg|kilogramos?|kilos?|g|gramos?|piezas?|unidades?)\b/iu.exec(text);
 const budget=/(?:m[aá]ximo|hasta|presupuesto(?:\s+de)?|l[ií]mite(?:\s+de)?)\s*(\$?\s*\d[\d,.]*(?:\s*(?:MXN|pesos))?)/iu.exec(text);
 return {productText:/(?<![\p{L}\p{N}])(?:caf[eé]|coffee)(?![\p{L}\p{N}])/iu.exec(text)?.[0]??null,quantityText:q?.[1]??null,unitText:q?.[2]??null,budgetText:budget?.[1]?.trim()??null,deliveryText:/\b(?:pasado\s+ma[nñ]ana|ma[nñ]ana|hoy|\d{4}-\d{2}-\d{2})\b/iu.exec(text)?.[0]??null};
}};
