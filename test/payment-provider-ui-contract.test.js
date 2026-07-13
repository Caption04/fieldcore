const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const apiUi = fs.readFileSync(path.join(root, 'assets', 'api.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'src', 'routes', 'api.js'), 'utf8');

function providerUiBlock() {
  const start = apiUi.indexOf('const paymentProviderDefinitions');
  const end = apiUi.indexOf('const SAAS_PRICE_BOOK', start);
  return apiUi.slice(start, end);
}

test('customer-facing payment setup only shows the provider for the current market', () => {
  const block = providerUiBlock();
  assert.match(block, /definition\.market === market/);
  assert.match(block, /provider: 'PAYNOW'[\s\S]*market: 'ZW'/);
  assert.match(block, /provider: 'OZOW'[\s\S]*market: 'SA'/);
});

test('customer-facing payment setup hides QA and developer configuration', () => {
  const block = providerUiBlock();
  for (const forbidden of ['Mock Provider', 'Webhook secret', 'webhook URL', 'Result/webhook URL', 'Notify/webhook URL', 'Endpoint', 'Mode: test/live', "provider: 'MOCK'", "provider: 'MANUAL_BANK'"]) {
    assert.equal(block.includes(forbidden), false, `${forbidden} must not be shown in the normal payment setup UI`);
  }
});

test('payment setup uses simple regional connection wording', () => {
  const block = providerUiBlock();
  assert.match(block, /Online payments/);
  assert.match(block, /FieldCore handles the technical setup in the background/);
  assert.match(block, /Save connection/);
  assert.match(block, /Check connection/);
});

test('backend filters and rejects payment providers that do not match the company market', () => {
  assert.match(routes, /allowedPaymentProvidersForCompany/);
  assert.match(routes, /assertPaymentProviderAvailableForCompany/);
  assert.match(routes, /provider: \{ in: allowedProviders \}/);
});
