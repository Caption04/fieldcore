const { createXeroProvider } = require('./xero.provider');
const { createSageProvider } = require('./sage.provider');
const { createQuickBooksProvider } = require('./quickbooks.provider');

function createFinanceProvider(provider, options = {}) {
  if (provider === 'XERO') return createXeroProvider(options);
  if (provider === 'SAGE') return createSageProvider(options);
  if (provider === 'QUICKBOOKS') return createQuickBooksProvider(options);
  return {
    async testConnection() {
      return { ok: true, verified: true, provider, mockMode: true, message: 'Manual CSV provider is available.' };
    },
    async syncInvoice(record) {
      return { externalId: `${String(provider).toLowerCase()}-invoice-${record.id}`, externalUrl: null };
    },
    async syncPayment(record) {
      return { externalId: `${String(provider).toLowerCase()}-payment-${record.id}`, externalUrl: null };
    },
    async handleWebhook(payload) {
      return { eventId: payload && (payload.eventId || payload.id) || null, eventType: payload && (payload.eventType || payload.type) || 'unknown' };
    }
  };
}

module.exports = { createFinanceProvider };
