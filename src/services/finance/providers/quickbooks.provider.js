function createQuickBooksProvider({ integration = {} } = {}) {
  return {
    async testConnection() {
      return { ok: true, verified: true, provider: 'QUICKBOOKS', mockMode: Boolean(integration.config && integration.config.mockMode), message: 'QuickBooks integration is configured.' };
    },
    async syncInvoice(invoice) {
      return { externalId: `quickbooks-invoice-${invoice.id}`, externalUrl: null, providerResponse: { mockMode: true } };
    },
    async syncPayment(payment) {
      return { externalId: `quickbooks-payment-${payment.id}`, externalUrl: null, providerResponse: { mockMode: true } };
    },
    async handleWebhook(payload = {}) {
      return { eventId: payload.eventId || payload.id || null, eventType: payload.eventType || payload.type || 'quickbooks.webhook', provider: 'QUICKBOOKS' };
    }
  };
}

module.exports = { createQuickBooksProvider };
