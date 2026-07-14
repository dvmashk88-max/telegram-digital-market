import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isDatabaseConfigured, query, dbPool } from '../db.mjs';

if (!isDatabaseConfigured()) {
  console.error('DATABASE_NOT_CONFIGURED: set DATABASE_URL before running migrations.');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'migrations');

try {
  const migrationFiles = (await readdir(migrationsDir))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();

  for (const fileName of migrationFiles) {
    try {
      const sql = await readFile(join(migrationsDir, fileName), 'utf8');
      await query(sql);
      console.log(`Migration completed: ${fileName}`);
    } catch (error) {
      throw new Error(`${fileName}: ${error.message}`);
    }
  }
} catch (error) {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await dbPool?.end();
}
