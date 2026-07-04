# MVP Sign-Off Checklist

Use this checklist during final QA and launch review. Do not mark an item complete until it has been manually verified in the target environment.

## Build Scope

- [ ] Phase 1 backend foundation complete
- [ ] Phase 2 white-label branding complete
- [ ] Phase 3 quote to invoice to receipt flow complete
- [ ] Phase 4 scheduling engine complete
- [ ] Phase 5 worker operations complete
- [ ] Phase 6 client portal complete
- [ ] Phase 7 email and WhatsApp notifications complete
- [ ] Phase 8 public booking/request portal complete
- [ ] Phase 9 proof-of-work system complete
- [ ] Phase 10 production readiness complete
- [ ] Phase 11 SaaS billing/subscriptions complete
- [ ] Phase 12 reporting and analytics complete

## Operational QA

- [ ] Manual browser QA complete
- [ ] Database migrations applied
- [ ] Seed/demo reset verified
- [ ] Backup plan reviewed
- [ ] Deployment checklist reviewed
- [ ] Security review reviewed
- [ ] No known critical bugs

## Provider And Integration Smoke Tests

- [ ] Email provider tested
- [ ] WhatsApp provider tested
- [ ] SaaS billing provider tested
- [ ] Customer payment/provider flow tested
- [ ] File upload/storage tested

## Product Flows

- [ ] Login/logout tested
- [ ] Admin dashboard tested
- [ ] Public booking tested
- [ ] Public tracking tested
- [ ] Client portal tested
- [ ] Worker app and lifecycle flow tested
- [ ] Proof-of-work photos/signature/location tested
- [ ] Quotes tested
- [ ] Invoices/payments/receipts tested
- [ ] Scheduling and conflict handling tested
- [ ] Branding/settings tested
- [ ] SaaS billing page tested
- [ ] Reports and CSV exports tested

## Security Review

- [ ] Company isolation verified
- [ ] Worker restrictions verified
- [ ] Client portal restrictions verified
- [ ] Public route restrictions verified
- [ ] No `passwordHash` leaks found
- [ ] No provider secrets exposed
- [ ] No raw storage secrets exposed
- [ ] Production error responses checked

## Launch Decision

- [ ] Launch approved
- [ ] Launch blocked
- [ ] Blockers documented
- [ ] Rollback plan reviewed
