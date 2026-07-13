const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'fieldcore-source-safe.tar');
const temporaryOutput = `${output}.tmp`;
const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'buffer' });
if (listed.status !== 0) throw new Error('Could not list source files');

const unsafe = /(^|\/)(\.env(?:\..*)?|node_modules|uploads|logs|coverage)(\/|$)|\.(?:log|sql|dump|zip|tar|tgz|gz)$/i;
const files = listed.stdout.toString().split('\0').filter(Boolean).filter((file) => file === '.env.example' || !unsafe.test(file));
if (!files.includes('.env.example')) throw new Error('.env.example is missing from the safe source list');

const archive = spawnSync('tar', ['-cf', temporaryOutput, '--', ...files], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], timeout: 120000 });
if (archive.status !== 0 || archive.signal) throw new Error(`Could not create the safe source archive${archive.signal ? ` (${archive.signal})` : ''}`);
const contents = spawnSync('tar', ['-tf', temporaryOutput], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120000 });
if (contents.status !== 0 || contents.signal) throw new Error('Could not verify the safe source archive');
const archivedFiles = contents.stdout.split('\n').filter(Boolean);
if (!archivedFiles.includes('.env.example') || archivedFiles.some((file) => file !== '.env.example' && /(^|\/)\.env(?:\.|$)/.test(file))) {
  throw new Error('Safe archive verification rejected an environment file');
}
require('node:fs').renameSync(temporaryOutput, output);
console.log(`Created ${path.basename(output)} with ${archivedFiles.length} source files. Real environment files were excluded.`);
