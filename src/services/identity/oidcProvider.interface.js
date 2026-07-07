function assertConfigured(config) {
  if (!config || config.status !== 'CONFIGURED') {
    throw new Error('Identity provider is disabled or not configured.');
  }
  if (!config.issuerUrl || !config.clientId) {
    throw new Error('OIDC identity provider requires issuerUrl and clientId.');
  }
}

function createOidcProvider(config) {
  return {
    providerType: config.providerType || 'OIDC',
    displayName: config.displayName,
    buildAuthorizationUrl() {
      assertConfigured(config);
      throw new Error('OIDC authorization is not enabled yet. Configure a provider adapter before use.');
    },
    exchangeCode() {
      assertConfigured(config);
      throw new Error('OIDC token exchange is not enabled yet. Configure a provider adapter before use.');
    },
    normalizeIdentity() {
      assertConfigured(config);
      throw new Error('OIDC identity normalization is not enabled yet. Configure a provider adapter before use.');
    }
  };
}

module.exports = { createOidcProvider };
