const API = "/api";
const page = document.body.dataset.clientPage;
const state = { dashboard: null, requests: [], quotes: [], jobs: [], assets: [], contracts: [], invoices: [], receipts: [], payments: [], properties: [], profile: null, localization: { defaultCurrency: "USD", numberFormat: "en-US" } };

async function api(path, options) {
  const response = await fetch(API + path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...(options || {}) });
  const payload = await response.json().catch(function() { return {}; });
  if (!response.ok) throw new Error((payload.error && payload.error.message) || "Request failed");
  return payload.data;
}

function data(form) { return Object.fromEntries(new FormData(form).entries()); }

function clean(input) {
  Object.keys(input).forEach(function(key) { if (input[key] === "") delete input[key]; });
  return input;
}

function message(el, text, ok) {
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || "";
  el.classList.toggle("is-success", Boolean(ok));
}

function money(value) {
  const settings = state.localization || {};
  const currency = settings.defaultCurrency || "USD";
  const locale = settings.numberFormat || "en-US";
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function date(value) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString();
}

function dateTime(value) {
  if (!value) return "Not set";
  return new Date(value).toLocaleString();
}

function statusClass(status) {
  if (["ACCEPTED", "PAID", "COMPLETED", "CONFIRMED", "CONVERTED"].includes(status)) return "green";
  if (["SENT", "SCHEDULED", "IN_PROGRESS", "PARTIALLY_PAID", "REVIEWED"].includes(status)) return "blue";
  if (["REJECTED", "VOID", "CANCELLED", "FAILED", "DECLINED"].includes(status)) return "red";
  return "gray";
}

function badge(status) {
  return '<span class="status-pill ' + statusClass(status) + '">' + (status || "NEW").replace(/_/g, " ") + "</span>";
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function(char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}

async function brand() {
  try {
    const company = await api("/public/company");
    state.localization = company.localization || state.localization;
    document.querySelectorAll("[data-client-brand]").forEach(function(el) { el.textContent = company.brandName || "FieldCore"; });
    document.querySelectorAll("[data-client-logo]").forEach(function(el) {
      const brandName = company.brandName || "FieldCore";
      el.style.backgroundImage = "";
      if (company.logoUrl) {
        el.innerHTML = '<img src="' + escapeHtml(company.logoUrl) + '" alt="' + escapeHtml(brandName) + ' logo">';
      } else {
        el.textContent = brandName.slice(0, 2).toUpperCase();
      }
    });
  } catch (error) {}
}

async function fillServices(select) {
  if (!select) return;
  const services = await api("/public/services");
  select.innerHTML = '<option value="">Select service</option>';
  services.forEach(function(service) {
    const option = document.createElement("option");
    option.value = service.id;
    option.textContent = service.name;
    select.appendChild(option);
  });
}

function empty(text) {
  return '<div class="client-empty">' + escapeHtml(text) + "</div>";
}

function listCard(item) {
  return '<article class="client-resource-card">' +
    '<div><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.meta || "") + '</span></div>' +
    '<div class="client-card-actions">' + (item.badge || "") + (item.action ? '<button class="secondary-button" data-action="' + item.action + '" data-id="' + item.id + '" type="button">View</button>' : "") + '</div>' +
  '</article>';
}

function renderRequests(container, requests) {
  if (!container) return;
  if (!requests.length) { container.innerHTML = empty("No requests yet."); return; }
  container.innerHTML = requests.map(function(item) {
    return listCard({
      id: item.id,
      title: item.serviceName || (item.service && item.service.name) || "Service Request",
      meta: [item.address, date(item.preferredDate)].filter(Boolean).join(" - "),
      badge: badge(item.status)
    });
  }).join("");
}

const sectionCopy = {
  dashboard: { label: "Overview", title: "Dashboard" },
  requests: { label: "Service Requests", title: "My Requests" },
  quotes: { label: "Quotes", title: "My Quotes" },
  jobs: { label: "Jobs", title: "My Jobs" },
  assets: { label: "Assets", title: "Assets" },
  contracts: { label: "Contracts", title: "Service Contracts" },
  invoices: { label: "Invoices", title: "My Invoices" },
  receipts: { label: "Receipts", title: "Receipts" },
  profile: { label: "Account", title: "Profile" },
  properties: { label: "Addresses", title: "Properties" }
};

function activateTab(name) {
  document.body.dataset.activeClientTab = name;
  const copy = sectionCopy[name] || sectionCopy.dashboard;
  const heading = document.querySelector("[data-client-welcome]");
  const label = document.querySelector("[data-client-section-label]");
  if (heading) heading.textContent = copy.title;
  if (label) label.textContent = copy.label;
  document.querySelectorAll("[data-client-tab]").forEach(function(tab) { tab.hidden = tab.dataset.clientTab !== name; });
  document.querySelectorAll("[data-client-tab-button]").forEach(function(button) { button.classList.toggle("active", button.dataset.clientTabButton === name); });
}

function activateRequestSubtab(name) {
  document.querySelectorAll("[data-request-subtab]").forEach(function(panel) { panel.hidden = panel.dataset.requestSubtab !== name; });
  document.querySelectorAll("[data-request-subtab-button]").forEach(function(button) { button.classList.toggle("active", button.dataset.requestSubtabButton === name); });
}

function openPasswordModal(name) {
  document.querySelectorAll("[data-password-modal]").forEach(function(modal) { modal.hidden = modal.dataset.passwordModal !== name; });
  syncClientModalScrollLock();
}

function closePasswordModals() {
  document.querySelectorAll("[data-password-modal]").forEach(function(modal) { modal.hidden = true; });
  syncClientModalScrollLock();
}

function syncClientModalScrollLock() {
  const openModal = Array.from(document.querySelectorAll("[data-password-modal], [data-client-detail-modal]")).some(function(modal) {
    return !modal.hidden;
  });
  document.body.classList.toggle("modal-open", openModal);
}

if (window.MutationObserver) {
  new MutationObserver(syncClientModalScrollLock).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["hidden"] });
}

