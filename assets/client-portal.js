const API = "/api";
const page = document.body.dataset.clientPage;
const state = { dashboard: null, requests: [], quotes: [], jobs: [], invoices: [], receipts: [], payments: [], properties: [], profile: null };

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
  return "$" + Number(value || 0).toFixed(2);
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
    document.querySelectorAll("[data-client-brand]").forEach(function(el) { el.textContent = company.brandName || "FieldCore"; });
    document.querySelectorAll("[data-client-logo]").forEach(function(el) {
      el.textContent = (company.brandName || "FC").slice(0, 2).toUpperCase();
      if (company.logoUrl) el.style.backgroundImage = "url(" + company.logoUrl + ")";
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
}

function closePasswordModals() {
  document.querySelectorAll("[data-password-modal]").forEach(function(modal) { modal.hidden = true; });
}

function openDetail(title, html) {
  const modal = document.querySelector("[data-client-detail-modal]");
  document.querySelector("[data-client-detail-title]").textContent = title;
  document.querySelector("[data-client-detail-body]").innerHTML = html;
  modal.hidden = false;
}

function closeDetail() {
  const modal = document.querySelector("[data-client-detail-modal]");
  if (modal) modal.hidden = true;
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

function invoiceDetail(item) {
  return '<div class="client-detail-stack">' + badge(item.status) + lineItemsHtml(item.lineItems) + '<div class="client-total-row"><span>Total</span><strong>' + money(item.total) + '</strong></div><div class="client-total-row"><span>Paid</span><strong>' + money(item.amountPaid) + '</strong></div><div class="client-total-row"><span>Due</span><strong>' + money(item.amountDue) + '</strong></div><h3>Payments</h3>' + (item.payments && item.payments.length ? item.payments.map(function(payment) { return listCard({ title: money(payment.amount), meta: [payment.method, date(payment.receivedAt || payment.createdAt)].filter(Boolean).join(" - "), badge: badge(payment.status) }); }).join("") : empty("No payments recorded yet.")) + '<h3>Receipts</h3>' + (item.receipts && item.receipts.length ? item.receipts.map(function(receipt) { return listCard({ id: receipt.id, title: receipt.receiptNumber || "Receipt", meta: money(receipt.amount), badge: badge("PAID"), action: "receipt-detail" }); }).join("") : empty("No receipts yet.")) + "</div>";
}

function jobDetail(item) {
  const timeline = ["arrivedAt", "startedAt", "pausedAt", "resumedAt", "completedAt"].map(function(key) { return item[key] ? '<div><span>' + key.replace("At", "") + '</span><strong>' + dateTime(item[key]) + "</strong></div>" : ""; }).join("");
  const photos = item.proofPhotos && item.proofPhotos.length ? item.proofPhotos.map(function(photo) { return '<figure><img src="' + escapeHtml(photo.url) + '" alt=""><figcaption>' + escapeHtml(photo.caption || date(photo.createdAt)) + "</figcaption></figure>"; }).join("") : empty("No proof photos yet.");
  const signature = item.signature ? '<figure><img src="' + escapeHtml(item.signature.signatureUrl) + '" alt=""><figcaption>' + escapeHtml(item.signature.signedByName || "Signature collected") + "</figcaption></figure>" : empty("No signature captured yet.");
  return '<div class="client-detail-stack">' + badge(item.status) + '<p>' + escapeHtml(item.description || "") + '</p><div class="client-detail-lines"><div><span>Schedule</span><strong>' + dateTime(item.scheduledStart) + '</strong><small>' + escapeHtml(item.address || "") + '</small></div>' + timeline + '</div><h3>Proof Photos</h3><div class="client-proof-grid">' + photos + '</div><h3>Signature</h3><div class="client-proof-grid">' + signature + '</div></div>';
}

function receiptDetail(item) {
  return '<div class="client-detail-stack">' + badge("PAID") + '<div class="client-detail-lines"><div><span>Receipt</span><strong>' + escapeHtml(item.receiptNumber || item.id) + '</strong><small>' + date(item.issuedAt || item.createdAt) + '</small></div><div><span>Invoice</span><strong>' + escapeHtml(item.invoice && (item.invoice.number || item.invoice.invoiceNumber) || item.invoiceId) + '</strong></div><div><span>Amount</span><strong>' + money(item.amount) + '</strong></div></div></div>';
}

async function loadAll() {
  const [dashboard, requests, quotes, jobs, invoices, receipts, payments, properties, profile] = await Promise.all([
    api("/client/dashboard"),
    api("/client/booking-requests"),
    api("/client/quotes"),
    api("/client/jobs"),
    api("/client/invoices"),
    api("/client/receipts"),
    api("/client/payments"),
    api("/client/properties"),
    api("/client/profile")
  ]);
  Object.assign(state, { dashboard, requests, quotes, jobs, invoices, receipts, payments, properties, profile });
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
  summary.textContent = profile.customer ? [profile.customer.name, profile.customer.address].filter(Boolean).join(" - ") : "No linked customer details yet.";
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
  if (button.dataset.action === "receipt-detail") {
    const item = await api("/client/receipts/" + id);
    openDetail(item.receiptNumber || "Receipt", receiptDetail(item));
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
  try {
    await api(isChange ? "/client/profile/password" : "/client/auth/forgot-password", { method: "POST", body: JSON.stringify(clean(data(form))) });
    if (isChange) { form.reset(); message(msg, "Password updated.", true); setTimeout(closePasswordModals, 700); }
    else message(msg, "If this email has a client account, a reset link will be sent.", true);
  } catch (error) {
    message(msg, error.message);
  }
}

document.addEventListener("submit", clientPasswordSubmitHandler);

document.addEventListener("DOMContentLoaded", function() {
  if (page === "login") authPage("login");
  if (page === "register") authPage("register");
  if (page === "portal") loadPortal();
});
