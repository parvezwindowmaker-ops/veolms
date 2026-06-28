/**
 * DESTRUCTIVE reset — wipes ALL application data for a clean start.
 *
 *   1. Drops every table + enum type in the Postgres `public` schema, then
 *      immediately recreates the schema (sequelize.sync) and reseeds (roles,
 *      menus, demo catalog) — same as a normal app boot, so no restart needed.
 *   2. Deletes every object under the app's R2 prefixes.
 *
 * It reads the SAME config the app uses (config/env.ts), so it always targets
 * whatever Postgres + R2 your env points at.
 *
 * Lives under src/ so it compiles into dist/ and ships in the Docker image
 * (no tsx needed in the container). Run it:
 *
 *   Local dev:   npm run reset -- --yes
 *   In Docker:   docker exec veolms-backend node dist/scripts/reset.js --yes
 *
 * The `--yes` flag (or CONFIRM=1) is required so it can never run by accident.
 */
import { sequelize } from '../db/sequelize';
import connectDB from '../db/connection';
import { env } from '../config/env';
import { isStorageConfigured, deletePrefix } from '../services/storage-service';

// Every top-level key prefix the app writes under (storage-service +
// media-controller KEY_PREFIX + hls-service). Scoped on purpose so a shared
// bucket's unrelated objects are left alone.
const R2_PREFIXES = ['course/', 'hls/', 'videos/', 'thumbnails/', 'files/', 'avatars/'];

async function wipeDatabase(): Promise<void> {
  const target = env.database.url ? '(DATABASE_URL)' : `${env.database.host}/${env.database.name}`;
  console.log(`\n[db]  Dropping all tables + enum types in "${target}" ...`);
  await sequelize.query(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
      FOR r IN (
        SELECT t.typname
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typtype = 'e'
      ) LOOP
        EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
      END LOOP;
    END $$;
  `);
  console.log('[db]  dropped.');
}

/**
 * Recreate the schema and reseed, exactly like a normal app boot: connectDB()
 * wires associations, runs sequelize.sync() (creates the now-missing tables),
 * and seeds baseline data since the DB is empty. So no container restart is
 * needed after a reset — the DB is left ready to use.
 */
async function recreateDatabase(): Promise<void> {
  console.log('\n[db]  Recreating schema + seeding ...');
  await connectDB();
  console.log('[db]  schema recreated and seeded.');
}

async function wipeR2(): Promise<void> {
  if (!isStorageConfigured()) {
    console.log('\n[r2]  R2 not configured (R2_* env unset) — skipping object cleanup.');
    return;
  }
  console.log(`\n[r2]  Deleting objects in bucket "${env.r2.bucket}" under: ${R2_PREFIXES.join(' ')}`);
  for (const prefix of R2_PREFIXES) {
    await deletePrefix(prefix);
    console.log(`[r2]  cleared ${prefix}`);
  }
  console.log('[r2]  done.');
}

async function main(): Promise<void> {
  const confirmed = process.argv.includes('--yes') || process.env.CONFIRM === '1';
  if (!confirmed) {
    console.error(
      'Refusing to run without confirmation.\n' +
        'This permanently DELETES ALL data (Postgres tables + R2 objects)\n' +
        'for the env this process loads. Re-run with:\n\n' +
        '    npm run reset -- --yes\n' +
        '    # or in Docker: docker exec veolms-backend node dist/scripts/reset.js --yes\n'
    );
    process.exit(1);
  }

  try {
    await wipeDatabase();
    await recreateDatabase();
    await wipeR2();
    console.log('\n✓ Clean, schema recreated, and reseeded — no restart needed.\n');
  } catch (err) {
    console.error('\n✗ Reset failed:', (err as Error).message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

// Only run when executed directly (never if some module imports this file).
if (require.main === module) {
  void main();
}
