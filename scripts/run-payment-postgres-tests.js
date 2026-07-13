const { spawnSync } = require('node:child_process');

function safePaymentTestUrl(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new Error('PAYMENT_TEST_DATABASE_URL must be a valid PostgreSQL URL'); }
  const databaseName = url.pathname.replace(/^\//, '');
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !databaseName.endsWith('_test')) {
    throw new Error('PAYMENT_TEST_DATABASE_URL must use localhost and a database name ending in _test');
  }
  return url.toString();
}

let databaseUrl;
try { databaseUrl = safePaymentTestUrl(process.env.PAYMENT_TEST_DATABASE_URL); } catch (error) {
  console.error(error.message);
  process.exit(1);
}
const env = { ...process.env, DATABASE_URL: databaseUrl, PAYMENT_TEST_DATABASE_URL: databaseUrl, NODE_ENV: 'test' };
for (const [command, args] of [
  ['npx', ['prisma', 'migrate', 'reset', '--force', '--skip-seed']],
  [process.execPath, ['--test', 'test/payment-postgres.integration.test.js']]
]) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

module.exports = { safePaymentTestUrl };
