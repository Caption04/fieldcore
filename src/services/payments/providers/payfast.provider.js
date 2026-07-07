const { createManualProvider } = require('./manual.provider');

function createPayFastProvider(options = {}) {
  const base = createManualProvider({ ...options, provider: 'PAYFAST' });
  return {
    ...base,
    async testConnection() {
      const configured = Boolean(process.env.PAYFAST_MERCHANT_ID && process.env.PAYFAST_MERCHANT_KEY) || Boolean(options.connection && options.connection.config && options.connection.config.mockMode);
      return { ok: configured, provider: 'PAYFAST', mockMode: Boolean(options.connection && options.connection.config && options.connection.config.mockMode), message: configured ? 'PayFast ready or mock-enabled.' : 'PayFast env vars are not configured.' };
    }
  };
}

module.exports = { createPayFastProvider };
