import pg from 'pg';

import { DATABASE_URL } from '../../config.mjs';

const { Pool } = pg;

export const dbPool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    })
  : null;

export function isDatabaseConfigured() {
  return Boolean(dbPool);
}

export async function query(text, params) {
  if (!dbPool) {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  return dbPool.query(text, params);
}

export async function withTransaction(callback) {
  if (!dbPool) {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
