const providers = {
  BREVO: {
    channel: 'EMAIL',
    label: 'Brevo',
    safeConfig: ['senderName', 'senderEmail', 'replyToEmail'],
    secrets: ['apiKey']
  },
  META_WHATSAPP_CLOUD: {
    channel: 'WHATSAPP',
    label: 'Meta WhatsApp Cloud API',
    safeConfig: ['wabaId', 'phoneNumberId', 'businessPhoneDisplayNumber', 'templateNamespace', 'defaultTemplateName'],
    secrets: ['accessToken', 'webhookVerifyToken', 'appSecret']
  },
  CLICKATELL: {
    channel: 'SMS',
    label: 'Clickatell',
    safeConfig: ['senderId', 'profileId', 'channel'],
    secrets: ['apiKey']
  },
  AFRICAS_TALKING: {
    channel: 'SMS',
    label: "Africa's Talking",
    safeConfig: ['senderId', 'shortCode', 'environment'],
    secrets: ['username', 'apiKey']
  },
  CLOUDFLARE_R2: {
    channel: 'STORAGE',
    label: 'Cloudflare R2',
    safeConfig: ['accountId', 'bucket', 'endpoint', 'publicDomain', 'region'],
    secrets: ['accessKeyId', 'secretAccessKey']
  }
};

function providerDefinition(provider) {
  const definition = providers[provider];
  if (!definition) throw new Error('Unsupported integration provider');
  return definition;
}

function sanitizeConfig(provider, config = {}) {
  const definition = providerDefinition(provider);
  const output = {};
  for (const key of definition.safeConfig) {
    if (config[key] !== undefined && config[key] !== '') output[key] = config[key];
  }
  return output;
}

function configuredSecretKeys(provider, secrets = []) {
  const allowed = new Set(providerDefinition(provider).secrets);
  return secrets.filter((secret) => allowed.has(secret.keyName)).map((secret) => secret.keyName).sort();
}

module.exports = { configuredSecretKeys, providerDefinition, providers, sanitizeConfig };
