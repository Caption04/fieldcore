const { spawnSync } = require('child_process');

const nodeEnv = process.env.NODE_ENV || 'development';
const confirmed = process.argv.includes('--yes') || process.env.ALLOW_DEMO_RESET === 'true';

if (nodeEnv === 'production') {
  console.error('demo:reset refused: NODE_ENV=production.');
  process.exit(1);
}

if (!confirmed) {
  console.error('demo:reset refused: pass --yes or set ALLOW_DEMO_RESET=true.');
  process.exit(1);
}

console.log('Resetting local/demo data with prisma db seed...');
const result = spawnSync('npx', ['prisma', 'db', 'seed'], { stdio: 'inherit', shell: false });
process.exit(result.status || 0);
