import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isDatabaseConfigured, query, dbPool } from '../db.mjs';

if (!isDatabaseConfigured()) {
  console.error('DATABASE_NOT_CONFIGURED: set DATABASE_URL before running migrations.');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(__dirname, '..', 'migrations', '001_create_orders.sql');

try {
  const sql = await readFile(migrationPath, 'utf8');
  await query(sql);
  console.log('Migration completed: 001_create_orders.sql');
} catch (error) {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await dbPool?.end();
}
