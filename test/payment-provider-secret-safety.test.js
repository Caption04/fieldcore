const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const tokenService = fs.readFileSync(path.join(root, 'src', 'services', 'payments', 'paymentToken.service.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'src', 'routes', 'api.js'), 'utf8');
const apiUi = fs.readFileSync(path.join(root, 'assets', 'api.js'), 'utf8');
const formUx = fs.readFileSync(path.join(root, 'assets', 'form-ux.js'), 'utf8');

test('payment provider secrets are encrypted and API responses expose masks only', () => {
  assert.match(tokenService, /encryptSecret\(String\(value\)\)/);
  assert.match(tokenService, /paymentProviderSecretSummaries/);
  assert.match(tokenService, /maskedValue: maskSecretValue/);
  assert.match(routes, /secretMasks: Object\.fromEntries/);
  assert.match(routes, /paymentProviderConnectionResponse/);
  assert.doesNotMatch(routes, /sendData\(res, normalize\(await readPaymentProviderSecrets/);
});

test('saved provider secrets can never be revealed in the browser', () => {
  assert.match(apiUi, /Saved securely/);
  assert.match(apiUi, /Update connection/);
  assert.match(apiUi, /data-no-password-toggle=\"true\"/);
  assert.match(apiUi, /data-secret-input=\"true\"/);
  assert.match(apiUi, /leave this blank to keep the saved value/i);
  assert.match(formUx, /input\.dataset\.noPasswordToggle === 'true'/);
});

test('secret mask keeps only a short suffix', () => {
  process.env.NODE_ENV = 'test';
  const { maskSecretValue } = require('../src/services/payments/paymentToken.service');
  const masked = maskSecretValue('my-very-private-key-9876');
  assert.equal(masked.endsWith('9876'), true);
  assert.equal(masked.includes('my-very-private-key'), false);
});
