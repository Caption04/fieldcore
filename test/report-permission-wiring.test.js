const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const reportPermissions = [
  'reports.money.view',
  'reports.work.view',
  'reports.workers.view',
  'reports.sales.view',
  'reports.stock.view'
];

test('report access choices are exposed as separate permissions', () => {
  const access = read('src/services/accessControl.service.js');
  const members = read('assets/members.js');

  for (const permission of reportPermissions) {
    assert.match(access, new RegExp(permission.replaceAll('.', '\\.')));
    assert.match(members, new RegExp(permission.replaceAll('.', '\\.')));
  }
  assert.match(access, /key:\s*'Reports'[\s\S]+label:\s*'Reports'/);
  assert.doesNotMatch(members, /'finance\.reports\.view':\s*'View money reports'/);
});

test('report routes enforce the matching report permission', () => {
  const api = read('src/routes/api.js');

  assert.match(api, /service-profitability[^\n]+reports\.money\.view/);
  assert.match(api, /technician-productivity[^\n]+reports\.workers\.view/);
  assert.match(api, /sla-performance[^\n]+reports\.work\.view/);
  assert.match(api, /inventory-value[^\n]+reports\.stock\.view/);
  assert.match(api, /reports\.sales\.view/);
  assert.match(api, /finance\\\/export[^\n]+finance\.exports\.manage/);
  assert.match(api, /finance\\\/integrations[^\n]+finance\.integrations\.manage/);
});

test('reports page hides developer output and uses allowed report areas', () => {
  const html = read('reports.html');
  const frontend = read('assets/api.js');
  const layout = read('assets/layout.js');
  const app = read('src/app.js');

  assert.doesNotMatch(html, /TASK5|>JSON</);
  assert.match(frontend, /allowedReports/);
  assert.match(frontend, /reportViewOptions/);
  assert.match(frontend, /stock-value/);
  assert.match(frontend, /canSeeMoney/);
  assert.match(layout, /reports:\s*\['reports\.money\.view'/);
  assert.match(app, /\['reports\.html',\s*\['reports\.money\.view'/);
});
