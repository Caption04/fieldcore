const { createManualProvider } = require('./manual.provider');

function createYocoProvider(options = {}) {
  const base = createManualProvider({ ...options, provider: 'YOCO' });
  return {
    ...base,
    async testConnection() {
      const configured = Boolean(process.env.YOCO_SECRET_KEY) || Boolean(options.connection && options.connection.config && options.connection.config.mockMode);
      return { ok: configured, provider: 'YOCO', mockMode: Boolean(options.connection && options.connection.config && options.connection.config.mockMode), message: configured ? 'Yoco ready or mock-enabled.' : 'Yoco env vars are not configured.' };
    }
  };
}

module.exports = { createYocoProvider };