function passwordMatchState() {
  const form = document.querySelector("[data-client-change-password-form]");
  if (!form) return true;
  const msg = document.querySelector("[data-password-match-message]");
  const submit = document.querySelector("[data-change-password-submit]");
  const newPassword = form.newPassword && form.newPassword.value || "";
  const confirm = form.confirmNewPassword && form.confirmNewPassword.value || "";
  const touched = Boolean(newPassword || confirm);
  const matches = Boolean(newPassword && confirm && newPassword === confirm);
  if (msg) {
    msg.hidden = !touched;
    msg.textContent = !touched ? "" : matches ? "Passwords match." : "New passwords do not match.";
    msg.classList.toggle("is-success", matches);
  }
  if (submit) submit.disabled = touched && !matches;
  return !touched || matches;
}

function openDetail(title, html) {
  const modal = document.querySelector("[data-client-detail-modal]");
  document.querySelector("[data-client-detail-title]").textContent = title;
  document.querySelector("[data-client-detail-body]").innerHTML = html;
  modal.hidden = false;
  syncClientModalScrollLock();
}

function closeDetail() {
  const modal = document.querySelector("[data-client-detail-modal]");
  if (modal) modal.hidden = true;
  syncClientModalScrollLock();
}

async function authPage(kind) {
  await brand();
  const form = document.querySelector(kind === "login" ? "[data-client-login-form]" : "[data-client-register-form]");
  const msg = document.querySelector("[data-client-message]");
  form.addEventListener("submit", async function(event) {
    event.preventDefault();
    message(msg, "");
    try {
      await api(kind === "login" ? "/client/auth/login" : "/client/auth/register", { method: "POST", body: JSON.stringify(clean(data(form))) });
      window.location.href = "client-portal.html";
    } catch (error) {
      message(msg, error.message);
    }
  });
}

async function requireSession() {
  const session = await api("/client/auth/session");
  if (!session) window.location.href = "client-login.html";
  return session;
}

