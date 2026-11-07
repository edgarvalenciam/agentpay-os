import { open,unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Database } from '@agentpay/database';
import { buildPeyWebhookReceiver } from './pey-webhook-receiver.js';
import { loadPeyReceiverConfig } from './pey-webhook-config.js';
const url=process.env.PEY_INBOX_DATABASE_URL;
if(!url?.startsWith('file:/'))throw new Error('ABSOLUTE_INBOX_DATABASE_REQUIRED');
const port=Number(process.env.PEY_WEBHOOK_PORT??3010);
const db=new Database(url),path=fileURLToPath(url),lock=await open(path+'.receiver.lock','wx',0o600);
const app=buildPeyWebhookReceiver({db,loadConfig:()=>loadPeyReceiverConfig(resolve('.env.pey.local'))});
let closing=false;
async function stop(){if(closing)return;closing=true;await app.close();await db.close();await lock.close();await unlink(path+'.receiver.lock');}
process.once('SIGTERM',()=>{void stop();});process.once('SIGINT',()=>{void stop();});
try{await app.listen({host:'127.0.0.1',port});console.log('Receptor dedicado de webhooks listo; funciones de cobro ausentes.');}
catch{await stop();process.exitCode=1;}
