function createManualProvider({ provider = 'MANUAL_BANK', connection = {} } = {}) {
  const mockMode = Boolean(connection && connection.config && connection.config.mockMode) || provider === 'MOCK';
  return {
    async testConnection() {
      return { ok: true, provider, mockMode, message: provider === 'MOCK' ? 'Mock payment provider ready.' : 'Manual payment rail is available.' };
    },
    async createCheckoutSession({ invoice, amount, currency, reference }) {
      return this.createPaymentLink({ invoice, amount, currency, reference });
    },
    async createPaymentLink({ invoice, amount, currency, reference }) {
      return {
        provider,
        externalId: `${String(provider).toLowerCase()}-link-${reference}`,
        checkoutUrl: `https://payments.fieldcore.local/${String(provider).toLowerCase()}/${encodeURIComponent(reference)}`,
        status: 'CREATED',
        amount,
        currency,
        invoiceId: invoice && invoice.id
      };
    },
    verifyWebhook() { return mockMode; },
    async handleWebhookEvent(payload = {}) {
      return {
        eventId: payload.eventId || payload.id || null,
        eventType: payload.eventType || payload.type || 'payment.mock',
        reference: payload.reference || payload.paymentReference || null,
        providerPaymentId: payload.providerPaymentId || payload.paymentId || payload.id || null,
        amount: payload.amount,
        currency: payload.currency,
        status: payload.status || 'CONFIRMED'
      };
    },
    async refundPayment(payment, { amount, reason } = {}) {
      return { ok: true, providerRefundId: `${String(provider).toLowerCase()}-refund-${payment.id}`, amount: amount || payment.amount, reason: reason || null, mockMode: true };
    },
    async getPaymentStatus(paymentLink) {
      return { status: paymentLink.status || 'CREATED', provider, externalId: paymentLink.externalId || null };
    }
  };
}

module.exports = { createManualProvider };