function renderDashboard() {
  const stats = state.dashboard && state.dashboard.stats || {};
  document.querySelectorAll("[data-client-stat]").forEach(function(el) { el.textContent = stats[el.dataset.clientStat] || 0; });
  renderRequests(document.querySelector("[data-client-recent]"), state.dashboard && state.dashboard.recentRequests || []);
  const activity = document.querySelector("[data-client-activity]");
  const rows = []
    .concat((state.dashboard && state.dashboard.recentQuotes || []).map(function(item) { return { title: "Quote " + item.status.toLowerCase(), meta: item.title + " - " + money(item.total), badge: badge(item.status), id: item.id, action: "quote-detail" }; }))
    .concat((state.dashboard && state.dashboard.recentJobs || []).map(function(item) { return { title: "Job " + item.status.toLowerCase().replace(/_/g, " "), meta: item.title + " - " + dateTime(item.scheduledStart), badge: badge(item.status), id: item.id, action: "job-detail" }; }))
    .slice(0, 6);
  activity.innerHTML = rows.length ? rows.map(listCard).join("") : empty("No recent activity yet.");
}

function renderQuotes() {
  const container = document.querySelector("[data-client-quotes]");
  if (!state.quotes.length) { container.innerHTML = empty("No quotes yet. When your quote is ready, it will appear here."); return; }
  container.innerHTML = state.quotes.map(function(item) {
    return listCard({ id: item.id, title: item.title || "Quote", meta: money(item.total) + " - " + date(item.validUntil || item.createdAt), badge: badge(item.status), action: "quote-detail" });
  }).join("");
}

function renderJobs() {
  const container = document.querySelector("[data-client-jobs]");
  if (!state.jobs.length) { container.innerHTML = empty("No jobs yet. Accepted quotes and scheduled work will appear here."); return; }
  container.innerHTML = state.jobs.map(function(item) {
    return listCard({ id: item.id, title: item.title || "Job", meta: [dateTime(item.scheduledStart), item.address].filter(Boolean).join(" - "), badge: badge(item.status), action: "job-detail" });
  }).join("");
}

function renderAssets() {
  const container = document.querySelector("[data-client-assets]");
  if (!state.assets.length) { container.innerHTML = empty("No linked assets yet."); return; }
  container.innerHTML = state.assets.map(function(item) {
    return listCard({ id: item.id, title: item.name || "Asset", meta: [item.assetType, item.assetTag || item.serialNumber, item.locationLabel].filter(Boolean).join(" - "), badge: badge(item.status || "ACTIVE"), action: "asset-detail" });
  }).join("");
}

function renderContracts() {
  const container = document.querySelector("[data-client-contracts]");
  if (!state.contracts.length) { container.innerHTML = empty("No service contracts yet."); return; }
  container.innerHTML = state.contracts.map(function(item) {
    return listCard({ id: item.id, title: item.name || item.contractNumber || "Contract", meta: [item.contractNumber, "Assets " + ((item.assets || []).length), "Due " + ((item.upcomingDueWork || []).length)].filter(Boolean).join(" - "), badge: badge(item.status), action: "contract-detail" });
  }).join("");
}

function renderInvoices() {
  const container = document.querySelector("[data-client-invoices]");
  if (!state.invoices.length) { container.innerHTML = empty("No invoices yet."); return; }
  container.innerHTML = state.invoices.map(function(item) {
    return listCard({ id: item.id, title: item.invoiceNumber || item.number || "Invoice", meta: "Total " + money(item.total) + " - Due " + money(item.amountDue), badge: badge(item.status), action: "invoice-detail" });
  }).join("");
}

function renderReceipts() {
  const container = document.querySelector("[data-client-receipts]");
  if (!state.receipts.length) { container.innerHTML = empty("No receipts yet."); return; }
  container.innerHTML = state.receipts.map(function(item) {
    return listCard({ id: item.id, title: item.receiptNumber || "Receipt", meta: money(item.amount) + " - " + date(item.issuedAt || item.createdAt), badge: badge("PAID"), action: "receipt-detail" });
  }).join("");
}

