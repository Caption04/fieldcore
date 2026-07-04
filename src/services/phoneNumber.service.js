function normalizePhoneNumber(value, options = {}) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let compact = raw.replace(/[\s().-]/g, '');
  if (compact.startsWith('00')) compact = '+' + compact.slice(2);
  if (!compact.startsWith('+')) {
    const countryCode = String(options.defaultCountryCode || process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '').replace(/\D/g, '');
    if (!countryCode) return null;
    compact = compact.replace(/^0+/, '');
    if (!compact) return null;
    compact = '+' + countryCode + compact;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(compact)) return null;
  return compact;
}

module.exports = { normalizePhoneNumber };
