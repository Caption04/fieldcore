# Offer-Specific Localization

TASK6 adds practical localization for South Africa, Zimbabwe, and similar field-service markets without making FieldCore hardcoded to one country.

Implemented foundation:

- company country and timezone settings
- default and allowed currencies
- local tax/VAT label and tax rate
- date and number format preferences
- quote expiry and invoice payment terms
- configurable payment methods including cash, bank transfer, Paynow, PayFast, Yoco, Ozow, SnapScan, manual card, external payment link, and custom manual methods
- manual payment instructions for bank details or external payment references
- localized metadata on quote, invoice, receipt, public company, and service responses
- WhatsApp/email template coverage for high-value events such as contracts, maintenance due, SLA risk/breach, proof ready, overdue invoices, payment received, and stock shortages

Limitations:

- Live PayFast, Yoco, Ozow, SnapScan, Xero, Sage, and QuickBooks sync are not implemented in this phase.
- Payment methods are configurable operational labels and manual reference capture unless a provider integration already exists.
- CSV export foundation remains the supported accounting workflow.
