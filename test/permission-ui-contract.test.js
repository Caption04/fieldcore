const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadAccessCatalog() {
  const source = read('src/services/accessControl.service.js');
  const sandbox = {
    require(request) {
      if (request === '../db') return { prisma: {} };
      throw new Error(`Unexpected require: ${request}`);
    },
    module: { exports: {} },
    exports: {},
    Set,
    console
  };
  vm.runInNewContext(source, sandbox, { filename: 'accessControl.service.js' });
  return sandbox.module.exports;
}

test('every visible permission has a real target and unique key', () => {
  const { PERMISSION_CATALOG } = loadAccessCatalog();
  const seen = new Set();
  for (const group of PERMISSION_CATALOG) {
    assert.ok(group.label, `Missing label for ${group.key}`);
    for (const permission of group.permissions) {
      assert.ok(!seen.has(permission.key), `Duplicate permission: ${permission.key}`);
      seen.add(permission.key);
      assert.ok(Array.isArray(permission.targets) && permission.targets.length > 0, `No target for ${permission.key}`);
    }
  }
});

test('Money and Reports contain only their correct choices', () => {
  const { PERMISSION_CATALOG } = loadAccessCatalog();
  const group = (key) => PERMISSION_CATALOG.find((item) => item.key === key).permissions.map((item) => item.key);
  assert.deepEqual([...group('Finance')], [
    'payments.view',
    'payments.manage',
    'payment.refund',
    'settings.finance.manage',
    'finance.exports.manage',
    'finance.integrations.manage'
  ]);
  assert.deepEqual([...group('Reports')], [
    'dashboard.executive.view',
    'reports.money.view',
    'reports.work.view',
    'reports.workers.view',
    'reports.sales.view',
    'reports.stock.view'
  ]);
});

test('every visible permission is referenced by real application wiring', () => {
  const { PERMISSION_CATALOG } = loadAccessCatalog();
  const wiring = [
    'src/routes/api.js',
    'src/app.js',
    'assets/layout.js',
    'assets/api.js',
    'assets/enterprise-pages.js',
    'settings.html',
    'collections.html'
  ].map(read).join('\n');
  for (const permission of PERMISSION_CATALOG.flatMap((group) => group.permissions)) {
    assert.ok(wiring.includes(permission.key), `Visible checkbox is not wired: ${permission.key}`);
  }
});


test('owner always receives every current report permission', async () => {
  const { effectiveAccessForUser } = loadAccessCatalog();
  const access = await effectiveAccessForUser({ id: 'owner-1', companyId: 'company-1', role: 'OWNER', defaultScopeType: 'COMPANY' });
  for (const key of ['reports.money.view', 'reports.work.view', 'reports.workers.view', 'reports.sales.view', 'reports.stock.view']) {
    assert.ok(access.permissions.includes(key), `Owner missing ${key}`);
  }
});

test('Reports remain a standalone owner-visible section', () => {
  const layout = read('assets/layout.js');
  const app = read('src/app.js');
  assert.match(layout, /\['Reports', 'Business results', \['executive-dashboard', 'reports'\]\]/);
  assert.doesNotMatch(layout, /\['Enterprise'[^\n]+\breports\b/);
  assert.match(layout, /role === 'OWNER' \|\| hasPagePermission/);
  assert.match(app, /user\.role !== 'OWNER' && !hasPagePermission/);
});

test('settings and collections hide controls without their exact permission', () => {
  const settings = read('settings.html');
  const collections = read('collections.html');
  assert.match(settings, /data-settings-target="finance"[^>]+settings\.finance\.manage,finance\.exports\.manage/);
  assert.match(settings, /data-finance-settings-form data-required-permission="settings\.finance\.manage"/);
  assert.match(settings, /data-finance-export-card data-required-permission="finance\.exports\.manage"/);
  assert.match(settings, /data-settings-target="notifications" data-required-permission="notifications\.view"/);
  assert.match(collections, /href="invoices\.html" data-required-permission="invoices\.view"/);
  assert.match(collections, /finance\/export\/payments\.csv" data-required-permission="finance\.exports\.manage"/);
});
