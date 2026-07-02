const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

function tagName(line) {
  const match = line.match(/^<\/?\s*([a-zA-Z0-9-]+)/);
  return match ? match[1].toLowerCase() : '';
}

function isClosing(line) {
  return /^<\//.test(line);
}

function isOpening(line) {
  return /^<[a-zA-Z][^>]*>$/.test(line) && !isClosing(line) && !/\/>$/.test(line);
}

function opensAndClosesSameLine(line) {
  const name = tagName(line);
  return name && line.includes(`</${name}>`);
}

function formatHtml(source) {
  const expanded = source
    .replace(/>\s*</g, '>\n<')
    .replace(/(<body[^>]*>)/g, '$1\n')
    .replace(/(<\/body>)/g, '\n$1')
    .replace(/(<section[^>]*>)/g, '$1\n')
    .replace(/(<\/section>)/g, '\n$1')
    .replace(/(<div[^>]*>)/g, '$1\n')
    .replace(/(<\/div>)/g, '\n$1')
    .replace(/(<article[^>]*>)/g, '$1\n')
    .replace(/(<\/article>)/g, '\n$1')
    .replace(/(<aside[^>]*>)/g, '$1\n')
    .replace(/(<\/aside>)/g, '\n$1')
    .replace(/(<footer[^>]*>)/g, '$1\n')
    .replace(/(<\/footer>)/g, '\n$1')
    .replace(/(<form[^>]*>)/g, '$1\n')
    .replace(/(<\/form>)/g, '\n$1');

  const rawLines = expanded.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lines = [];
  let depth = 0;

  for (const line of rawLines) {
    const name = tagName(line);
    if (isClosing(line)) depth = Math.max(depth - 1, 0);
    lines.push(`${'  '.repeat(depth)}${line}`);
    if (
      isOpening(line) &&
      !voidTags.has(name) &&
      !opensAndClosesSameLine(line) &&
      !line.startsWith('<!DOCTYPE')
    ) {
      depth += 1;
    }
  }

  return `${lines.join('\n')}\n`;
}

function formatCss(source) {
  const expanded = source
    .replace(/\{/g, '{\n')
    .replace(/;/g, ';\n')
    .replace(/\}/g, '\n}\n')
    .replace(/,/g, ',\n');
  const rawLines = expanded.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lines = [];
  let depth = 0;

  for (const line of rawLines) {
    if (line === '}') depth = Math.max(depth - 1, 0);
    lines.push(`${'  '.repeat(depth)}${line}`);
    if (line.endsWith('{')) depth += 1;
  }

  return `${lines.join('\n')}\n`;
}

for (const file of htmlFiles) {
  const filePath = path.join(root, file);
  fs.writeFileSync(filePath, formatHtml(fs.readFileSync(filePath, 'utf8')), 'utf8');
}

const cssPath = path.join(root, 'assets', 'app.css');
fs.writeFileSync(cssPath, formatCss(fs.readFileSync(cssPath, 'utf8')), 'utf8');

