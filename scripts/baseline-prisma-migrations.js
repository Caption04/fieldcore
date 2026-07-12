#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

const root = path.resolve(__dirname, '..');
const migrationsDir = path.join(root, 'prisma', 'migrations');
const confirmed = process.argv.includes('--yes') || process.env.FIELDCORE_BASELINE_CONFIRM === 'YES';

function fail(message) {
  console.error(`\nBaseline aborted: ${message}`);
  process.exit(1);
}

function runPrisma(args, options = {}) {
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', ...args], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit'
  });
  return result;
}

async function main() {
  if (!process.env.DATABASE_URL) fail('DATABASE_URL is not set. Load exactly one regional env file first.');
  if (!confirmed) {
    fail('This command records existing migrations as already applied. Re-run with --yes only after backing up the database.');
  }

  const migrationNames = fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(migrationsDir, entry.name, 'migration.sql')))
    .map((entry) => entry.name)
    .sort();
  if (!migrationNames.length) fail('No Prisma migrations were found.');

  console.log('Checking that the live database schema matches prisma/schema.prisma...');
  const diff = runPrisma(['migrate', 'diff', '--from-url', process.env.DATABASE_URL, '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code'], { capture: true });
  if (diff.status !== 0) {
    process.stdout.write(diff.stdout || '');
    process.stderr.write(diff.stderr || '');
    fail('The database schema does not exactly match the current Prisma schema. Do not baseline a drifting database.');
  }

  const prisma = new PrismaClient();
  let recorded = new Set();
  try {
    const tableExists = await prisma.$queryRawUnsafe(`SELECT to_regclass('public._prisma_migrations')::text AS name`);
    if (tableExists && tableExists[0] && tableExists[0].name) {
      const rows = await prisma.$queryRawUnsafe('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
      recorded = new Set(rows.map((row) => row.migration_name));
    }
  } finally {
    await prisma.$disconnect();
  }

  const missing = migrationNames.filter((name) => !recorded.has(name));
  if (!missing.length) {
    console.log('Migration history is already complete. Nothing to baseline.');
    return;
  }

  console.log(`Recording ${missing.length} existing migration(s) as applied. No migration SQL will be executed.`);
  for (const name of missing) {
    console.log(`- ${name}`);
    const result = runPrisma(['migrate', 'resolve', '--applied', name]);
    if (result.status !== 0) fail(`Could not record ${name} as applied.`);
  }

  console.log('\nBaseline complete. Verifying migration status...');
  const status = runPrisma(['migrate', 'status']);
  if (status.status !== 0) fail('Prisma still reports an unhealthy migration state.');
}

main().catch((error) => fail(error && error.message ? error.message : String(error)));
