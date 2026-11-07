import { open, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const url=process.env.DATABASE_URL;
if(!url?.startsWith('file:/'))throw new Error('ABSOLUTE_SQLITE_FILE_URL_REQUIRED');
const path=fileURLToPath(url);await mkdir(dirname(path),{recursive:true});
// Create only when absent; never truncate an existing database. Prisma 6 schema engine requires this in this environment.
const file=await open(path,'a',0o600);await file.close();
execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--schema','packages/database/prisma/schema.prisma'],{env:process.env,stdio:'inherit'});
