const { spawnSync } = require('node:child_process');

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['prisma', 'generate'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    CHECKPOINT_DISABLE: process.env.CHECKPOINT_DISABLE || '1',
    PRISMA_HIDE_UPDATE_MESSAGE: process.env.PRISMA_HIDE_UPDATE_MESSAGE || '1'
  },
  shell: process.platform === 'win32',
  stdio: ['ignore', 'inherit', 'inherit']
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (typeof result.status === 'number') process.exit(result.status);
if (result.signal) console.error(`Prisma generate stopped by ${result.signal}`);
process.exit(1);
