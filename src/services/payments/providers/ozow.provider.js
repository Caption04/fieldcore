const { createManualProvider } = require('./manual.provider');

function createOzowProvider(options = {}) {
  const base = createManualProvider({ ...options, provider: 'OZOW' });
  return {
    ...base,
    async testConnection() {
      const configured = Boolean(process.env.OZOW_SITE_CODE && process.env.OZOW_PRIVATE_KEY) || Boolean(options.connection && options.connection.config && options.connection.config.mockMode);
      return { ok: configured, provider: 'OZOW', mockMode: Boolean(options.connection && options.connection.config && options.connection.config.mockMode), message: configured ? 'Ozow ready or mock-enabled.' : 'Ozow env vars are not configured.' };
    }
  };
}

module.exports = { createOzowProvider };
