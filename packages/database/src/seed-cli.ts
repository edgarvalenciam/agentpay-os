import { Database } from './index.js';
import { seedDemo } from './seed.js';
if (process.env.NODE_ENV === 'production') throw new Error('DEMO_SEED_DISABLED_IN_PRODUCTION');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL_REQUIRED');
const db = new Database(url);
try { await seedDemo(db,new Date().toISOString()); console.log('Catálogo local de demostración creado; datos existentes conservados.'); }
finally { await db.close(); }
