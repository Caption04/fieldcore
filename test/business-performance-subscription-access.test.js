const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadAccessService() {
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

test('business performance is restored as a clear report page', () => {
  const html = read('executive-dashboard.html');
  const frontend = read('assets/enterprise-pages.js');
  const layout = read('assets/layout.js');
  const access = read('src/services/accessControl.service.js');

  assert.match(html, /<h2>Business Performance<\/h2>/);
  assert.match(html, /Branch results/);
  assert.match(html, /From request to payment/);
  assert.match(html, /Worker results/);
  assert.match(html, /Service work/);
  assert.match(html, /Stock and buying/);
  assert.doesNotMatch(html, /TASK\d+|Branch ID|JSON/);

  for (const endpoint of [
    '/analytics/executive',
    '/analytics/branches',
    '/analytics/technicians',
    '/analytics/quote-to-cash',
    '/analytics/contracts-sla',
    '/analytics/inventory-procurement'
  ]) assert.match(frontend, new RegExp(endpoint.replaceAll('/', '\\/')));

  assert.match(layout, /\['executive-dashboard', 'Business Performance'/);
  assert.match(layout, /\['Reports', 'Business results', \['executive-dashboard', 'reports'\]\]/);
  assert.match(access, /dashboard\.executive\.view', label: 'View business performance'/);
});

test('subscription is full-access only and is not a separate checkbox group', async () => {
  const service = loadAccessService();
  const accessSource = read('src/services/accessControl.service.js');
  const layout = read('assets/layout.js');
  const app = read('src/app.js');
  const api = read('src/routes/api.js');

  assert.equal(service.PERMISSION_CATALOG.some((group) => group.key === 'Subscription'), false);
  assert.deepEqual(Array.from(service.FULL_ACCESS_ONLY_PERMISSION_KEYS), ['subscription.view', 'subscription.manage']);

  const ownerAccess = await service.effectiveAccessForUser({
    id: 'owner-1',
    companyId: 'company-1',
    role: 'OWNER',
    defaultScopeType: 'COMPANY'
  });
  assert.equal(service.hasFullBusinessAccess({ role: 'OWNER' }, ownerAccess), true);

  const partial = { permissions: service.delegatablePermissionKeys.filter((key) => key !== 'jobs.edit'), scopeType: 'COMPANY' };
  assert.equal(service.hasFullBusinessAccess({ role: 'ADMIN', fullBusinessAccess: false }, partial), false);
  assert.equal(service.hasFullBusinessAccess({ role: 'ADMIN', fullBusinessAccess: false }, { permissions: service.delegatablePermissionKeys, scopeType: 'COMPANY' }), false);
  assert.equal(service.hasFullBusinessAccess({ role: 'ADMIN', fullBusinessAccess: true }, { permissions: service.delegatablePermissionKeys, scopeType: 'COMPANY' }), true);
  assert.equal(service.hasFullBusinessAccess({ role: 'ADMIN', fullBusinessAccess: true }, { permissions: service.delegatablePermissionKeys, scopeType: 'BRANCH' }), false);

  assert.match(layout, /data-full-access-only/);
  assert.doesNotMatch(layout, /href="subscription\.html" data-required-permission/);
  assert.match(app, /page === 'subscription\.html' && !hasFullBusinessAccess/);
  assert.ok(api.includes("pattern: /^\\/billing\\/(?:catalog|plans|subscription|usage)$/, fullAccessOnly: true"));
  assert.match(api, /if \(rule\.fullAccessOnly\)/);
  assert.match(accessSource, /FULL_ACCESS_ONLY_PERMISSION_KEYS/);
});