function renderProperties() {
  const container = document.querySelector("[data-client-properties]");
  if (!state.properties.length) { container.innerHTML = empty("No properties yet."); return; }
  container.innerHTML = state.properties.map(function(item) {
    return '<article class="client-resource-card"><div><strong>' + escapeHtml(item.label || "Property") + '</strong><span>' + escapeHtml([item.address, item.city].filter(Boolean).join(" - ")) + '</span></div><div class="client-card-actions">' + (item.isDefault ? badge("DEFAULT") : "") + '<button class="secondary-button" data-action="property-edit" data-id="' + item.id + '" type="button">Edit</button><button class="secondary-button" data-action="property-delete" data-id="' + item.id + '" type="button">Delete</button></div></article>';
  }).join("");
}

function lineItemsHtml(lines) {
  if (!lines || !lines.length) return empty("No line items.");
  return '<div class="client-detail-lines">' + lines.map(function(line) {
    return '<div><span>' + escapeHtml(line.description) + '</span><strong>' + money(line.lineTotal) + '</strong><small>' + Number(line.quantity || 0) + " x " + money(line.unitPrice) + '</small></div>';
  }).join("") + "</div>";
}

function quoteDetail(item) {
  const canAct = item.status === "SENT";
  return '<div class="client-detail-stack">' + badge(item.status) + '<p>' + escapeHtml(item.description || item.title || "") + '</p>' + lineItemsHtml(item.lineItems) + '<div class="client-total-row"><span>Total</span><strong>' + money(item.total) + '</strong></div>' + (canAct ? '<div class="client-action-row"><button class="primary-button" data-action="quote-accept" data-id="' + item.id + '" type="button">Accept</button><button class="secondary-button" data-action="quote-reject" data-id="' + item.id + '" type="button">Reject</button></div>' : "") + "</div>";
}

function invoicePaymentOptionsHtml(item) {
  const due = Number(item.amountDue || item.balanceDue || 0);
  const options = item.paymentOptions || {};
  if (due <= 0 || item.status === "PAID") return '<section class="client-payment-panel"><h3>Payment</h3><p>This invoice is paid.</p></section>';

  const parts = ['<section class="client-payment-panel"><h3>Pay this invoice</h3><p>Choose from the payment methods this business accepts for this invoice.</p>'];
  if (options.onlinePayment && options.onlinePayment.available) {
    parts.push('<div class="client-payment-option primary"><div><strong>Make payment online</strong><small>You will be redirected to the secure payment page configured by the business.</small></div><button class="primary-button" data-action="invoice-pay-online" data-id="' + escapeHtml(item.id) + '" type="button">Make payment online</button></div>');
  }
  if (options.bankTransfer && options.bankTransfer.available) {
    const instructions = options.bankTransfer.instructions || options.instructions || 'Use your invoice number as the bank transfer reference.';
    const proof = options.bankTransfer.proofRequired ? '<small>Proof of payment is required after bank transfer.</small>' : '<small>Proof of payment is not required unless the business asks for it.</small>';
    parts.push('<div class="client-payment-option"><div><strong>Bank transfer</strong><small>' + escapeHtml(instructions) + '</small>' + proof + '<small>Reference: ' + escapeHtml(item.invoiceNumber || item.number || item.id) + '</small></div></div>');
  }
  if (options.cash && options.cash.available) {
    parts.push('<div class="client-payment-option"><div><strong>Cash</strong><small>Cash payments are accepted by this business. A receipt is issued after the business records the payment.</small></div></div>');
  }
  if (!((options.onlinePayment && options.onlinePayment.available) || (options.bankTransfer && options.bankTransfer.available) || (options.cash && options.cash.available))) {
    parts.push('<div class="client-empty">No payment method is currently available for this invoice. Please contact the business.</div>');
  }
  parts.push('<p class="fc-form-error" data-client-payment-message hidden></p></section>');
  return parts.join('');
}

