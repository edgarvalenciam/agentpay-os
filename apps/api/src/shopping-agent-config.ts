import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { OpenAIIntentInterpreter } from '@agentpay/integrations';
import { checkPrivateConfig } from '../../../scripts/private-pey-config.js';
export async function loadOpenAIInterpreter(path=resolve('.env.openai.local'),env:Record<string,string|undefined>=process.env){
 let key=env.OPENAI_API_KEY,model=env.OPENAI_MODEL;
 if(!key&&!model){await checkPrivateConfig(path);const local=parseEnv(await readFile(path,'utf8'));key=local.OPENAI_API_KEY;model=local.OPENAI_MODEL;}
 return new OpenAIIntentInterpreter({apiKey:key??'',model:model??''});
}
