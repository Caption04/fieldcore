const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const apiUi = fs.readFileSync(path.join(root, 'assets', 'api.js'), 'utf8');

function providerUiBlock() {
  const start = apiUi.indexOf('const paymentProviderDefinitions');
  const end = apiUi.indexOf('const SAAS_PRICE_BOOK', start);
  return apiUi.slice(start, end);
}

test('connected payment credentials stay masked and disabled until update is chosen', () => {
  const block = providerUiBlock();
  assert.match(block, /data-saved-mask=/);
  assert.match(block, /value="' \+ escapeHtml\(maskedValue\) \+ '" disabled/);
  assert.match(block, /Update connection/);
  assert.match(block, /data-payment-provider-edit/);
  assert.match(block, /field\.disabled = false/);
  assert.match(block, /field\.value = ''/);
  assert.match(block, /Save changes/);
  assert.match(block, /leave this blank to keep the saved value/i);
});

test('connected payment setup does not restore full credentials to the browser', () => {
  const block = providerUiBlock();
  assert.doesNotMatch(block, /readPaymentProviderSecrets/);
  assert.match(block, /secretMasks/);
  assert.match(block, /data-no-password-toggle="true"/);
});
