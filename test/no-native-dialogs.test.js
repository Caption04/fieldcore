const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const nativeDialogPattern = /window\.(?:alert|confirm|prompt)\s*\(|(?<![\w$.])(?:alert|confirm|prompt)\s*\(/g;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

test('frontend does not use browser-native alert, confirm, or prompt dialogs', () => {
  const files = [
    ...walk(path.join(root, 'assets')).filter((file) => file.endsWith('.js')),
    ...fs.readdirSync(root).filter((name) => name.endsWith('.html')).map((name) => path.join(root, name))
  ];

  const violations = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(nativeDialogPattern)) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push(`${path.relative(root, file)}:${line}: ${match[0].trim()}`);
    }
  }

  assert.deepEqual(violations, [], `Use FieldCoreUI notifications and modals instead:\n${violations.join('\n')}`);
});
