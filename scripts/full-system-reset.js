const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const requestedRegion = String(args.find((arg) => !arg.startsWith('-')) || process.env.FIELDCORE_SEED_REGIONS || process.env.FIELDCORE_SEED_REGION || 'ALL').toUpperCase();
const region = requestedRegion === 'ZA' ? 'SA' : requestedRegion;
const confirmed = args.includes('--yes') || process.env.ALLOW_FULL_SYSTEM_RESET === 'true';
const nodeEnv = process.env.NODE_ENV || 'development';

function envFileForRegion() {
  const explicit = args.find((arg) => arg.startsWith('--env='));
  if (explicit) return explicit.slice('--env='.length);
  if (process.env.FIELDCORE_ENV_FILE) return process.env.FIELDCORE_ENV_FILE;
  if (region === 'ZW') return '.env.zw';
  if (region === 'SA') return '.env.sa';
  return '.env';
}

function loadEnvFile(fileName) {
  const fullPath = path.resolve(root, fileName);
  if (!fs.existsSync(fullPath)) return null;
  dotenv.config({ path: fullPath, override: true });
  return fullPath;
}

function hasPlaceholderDatabaseCredentials(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.username === 'USER' || url.password === 'PASSWORD' || /postgres(?:ql)?:\/\/USER(?::PASSWORD)?@/i.test(value);
  } catch {
    return /postgres(?:ql)?:\/\/USER(?::PASSWORD)?@/i.test(value);
  }
}

function run(command, commandArgs, env) {
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', env });
  if (result.status !== 0) process.exit(result.status || 1);
}

if (nodeEnv === 'production') {
  console.error('full-system-reset refused: NODE_ENV=production.');
  process.exit(1);
}

if (!confirmed) {
  console.error('full-system-reset refused: pass --yes or set ALLOW_FULL_SYSTEM_RESET=true.');
  console.error('Example: node scripts/full-system-reset.js ALL --yes');
  process.exit(1);
}

const envFile = envFileForRegion();
const loadedPath = loadEnvFile(envFile);

if ((region === 'ZW' || region === 'SA') && !loadedPath) {
  console.error(`${envFile} is missing. Run npm run env:regions first.`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Add it to .env, .env.zw, .env.sa, or pass --env=<file>.');
  process.exit(1);
}

if ((region === 'ZW' || region === 'SA') && hasPlaceholderDatabaseCredentials(process.env.DATABASE_URL)) {
  console.error(`${envFile} still contains placeholder database credentials. Run npm run env:regions first.`);
  process.exit(1);
}

const seedRegions = region === 'ALL' ? 'ZW,SA' : region;
const childEnv = {
  ...process.env,
  NODE_ENV: nodeEnv,
  FIELDCORE_SEED_REGIONS: seedRegions,
  FIELDCORE_SEED_SAMPLE_DATA: process.env.FIELDCORE_SEED_SAMPLE_DATA || 'false'
};

console.log('');
console.log('FULL LOCAL RESET');
console.log('================');
console.log(`Environment file: ${loadedPath || '(none, using current process env)'}`);
console.log(`Seed regions: ${seedRegions}`);
console.log(`Sample data: ${childEnv.FIELDCORE_SEED_SAMPLE_DATA}`);
console.log('This will drop/reset the target database schema and seed only the selected clean regional tenant(s).');
console.log('');

run('npx', ['prisma', 'db', 'push', '--force-reset', '--skip-generate'], childEnv);
run('npx', ['prisma', 'generate'], childEnv);
run('npx', ['prisma', 'db', 'seed'], childEnv);

console.log('');
console.log('Reset complete.');