function invoiceDetail(item) {
  return '<div class="client-detail-stack">' + badge(item.status) + lineItemsHtml(item.lineItems) + '<div class="client-total-row"><span>Total</span><strong>' + money(item.total) + '</strong></div><div class="client-total-row"><span>Paid</span><strong>' + money(item.amountPaid) + '</strong></div><div class="client-total-row"><span>Due</span><strong>' + money(item.amountDue) + '</strong></div>' + invoicePaymentOptionsHtml(item) + '<h3>Payments</h3>' + (item.payments && item.payments.length ? item.payments.map(function(payment) { return listCard({ title: money(payment.amount), meta: [payment.method, date(payment.receivedAt || payment.createdAt)].filter(Boolean).join(" - "), badge: badge(payment.status) }); }).join("") : empty("No payments recorded yet.")) + '<h3>Receipts</h3>' + (item.receipts && item.receipts.length ? item.receipts.map(function(receipt) { return listCard({ id: receipt.id, title: receipt.receiptNumber || "Receipt", meta: money(receipt.amount), badge: badge("PAID"), action: "receipt-detail" }); }).join("") : empty("No receipts yet.")) + "</div>";
}

function jobDetail(item) {
  const timeline = ["arrivedAt", "startedAt", "pausedAt", "resumedAt", "completedAt"].map(function(key) { return item[key] ? '<div><span>' + key.replace("At", "") + '</span><strong>' + dateTime(item[key]) + "</strong></div>" : ""; }).join("");
  function photoGroup(label, category) {
    const photos = (item.proofPhotos || []).filter(function(photo) { return (photo.category || "GENERAL") === category || category === "GENERAL" && ["BEFORE", "AFTER"].indexOf(photo.category || "GENERAL") === -1; });
    return '<h3>' + label + '</h3><div class="client-proof-grid">' + (photos.length ? photos.map(function(photo) { return '<figure><img src="' + escapeHtml(photo.url) + '" alt=""><figcaption>' + escapeHtml(photo.caption || date(photo.createdAt)) + "</figcaption></figure>"; }).join("") : empty("No " + label.toLowerCase() + " yet.")) + "</div>";
  }
  const signature = item.signature ? '<figure><img src="' + escapeHtml(item.signature.signatureUrl) + '" alt=""><figcaption>' + escapeHtml(item.signature.signedByName || "Signature collected") + "</figcaption></figure>" : empty("No signature captured yet.");
  const summary = item.proofSummary || {};
  const location = summary.locationPresent ? '<div><span>Completion location</span><strong>Captured</strong><small>' + escapeHtml(summary.location && summary.location.accuracy ? Math.round(summary.location.accuracy) + " m accuracy" : "") + '</small></div>' : "";
  return '<div class="client-detail-stack">' + badge(item.status) + '<p>' + escapeHtml(item.description || "") + '</p><div class="client-detail-lines"><div><span>Schedule</span><strong>' + dateTime(item.scheduledStart) + '</strong><small>' + escapeHtml(item.address || "") + '</small></div>' + timeline + location + '</div>' + (item.completionNotes ? '<h3>Completion Notes</h3><p>' + escapeHtml(item.completionNotes) + '</p>' : '') + photoGroup("Before Photos", "BEFORE") + photoGroup("After Photos", "AFTER") + photoGroup("General Proof Photos", "GENERAL") + '<h3>Signature</h3><div class="client-proof-grid">' + signature + '</div></div>';
}

function receiptDetail(item) {
  return '<div class="client-detail-stack">' + badge("PAID") + '<div class="client-detail-lines"><div><span>Receipt</span><strong>' + escapeHtml(item.receiptNumber || item.id) + '</strong><small>' + date(item.issuedAt || item.createdAt) + '</small></div><div><span>Invoice</span><strong>' + escapeHtml(item.invoice && (item.invoice.number || item.invoice.invoiceNumber) || item.invoiceId) + '</strong></div><div><span>Amount</span><strong>' + money(item.amount) + '</strong></div></div></div>';
}

