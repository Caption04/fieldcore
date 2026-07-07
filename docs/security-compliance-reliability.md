# Security, compliance, and reliability foundation

FieldCore includes an enterprise-readiness security foundation. This is a practical control set for mid-market procurement conversations; it is not a SOC 2, ISO 27001, or PCI certification claim.

## Controls added

- Owner/admin 2FA foundation using email-code/TOTP-ready verification and single-use recovery codes.
- Revocable user sessions with expiry, last-seen tracking, and password-change force logout.
- Company password policy settings for minimum length, invite reset requirements, failed-login lockout thresholds, lockout duration, and inactive user disablement placeholders.
- Identity-provider configuration records for future OIDC/SAML support such as Google Workspace and Microsoft Entra ID. Providers are disabled by default.
- Security event logging for failed login bursts, lockouts, 2FA failures, password changes, role changes, exports, and identity-provider changes.
- Company-scoped data exports for customers, jobs, invoices, payments, assets, and contracts.
- Internal operations status endpoint and Security Center page.

## 2FA notes

The current foundation stores hashed verification codes and hashed recovery codes. Production email/TOTP delivery can be connected later without changing the login gate or recovery-code data model.

## SSO architecture

`IdentityProviderConfig` stores issuer/client metadata and safe config. No secret material is exposed in responses. Future provider adapters should build on `src/services/identity/oidcProvider.interface.js` and follow this interface:

```js
async function buildAuthorizationUrl(companyId, providerConfig, state) {}
async function exchangeCode(companyId, providerConfig, code) {}
async function normalizeIdentity(providerConfig, tokenSet) {}
```

Google Workspace and Microsoft Entra ID should be added as OIDC providers first. SAML can be layered in later for enterprise customers that require it.

## Data retention placeholders

Retention settings are stored on `CompanySecuritySettings` for audit logs, notification logs, proof photos, and deleted-customer policy notes. Automated purging should be introduced only after legal retention requirements are confirmed per market.
