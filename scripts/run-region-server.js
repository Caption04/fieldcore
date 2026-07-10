const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '..');
const rawRegion = String(process.argv[2] || process.env.FIELDCORE_REGION || 'ZW').toUpperCase();
const region = rawRegion === 'ZA' ? 'SA' : rawRegion;
const envFile = process.env.FIELDCORE_ENV_FILE || (region === 'SA' ? '.env.sa' : '.env.zw');

function load(fileName) {
  const fullPath = path.join(root, fileName);
  if (!fs.existsSync(fullPath)) return false;
  dotenv.config({ path: fullPath, override: true });
  console.log(`Loaded ${fileName}`);
  return true;
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

if (!load(envFile)) {
  console.error(`${envFile} is missing. Run npm run env:regions first.`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error(`${envFile} does not define DATABASE_URL. Run npm run env:regions first.`);
  process.exit(1);
}

if (hasPlaceholderDatabaseCredentials(process.env.DATABASE_URL)) {
  console.error(`${envFile} still contains placeholder database credentials. Run npm run env:regions first.`);
  process.exit(1);
}

process.env.FIELDCORE_REGION = region;
process.env.FIELDCORE_SEED_REGIONS = process.env.FIELDCORE_SEED_REGIONS || (region === 'SA' ? 'SA' : 'ZW');
process.env.PORT = process.env.PORT || (region === 'SA' ? '3001' : '3000');
process.env.APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT}`;

console.log(`Starting FieldCore ${region} server on port ${process.env.PORT}`);
require('../server');