function assetDetail(item) {
  const history = item.jobHistory || [];
  return '<div class="client-detail-stack">' + badge(item.status || "ACTIVE") + '<div class="client-detail-lines"><div><span>Type</span><strong>' + escapeHtml(item.assetType || "-") + '</strong><small>' + escapeHtml(item.assetTag || item.serialNumber || "") + '</small></div><div><span>Warranty</span><strong>' + escapeHtml(item.warrantyStatus || "UNKNOWN") + '</strong><small>' + date(item.warrantyEndAt) + '</small></div><div><span>Location</span><strong>' + escapeHtml(item.locationLabel || item.property && item.property.address || "Not set") + '</strong></div></div><h3>Service History</h3>' + (history.length ? history.map(function(job) { return listCard({ title: job.title || "Job", meta: dateTime(job.completedAt || job.scheduledStart), badge: badge(job.status) }); }).join("") : empty("No linked service history yet.")) + "</div>";
}

function contractDetail(item) {
  return '<div class="client-detail-stack">' + badge(item.status) + '<div class="client-detail-lines"><div><span>Contract</span><strong>' + escapeHtml(item.contractNumber || item.id) + '</strong><small>' + date(item.startDate) + " - " + date(item.endDate) + '</small></div><div><span>Response SLA</span><strong>' + escapeHtml(item.responseSlaHours ? item.responseSlaHours + " hours" : "Not set") + '</strong></div><div><span>Completion SLA</span><strong>' + escapeHtml(item.completionSlaHours ? item.completionSlaHours + " hours" : "Not set") + '</strong></div></div><h3>Covered Assets</h3>' + ((item.assets || []).length ? item.assets.map(function(asset) { return listCard({ title: asset.name || "Asset", meta: asset.assetType || "", badge: badge(asset.status || "ACTIVE") }); }).join("") : empty("No covered assets listed.")) + '<h3>Upcoming Due Work</h3>' + ((item.upcomingDueWork || []).length ? item.upcomingDueWork.map(function(work) { return listCard({ title: work.title || "Due work", meta: dateTime(work.nextDueAt), badge: badge("DUE") }); }).join("") : empty("No upcoming due work.")) + "</div>";
}

async function loadAll() {
  const [dashboard, requests, quotes, jobs, assets, contracts, invoices, receipts, payments, properties, profile] = await Promise.all([
    api("/client/dashboard"),
    api("/client/booking-requests"),
    api("/client/quotes"),
    api("/client/jobs"),
    api("/client/assets"),
    api("/client/service-contracts"),
    api("/client/invoices"),
    api("/client/receipts"),
    api("/client/payments"),
    api("/client/properties"),
    api("/client/profile")
  ]);
  Object.assign(state, { dashboard, requests, quotes, jobs, assets, contracts, invoices, receipts, payments, properties, profile });
}

function fillProfile(profile) {
  const form = document.querySelector("[data-client-profile-form]");
  form.name.value = profile.client.name || "";
  form.email.value = profile.client.email || "";
  form.phone.value = profile.client.phone || "";
  document.querySelector("[data-client-profile-name]").textContent = profile.client.name || "Client";
  document.querySelector("[data-client-profile-email]").textContent = profile.client.email || "";
  document.querySelector("[data-client-profile-status]").textContent = profile.client.status || "ACTIVE";
  document.querySelector("[data-client-avatar]").textContent = (profile.client.name || profile.client.email || "FC").slice(0, 2).toUpperCase();
  const summary = document.querySelector("[data-client-customer-summary]");
  const property = (state.properties || []).find(function(item) { return item.isDefault; }) || (state.properties || [])[0];
  if (property) {
    summary.hidden = false;
    summary.textContent = [property.label, property.address, property.city].filter(Boolean).join(" - ");
  } else {
    summary.hidden = true;
    summary.textContent = "";
  }
  const requestForm = document.querySelector("[data-client-request-form]");
  requestForm.customerName.value = profile.client.name || "";
  requestForm.customerEmail.value = profile.client.email || "";
  requestForm.customerPhone.value = profile.client.phone || "";
  const forgotForm = document.querySelector("[data-client-forgot-password-form]");
  if (forgotForm && forgotForm.email) forgotForm.email.value = profile.client.email || "";
}

