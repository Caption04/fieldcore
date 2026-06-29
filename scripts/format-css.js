const fs = require('fs');
const path = require('path');
const cssPath = path.join(__dirname, '..', 'assets', 'app.css');
let css = fs.readFileSync(cssPath, 'utf8');
css = css.replace(/,\s*\n\s*/g, ', ');
css = css.replace(/\{\s*/g, '{\n');
css = css.replace(/;\s*/g, ';\n');
css = css.replace(/\s*\}\s*/g, '\n}\n');
const rawLines = css.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const lines = [];
let depth = 0;
for (const line of rawLines) {
  if (line === '}') depth = Math.max(depth - 1, 0);
  lines.push(`${'  '.repeat(depth)}${line}`);
  if (line.endsWith('{')) depth += 1;
}
fs.writeFileSync(cssPath, `${lines.join('\n')}\n`, 'utf8');
