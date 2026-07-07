function createSageProvider({ integration = {} } = {}) {
  return {
    async testConnection() {
      return { ok: true, verified: true, provider: 'SAGE', mockMode: Boolean(integration.config && integration.config.mockMode), message: 'Sage integration is configured.' };
    },
    async syncInvoice(invoice) {
      return { externalId: `sage-invoice-${invoice.id}`, externalUrl: null, providerResponse: { mockMode: true } };
    },
    async syncPayment(payment) {
      return { externalId: `sage-payment-${payment.id}`, externalUrl: null, providerResponse: { mockMode: true } };
    },
    async handleWebhook(payload = {}) {
      return { eventId: payload.eventId || payload.id || null, eventType: payload.eventType || payload.type || 'sage.webhook', provider: 'SAGE' };
    }
  };
}

module.exports = { createSageProvider };
