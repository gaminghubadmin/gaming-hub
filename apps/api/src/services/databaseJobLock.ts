import { PrismaClient } from '@gaming-hub/db';
import { AppError } from '@gaming-hub/shared';

function resolveDirectLockUrl(): URL {
  const explicit = process.env.DATABASE_LOCK_URL;
  if (explicit) {
    const url = new URL(explicit);
    if (url.searchParams.get('pgbouncer') === 'true') {
      throw new Error('Database job locking requires a direct/session connection in DATABASE_LOCK_URL');
    }
    return url;
  }

  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('Database job locking requires an explicit database URL');

  const url = new URL(base);
  // Auto-resolve Neon transaction pooler to direct compute endpoint
  if (url.hostname.includes('-pooler.')) {
    url.hostname = url.hostname.replace('-pooler.', '.');
  }
  // Auto-resolve Supabase pooler port
  if (url.port === '6543') {
    url.port = '5432';
  }
  url.searchParams.delete('pgbouncer');
  return url;
}

/** A dedicated one-connection pool owns the session lock for its entire job.
 * DATABASE_LOCK_URL must be a direct/session PostgreSQL URL if the normal URL
 * uses a transaction pooler. Never acquire/release these on the shared pool.
 */
export async function withDatabaseJobLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const url = resolveDirectLockUrl();
  url.searchParams.set('connection_limit', '1');
  const client = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  let acquired = false;
  try {
    const [row] = await client.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_lock(hashtext(${key})) AS acquired
    `;
    acquired = row?.acquired === true;
    if (!acquired) throw new AppError('INVALID_ACTION', 'This job is already running on another instance', 409);
    return await work();
  } finally {
    // Closing the dedicated pool also releases locks if work/unlock fails.
    try {
      if (acquired) {
        const [row] = await client.$queryRaw<Array<{ released: boolean }>>`
          SELECT pg_advisory_unlock(hashtext(${key})) AS released
        `;
        if (!row?.released) {
          console.warn(`[databaseJobLock] pg_advisory_unlock returned false for "${key}". Connection will be closed.`);
        }
      }
    } catch (unlockErr) {
      console.warn(`[databaseJobLock] Failed to cleanly unlock "${key}":`, unlockErr);
    } finally {
      await client.$disconnect();
    }
  }
}