function renderAll() {
  renderDashboard();
  renderRequests(document.querySelector("[data-client-requests]"), state.requests);
  renderQuotes();
  renderJobs();
  renderAssets();
  renderContracts();
  renderInvoices();
  renderReceipts();
  renderProperties();
  fillProfile(state.profile);
}

function resetPropertyForm() {
  const form = document.querySelector("[data-client-property-form]");
  form.reset();
  form.id.value = "";
  document.querySelector("[data-property-form-title]").textContent = "Add Property";
}

async function refresh() {
  await loadAll();
  renderAll();
}

async function loadPortal() {
  await brand();
  const session = await requireSession();
  document.querySelector("[data-client-welcome]").textContent = "Welcome, " + session.name;
  await fillServices(document.querySelector("[data-client-service-select]"));

  document.querySelectorAll("[data-client-tab-button]").forEach(function(button) {
    button.addEventListener("click", function() { activateTab(button.dataset.clientTabButton); });
  });
  document.querySelector("[data-client-logout]").addEventListener("click", async function() { await api("/client/auth/logout", { method: "POST" }); window.location.href = "client-login.html"; });

  document.querySelector("[data-client-request-form]").addEventListener("submit", async function(event) {
    event.preventDefault();
    const msg = document.querySelector("[data-client-request-message]");
    message(msg, "");
    try {
      await api("/client/booking-requests", { method: "POST", body: JSON.stringify(clean(data(event.currentTarget))) });
      event.currentTarget.reset();
      message(msg, "Request submitted.", true);
      await refresh();
      activateTab("dashboard");
    } catch (error) { message(msg, error.message); }
  });

  document.querySelector("[data-client-profile-form]").addEventListener("submit", async function(event) {
    event.preventDefault();
    const msg = document.querySelector("[data-client-profile-message]");
    message(msg, "");
    try {
      await api("/client/profile", { method: "PATCH", body: JSON.stringify(clean(data(event.currentTarget))) });
      message(msg, "Profile saved.", true);
      await refresh();
    } catch (error) { message(msg, error.message); }
  });

  document.querySelector("[data-client-property-form]").addEventListener("submit", async function(event) {
    event.preventDefault();
    const msg = document.querySelector("[data-client-property-message]");
    const formData = clean(data(event.currentTarget));
    const id = formData.id;
    delete formData.id;
    formData.isDefault = event.currentTarget.elements.isDefault.checked;
    message(msg, "");
    try {
      await api(id ? "/client/properties/" + id : "/client/properties", { method: id ? "PATCH" : "POST", body: JSON.stringify(formData) });
      resetPropertyForm();
      message(msg, "Property saved.", true);
      await refresh();
    } catch (error) { message(msg, error.message); }
  });

  document.querySelector("[data-property-reset]").addEventListener("click", resetPropertyForm);
  activateTab("dashboard");
  await refresh();
}

