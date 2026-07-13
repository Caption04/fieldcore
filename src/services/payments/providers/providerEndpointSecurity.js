const net = require('node:net');

const REQUEST_TIMEOUT_MS = 10000;

function providerEndpointError(provider) {
  return new Error(`${provider} address is not allowed`);
}

function assertProviderUrl(value, { provider, hosts, exactPaths = [], pathPrefixes = [] }) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw providerEndpointError(provider);
  }
  const hostname = url.hostname.toLowerCase();
  const pathAllowed = exactPaths.includes(url.pathname)
    || pathPrefixes.some((prefix) => url.pathname.startsWith(prefix));
  if (url.protocol !== 'https:'
    || url.port
    || url.username
    || url.password
    || net.isIP(hostname)
    || !hosts.has(hostname)
    || !pathAllowed) {
    throw providerEndpointError(provider);
  }
  return url;
}

function assertNoRedirect(response, provider) {
  if (response && response.status >= 300 && response.status < 400) {
    throw providerEndpointError(provider);
  }
}

function secureFetchOptions(options = {}) {
  return {
    ...options,
    redirect: 'manual',
    signal: options.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  };
}

module.exports = { REQUEST_TIMEOUT_MS, assertNoRedirect, assertProviderUrl, secureFetchOptions };
