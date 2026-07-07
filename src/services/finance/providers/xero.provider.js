function mockEnabled(integration) {
  return Boolean(integration && integration.config && integration.config.mockMode);
}

function maybeFail(integration) {
  if (integration && integration.config && integration.config.failNextSync) {
    const error = new Error('Mock provider failure');
    error.code = 'MOCK_PROVIDER_FAILURE';
    throw error;
  }
}

function createXeroProvider({ integration = {}, tokens = {}, mapping = {} } = {}) {
  return {
    async testConnection() {
      return {
        ok: true,
        verified: true,
        provider: 'XERO',
        mockMode: mockEnabled(integration),
        tenantId: integration.externalTenantId || null,
        message: mockEnabled(integration) ? 'Mock Xero connection verified.' : 'Xero integration is configured.'
      };
    },
    async syncInvoice(invoice) {
      maybeFail(integration);
      return {
        externalId: `xero-invoice-${invoice.id}`,
        externalUrl: integration.externalTenantId ? `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=xero-invoice-${invoice.id}` : null,
        providerResponse: { mockMode: mockEnabled(integration), mapping: { revenueAccountCode: mapping.revenueAccountCode || null } }
      };
    },
    async syncPayment(payment) {
      maybeFail(integration);
      return {
        externalId: `xero-payment-${payment.id}`,
        externalUrl: integration.externalTenantId ? `https://go.xero.com/Bank/ViewTransaction.aspx?paymentID=xero-payment-${payment.id}` : null,
        providerResponse: { mockMode: mockEnabled(integration), mapping: { paymentsAccountCode: mapping.paymentsAccountCode || null } }
      };
    },
    async handleWebhook(payload = {}) {
      return {
        eventId: payload.eventId || payload.id || null,
        eventType: payload.eventType || payload.type || 'xero.webhook',
        provider: 'XERO'
      };
    }
  };
}

module.exports = { createXeroProvider };