document.addEventListener("click", async function(event) {
  const subtab = event.target.closest("[data-request-subtab-button]");
  if (subtab) activateRequestSubtab(subtab.dataset.requestSubtabButton);
  const openButton = event.target.closest("[data-open-password-modal]");
  if (openButton) openPasswordModal(openButton.dataset.openPasswordModal);
  if (event.target.closest("[data-close-password-modal]")) closePasswordModals();
  if (event.target.closest("[data-client-detail-close]")) closeDetail();
  const backdrop = event.target.closest("[data-password-modal], [data-client-detail-modal]");
  if (backdrop && event.target === backdrop) { closePasswordModals(); closeDetail(); }

  const button = event.target.closest("[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === "quote-detail") {
    const item = await api("/client/quotes/" + id);
    openDetail(item.title || "Quote", quoteDetail(item));
  }
  if (button.dataset.action === "invoice-detail") {
    const item = await api("/client/invoices/" + id);
    openDetail(item.invoiceNumber || "Invoice", invoiceDetail(item));
  }
  if (button.dataset.action === "job-detail") {
    const item = await api("/client/jobs/" + id);
    openDetail(item.title || "Job", jobDetail(item));
  }
  if (button.dataset.action === "asset-detail") {
    const item = await api("/client/assets/" + id);
    openDetail(item.name || "Asset", assetDetail(item));
  }
  if (button.dataset.action === "contract-detail") {
    const item = await api("/client/service-contracts/" + id);
    openDetail(item.name || "Contract", contractDetail(item));
  }
  if (button.dataset.action === "receipt-detail") {
    const item = await api("/client/receipts/" + id);
    openDetail(item.receiptNumber || "Receipt", receiptDetail(item));
  }
  if (button.dataset.action === "invoice-pay-online") {
    const msg = document.querySelector("[data-client-payment-message]");
    message(msg, "Preparing secure payment...");
    button.disabled = true;
    try {
      const result = await api("/client/invoices/" + id + "/pay-online", { method: "POST", body: JSON.stringify({}) });
      if (!result.checkoutUrl) throw new Error("Payment link was not returned.");
      window.location.href = result.checkoutUrl;
    } catch (error) {
      button.disabled = false;
      message(msg, error.message);
    }
  }
  if (button.dataset.action === "quote-accept") {
    if (!window.confirm("Accept this quote?")) return;
    await api("/client/quotes/" + id + "/accept", { method: "POST", body: JSON.stringify({}) });
    closeDetail();
    await refresh();
    activateTab("quotes");
  }
  if (button.dataset.action === "quote-reject") {
    const reason = window.prompt("Reason for rejecting this quote?") || "";
    await api("/client/quotes/" + id + "/reject", { method: "POST", body: JSON.stringify({ reason }) });
    closeDetail();
    await refresh();
    activateTab("quotes");
  }
  if (button.dataset.action === "property-edit") {
    const item = state.properties.find(function(property) { return property.id === id; });
    const form = document.querySelector("[data-client-property-form]");
    form.id.value = item.id;
    form.label.value = item.label || "";
    form.address.value = item.address || "";
    form.city.value = item.city || "";
    form.notes.value = item.notes || "";
    form.elements.isDefault.checked = Boolean(item.isDefault);
    document.querySelector("[data-property-form-title]").textContent = "Edit Property";
  }
  if (button.dataset.action === "property-delete") {
    if (!window.confirm("Delete this property?")) return;
    await api("/client/properties/" + id, { method: "DELETE" });
    await refresh();
  }
});

async function clientPasswordSubmitHandler(event) {
  const changeForm = event.target.closest("[data-client-change-password-form]");
  const forgotForm = event.target.closest("[data-client-forgot-password-form]");
  if (!changeForm && !forgotForm) return;
  event.preventDefault();
  const isChange = Boolean(changeForm);
  const form = changeForm || forgotForm;
  const msg = document.querySelector(isChange ? "[data-client-change-password-message]" : "[data-client-forgot-password-message]");
  message(msg, "");
  if (isChange && !passwordMatchState()) {
    message(msg, "New passwords do not match.");
    return;
  }
  try {
    const payload = clean(data(form));
    if (isChange) delete payload.confirmNewPassword;
    await api(isChange ? "/client/profile/password" : "/client/auth/forgot-password", { method: "POST", body: JSON.stringify(payload) });
    if (isChange) { form.reset(); message(msg, "Password updated.", true); setTimeout(closePasswordModals, 700); }
    else message(msg, "Password reset email delivery is not configured yet. Please contact the company to reset your password.", true);
  } catch (error) {
    message(msg, /current password/i.test(error.message) ? "Current password is incorrect." : error.message);
  }
}

document.addEventListener("submit", clientPasswordSubmitHandler);
document.addEventListener("input", function(event) {
  if (event.target.closest("[data-client-change-password-form]")) passwordMatchState();
});

document.addEventListener("DOMContentLoaded", function() {
  if (page === "login") authPage("login");
  if (page === "register") authPage("register");
  if (page === "portal") loadPortal();
});
