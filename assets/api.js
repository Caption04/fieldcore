(function(){
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  const page = document.body.dataset.page || 'dashboard';
  const state = { user: null, profile: null, branding: null, customers: [], services: [], workers: [], roles: [], jobs: [], assets: [], serviceContracts: [], invoices: [], schedule: [], scheduleSettings: null, scheduleView: 'week', scheduleDate: new Date(), scheduleFilters: { workerId: '', status: '' }, listFilters: {}, availability: {}, notificationLogs: [], integrations: [], messageLogs: [], storageUsage: null, billing: null, financeSettings: null, financeIntegrations: [], financeExportLogs: [], reports: null, activeReportTab: 'overview' };

  const MARKET_DEFAULTS = {
    ZW: { country: 'ZW', timezone: 'Africa/Harare', defaultCurrency: 'USD', numberFormat: 'en-ZW', taxName: 'VAT', allowedCurrencies: ['USD'], paymentMethods: ['CASH', 'BANK_TRANSFER', 'EXTERNAL_PAYMENT_LINK', 'CUSTOM_MANUAL', 'PAYNOW'] },
    SA: { country: 'ZA', timezone: 'Africa/Johannesburg', defaultCurrency: 'ZAR', numberFormat: 'en-ZA', taxName: 'VAT', allowedCurrencies: ['ZAR'], paymentMethods: ['CASH', 'BANK_TRANSFER', 'EXTERNAL_PAYMENT_LINK', 'CUSTOM_MANUAL', 'OZOW', 'YOCO', 'PAYFAST', 'SNAPSCAN'] }
  };

  const PAYMENT_METHOD_LABELS = {
    CASH: 'Cash',
    BANK_TRANSFER: 'Bank transfer',
    PAYNOW: 'Paynow',
    OZOW: 'Ozow',
    YOCO: 'Yoco',
    PAYFAST: 'PayFast',
    SNAPSCAN: 'SnapScan',
    EXTERNAL_PAYMENT_LINK: 'External payment link',
    CUSTOM_MANUAL: 'Other manual method'
  };

  function currentMarket() {
    const country = state.financeSettings && String(state.financeSettings.country || '').toUpperCase();
    if (country === 'ZA') return 'SA';
    if (country === 'ZW') return 'ZW';
    return window.location.port === '3001' ? 'SA' : 'ZW';
  }

  function effectiveFinanceSettings() {
    return applyMarketCurrencyForDisplay(state.financeSettings);
  }

  function applyMarketCurrencyForDisplay(settings) {
    const market = currentMarket();
    const marketDefaults = MARKET_DEFAULTS[market] || MARKET_DEFAULTS.ZW;
    const merged = { ...(settings || {}) };
    if (market === 'SA') {
      return {
        ...merged,
        country: 'ZA',
        timezone: merged.timezone || marketDefaults.timezone,
        defaultCurrency: 'ZAR',
        numberFormat: 'en-ZA',
        taxName: merged.taxName || 'VAT',
        allowedCurrencies: marketDefaults.allowedCurrencies,
        allowedPaymentMethods: Array.isArray(merged.allowedPaymentMethods) && merged.allowedPaymentMethods.length ? merged.allowedPaymentMethods : marketDefaults.paymentMethods
      };
    }
    return { ...marketDefaults, ...merged, allowedPaymentMethods: Array.isArray(merged.allowedPaymentMethods) && merged.allowedPaymentMethods.length ? merged.allowedPaymentMethods : marketDefaults.paymentMethods };
  }

  function marketFromCountry(country) {
    return String(country || '').toUpperCase() === 'ZA' ? 'SA' : 'ZW';
  }

  function financeDefaultsForCountry(country) {
    return MARKET_DEFAULTS[marketFromCountry(country)] || MARKET_DEFAULTS.ZW;
  }

  const money = { format(value) { const settings = effectiveFinanceSettings(); const currency = settings.defaultCurrency || 'USD'; const locale = settings.numberFormat || 'en-US'; return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value || 0)); } };
  const receiptMoney = { format(value) { const settings = effectiveFinanceSettings(); const currency = settings.defaultCurrency || 'USD'; const locale = settings.numberFormat || 'en-US'; return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0)); } };

  const tableConfigs = {
    customers: {
      columns: ['Customer', 'Contact', 'Address', 'Jobs', 'Balance'],
      emptyTitle: 'No customers yet',
      emptyText: 'Create your first customer to fill this directory.',
      row: (item) => [item.name, [item.email, item.phone].filter(Boolean).join(' / ') || '-', item.address || '-', (item.jobs || []).length, money.format((item.invoices || []).filter((i) => i.status !== 'PAID').reduce((sum, i) => sum + Number(i.amount || 0), 0))]
    },
    workers: {
      columns: ['Worker', 'Contact', 'Title', 'Status', 'Joined'],
      emptyTitle: 'No workers yet',
      emptyText: 'Create your first worker to fill the team directory.',
      row: (item) => [item.user && item.user.name || 'Worker', [item.user && item.user.email, item.phone].filter(Boolean).join(' / ') || '-', item.title || '-', badge(item.active === false ? 'INACTIVE' : 'ACTIVE'), formatDate(item.createdAt)]
    },
    jobs: {
      columns: ['Job', 'Customer', 'Worker', 'Status', 'SLA', 'Assets', 'Scheduled', 'Total', 'Actions'],
      emptyTitle: 'No jobs yet',
      emptyText: 'Create your first job to populate operations.',
      row: (item) => [item.title, item.customer && item.customer.name || '-', item.worker && item.worker.user && item.worker.user.name || '-', badge(item.status), item.slaStatus ? badge(item.slaStatus) : '-', (item.jobAssets || item.assets || []).length || '-', formatDate(item.scheduledStart), money.format(Number(item.total || 0)), rowActions('jobs', item)]
    },
    assets: {
      columns: ['Asset', 'Customer', 'Type', 'Tag', 'Warranty', 'Status'],
      emptyTitle: 'No assets yet',
      emptyText: 'Create serviceable equipment records for customer sites.',
      row: (item) => [item.name, item.customer && item.customer.name || '-', item.assetType || '-', item.assetTag || item.serialNumber || '-', item.warrantyStatus || warrantyLabel(item), badge(item.status)]
    },
    'service-contracts': {
      columns: ['Contract', 'Customer', 'Status', 'SLA', 'Assets', 'Due Work'],
      emptyTitle: 'No contracts yet',
      emptyText: 'Create maintenance contracts and recurring service entitlements.',
      row: (item) => [item.contractNumber || item.name, item.customer && item.customer.name || '-', badge(item.status), [item.responseSlaHours && item.responseSlaHours + 'h response', item.completionSlaHours && item.completionSlaHours + 'h complete'].filter(Boolean).join(' / ') || '-', (item.assets || []).length || 0, (item.upcomingDueWork || []).length || 0]
    },
    quotes: {
      columns: ['Quote', 'Customer', 'Status', 'Total', 'Valid Until', 'Actions'],
      emptyTitle: 'No quotes yet',
      emptyText: 'Create your first quote to start the pipeline.',
      row: (item) => [item.title, item.customer && item.customer.name || '-', item.deletedAt ? badge('DELETED') : badge(item.status), money.format(Number(item.total || item.amount || 0)), item.deletedAt ? formatDate(item.deleteExpiresAt) : formatDate(item.validUntil), rowActions('quotes', item)]
    },
    invoices: {
      columns: ['Invoice', 'Customer', 'Status', 'Total', 'Balance', 'Due', 'Actions'],
      emptyTitle: 'No invoices yet',
      emptyText: 'Create your first invoice to start billing.',
      row: (item) => [item.number, item.customer && item.customer.name || '-', badge(item.status), money.format(Number(item.total || item.amount || 0)), money.format(Number(item.balanceDue || 0)), formatDate(item.dueDate), rowActions('invoices', item)]
    },
    'booking-requests': {
      columns: ['Customer', 'Contact', 'Service', 'Preferred', 'Status', 'Created', 'Actions'],
      emptyTitle: 'No booking requests yet',
      emptyText: 'Public service requests will appear here.',
      row: (item) => [item.customerName, [item.customerEmail, item.customerPhone].filter(Boolean).join(' / ') || '-', item.service && item.service.name || item.serviceName || '-', [formatDate(item.preferredDate), item.preferredTimeWindow && String(item.preferredTimeWindow).replace(/_/g, ' ')].filter(Boolean).join(' / ') || '-', badge(item.status), formatDate(item.createdAt), rowActions('booking-requests', item)]
    },
    schedule: {
      columns: ['Job', 'Customer', 'Worker', 'Status', 'Start', 'End', 'Conflict'],
      emptyTitle: 'No scheduled work',
      emptyText: 'Schedule jobs to workers to fill this calendar.',
      row: (item) => [item.job && item.job.title || '-', item.job && item.job.customer && item.job.customer.name || '-', item.worker && item.worker.user && item.worker.user.name || '-', badge(item.status), formatDateTime(item.startsAt), formatDateTime(item.endsAt), badge(item.conflictStatus || 'CLEAR')]
    }
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function setStatus(message, ok) {
    const text = String(message == null ? '' : message);
    const isRedundantConnectedState = ok === true && /^Connected(\s+as)?\b/i.test(text);
    document.querySelectorAll('[data-api-status]').forEach((node) => {
      if (isRedundantConnectedState) {
        node.textContent = '';
        node.hidden = true;
        node.classList.remove('red');
        return;
      }
      node.hidden = false;
      node.textContent = text;
      node.classList.toggle('red', ok === false);
    });
  }

  function showToast(message, ok = true) {
    if (window.FieldCoreUI) {
      window.FieldCoreUI.notify(message, { type: ok ? 'success' : 'error' });
      return;
    }
    console[ok ? 'info' : 'error'](message);
  }


  function syncModalScrollLock() {
    document.body.classList.toggle('modal-open', Boolean(document.querySelector('.fc-modal')));
  }

  if (window.MutationObserver) {
    new MutationObserver(syncModalScrollLock).observe(document.body, { childList: true });
  }

  function hasPermission(permission) {
    if (!state.user) return false;
    if (state.user.role === 'OWNER') return true;
    return new Set(state.user.effectivePermissions || []).has(permission);
  }

  function hasAnyPermission(permissions) {
    return (permissions || []).some((permission) => hasPermission(permission));
  }

  function isWorker() {
    return state.user && state.user.role === 'WORKER';
  }

  function setLinkLabel(link, label) {
    if (!link) return;
    const iconNode = link.querySelector('.nav-icon');
    link.textContent = '';
    if (iconNode) link.appendChild(iconNode);
    link.appendChild(document.createTextNode(label));
  }

  function applyRoleUi() {
    document.querySelectorAll('.nav-link').forEach((link) => {
      const href = (link.getAttribute('href') || '').split('/').pop();
      if (href === 'jobs.html') setLinkLabel(link, isWorker() ? 'My Jobs' : 'Jobs');
      if (href === 'schedule.html') setLinkLabel(link, isWorker() ? 'My Schedule' : 'Schedule');
    });
    document.body.classList.toggle('worker-role', Boolean(isWorker()));
    document.querySelectorAll('.quick-card').forEach((node) => {
      node.hidden = !(hasPermission('jobs.create') && hasPermission('jobs.view'));
    });
    document.querySelectorAll('.primary-button').forEach((button) => {
      if (button.closest('form') || !button.textContent.trim().toLowerCase().startsWith('+ new ')) return;
      const resource = createResourceForButton(button);
      const permission = createPermission(resource);
      if (permission) button.hidden = !hasPermission(permission);
    });
    if (!isWorker()) return;
    const title = document.querySelector('h1, h2');
    const copy = title && title.parentElement ? title.parentElement.querySelector('p') : null;
    if (page === 'jobs') {
      if (title) title.textContent = 'My Jobs';
      if (copy) copy.textContent = 'Your assigned work for today and upcoming jobs.';
    }
    if (page === 'schedule') {
      if (title) title.textContent = 'My Schedule';
      if (copy) copy.textContent = 'Your assigned schedule.';
    }
  }
  function renderWorkerAccessDenied() {
    const pageEl = document.querySelector('.page') || document.querySelector('.page-mount');
    if (!pageEl) return;
    pageEl.innerHTML = '<h2>Worker Workspace</h2><p>Use Dashboard, My Jobs, or My Schedule for assigned work.</p><div class=empty-state><div><strong>This area is for admin users.</strong><span>No admin data was loaded.</span></div></div>';
  }

  async function api(path, options) {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options && options.headers) },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error && payload.error.message || `HTTP ${response.status}`);
      error.details = payload.error && payload.error.details;
      error.status = response.status;
      throw error;
    }
    return payload.data;
  }


  function defaultBranding() {
    return {
      brandName: 'FieldCore',
      logoUrl: '',
      primaryColor: '#2363ff',
      secondaryColor: '#263ff1',
      accentColor: '#12a96d',
      supportEmail: '',
      supportPhone: '',
      websiteUrl: '',
      invoiceFooter: '',
      invoiceTerms: ''
    };
  }

  function currentBranding() {
    return { ...defaultBranding(), ...(state.branding || {}) };
  }

  function initials(value) {
    return String(value || 'FC').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'FC';
  }

  function applyBranding() {
    const branding = currentBranding();
    const name = branding.brandName || state.profile && (state.profile.tradingName || state.profile.name) || 'FieldCore';
    document.documentElement.style.setProperty('--blue', branding.primaryColor || '#2363ff');
    document.documentElement.style.setProperty('--blue2', branding.secondaryColor || '#263ff1');
    document.documentElement.style.setProperty('--green', branding.accentColor || '#12a96d');
    document.querySelectorAll('.brand-name').forEach((node) => { node.textContent = name; });
    document.querySelectorAll('.brand-mark').forEach((node) => {
      if (branding.logoUrl) node.innerHTML = `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(name)} logo">`;
      else node.textContent = initials(name);
    });
    if (page === 'dashboard') {
      const heading = document.querySelector('.hero-copy h2');
      if (heading) heading.textContent = `Good morning, ${name}.`;
    }
    if (page === 'quotes' || page === 'invoices') {
      const copy = document.querySelector('.hero-copy p');
      if (copy && branding.supportEmail) copy.textContent = `${name} documents use ${branding.supportEmail} for customer replies.`;
    }
    updateBrandingPreview();
  }

  async function loadCompanyBranding() {
    try {
      const [profile, branding] = await Promise.all([api('/company/profile'), api('/company/branding')]);
      state.profile = profile;
      state.branding = branding;
      applyBranding();
      populateBrandingForm();
    } catch (error) {
      state.branding = defaultBranding();
      applyBranding();
    }
  }

  function setFieldValue(selector, value) {
    const field = document.querySelector(selector);
    if (field) field.value = value || '';
  }

  function populateBrandingForm() {
    if (!document.querySelector('[data-branding-form]')) return;
    const profile = state.profile || {};
    const branding = currentBranding();
    document.querySelectorAll('[data-profile-field]').forEach((field) => { field.value = profile[field.dataset.profileField] || ''; });
    document.querySelectorAll('[data-branding-field]').forEach((field) => { field.value = branding[field.dataset.brandingField] || ''; });
    setFieldValue('[data-branding-field="primaryColor"]', branding.primaryColor || '#2363ff');
    setFieldValue('[data-branding-field="secondaryColor"]', branding.secondaryColor || '#263ff1');
    updateBrandingPreview();
  }

  function updateBrandingPreview() {
    const branding = currentBranding();
    const nameInput = document.querySelector('[data-branding-field="brandName"]');
    const companyInput = document.querySelector('[data-profile-field="name"]');
    const logoInput = document.querySelector('[data-branding-field="logoUrl"]');
    const colorInput = document.querySelector('[data-branding-field="primaryColor"]');
    const footerInput = document.querySelector('[data-branding-field="invoiceFooter"]');
    const name = nameInput && nameInput.value || companyInput && companyInput.value || branding.brandName || 'FieldCore';
    const logoUrl = logoInput && logoInput.value || branding.logoUrl;
    const primaryColor = colorInput && colorInput.value || branding.primaryColor || '#2363ff';
    const footer = footerInput && footerInput.value || branding.invoiceFooter || 'Invoice footer preview will appear here.';
    const title = document.querySelector('[data-preview-title]');
    const logo = document.querySelector('[data-preview-logo]');
    const bar = document.querySelector('[data-preview-bar]');
    const footerText = document.querySelector('[data-preview-footer-text]');
    if (title) title.textContent = name;
    if (logo) logo.innerHTML = logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(name)} logo">` : initials(name);
    if (bar) bar.style.background = primaryColor;
    if (footerText) footerText.textContent = footer;
  }

  function formPayload(selector) {
    const payload = {};
    document.querySelectorAll(selector).forEach((field) => {
      payload[field.name] = field.value || '';
    });
    return payload;
  }
  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function formatReceiptDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function badge(value) {
    const normalized = String(value || '').toLowerCase();
    const color = normalized.includes('overdue') || normalized.includes('reject') || normalized.includes('cancel') ? 'red' : normalized.includes('progress') || normalized.includes('sent') || normalized.includes('scheduled') ? 'orange' : normalized.includes('draft') || normalized.includes('new') ? 'gray' : 'blue';
    return `<span class="badge ${color}">${escapeHtml(String(value || '-').replace(/_/g, ' '))}</span>`;
  }

  function warrantyLabel(item) {
    if (!item || !item.warrantyEndAt) return '-';
    return new Date(item.warrantyEndAt) >= new Date() ? 'Active until ' + formatDate(item.warrantyEndAt) : 'Expired';
  }


  function rowActionItems(resource, item) {
    const actions = [];
    const add = (label, action, primary, permission) => {
      if (!permission || hasPermission(permission)) actions.push({ label, action, primary: Boolean(primary) });
    };
    if (resource === 'quotes') {
      const status = String(item.status || '').toUpperCase();
      if (item.deletedAt) {
        add('Restore', 'quote-restore', true, 'quotes.edit');
      } else {
        if (status === 'DRAFT') add('Send', 'quote-send', true, 'quotes.send');
        if (status === 'SENT') add('Accept', 'quote-accept', true, 'quotes.edit');
        if (status === 'SENT') add('Reject', 'quote-reject', false, 'quotes.edit');
        if (status === 'REJECTED') add('Reverse Rejection', 'quote-reverse-rejection', true, 'quotes.edit');
        add('Delete', 'quote-delete', false, 'quotes.edit');
      }
    }
    if (resource === 'jobs') add('Details', 'job-detail', true, 'jobs.view');
    if (resource === 'jobs' && item.status !== 'COMPLETED' && item.status !== 'CANCELLED') add(item.scheduledStart ? 'Reschedule' : 'Schedule', item.scheduledStart ? 'job-reschedule' : 'job-schedule', false, 'schedule.manage');
    if (resource === 'jobs' && item.scheduledStart && item.status !== 'COMPLETED' && item.status !== 'CANCELLED') add('Unschedule', 'job-unschedule', false, 'schedule.manage');
    if (resource === 'jobs' && item.status === 'COMPLETED') add('Invoice', 'job-invoice', false, 'invoices.create');
    if (resource === 'booking-requests') {
      const quoteAlreadySent = /quote has been sent/i.test(String(item.customerFacingMessage || ''));
      add('View', 'booking-view', true, 'bookings.view');
      if (item.status === 'NEW') add('Mark Reviewed', 'booking-review', false, 'bookings.manage');
      if (item.status !== 'CONVERTED' && item.status !== 'DECLINED') add('Decline', 'booking-decline', false, 'bookings.manage');
      if (item.status !== 'CONVERTED' && item.status !== 'DECLINED') add('Convert to Job', 'booking-convert', false, 'bookings.manage');
      if (item.status !== 'CONVERTED' && item.status !== 'DECLINED' && !quoteAlreadySent) add('Create Quote', 'booking-quote', false, 'bookings.manage');
    }
    if (resource === 'invoices') {
      const status = String(item.status || '').toUpperCase();
      const hasReceipts = Array.isArray(item.receipts) && item.receipts.length > 0;
      if (status === 'DRAFT') add('Send', 'invoice-send', false, 'invoices.send');
      if (status !== 'PAID' && status !== 'VOID') add('Record Payment', 'invoice-pay', false, 'payments.manage');
      if (hasReceipts) add(status === 'PARTIALLY_PAID' || item.receipts.length > 1 ? 'View Receipts' : 'View Receipt', 'invoice-receipts', status === 'PAID', 'payments.view');
      if (status !== 'VOID' && status !== 'PAID') add('Void', 'invoice-void', false, 'invoice.void');
    }
    return actions;
  }

  function rowActionButton(action, id) {
    return '<button class="' + (action.primary ? 'primary-button' : 'secondary-button') + ' compact" type="button" data-row-action="' + escapeHtml(action.action) + '" data-id="' + escapeHtml(id) + '">' + escapeHtml(action.label) + '</button>';
  }

  function rowActions(resource, item) {
    if (isWorker()) {
      return resource === 'jobs' ? workerJobActions(item, true) : '';
    }
    const actions = rowActionItems(resource, item);
    if (!actions.length) return '<span class="muted">-</span>';
    return '<div class="row-actions"><button class="secondary-button compact action-menu-button" type="button" data-row-action-menu="' + escapeHtml(resource) + '" data-id="' + escapeHtml(item.id) + '">Actions</button></div>';
  }

  function actionMenuTitle(resource) {
    return {
      jobs: 'Job Actions',
      quotes: 'Quote Actions',
      invoices: 'Invoice Actions',
      'booking-requests': 'Booking Request Actions'
    }[resource] || 'Actions';
  }

  function actionMenuSubtitle(resource, item) {
    if (resource === 'jobs') return item.title || 'Job';
    if (resource === 'quotes') return item.title || 'Quote';
    if (resource === 'invoices') return item.number || 'Invoice';
    if (resource === 'booking-requests') return item.customerName || item.publicReference || 'Booking request';
    return 'Select an action';
  }

  function openRowActionMenu(resource, item) {
    const actions = rowActionItems(resource, item);
    if (!actions.length) return;
    closeModal();
    const modal = document.createElement('div');
    modal.className = 'fc-modal';
    modal.dataset.actionMenuModal = 'true';
    modal.innerHTML = '<div class="fc-dialog action-menu-dialog"><div class="panel-head"><div><h3>' + escapeHtml(actionMenuTitle(resource)) + '</h3><p class="modal-copy">' + escapeHtml(actionMenuSubtitle(resource, item)) + '</p></div><button class="icon-button" type="button" data-close>&times;</button></div><div class="action-menu-list">' + actions.map((action) => rowActionButton(action, item.id)).join('') + '</div></div>';
    modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-close]')) closeModal(); });
    document.body.appendChild(modal);
  }

  function setStats(values) {
    document.querySelectorAll('.stat-card').forEach((card, index) => {
      if (!values[index]) return;
      const label = card.querySelector('.stat-label');
      const value = card.querySelector('.stat-value');
      const trend = card.querySelector('.trend');
      if (label && values[index].label) label.textContent = values[index].label;
      if (value) value.textContent = values[index].value;
      if (trend && values[index].trend) trend.textContent = values[index].trend;
    });
  }

  function scheduleDayIndex(value) {
    const day = new Date(value).getDay();
    return day === 0 ? 6 : day - 1;
  }

  function startOfDay(date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function startOfWeek(date) {
    return addDays(startOfDay(date), -scheduleDayIndex(date));
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function endOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  function dateKey(value) {
    const date = new Date(value);
    const pad = (number) => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function scheduleRange() {
    if (state.scheduleView === 'day') {
      const start = startOfDay(state.scheduleDate);
      return { start, end: addDays(start, 1) };
    }
    if (state.scheduleView === 'month') {
      const start = startOfMonth(state.scheduleDate);
      return { start, end: addDays(endOfMonth(state.scheduleDate), 1) };
    }
    const start = startOfWeek(state.scheduleDate);
    return { start, end: addDays(start, 7) };
  }

  function formatShortDate(date) {
    return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function scheduleRangeLabel(range) {
    if (state.scheduleView === 'day') return new Date(range.start).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    if (state.scheduleView === 'month') return new Date(range.start).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return `${formatShortDate(range.start)} - ${formatShortDate(addDays(range.end, -1))}`;
  }

  function hourLabel(hour) {
    const normalized = ((hour % 24) + 24) % 24;
    if (normalized === 0) return '12 AM';
    if (normalized < 12) return normalized + ' AM';
    if (normalized === 12) return '12 PM';
    return (normalized - 12) + ' PM';
  }

  function minutesFromTime(value) {
    const parts = String(value || '00:00').split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }

  function scheduleHours(settings) {
    const start = Math.floor(minutesFromTime(settings && settings.workingDayStart || '08:00') / 60);
    const end = Math.ceil(minutesFromTime(settings && settings.workingDayEnd || '17:00') / 60);
    const safeStart = Math.max(0, Math.min(23, start));
    const safeEnd = Math.max(safeStart + 1, Math.min(24, end));
    return Array.from({ length: safeEnd - safeStart + 1 }, (_, index) => safeStart + index);
  }

  function scheduleRowIndex(value, hours) {
    const hour = new Date(value).getHours();
    if (!hours.length) return 0;
    if (hour <= hours[0]) return 0;
    if (hour >= hours[hours.length - 1]) return hours.length - 1;
    return hour - hours[0];
  }

  function scheduleVisibleDays(range) {
    if (state.scheduleView === 'day') return [startOfDay(state.scheduleDate)];
    if (state.scheduleView === 'month') {
      const first = startOfWeek(startOfMonth(state.scheduleDate));
      return Array.from({ length: 42 }, (_, index) => addDays(first, index));
    }
    return Array.from({ length: 7 }, (_, index) => addDays(range.start, index));
  }

  function scheduleDayLabel(date) {
    if (state.scheduleView === 'month') return String(new Date(date).getDate());
    return new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function buildScheduleGrid(grid, settings, range) {
    const visibleDays = scheduleVisibleDays(range);
    const hours = scheduleHours(settings);
    const columns = visibleDays.length;
    grid.dataset.scheduleMode = state.scheduleView;
    grid.style.gridTemplateColumns = state.scheduleView === 'month' ? 'repeat(7, minmax(120px, 1fr))' : `92px repeat(${columns}, minmax(140px, 1fr))`;
    if (state.scheduleView === 'month') {
      const weekdayHeads = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => `<div class="schedule-head">${day}</div>`).join('');
      grid.innerHTML = weekdayHeads + visibleDays.map((day) => `<div class="schedule-cell month-cell" data-date="${dateKey(day)}"><strong class="month-day">${scheduleDayLabel(day)}</strong></div>`).join('');
      return { hours, visibleDays };
    }
    grid.innerHTML = '<div class="schedule-head">Time</div>' + visibleDays.map((day) => `<div class="schedule-head">${scheduleDayLabel(day)}</div>`).join('') + hours.map((hour) => '<div class="time-cell">' + hourLabel(hour) + '</div>' + visibleDays.map((day) => `<div class="schedule-cell" data-date="${dateKey(day)}" data-hour="${hour}"></div>`).join('')).join('');
    return { hours, visibleDays };
  }

  function eventTone(item) {
    const sla = String(item.job && item.job.slaStatus || '').toLowerCase();
    if (sla.includes('breach')) return 'red';
    if (sla.includes('risk')) return 'orange';
    const status = String(item.conflictStatus || item.status || '').toLowerCase();
    if (status.includes('conflict') || status.includes('override')) return 'orange';
    if (status.includes('complete')) return 'green';
    return '';
  }

  function scheduleItemMatchesFilters(item) {
    const filters = state.scheduleFilters || {};
    if (filters.workerId && item.workerId !== filters.workerId) return false;
    if (filters.status) {
      const status = item.job && item.job.status || item.status;
      if (status !== filters.status) return false;
    }
    return true;
  }

  function renderSchedule(data, settings) {
    const card = document.querySelector('.table-card');
    const grid = document.querySelector('.schedule-grid');
    if (!card || !grid) return;
    const range = scheduleRange();
    const scheduleData = (data || []).filter(scheduleItemMatchesFilters).filter((item) => {
      const startsAt = item.startsAt && new Date(item.startsAt);
      return startsAt && startsAt >= range.start && startsAt < range.end;
    });
    const built = buildScheduleGrid(grid, settings, range);
    const hours = built.hours;
    const cells = Array.from(grid.querySelectorAll('.schedule-cell'));
    const empty = card.querySelector('.empty-state');
    const rangeHead = document.querySelector('[data-schedule-range]');
    const toolbarRange = document.querySelector('[data-schedule-toolbar-range]');
    const count = document.querySelector('[data-schedule-count]');
    const label = scheduleRangeLabel(range);
    if (rangeHead) rangeHead.textContent = label;
    if (toolbarRange) toolbarRange.textContent = label;
    if (count) count.textContent = `${scheduleData.length} ${scheduleData.length === 1 ? 'job' : 'jobs'}`;
    document.querySelectorAll('[data-schedule-view]').forEach((tab) => tab.classList.toggle('active', tab.dataset.scheduleView === state.scheduleView));
    if (empty) empty.hidden = scheduleData.length > 0;
    scheduleData.forEach((item) => {
      if (!item.startsAt) return;
      const key = dateKey(item.startsAt);
      const row = scheduleRowIndex(item.startsAt, hours);
      const cell = state.scheduleView === 'month'
        ? grid.querySelector(`.schedule-cell[data-date="${key}"]`)
        : grid.querySelector(`.schedule-cell[data-date="${key}"][data-hour="${hours[row]}"]`);
      if (!cell) return;
      const title = item.job && item.job.title || 'Scheduled job';
      const worker = item.worker && item.worker.user && item.worker.user.name || 'Unassigned';
      const conflict = item.conflictStatus && item.conflictStatus !== 'CLEAR' ? ' - ' + item.conflictStatus.replace(/_/g, ' ') : '';
      const event = document.createElement('div');
      event.className = ['event', eventTone(item)].filter(Boolean).join(' ');
      event.innerHTML = `<strong>${escapeHtml(title)}</strong><small>${escapeHtml(formatDateTime(item.startsAt))} - ${escapeHtml(worker)}${escapeHtml(conflict)}</small>`;
      cell.appendChild(event);
    });
    const footer = card.querySelector('.table-footer');
    if (footer) footer.remove();
  }

  function itemMatchesListFilter(resource, item, filter) {
    if (!filter || filter === 'all') return true;
    if (resource === 'jobs' && filter === 'ON_HOLD') return ['ON_HOLD', 'PAUSED'].includes(String(item.status || '').toUpperCase());
    if (resource === 'invoices' && filter === 'UNPAID') return !['PAID', 'VOID', 'DRAFT'].includes(String(item.status || '').toUpperCase());
    if (resource === 'invoices' && filter === 'OVERDUE') {
      const status = String(item.status || '').toUpperCase();
      const due = item.dueDate && new Date(item.dueDate);
      return status === 'OVERDUE' || (!['PAID', 'VOID', 'DRAFT'].includes(status) && due && due < new Date());
    }
    return String(item.status || '').toUpperCase() === filter;
  }

  function filteredListData(resource, data) {
    return (data || []).filter((item) => itemMatchesListFilter(resource, item, state.listFilters[resource]));
  }

  function setupStatusTabs(resource, data) {
    document.querySelectorAll('[data-status-filter]').forEach((tab) => {
      tab.classList.toggle('active', (state.listFilters[resource] || 'all') === tab.dataset.statusFilter);
      tab.onclick = () => {
        state.listFilters[resource] = tab.dataset.statusFilter || 'all';
        renderTable(resource, filteredListData(resource, data));
        setupStatusTabs(resource, data);
      };
    });
  }


  function assetsForSelectedCustomer(data) {
    const select = document.querySelector('[data-asset-customer-filter]');
    const customerId = select && select.value;
    if (!customerId) return data || [];
    return (data || []).filter((item) => item.customerId === customerId || item.customer && item.customer.id === customerId);
  }

  function setupAssetCustomerFilter(data) {
    if (page !== 'assets') return;
    const select = document.querySelector('[data-asset-customer-filter]');
    const details = document.querySelector('[data-selected-customer-assets]');
    if (!select) return;
    if (!select.dataset.ready) {
      select.innerHTML = '<option value="">All customers</option>' + (state.customers || []).map((customer) => '<option value="' + escapeHtml(customer.id) + '">' + escapeHtml(customer.name || customer.email || customer.id) + '</option>').join('');
      select.dataset.ready = 'true';
      select.addEventListener('change', () => {
        const filtered = assetsForSelectedCustomer(state.assets || []);
        renderTable('assets', filtered);
        setupAssetCustomerFilter(state.assets || []);
      });
    }
    const customer = (state.customers || []).find((item) => item.id === select.value);
    const filtered = assetsForSelectedCustomer(data);
    if (details) {
      if (!customer) {
        details.innerHTML = '<div class="list-item"><span class="initials">ALL</span><div><strong>All customer assets</strong><small>Select a customer to open a focused asset view.</small></div><span class="badge gray">' + filtered.length + ' assets</span></div>';
      } else {
        details.innerHTML = '<div class="list-item"><span class="initials">' + escapeHtml((customer.name || 'CU').slice(0,2).toUpperCase()) + '</span><div><strong>' + escapeHtml(customer.name || 'Customer') + '</strong><small>' + escapeHtml([customer.email, customer.phone, customer.address].filter(Boolean).join(' · ') || 'Customer asset page') + '</small></div><span class="badge gray">' + filtered.length + ' assets</span></div>';
      }
    }
  }

  function renderTable(resource, data) {
    const config = tableConfigs[resource];
    const card = document.querySelector('.table-card');
    if (!card || !config) return;
    if (!data.length) {
      card.innerHTML = `<div class="empty-state"><div><strong>${config.emptyTitle}</strong><span>${config.emptyText}</span></div></div><footer class="table-footer"><span>Showing 0 ${resource}</span><div class="pager"><span class="page-dot active">1</span></div></footer>`;
      if (resource === 'booking-requests') updateBookingRequestStats(data);
      return;
    }
    const rows = data.map((item) => `<tr>${config.row(item).map((cell) => `<td>${String(cell).startsWith('<span') || String(cell).startsWith('<div') ? cell : escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
    card.innerHTML = `<div class="table-scroll"><table><thead><tr>${config.columns.map((name) => `<th>${escapeHtml(name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div><footer class="table-footer"><span>Showing ${data.length} ${resource}</span><div class="pager"><span class="page-dot active">1</span></div></footer>`;
    if (resource === 'booking-requests') updateBookingRequestStats(data);
  }

  function setScheduleFilterOptions() {
    const workerSelect = document.querySelector('[data-schedule-worker-filter]');
    if (workerSelect) {
      const previous = workerSelect.value || state.scheduleFilters.workerId || '';
      workerSelect.innerHTML = optionList(state.workers || [], 'All workers');
      workerSelect.value = previous;
    }
    const statusSelect = document.querySelector('[data-schedule-status-filter]');
    if (statusSelect) statusSelect.value = state.scheduleFilters.status || '';
  }

  function rerenderSchedule() {
    renderSchedule(state.schedule || [], state.scheduleSettings || { workingDayStart: '08:00', workingDayEnd: '17:00' });
  }

  function setupScheduleControls() {
    if (page !== 'schedule') return;
    setScheduleFilterOptions();
    document.querySelectorAll('[data-schedule-view]').forEach((button) => {
      button.onclick = () => {
        state.scheduleView = button.dataset.scheduleView || 'week';
        rerenderSchedule();
      };
    });
    const today = document.querySelector('[data-schedule-today]');
    if (today) today.onclick = () => {
      state.scheduleDate = new Date();
      rerenderSchedule();
    };
    const previous = document.querySelector('[data-schedule-prev]');
    if (previous) previous.onclick = () => {
      state.scheduleDate = state.scheduleView === 'month'
        ? new Date(state.scheduleDate.getFullYear(), state.scheduleDate.getMonth() - 1, 1)
        : addDays(state.scheduleDate, state.scheduleView === 'day' ? -1 : -7);
      rerenderSchedule();
    };
    const next = document.querySelector('[data-schedule-next]');
    if (next) next.onclick = () => {
      state.scheduleDate = state.scheduleView === 'month'
        ? new Date(state.scheduleDate.getFullYear(), state.scheduleDate.getMonth() + 1, 1)
        : addDays(state.scheduleDate, state.scheduleView === 'day' ? 1 : 7);
      rerenderSchedule();
    };
    const toggle = document.querySelector('[data-schedule-filter]');
    const panel = document.querySelector('[data-schedule-filters]');
    if (toggle && panel) toggle.onclick = () => { panel.hidden = !panel.hidden; };
    const form = document.querySelector('[data-schedule-filters]');
    if (form) form.onsubmit = (event) => {
      event.preventDefault();
      state.scheduleFilters = Object.fromEntries(new FormData(form).entries());
      rerenderSchedule();
    };
    const clear = document.querySelector('[data-schedule-clear-filters]');
    if (clear && form) clear.onclick = () => {
      form.reset();
      state.scheduleFilters = { workerId: '', status: '' };
      rerenderSchedule();
    };
  }

  function renderDashboard(data) {
    if ((state.user && state.user.role === 'WORKER') || data.role === 'WORKER') {
      renderWorkerDashboard(data);
      return;
    }
    const totals = data.totals || {};
    setStats([
      { label: 'Jobs Today', value: totals.jobsToday || 0, trend: totals.jobsToday ? 'Scheduled today' : 'No jobs scheduled' },
      { label: 'Revenue MTD', value: money.format(totals.revenueMonthToDate || 0), trend: 'Month to date' },
      { label: 'Unpaid Invoices', value: money.format(totals.unpaidInvoices || 0), trend: totals.unpaidInvoices ? 'Outstanding' : 'Nothing outstanding' },
      { label: 'Active Workers', value: totals.activeWorkers || 0, trend: totals.activeWorkers ? 'Available workers' : 'No workers online' }
    ]);

    fillPanel("Today's Schedule", data.schedule || [], (item) => [item.job && item.job.title || 'Scheduled job', formatDateTime(item.startsAt)]);
    fillPanel('Worker Status', data.workers || [], (item) => [item.user && item.user.name || 'Worker', item.active ? 'Active' : 'Inactive']);
    fillPanel('Recent Jobs', data.recentJobs || [], (item) => [item.title, `${item.customer && item.customer.name || '-'} - ${String(item.status || '').replace(/_/g, ' ')}`]);
    const pipeline = data.pipeline || {};
    fillPanel('Pipeline', [
      { name: 'Leads', value: pipeline.leads || 0 },
      { name: 'Quoted', value: pipeline.quoted || 0 },
      { name: 'Won', value: pipeline.won || 0 }
    ], (item) => [item.name, `${item.value} records`]);
  }

  function reportQueryFromForm() {
    const form = document.querySelector('[data-report-filters]');
    const params = new URLSearchParams();
    if (!form) return params;
    ['period', 'startDate', 'endDate', 'serviceId', 'workerId', 'customerId'].forEach((name) => {
      const field = form.elements[name];
      if (field && field.value) params.set(name, field.value);
    });
    return params;
  }

  function reportOptionList(items, label, selected) {
    return '<option value="">' + escapeHtml(label) + '</option>' + (items || []).map((item) => '<option value="' + escapeHtml(item.id) + '"' + (selected === item.id ? ' selected' : '') + '>' + escapeHtml(item.name || item.id) + '</option>').join('');
  }

  function reportTable(columns, rows, emptyText) {
    if (!rows || !rows.length) return '<div class="empty-state compact-empty"><div><strong>' + escapeHtml(emptyText || 'No data for this range.') + '</strong></div></div>';
    return '<div class="table-scroll report-table-scroll report-table-panel"><table><thead><tr>' + columns.map((column) => '<th>' + escapeHtml(column.label) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((row) => '<tr>' + columns.map((column) => '<td>' + (column.html ? column.value(row) : escapeHtml(column.value(row))) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  }

  function reportValue(value, formatter) {
    if (formatter) return formatter(value);
    if (value == null || value === '') return '-';
    return String(value);
  }

  function reportMetricCard(label, value, trend) {
    return '<article class="card stat-card report-metric-card"><div class="stat-label">' + escapeHtml(label) + '</div><div class="stat-value">' + escapeHtml(value) + '</div><div class="trend">' + escapeHtml(trend || '') + '</div></article>';
  }

  function reportPanel(title, body, meta) {
    return '<section class="panel report-insight-card"><div class="panel-head"><h3>' + escapeHtml(title) + '</h3>' + (meta ? '<span class="badge gray">' + escapeHtml(meta) + '</span>' : '') + '</div>' + body + '</section>';
  }

  function reportRows(rows) {
    return Array.isArray(rows) ? rows.filter(Boolean) : [];
  }

  function reportMax(rows, valueKey) {
    return Math.max(0, ...reportRows(rows).map((row) => Number(row[valueKey] || 0)));
  }

  function reportBarChart(title, rows, labelKey, valueKey, formatter) {
    const items = reportRows(rows).slice(0, 10);
    if (!items.length) return reportPanel(title, '<div class="empty-state compact-empty"><div><strong>No chart data yet.</strong></div></div>');
    const max = reportMax(items, valueKey) || 1;
    const bars = items.map((item) => {
      const raw = Number(item[valueKey] || 0);
      const width = Math.max(4, Math.round((raw / max) * 100));
      return '<div class="report-bar-row"><span>' + escapeHtml(item[labelKey] || 'Unknown') + '</span><div class="report-bar-track"><i style="width:' + width + '%"></i></div><strong>' + escapeHtml(reportValue(raw, formatter)) + '</strong></div>';
    }).join('');
    return reportPanel(title, '<div class="report-chart report-bar-chart">' + bars + '</div>');
  }

  function reportLineChart(title, rows, labelKey, valueKey, formatter) {
    const items = reportRows(rows).slice(-20);
    if (!items.length) return reportPanel(title, '<div class="empty-state compact-empty"><div><strong>No trend data yet.</strong></div></div>');
    const values = items.map((item) => Number(item[valueKey] || 0));
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const spread = max - min || 1;
    const points = items.map((item, index) => {
      const x = items.length === 1 ? 50 : Math.round((index / (items.length - 1)) * 100);
      const y = Math.round(90 - (((Number(item[valueKey] || 0) - min) / spread) * 70));
      return x + ',' + y;
    }).join(' ');
    const last = items[items.length - 1];
    const first = items[0];
    const dots = items.map((item, index) => {
      const [x, y] = points.split(' ')[index].split(',');
      return '<circle cx="' + x + '" cy="' + y + '" r="2"><title>' + escapeHtml(item[labelKey] + ': ' + reportValue(item[valueKey], formatter)) + '</title></circle>';
    }).join('');
    return reportPanel(title, '<div class="report-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img"><polyline points="' + points + '"></polyline>' + dots + '</svg><div class="report-chart-footer"><span>' + escapeHtml(first[labelKey] || '') + '</span><strong>' + escapeHtml(reportValue(last[valueKey], formatter)) + '</strong><span>' + escapeHtml(last[labelKey] || '') + '</span></div></div>');
  }

  function reportPieChart(title, rows, labelKey, valueKey, formatter) {
    const items = reportRows(rows).filter((item) => Number(item[valueKey] || 0) > 0).slice(0, 6);
    const total = items.reduce((sum, item) => sum + Number(item[valueKey] || 0), 0);
    if (!items.length || !total) return reportPanel(title, '<div class="empty-state compact-empty"><div><strong>No split data yet.</strong></div></div>');
    let offset = 0;
    const slices = items.map((item, index) => {
      const value = Number(item[valueKey] || 0);
      const pctValue = (value / total) * 100;
      const slice = '<circle class="report-pie-slice segment-' + (index % 6) + '" r="15.915" cx="20" cy="20" stroke-dasharray="' + pctValue.toFixed(3) + ' ' + (100 - pctValue).toFixed(3) + '" stroke-dashoffset="-' + offset.toFixed(3) + '"><title>' + escapeHtml(item[labelKey] + ': ' + reportValue(value, formatter)) + '</title></circle>';
      offset += pctValue;
      return slice;
    }).join('');
    const legend = items.map((item, index) => '<li><i class="segment-' + (index % 6) + '"></i><span>' + escapeHtml(item[labelKey] || 'Unknown') + '</span><strong>' + escapeHtml(reportValue(item[valueKey], formatter)) + '</strong></li>').join('');
    return reportPanel(title, '<div class="report-chart report-pie-chart"><svg viewBox="0 0 40 40" role="img"><circle class="report-pie-bg" r="15.915" cx="20" cy="20"></circle>' + slices + '</svg><ul class="report-legend">' + legend + '</ul></div>');
  }

  function reportFunnelChart(title, rows) {
    return reportBarChart(title, reportRows(rows).map((row) => ({ name: row.name || row.label, value: row.value || row.count || 0 })), 'name', 'value', (value) => String(value));
  }

  function reportExportHref(section, filters) {
    const params = new URLSearchParams();
    ['period', 'startDate', 'endDate', 'serviceId', 'workerId', 'customerId'].forEach((name) => {
      const value = filters && filters[name];
      if (value) params.set(name, String(value).slice(0, name.endsWith('Date') ? 10 : undefined));
    });
    params.set('section', section);
    return '/api/reports/export?' + params.toString();
  }

  function reportViewOptions(data) {
    const allowed = new Set(data.allowedReports || []);
    const views = [];
    if (allowed.has('money')) {
      views.push(['revenue', 'Money received']);
      views.push(['unpaid-invoices', 'Unpaid invoices']);
    }
    if (allowed.has('work')) views.push(['completed-jobs', 'Jobs']);
    if (allowed.has('workers')) views.push(['worker-performance', 'Workers']);
    if (allowed.has('sales')) {
      views.push(['service-popularity', 'Services']);
      views.push(['quote-conversion', 'Quotes']);
      views.push(['customer-analytics', 'Customers']);
    }
    if (allowed.has('stock')) views.push(['stock-value', 'Stock value']);
    return views;
  }

  function renderReportFilters(data) {
    const filters = data.filters || {};
    const options = data.options || {};
    const allowed = new Set(data.allowedReports || []);
    const fields = [
      '<div class="field"><label for="reportPeriod">Time period</label><select id="reportPeriod" name="period"><option value="last30days">Last 30 days</option><option value="today">Today</option><option value="thisWeek">This week</option><option value="thisMonth">This month</option><option value="lastMonth">Last month</option><option value="thisYear">This year</option><option value="custom">Choose dates</option></select></div>',
      '<div class="field"><label for="reportStart">Start date</label><input id="reportStart" name="startDate" type="date"></div>',
      '<div class="field"><label for="reportEnd">End date</label><input id="reportEnd" name="endDate" type="date"></div>'
    ];
    if ((allowed.has('money') || allowed.has('work') || allowed.has('sales')) && (options.services || []).length) {
      fields.push('<div class="field"><label for="reportService">Service</label><select id="reportService" name="serviceId">' + reportOptionList(options.services, 'All services', filters.serviceId) + '</select></div>');
    }
    if ((allowed.has('work') || allowed.has('workers')) && (options.workers || []).length) {
      fields.push('<div class="field"><label for="reportWorker">Worker</label><select id="reportWorker" name="workerId">' + reportOptionList(options.workers, 'All workers', filters.workerId) + '</select></div>');
    }
    if ((allowed.has('money') || allowed.has('work') || allowed.has('sales')) && (options.customers || []).length) {
      fields.push('<div class="field"><label for="reportCustomer">Customer</label><select id="reportCustomer" name="customerId">' + reportOptionList(options.customers, 'All customers', filters.customerId) + '</select></div>');
    }

    const actions = ['<button class="primary-button" type="submit">Show reports</button>'];
    if (data.canExport && allowed.has('money')) {
      actions.push('<a class="secondary-button" href="' + escapeHtml(reportExportHref('revenue', filters)) + '">Download revenue</a>');
      actions.push('<a class="secondary-button" href="' + escapeHtml(reportExportHref('invoices', filters)) + '">Download unpaid invoices</a>');
    }
    if (data.canExport && (allowed.has('work') || allowed.has('workers'))) {
      actions.push('<a class="secondary-button" href="' + escapeHtml(reportExportHref('jobs', filters)) + '">Download job report</a>');
    }

    return '<form class="panel form-grid report-filters" data-report-filters>' + fields.join('') + '<div class="form-actions span-2">' + actions.join('') + '</div><p class="fc-form-error span-2" data-report-message hidden></p></form>';
  }

  function renderReportSwitcher(data) {
    const views = reportViewOptions(data);
    if (views.length <= 1) return '';
    return '<div class="report-switcher"><label for="reportView">Choose a report</label><select id="reportView" data-report-view>' + views.map(([key, label]) => '<option value="' + escapeHtml(key) + '"' + (state.activeReportTab === key ? ' selected' : '') + '>' + escapeHtml(label) + '</option>').join('') + '</select></div>';
  }

  function renderOverviewReport(data) {
    const overview = data.overview || {};
    const revenue = data.revenue || {};
    const quotes = data.quotes || {};
    const urgent = overview.urgentItems || {};
    const urgentRows = [
      { label: 'Overdue unpaid invoices', value: urgent.overdueUnpaidInvoices || 0 },
      { label: 'In-progress jobs', value: urgent.inProgressJobs || 0 },
      { label: 'Rejected quotes', value: urgent.rejectedQuotes || 0 }
    ];
    return '<section class="report-section"><div class="report-kpi-row">' +
      reportMetricCard('Paid revenue', money.format(overview.totalRevenue || 0), 'Confirmed payments') +
      reportMetricCard('Unpaid invoices', money.format(overview.unpaidInvoiceTotal || 0), money.format(overview.overdueInvoiceTotal || 0) + ' overdue') +
      reportMetricCard('Completed jobs', overview.completedJobs || 0, (overview.scheduledJobs || 0) + ' scheduled') +
      reportMetricCard('Quote acceptance', (overview.quoteAcceptanceRate || 0) + '%', 'Sent quote outcomes') +
      '</div><div class="report-grid two">' +
      reportLineChart('Revenue trend', revenue.byPeriod || [], 'date', 'value', (value) => money.format(value || 0)) +
      reportPieChart('Service popularity', data.services || [], 'name', 'jobs', (value) => String(value || 0)) +
      reportFunnelChart('Quote conversion funnel', quotes.funnel || []) +
      reportPanel('Urgent items', reportTable([{ label: 'Item', value: (row) => row.label }, { label: 'Count', value: (row) => row.value }], urgentRows, 'No urgent items.')) +
      '</div></section>';
  }

  function renderRevenueReport(data) {
    const revenue = data.revenue || {};
    return '<section class="report-section"><div class="report-kpi-row">' +
      reportMetricCard('Total revenue', money.format(revenue.totalRevenue || 0), 'Confirmed payments') +
      reportMetricCard('Paid invoice total', money.format(revenue.paidInvoiceTotal || 0), 'Paid invoices') +
      reportMetricCard('Unpaid invoice total', money.format(revenue.unpaidInvoiceTotal || 0), 'Still outstanding') +
      reportMetricCard('Average invoice value', money.format(revenue.averageInvoiceValue || 0), 'Across invoices') +
      '</div><div class="report-grid two">' +
      reportLineChart('Revenue trend', revenue.byPeriod || [], 'date', 'value', (value) => money.format(value || 0)) +
      reportBarChart('Revenue by service', revenue.byService || [], 'name', 'total', (value) => money.format(value || 0)) +
      reportPieChart('Payment method split', revenue.byPaymentMethod || [], 'name', 'total', (value) => money.format(value || 0)) +
      reportPanel('Top revenue customers', reportTable([{ label: 'Customer', value: (row) => row.name }, { label: 'Payments', value: (row) => row.count }, { label: 'Revenue', value: (row) => money.format(row.total || 0) }], revenue.topRevenueCustomers || revenue.byCustomer || [], 'No paying customers in this range.')) +
      '</div></section>';
  }

  function renderUnpaidInvoicesReport(data) {
    const invoices = data.invoices || {};
    return '<section class="report-section"><div class="report-kpi-row">' +
      reportMetricCard('Unpaid count', invoices.unpaidCount || 0, 'Open invoices') +
      reportMetricCard('Unpaid total', money.format(invoices.unpaidTotal || 0), 'Balance due') +
      reportMetricCard('Overdue count', invoices.overdueCount || 0, 'Past due date') +
      reportMetricCard('Overdue total', money.format(invoices.overdueTotal || 0), 'Needs follow-up') +
      '</div><div class="report-grid two">' +
      reportPieChart('Unpaid age buckets', invoices.ageBuckets || [], 'name', 'total', (value) => money.format(value || 0)) +
      reportBarChart('Top unpaid customers', invoices.topUnpaidCustomers || [], 'name', 'total', (value) => money.format(value || 0)) +
      '</div>' +
      reportPanel('Unpaid invoice details', reportTable([{ label: 'Invoice', value: (row) => row.number }, { label: 'Customer', value: (row) => row.customerName }, { label: 'Status', value: (row) => row.status }, { label: 'Total', value: (row) => money.format(row.total || 0) }, { label: 'Balance', value: (row) => money.format(row.balanceDue || 0) }, { label: 'Due', value: (row) => formatDate(row.dueDate) }, { label: 'Days overdue', value: (row) => row.daysOverdue || 0 }], invoices.details || [], 'No unpaid invoices.')) +
      '</section>';
  }

  function renderCompletedJobsReport(data) {
    const jobs = data.jobs || {};
    return '<section class="report-section"><div class="report-kpi-row">' +
      reportMetricCard('Completed', jobs.completedCount || 0, 'Finished jobs') +
      reportMetricCard('Scheduled', jobs.scheduledCount || 0, 'On calendar') +
      reportMetricCard('In progress', jobs.inProgressCount || 0, 'Active work') +
      reportMetricCard('Completion rate', (jobs.completionRate || 0) + '%', 'Completed vs cancelled') +
      '</div><div class="report-grid two">' +
      reportLineChart('Completed jobs trend', jobs.byPeriod || [], 'date', 'value', (value) => String(value || 0)) +
      reportBarChart('Jobs by service', jobs.byService || [], 'name', 'count', (value) => String(value || 0)) +
      reportBarChart('Jobs by worker', jobs.byWorker || [], 'name', 'count', (value) => String(value || 0)) +
      reportPanel('Recent completed jobs', reportTable([{ label: 'Job', value: (row) => row.title }, { label: 'Customer', value: (row) => row.customerName }, { label: 'Service', value: (row) => row.serviceName }, { label: 'Worker', value: (row) => row.workerName }, { label: 'Completed', value: (row) => formatDate(row.completedAt) }, { label: 'Proof', value: (row) => row.proofComplete ? 'Complete' : 'Missing' }], jobs.recentCompletedJobs || [], 'No completed jobs yet.')) +
      '</div></section>';
  }

  function renderWorkerPerformanceReport(data) {
    const workers = data.workers || [];
    const canSeeMoney = (data.allowedReports || []).includes('money');
    const avgCompletion = workers.length ? Math.round(workers.reduce((sum, worker) => sum + Number(worker.completionRate || 0), 0) / workers.length) : 0;
    const avgProof = workers.filter((worker) => worker.proofComplianceRate != null);
    const cards = [
      reportMetricCard('Workers tracked', workers.length, 'With activity'),
      reportMetricCard('Average completion', avgCompletion + '%', 'Across workers'),
      reportMetricCard('Proof complete', (avgProof.length ? Math.round(avgProof.reduce((sum, worker) => sum + Number(worker.proofComplianceRate || 0), 0) / avgProof.length) : 0) + '%', 'Required proof')
    ];
    if (canSeeMoney) cards.push(reportMetricCard('Money from completed work', money.format(workers.reduce((sum, worker) => sum + Number(worker.revenueHandled || 0), 0)), 'Paid work'));
    const columns = [
      { label: 'Worker', value: (row) => row.name },
      { label: 'Assigned', value: (row) => row.assigned },
      { label: 'Completed', value: (row) => row.completed },
      { label: 'In progress', value: (row) => row.inProgress },
      { label: 'Completion', value: (row) => row.completionRate + '%' },
      { label: 'Average time', value: (row) => row.averageDurationMinutes ? row.averageDurationMinutes + ' min' : '-' },
      { label: 'Proof', value: (row) => row.proofComplianceRate == null ? '-' : row.proofComplianceRate + '%' },
      { label: 'Active', value: (row) => row.active ? 'Yes' : 'No' }
    ];
    if (canSeeMoney) columns.splice(columns.length - 1, 0, { label: 'Money handled', value: (row) => money.format(row.revenueHandled || 0) });
    return '<section class="report-section"><div class="report-kpi-row">' + cards.join('') +
      '</div><div class="report-grid two">' +
      reportBarChart('Jobs completed', workers, 'name', 'completed', (value) => String(value || 0)) +
      reportBarChart('Proof complete', workers.filter((worker) => worker.proofComplianceRate != null), 'name', 'proofComplianceRate', (value) => (value || 0) + '%') +
      '</div>' +
      reportPanel('Worker results', reportTable(columns, workers, 'No worker activity yet.')) +
      '</section>';
  }

  function renderServicePopularityReport(data) {
    const services = data.services || [];
    const canSeeMoney = (data.allowedReports || []).includes('money');
    const cards = [
      reportMetricCard('Services', services.length, 'Set up in FieldCore'),
      reportMetricCard('Booking requests', services.reduce((sum, item) => sum + Number(item.bookingRequests || 0), 0), 'New requests'),
      reportMetricCard('Jobs', services.reduce((sum, item) => sum + Number(item.jobs || 0), 0), 'All work')
    ];
    if (canSeeMoney) cards.push(reportMetricCard('Money received', money.format(services.reduce((sum, item) => sum + Number(item.revenue || 0), 0)), 'By service'));
    const charts = [reportBarChart('Jobs by service', services, 'name', 'jobs', (value) => String(value || 0)), reportBarChart('Quote success', services, 'name', 'quoteAcceptanceRate', (value) => (value || 0) + '%')];
    if (canSeeMoney) charts.unshift(reportBarChart('Money by service', services, 'name', 'revenue', (value) => money.format(value || 0)));
    const columns = [
      { label: 'Service', value: (row) => row.name },
      { label: 'Bookings', value: (row) => row.bookingRequests },
      { label: 'Jobs', value: (row) => row.jobs },
      { label: 'Completed', value: (row) => row.completedJobs },
      { label: 'Quotes', value: (row) => row.quotes },
      { label: 'Accepted', value: (row) => row.acceptedQuotes },
      { label: 'Quote success', value: (row) => row.quoteAcceptanceRate + '%' }
    ];
    if (canSeeMoney) {
      columns.splice(4, 0, { label: 'Money', value: (row) => money.format(row.revenue || 0) });
      columns.push({ label: 'Average invoice', value: (row) => money.format(row.averageInvoiceValue || 0) });
    }
    return '<section class="report-section"><div class="report-kpi-row">' + cards.join('') + '</div><div class="report-grid two">' + charts.join('') + '</div>' + reportPanel('Service results', reportTable(columns, services, 'No service activity yet.')) + '</section>';
  }

  function renderQuoteConversionReport(data) {
    const quotes = data.quotes || {};
    const canSeeMoney = (data.allowedReports || []).includes('money');
    const cards = [
      reportMetricCard('Created', quotes.createdCount || 0, 'All quotes'),
      reportMetricCard('Accepted', quotes.acceptedCount || 0, 'Won work'),
      reportMetricCard('Rejected', quotes.rejectedCount || 0, (quotes.rejectionRate || 0) + '% rejected'),
      reportMetricCard('Success rate', (quotes.acceptanceRate || 0) + '%', 'Sent quote results')
    ];
    if (canSeeMoney) {
      cards[1] = reportMetricCard('Accepted', quotes.acceptedCount || 0, money.format(quotes.acceptedQuoteValue || 0));
      cards[3] = reportMetricCard('Success rate', (quotes.acceptanceRate || 0) + '%', money.format(quotes.averageQuoteValue || 0) + ' average');
    }
    return '<section class="report-section"><div class="report-kpi-row">' + cards.join('') +
      '</div><div class="report-grid two">' +
      reportFunnelChart('Quote steps', quotes.funnel || []) +
      reportLineChart('Quotes over time', quotes.byPeriod || [], 'date', 'value', (value) => String(value || 0)) +
      '</div>' +
      reportPanel('Quotes by service', reportTable([{ label: 'Service', value: (row) => row.name }, { label: 'Quotes', value: (row) => row.quotes }, { label: 'Sent', value: (row) => row.sent }, { label: 'Accepted', value: (row) => row.accepted }, { label: 'Rejected', value: (row) => row.rejected }, { label: 'Success rate', value: (row) => row.acceptanceRate + '%' }], quotes.byService || [], 'No quotes in this time period.')) +
      '</section>';
  }

  function renderCustomerAnalyticsReport(data) {
    const customers = data.customers || {};
    const canSeeMoney = (data.allowedReports || []).includes('money');
    const cards = [
      reportMetricCard('Customers', customers.totalCustomers || 0, 'All customers'),
      reportMetricCard('New customers', customers.newCustomers || 0, 'In this time period'),
      reportMetricCard('Repeat customers', customers.repeatCustomers || 0, 'More than one job')
    ];
    if (canSeeMoney) cards.push(reportMetricCard('Customers who owe money', (customers.customersWithUnpaidInvoices || []).length, 'Need follow-up'));
    const columns = [
      { label: 'Customer', value: (row) => row.name },
      { label: 'Invoices', value: (row) => row.invoices },
      { label: 'Jobs', value: (row) => row.jobs },
      { label: 'Completed jobs', value: (row) => row.completedJobs },
      { label: 'Quotes', value: (row) => row.quotes },
      { label: 'Bookings', value: (row) => row.bookingRequests },
      { label: 'Last job', value: (row) => formatDate(row.lastJobDate) },
      { label: 'Last payment', value: (row) => formatDate(row.lastPaymentDate) }
    ];
    if (canSeeMoney) {
      columns.splice(1, 0, { label: 'Money received', value: (row) => money.format(row.revenue || 0) });
      columns.splice(2, 0, { label: 'Money owed', value: (row) => money.format(row.unpaidTotal || 0) });
    }
    const extra = canSeeMoney
      ? '<div class="report-grid two">' + reportBarChart('Top customers by money received', customers.topCustomers || [], 'name', 'revenue', (value) => money.format(value || 0)) + reportPanel('Customers who owe money', reportTable([{ label: 'Customer', value: (row) => row.name }, { label: 'Money owed', value: (row) => money.format(row.unpaidTotal || 0) }, { label: 'Invoices', value: (row) => row.invoices }], customers.customersWithUnpaidInvoices || [], 'No customers owe money.')) + '</div>'
      : '';
    return '<section class="report-section"><div class="report-kpi-row">' + cards.join('') + '</div>' + extra + reportPanel('Customer activity', reportTable(columns, customers.customerHistory || customers.topCustomers || [], 'No customer activity yet.')) + '</section>';
  }

  function renderStockValueReport(data) {
    const stock = data.stock || { totalValue: 0, rows: [] };
    return '<section class="report-section"><div class="report-kpi-row">' +
      reportMetricCard('Stock value', money.format(stock.totalValue || 0), 'Items currently on hand') +
      reportMetricCard('Stock lines', (stock.rows || []).length, 'Across all locations') +
      '</div>' +
      reportPanel('Stock value by item', reportTable([
        { label: 'Item', value: (row) => row.itemName },
        { label: 'Location', value: (row) => row.locationName },
        { label: 'Quantity', value: (row) => row.quantity },
        { label: 'Cost each', value: (row) => money.format(row.unitCost || 0) },
        { label: 'Value', value: (row) => money.format(row.value || 0) }
      ], stock.rows || [], 'No stock value is available yet.')) +
      '</section>';
  }

  function renderActiveReportTab(data) {
    const renderers = {
      revenue: renderRevenueReport,
      'unpaid-invoices': renderUnpaidInvoicesReport,
      'completed-jobs': renderCompletedJobsReport,
      'worker-performance': renderWorkerPerformanceReport,
      'service-popularity': renderServicePopularityReport,
      'quote-conversion': renderQuoteConversionReport,
      'customer-analytics': renderCustomerAnalyticsReport,
      'stock-value': renderStockValueReport
    };
    const views = reportViewOptions(data);
    const allowedKeys = new Set(views.map(([key]) => key));
    if (!allowedKeys.has(state.activeReportTab)) state.activeReportTab = views.length ? views[0][0] : '';
    const renderer = renderers[state.activeReportTab];
    return renderer ? renderer(data || {}) : '<section class="panel"><div class="empty-state"><div><strong>No reports selected</strong><span>Ask the owner to add report access to your account.</span></div></div></section>';
  }

  function bindReportControls(data) {
    const form = document.querySelector('[data-report-filters]');
    const reportView = document.querySelector('[data-report-view]');
    if (reportView) {
      reportView.addEventListener('change', () => {
        state.activeReportTab = reportView.value || '';
        renderReports(state.reports || data);
      });
    }
    if (!form) return;
    const filters = data.filters || {};
    if (form.elements.period) form.elements.period.value = filters.period || 'last30days';
    if (form.elements.startDate) form.elements.startDate.value = String(filters.startDate || '').slice(0, 10);
    if (form.elements.endDate) form.elements.endDate.value = String(filters.endDate || '').slice(0, 10);
    if (form.elements.period) form.elements.period.addEventListener('change', () => {
      if (form.elements.period.value === 'custom') return;
      if (form.elements.startDate) form.elements.startDate.value = '';
      if (form.elements.endDate) form.elements.endDate.value = '';
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (form.elements.period && ((form.elements.startDate && form.elements.startDate.value) || (form.elements.endDate && form.elements.endDate.value))) form.elements.period.value = 'custom';
      await loadReports();
    });
  }

  function renderReports(data) {
    const root = document.querySelector('[data-reports-root]');
    if (!root) return;
    state.reports = data || {};
    const views = reportViewOptions(data || {});
    if (!views.some(([key]) => key === state.activeReportTab)) state.activeReportTab = views.length ? views[0][0] : '';
    const filters = data.filters || {};
    root.innerHTML = '<div class="hero-row"><div class="hero-copy"><h2>Reports</h2><p>Showing the reports this account can use from ' + escapeHtml(formatDate(filters.startDate)) + ' to ' + escapeHtml(formatDate(filters.endDate)) + '.</p></div></div>' +
      renderReportFilters(data || {}) +
      renderReportSwitcher(data || {}) +
      '<div data-report-tab-panel>' + renderActiveReportTab(data || {}) + '</div>';
    bindReportControls(data || {});
  }
  
  async function loadReports() {
    const root = document.querySelector('[data-reports-root]');
    if (!root) return;
    const message = document.querySelector('[data-report-message]');
    if (message) message.hidden = true;
    try {
      const params = reportQueryFromForm();
      const data = await api('/reports' + (params.toString() ? '?' + params.toString() : ''));
      state.reports = data;
      renderReports(data);
    } catch (error) {
      if (message) { message.textContent = error.message; message.hidden = false; }
      else root.innerHTML = '<div class="hero-row"><div class="hero-copy"><h2>Business Performance</h2><p>Reports could not be loaded.</p></div><span class="api-status" data-api-status>Disconnected</span></div><section class="panel"><div class="empty-state"><div><strong>Reports unavailable</strong><span>' + escapeHtml(error.message) + '</span></div></div></section>';
    }
  }

  function jobCustomer(job) {
    return job && job.customer && job.customer.name || 'No customer';
  }

  function jobAddress(job) {
    return job && job.customer && job.customer.address || job && job.address || '';
  }

  function workerJobActions(job, includeLifecycle) {
    if (!job || !job.id) return '';
    const status = String(job.status || '').toUpperCase();
    const id = escapeHtml(job.id);
    const buttons = ['<button class="secondary-button compact" type="button" data-row-action="job-detail" data-id="' + id + '">View Job</button>'];
    const add = (label, action, primary) => buttons.push('<button class="' + (primary ? 'primary-button' : 'secondary-button') + ' compact" type="button" data-worker-dashboard-action="' + action + '" data-id="' + id + '">' + label + '</button>');
    if (includeLifecycle && (status === 'SCHEDULED' || status === 'DISPATCHED')) add('Arrived', 'arrive');
    if (includeLifecycle && (status === 'ARRIVED' || status === 'SCHEDULED' || status === 'DISPATCHED')) add('Start', 'start', status === 'ARRIVED');
    if (includeLifecycle && status === 'IN_PROGRESS') add('Pause', 'pause');
    if (includeLifecycle && status === 'PAUSED') add('Resume', 'resume');
    if (includeLifecycle && (status === 'IN_PROGRESS' || status === 'PAUSED')) add('Complete', 'complete', true);
    return '<div class="row-actions">' + buttons.join('') + '</div>';
  }

  function workerJobItem(job, includeLifecycle) {
    const address = jobAddress(job);
    return `<div class="list-item"><span class="initials">${escapeHtml(String(job.title || 'Job').slice(0, 2).toUpperCase())}</span><div><strong>${escapeHtml(job.title || 'Scheduled job')}</strong><small>${escapeHtml([formatDateTime(job.scheduledStart), jobCustomer(job), address].filter(Boolean).join(' - '))}</small></div><div>${badge(job.status)}${workerJobActions(job, includeLifecycle)}</div></div>`;
  }

  function renderWorkerPanel(title, items, emptyTitle, renderer) {
    return `<div class="panel"><div class="panel-head"><h3>${escapeHtml(title)}</h3></div>${items.length ? `<div class="list">${items.map(renderer).join('')}</div>` : `<div class="empty-state"><div><strong>${escapeHtml(emptyTitle)}</strong></div></div>`}</div>`;
  }

  function renderWorkerDashboard(data) {
    const today = data.today || {};
    const activeJob = today.activeJob;
    const pageEl = document.querySelector('.page');
    if (!pageEl) return;
    pageEl.innerHTML = `<div class="hero-row"><div class="hero-copy"><h2>Field operations</h2><p>Your assigned work for today is ready.</p></div><span class="api-status" data-api-status>Connected</span></div><section class="stats"><article class="card stat-card"><div class="stat-label">Jobs Today</div><div class="stat-value">0</div><div class="trend"></div></article><article class="card stat-card"><div class="stat-label">Completed</div><div class="stat-value">0</div><div class="trend"></div></article><article class="card stat-card"><div class="stat-label">Remaining</div><div class="stat-value">0</div><div class="trend"></div></article><article class="card stat-card"><div class="stat-label">Active Job</div><div class="stat-value">-</div><div class="trend"></div></article></section><section class="split"><div class="panel"><div class="panel-head"><h2>Current Job</h2></div>${activeJob ? `<div class="list">${workerJobItem(activeJob, true)}</div>` : '<div class="empty-state"><div><strong>No active job right now.</strong></div></div>'}</div>${renderWorkerPanel('Required Actions', data.requiredActions || [], 'No urgent actions.', (item) => `<div class="list-item"><span class="initials">!</span><div><strong>${escapeHtml(item.label || 'Action required')}</strong><small>${escapeHtml(item.jobId || '')}</small></div>${item.jobId ? workerJobActions({ id: item.jobId }, false) : ''}</div>`)}</section><section class="split">${renderWorkerPanel("Today's Jobs", data.jobsToday || [], 'No assigned jobs today.', (job) => workerJobItem(job, false))}${renderWorkerPanel('Upcoming Jobs', data.upcomingJobs || [], 'No upcoming assigned jobs.', (job) => workerJobItem(job, false))}</section><section class="split"><div class="table-card"><div class="panel-head card"><h3>Recent Activity</h3></div>${(data.recentActivity || []).length ? `<div class="list">${(data.recentActivity || []).map((item) => `<div class="list-item"><span class="initials">${escapeHtml(String(item.type || 'A').slice(0, 2).toUpperCase())}</span><div><strong>${escapeHtml(activityTitle(item))}</strong><small>${escapeHtml([item.job && item.job.title, item.job && item.job.customer && item.job.customer.name, formatDateTime(item.createdAt)].filter(Boolean).join(' - '))}</small></div></div>`).join('')}</div>` : '<div class="empty-state"><div><strong>No recent activity.</strong></div></div>'}</div></section>`;
    setStats([
      { label: 'Jobs Today', value: today.totalJobs || 0, trend: today.totalJobs ? 'Assigned today' : 'No jobs scheduled' },
      { label: 'Completed', value: today.completedJobs || 0, trend: 'Finished today' },
      { label: 'Remaining', value: today.remainingJobs || 0, trend: 'Still open today' },
      { label: 'Active Job', value: activeJob ? '1' : '0', trend: activeJob ? String(activeJob.status || '').replace(/_/g, ' ') : 'No active job' }
    ]);
  }
  function jobRequirementSummary(job) {
    const requirements = job && job.completionRequirements || {};
    const parts = [];
    if (requirements.requiresProofPhotos) parts.push('Proof photo required');
    if (requirements.requiresSignature) parts.push('Signature');
    return parts.length ? parts.join(' / ') : 'No completion evidence required';
  }

  function renderWorkerJobsPage(data) {
    const pageEl = document.querySelector('.page');
    if (!pageEl) return;
    const jobs = Array.isArray(data) ? data : [];
    const today = new Date();
    const todayJobs = jobs.filter((job) => {
      if (!job.scheduledStart) return false;
      const date = new Date(job.scheduledStart);
      return !Number.isNaN(date.getTime()) && date.toDateString() === today.toDateString();
    });
    const upcomingJobs = jobs.filter((job) => {
      if (!job.scheduledStart) return true;
      const date = new Date(job.scheduledStart);
      return Number.isNaN(date.getTime()) || (date > today && date.toDateString() !== today.toDateString());
    });
    const renderJob = (job) => '<div class="list-item worker-job-card"><span class="initials">' + escapeHtml(String(job.title || 'Job').slice(0, 2).toUpperCase()) + '</span><div><strong>' + escapeHtml(job.title || 'Assigned job') + '</strong><small>' + escapeHtml([formatDateTime(job.scheduledStart), jobCustomer(job), jobAddress(job)].filter(Boolean).join(' - ')) + '</small><small>' + escapeHtml(jobRequirementSummary(job)) + '</small></div><div>' + badge(job.status) + workerJobActions(job, true) + '</div></div>';
    pageEl.innerHTML = '<div class="hero-row"><div class="hero-copy"><h2>My Jobs</h2><p>Your assigned work for today and upcoming jobs.</p></div><span class="api-status" data-api-status>Connected</span></div><section class="split">' + renderWorkerPanel('Today', todayJobs, 'No assigned jobs today.', renderJob) + renderWorkerPanel('Upcoming', upcomingJobs, 'No upcoming assigned jobs.', renderJob) + '</section><section class="panel"><div class="panel-head"><h3>All Assigned Jobs</h3></div>' + (jobs.length ? '<div class="list">' + jobs.map(renderJob).join('') + '</div>' : '<div class="empty-state"><div><strong>No assigned jobs.</strong></div></div>') + '</section>';
  }


  function fillPanel(title, items, mapper) {
    const panel = Array.from(document.querySelectorAll('.panel, .table-card')).find((node) => {
      const heading = node.querySelector('h2, h3');
      return heading && heading.textContent.trim() === title;
    });
    if (!panel || !items.length) return;
    const existing = panel.querySelector('.empty-state');
    if (existing) existing.remove();
    let list = panel.querySelector('.list');
    if (!list) {
      list = document.createElement('div');
      list.className = 'list';
      panel.appendChild(list);
    }
    list.innerHTML = items.map((item) => {
      const [primary, secondary] = mapper(item);
      return `<div class="list-item"><span class="initials">${escapeHtml(String(primary || 'FC').slice(0, 2).toUpperCase())}</span><div><strong>${escapeHtml(primary)}</strong><small>${escapeHtml(secondary)}</small></div></div>`;
    }).join('');
  }

  function updateListStats(resource, data) {
    if (resource === 'customers') {
      const balance = data.reduce((sum, c) => sum + (c.invoices || []).filter((i) => i.status !== 'PAID').reduce((inner, i) => inner + Number(i.amount || 0), 0), 0);
      setStats([{ label: 'Total Customers', value: data.length, trend: 'Total records' }, { label: 'Active Accounts', value: data.length, trend: 'Active accounts' }, { label: 'Outstanding Balance', value: money.format(balance), trend: 'Outstanding' }, { label: 'Avg. Jobs', value: average(data.map((c) => (c.jobs || []).length)), trend: 'Per customer' }]);
    }
    if (resource === 'workers') {
      const active = data.filter((worker) => worker.active !== false).length;
      const titled = data.filter((worker) => worker.title).length;
      setStats([{ label: 'Total Workers', value: data.length, trend: 'Team members' }, { label: 'Active Workers', value: active, trend: 'Available for work' }, { label: 'Inactive Workers', value: data.length - active, trend: 'Not active' }, { label: 'With Titles', value: titled, trend: 'Role assigned' }]);
    }
    if (resource === 'jobs') setStats(countStatuses(data, ['NEW', 'IN_PROGRESS', 'SCHEDULED', 'ON_HOLD'], ['Not on calendar', 'Active work', 'On calendar', 'Paused or held']));
    if (resource === 'assets') setStats([{ label: 'Active', value: data.filter((item) => item.status === 'ACTIVE').length, trend: 'Assets in service' }, { label: 'Under Repair', value: data.filter((item) => item.status === 'UNDER_REPAIR').length, trend: 'Needs attention' }, { label: 'Retired', value: data.filter((item) => item.status === 'RETIRED').length, trend: 'Out of service' }, { label: 'Warranty', value: data.filter((item) => item.warrantyEndAt).length, trend: 'Tracked warranties' }]);
    if (resource === 'service-contracts') setStats([{ label: 'Active', value: data.filter((item) => item.status === 'ACTIVE').length, trend: 'Live agreements' }, { label: 'Suspended', value: data.filter((item) => item.status === 'SUSPENDED').length, trend: 'Paused service' }, { label: 'Draft', value: data.filter((item) => item.status === 'DRAFT').length, trend: 'In setup' }, { label: 'Due Work', value: data.reduce((sum, item) => sum + ((item.upcomingDueWork || []).length), 0), trend: 'Upcoming visits' }]);
    if (resource === 'quotes') setStats(countStatuses(data, ['SENT', 'ACCEPTED', 'SENT', 'DRAFT'], ['Open quotes', 'Accepted', 'Sent', 'Drafts']));
    if (resource === 'invoices') setStats(countStatuses(data, ['ALL', 'PAID', 'SENT', 'OVERDUE', 'DRAFT'], ['Total invoices', 'Paid', 'Unpaid', 'Overdue', 'Drafts']));
    if (resource === 'booking-requests') updateBookingRequestStats(data);
  }

  function average(values) {
    if (!values.length) return '0';
    return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1).replace('.0', '');
  }

  function countStatuses(data, statuses, trends) {
    const aliases = {
      SUBMITTED: 'NEW',
      UNDER_REVIEW: 'REVIEWED',
      APPROVED: 'CONVERTED',
      REJECTED: 'DECLINED',
      PAUSED: 'ON_HOLD'
    };
    const normalizeStatus = (value) => {
      const key = String(value || '').trim().toUpperCase().replace(/\s+/g, '_');
      return aliases[key] || key;
    };
    return statuses.map((status, index) => ({ value: status === 'ALL' ? data.length : data.filter((item) => normalizeStatus(item.status) === status).length, trend: trends[index] }));
  }

  function normalizeBookingRequestStatus(value) {
    const key = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    return {
      SUBMITTED: 'NEW',
      NEW: 'NEW',
      UNDER_REVIEW: 'REVIEWED',
      REVIEWED: 'REVIEWED',
      APPROVED: 'CONVERTED',
      CONVERTED: 'CONVERTED',
      REJECTED: 'DECLINED',
      DECLINED: 'DECLINED'
    }[key] || key;
  }

  function updateBookingRequestStats(data) {
    const counts = {
      NEW: 0,
      REVIEWED: 0,
      CONVERTED: 0,
      DECLINED: 0
    };

    (data || []).forEach((item) => {
      const status = normalizeBookingRequestStatus(item.status);

      if (Object.prototype.hasOwnProperty.call(counts, status)) {
        counts[status] += 1;
      }
    });

    document
      .querySelectorAll('body[data-page="booking-requests"] [data-booking-stat]')
      .forEach((card) => {
        const status = card.dataset.bookingStat;
        const value = card.querySelector('.stat-value');

        if (value && Object.prototype.hasOwnProperty.call(counts, status)) {
          value.textContent = String(counts[status]);
        }
      });
  }

  async function preloadLookups() {
    const requests = [];
    if (['jobs', 'quotes', 'invoices', 'schedule', 'assets', 'service-contracts'].includes(page)) requests.push(api('/customers').then((d) => state.customers = d).catch(() => []));
    if (['jobs', 'quotes', 'invoices', 'assets', 'service-contracts'].includes(page)) requests.push(api('/services').then((d) => state.services = d).catch(() => []));
    if (['jobs', 'schedule'].includes(page)) requests.push(api('/workers').then((d) => state.workers = d).catch(() => []));
    if (page === 'jobs' && !isWorker()) {
      requests.push(api('/assets').then((d) => state.assets = d).catch(() => []));
      requests.push(api('/service-contracts').then((d) => state.serviceContracts = d).catch(() => []));
    }
    if (['quotes', 'invoices', 'schedule'].includes(page)) requests.push(api('/jobs').then((d) => state.jobs = d).catch(() => []));
    if (['dashboard', 'jobs', 'quotes', 'invoices', 'reports', 'settings', 'collections', 'assets', 'service-contracts'].includes(page)) requests.push(api('/company/finance-settings').then((d) => state.financeSettings = applyMarketCurrencyForDisplay(d)).catch(() => { state.financeSettings = applyMarketCurrencyForDisplay(null); }));
    if (['jobs', 'schedule'].includes(page) && !isWorker()) requests.push(api('/company/scheduling-settings').then((d) => state.scheduleSettings = d).catch(() => null));
    await Promise.all(requests);
  }

  function optionLabel(item) {
    if (item && item.user) return [item.user.name || item.user.email || 'Worker', item.role && item.role.name || item.title].filter(Boolean).join(' - ');
    return item.name || item.title || item.number || 'Record';
  }

  function optionList(items, label) {
    return `<option value="">${label}</option>${items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(optionLabel(item))}</option>`).join('')}`;
  }

  function field(name, label, type, attrs) {
    return `<div class="field"><label for="fc-${name}">${label}</label><input id="fc-${name}" name="${name}" type="${type || 'text'}" ${attrs || ''}></div>`;
  }

  function checkboxField(name, label, checked) {
    const q = String.fromCharCode(34);
    return "<div class=" + q + "field checkbox-field" + q + "><label for=" + q + "fc-" + name + q + "><input id=" + q + "fc-" + name + q + " name=" + q + name + q + " type=" + q + "checkbox" + q + (checked ? " checked" : "") + "> " + escapeHtml(label) + "</label></div>";
  }

  function formSection(title) {
    const q = String.fromCharCode(34);
    return "<div class=" + q + "field span-2 form-section-title" + q + "><strong>" + escapeHtml(title) + "</strong></div>";
  }

  function select(name, label, options, required) {
    return `<div class="field"><label for="fc-${name}">${label}</label><select id="fc-${name}" name="${name}" ${required ? 'required' : ''}>${options}</select></div>`;
  }

  function formFor(resource) {
    if (resource === 'customers') return { title: 'New Customer', action: '/customers', fields: field('name', 'Name', 'text', 'required') + field('email', 'Email', 'email') + field('phone', 'Phone') + field('address', 'Address') };
    if (resource === 'workers') return { title: 'New Worker', action: '/workers', fields: field('name', 'Name', 'text', 'required') + field('email', 'Email', 'email', 'required') + field('password', 'Temporary Password', 'password', 'required minlength="12"') + field('title', 'Title') + field('phone', 'Phone') };
    if (resource === 'jobs') {
      const settings = state.scheduleSettings || {};
      const duration = settings.defaultJobDurationMinutes || 60;
      const buffer = settings.defaultTravelBufferMinutes || 0;
      return {
  title: 'New Job',
  action: '/jobs',
  fields:
    field('title', 'Title', 'text', 'required') +
    select('customerId', 'Customer', optionList(state.customers, 'Select customer'), true) +
    select('serviceId', 'Service', optionList(state.services, 'No service'), false) +
    select('contractId', 'Service Contract', optionList(state.serviceContracts, 'No contract'), false) +
    select('assetId', 'Primary Asset', optionList(state.assets, 'No linked asset'), false) +
    select('workerId', 'Worker', optionList(state.workers, 'No worker'), false) +
    field('scheduledStart', 'Scheduled Start', 'datetime-local') +
    field('durationMinutes', 'Duration Minutes', 'number', 'min="1" value="' + escapeHtml(duration) + '"') +
    field('travelBufferMinutes', 'Travel Buffer Minutes', 'number', 'min="0" value="' + escapeHtml(buffer) + '"') +
    formSection('Completion Requirements') +
    checkboxField('requiresProofPhotos', 'Require proof of work photo', settings.requireProofPhotos !== false) +
    checkboxField('requiresBeforePhotos', 'Require before photo', Boolean(settings.requireBeforePhotos)) +
    checkboxField('requiresAfterPhotos', 'Require after photo', Boolean(settings.requireAfterPhotos)) +
    checkboxField('requiresSignature', 'Require customer signature') +
    checkboxField('requiresLocation', 'Require completion location', Boolean(settings.requireLocation))
      };
    }
    if (resource === 'assets') return { title: 'New Asset', action: '/assets', fields: field('name', 'Asset Name', 'text', 'required') + select('customerId', 'Customer', optionList(state.customers, 'Select customer'), true) + select('serviceId', 'Default Service', optionList(state.services, 'No service'), false) + field('assetType', 'Asset Type', 'text', 'required') + field('assetTag', 'Asset Tag') + field('serialNumber', 'Serial Number') + field('manufacturer', 'Manufacturer') + field('modelNumber', 'Model Number') + field('locationLabel', 'Location') + field('warrantyEndAt', 'Warranty Ends', 'date') };
    if (resource === 'service-contracts') return { title: 'New Service Contract', action: '/service-contracts', fields: field('contractNumber', 'Contract Number', 'text', 'required') + field('name', 'Contract Name', 'text', 'required') + select('customerId', 'Customer', optionList(state.customers, 'Select customer'), true) + field('startDate', 'Start Date', 'date', 'required') + field('endDate', 'End Date', 'date') + field('currency', 'Currency', 'text', 'maxlength="3" value="' + escapeHtml(effectiveFinanceSettings().defaultCurrency || 'USD') + '"') + field('contractValue', 'Contract Value', 'number', 'min="0" step="0.01"') + field('responseSlaHours', 'Response SLA Hours', 'number', 'min="1"') + field('completionSlaHours', 'Completion SLA Hours', 'number', 'min="1"') + field('includedVisits', 'Included Visits', 'number', 'min="0"') };
    if (resource === 'quotes') return { title: 'New Quote', action: '/quotes', fields: field('title', 'Title', 'text', 'required') + select('customerId', 'Customer', optionList(state.customers, 'Select customer'), true) + select('serviceId', 'Service', optionList(state.services, 'No service'), false) + field('amount', 'Amount', 'number', 'min="0" step="0.01"') + field('validUntil', 'Valid Until', 'date') };
    if (resource === 'invoices') return { title: 'New Invoice', action: '/invoices', fields: field('number', 'Number') + select('customerId', 'Customer', optionList(state.customers, 'Select customer'), true) + select('jobId', 'Job', optionList(state.jobs, 'No job'), false) + field('amount', 'Amount', 'number', 'min="0" step="0.01"') + field('dueDate', 'Due Date', 'date') };
  }

  function localDateTimeValue(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (number) => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  function openModal(config) {
    closeModal();
    const modal = document.createElement('div');
    modal.className = 'fc-modal';
    modal.innerHTML = `<div class="fc-dialog"><form><div class="panel-head"><h3>${escapeHtml(config.title)}</h3><button class="icon-button" type="button" data-close>&times;</button></div><div class="form-grid">${config.fields}</div><div class="fc-form-actions"><button class="secondary-button" type="button" data-close>Cancel</button><button class="primary-button" type="submit">Save</button></div><p class="fc-form-error" hidden></p></form></div>`;
    modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-close]')) closeModal(); });
    if (config.action) modal.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = modal.querySelector('.fc-form-error');
      error.hidden = true;
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      Object.keys(body).forEach((key) => { if (body[key] === '') delete body[key]; });
      if (config.action === '/jobs') {
        const form = event.currentTarget;
        body.primaryAssetId = body.assetId;
        delete body.assetId;
        body.requiresProofPhotos = Boolean(form.elements.requiresProofPhotos && form.elements.requiresProofPhotos.checked);
        body.requiresBeforePhotos = Boolean(form.elements.requiresBeforePhotos && form.elements.requiresBeforePhotos.checked);
        body.requiresAfterPhotos = Boolean(form.elements.requiresAfterPhotos && form.elements.requiresAfterPhotos.checked);
        body.requiresSignature = Boolean(form.elements.requiresSignature && form.elements.requiresSignature.checked);
        body.requiresLocation = Boolean(form.elements.requiresLocation && form.elements.requiresLocation.checked);
        body.minimumProofPhotos = body.requiresProofPhotos ? 1 : 0;
      }
      if ((config.action === '/quotes' || config.action === '/invoices') && body.amount) {
        body.lineItems = [{ serviceId: body.serviceId, description: body.title || body.number || 'Service line item', quantity: 1, unitPrice: Number(body.amount), discountAmount: 0, taxAmount: 0 }];
        delete body.amount;
      }
      try {
            if (config.action === '/jobs' && body.scheduledStart && body.workerId) {
              const check = await api('/schedule/check-conflicts', {
                method: 'POST',
                body: JSON.stringify({
                  workerId: body.workerId,
                  startsAt: body.scheduledStart,
                  durationMinutes: Number(body.durationMinutes || 60),
                  travelBufferMinutes: Number(body.travelBufferMinutes || 0)
                })
              });

              if (check.hasConflict) {
                const detail = check.conflicts.map((item) => item.message).join('\n');
                if (!hasPermission('schedule.override')) {
                  showToast('This time has a clash. Choose another time or worker.', false);
                  return;
                }
                const override = await openConfirmModal({
                  title: 'Schedule clash',
                  message: 'This time has a clash. You can change the time or allow it anyway.',
                  detail,
                  cancelLabel: 'Change schedule',
                  okLabel: 'Allow anyway',
                  closeExisting: false
                });

                if (!override) return;
                body.adminOverride = true;
              }
            }

            const primaryAssetId = body.primaryAssetId;
            delete body.primaryAssetId;
            const saved = await api(config.action, { method: 'POST', body: JSON.stringify(body) });
            if (config.action === '/jobs' && primaryAssetId && saved && saved.id) {
              await api('/jobs/' + encodeURIComponent(saved.id) + '/assets', { method: 'POST', body: JSON.stringify({ assetId: primaryAssetId, primaryAsset: true }) });
            }
            closeModal();
            await load();
            showToast('Saved.', true);
          } catch (err) {
            if (err.status === 409 && err.details && err.details.conflicts) {
              error.textContent = err.details.conflicts.map((item) => item.message).join('\n');
            } else {
              error.textContent = err.message;
            }
            error.hidden = false;
          }
    });
    document.body.appendChild(modal);
  }

  function receiptDetail(label, value) {
    return `<div class="receipt-detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '-')}</strong></div>`;
  }

  function paymentMethod(value) {
    return String(value || '-').replace(/_/g, ' ');
  }

  function receiptCard(receipt, invoice) {
    const payment = receipt.payment || {};
    const invoiceNumber = invoice.number || receipt.invoice && receipt.invoice.number || '-';
    const customerName = invoice.customer && invoice.customer.name || receipt.invoice && receipt.invoice.customer && receipt.invoice.customer.name || '-';
    const remainingBalance = invoice.balanceDue == null ? null : receiptMoney.format(Number(invoice.balanceDue || 0));
    return `<article class="receipt-card">
      <div class="receipt-card-head">
        <strong>${escapeHtml(receipt.receiptNumber || 'Receipt')}</strong>
        <span>${escapeHtml(formatReceiptDateTime(receipt.issuedAt || receipt.createdAt))}</span>
      </div>
      <div class="receipt-details">
        ${receiptDetail('Receipt number', receipt.receiptNumber || '-')}
        ${receiptDetail('Invoice number', invoiceNumber)}
        ${receiptDetail('Customer', customerName)}
        ${receiptDetail('Amount paid', receiptMoney.format(Number(receipt.amount || payment.amount || 0)))}
        ${receiptDetail('Payment method', paymentMethod(payment.method))}
        ${payment.reference ? receiptDetail('Payment reference', payment.reference) : ''}
        ${receiptDetail('Issued date', formatReceiptDateTime(receipt.issuedAt || receipt.createdAt))}
        ${remainingBalance == null ? '' : receiptDetail('Remaining balance', remainingBalance)}
      </div>
    </article>`;
  }

  function openReceiptModal(invoice, receipts) {
    closeModal();
    const branding = currentBranding();
    const companyName = branding.brandName || state.profile && (state.profile.tradingName || state.profile.name) || 'FieldCore';
    const modal = document.createElement('div');
    modal.className = 'fc-modal';
    const receiptContent = receipts.length ? receipts.map((receipt) => receiptCard(receipt, invoice)).join('') : '<div class="empty-state receipt-empty"><div><strong>No receipt found for this invoice yet.</strong></div></div>';
    modal.innerHTML = `<div class="fc-dialog receipt-dialog">
      <div class="panel-head">
        <div class="receipt-brand">
          <span class="logo-preview small">${branding.logoUrl ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(companyName)} logo">` : escapeHtml(initials(companyName))}</span>
          <div><h3>Receipts</h3><small>${escapeHtml(companyName)}</small></div>
        </div>
        <button class="icon-button" type="button" data-close>&times;</button>
      </div>
      <div class="receipt-list">${receiptContent}</div>
      <div class="fc-form-actions"><button class="secondary-button" type="button" data-close>Close</button></div>
    </div>`;
    modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-close]')) closeModal(); });
    document.body.appendChild(modal);
  }

  async function showInvoiceReceipts(invoiceId) {
    const invoice = state.invoices.find((item) => item.id === invoiceId) || await api('/invoices/' + invoiceId).catch(() => ({}));
    const receipts = await api('/invoices/' + invoiceId + '/receipts');
    openReceiptModal(invoice || {}, Array.isArray(receipts) ? receipts : []);
  }

  function openConfirmModal(config) {
  if (config.closeExisting !== false) closeModal();

  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'fc-modal fc-confirm-modal';

    const cancelLabel = config.cancelLabel || 'Cancel';
    const okLabel = config.okLabel || 'Continue';

    modal.innerHTML = `<div class="fc-dialog fc-confirm-dialog">
      <div class="panel-head">
        <h3>${escapeHtml(config.title || 'Confirm')}</h3>
        <button class="icon-button" type="button" data-result="cancel">&times;</button>
      </div>
      <p class="modal-copy">${escapeHtml(config.message || '')}</p>
      ${config.detail ? `<div class="modal-warning">${escapeHtml(config.detail)}</div>` : ''}
      <div class="fc-form-actions">
        <button class="secondary-button" type="button" data-result="cancel">${escapeHtml(cancelLabel)}</button>
        <button class="primary-button" type="button" data-result="ok">${escapeHtml(okLabel)}</button>
      </div>
    </div>`;

    modal.addEventListener('click', (event) => {
      const result = event.target === modal
        ? 'cancel'
        : event.target.closest('[data-result]') && event.target.closest('[data-result]').dataset.result;

      if (!result) return;

      modal.remove();
      resolve(result === 'ok');
    });

    document.body.appendChild(modal);
  });
}

  function openInputModal(config) {
    openModal({ title: config.title, fields: field(config.name || 'value', config.label || 'Value', config.type || 'text', config.attrs || '') });
    const modal = document.querySelector('.fc-modal');
    const form = modal.querySelector('form');
    const input = form.querySelector('[name="' + (config.name || 'value') + '"]');
    if (config.value != null) input.value = config.value;
    form.querySelector('.fc-form-actions').innerHTML = '<button class="secondary-button" type="button" data-close>Cancel</button><button class="primary-button" type="submit">Save</button>';
    return new Promise((resolve) => {
      modal.addEventListener('click', (event) => {
        if (event.target === modal || event.target.closest('[data-close]')) resolve(null);
      }, { once: true });
      form.onsubmit = (event) => {
        event.preventDefault();
        const value = input.value;
        closeModal();
        resolve(value);
      };
    });
  }
  async function openScheduleModal(jobId, mode) {
    await preloadLookups();
    const job = state.jobs.find((item) => item.id === jobId) || await api('/jobs/' + jobId);
    const title = mode === 'reschedule' ? 'Reschedule Job' : 'Schedule Job';
    openModal({
      title,
      fields: `<div class="field span-2"><label>Job</label><input value="${escapeHtml(job.title || 'Job')}" disabled></div>` +
        select('workerId', 'Worker', optionList(state.workers, 'Select worker'), true) +
        field('startsAt', 'Start', 'datetime-local', 'required') +
        field('durationMinutes', 'Duration Minutes', 'number', 'min="1" value="' + escapeHtml(job.durationMinutes || 60) + '"') +
        field('travelBufferMinutes', 'Travel Buffer Minutes', 'number', 'min="0" value="' + escapeHtml(job.travelBufferMinutes || 0) + '"') +
        `<div class="field span-2"><label for="fc-notes">Notes</label><textarea id="fc-notes" name="notes"></textarea></div>`
    });
    const modal = document.querySelector('.fc-modal');
    const form = modal.querySelector('form');
    form.workerId.value = job.workerId || '';
    form.startsAt.value = localDateTimeValue(job.scheduledStart);
    form.querySelector('.fc-form-actions').innerHTML = '<button class="secondary-button" type="button" data-close>Cancel</button><button class="primary-button" type="submit">Save</button>';
    form.onsubmit = async (event) => {
      event.preventDefault();
      const error = modal.querySelector('.fc-form-error');
      error.hidden = true;
      const body = Object.fromEntries(new FormData(form).entries());
      Object.keys(body).forEach((key) => { if (body[key] === '') delete body[key]; });
      body.durationMinutes = Number(body.durationMinutes || 60);
      body.travelBufferMinutes = Number(body.travelBufferMinutes || 0);
      try {
        const check = await api('/schedule/check-conflicts', { method: 'POST', body: JSON.stringify({ ...body, jobId }) });
        if (check.hasConflict) {
          const message = check.conflicts.map((item) => item.message).join('\n');
          if (!hasPermission('schedule.override')) {
            error.textContent = 'This time has a clash. Choose another time or worker.';
            error.hidden = false;
            return;
          }
          const override = await openConfirmModal({
            title: 'Schedule clash',
            message: 'This time has a clash. You can change the time or allow it anyway.',
            detail: message,
            cancelLabel: 'Change schedule',
            okLabel: 'Allow anyway',
            closeExisting: false
          });
          if (!override) return;
          body.adminOverride = true;
        }
        await api('/jobs/' + jobId + '/' + (mode === 'reschedule' ? 'reschedule' : 'schedule'), { method: 'POST', body: JSON.stringify(body) });
        closeModal();
        await load();
        showToast(mode === 'reschedule' ? 'Job rescheduled.' : 'Job scheduled.', true);
      } catch (err) {
        if (err.status === 409 && err.details && err.details.conflicts && hasPermission('schedule.override')) {
          const detail = err.details.conflicts.map((item) => item.message).join('\n');
          const override = await openConfirmModal({
            title: 'Schedule clash',
            message: 'This time has a clash. You can change the time or allow it anyway.',
            detail,
            cancelLabel: 'Change schedule',
            okLabel: 'Allow anyway',
            closeExisting: false
          });
          if (override) {
            body.adminOverride = true;
            try {
              await api('/jobs/' + jobId + '/' + (mode === 'reschedule' ? 'reschedule' : 'schedule'), { method: 'POST', body: JSON.stringify(body) });
              closeModal();
              await load();
              showToast(mode === 'reschedule' ? 'Job rescheduled.' : 'Job scheduled.', true);
              return;
            } catch (retryError) {
              error.textContent = retryError.message;
              error.hidden = false;
              return;
            }
          }
        }
        error.textContent = err.message;
        error.hidden = false;
      }
    };
  }
  function closeModal() {
    const modal = document.querySelector('.fc-modal');
    if (modal) modal.remove();
    syncModalScrollLock();
  }

  function createPermission(resource) {
    return ({ customers: 'customers.create', workers: 'workers.manage', jobs: 'jobs.create', quotes: 'quotes.create', invoices: 'invoices.create' })[resource];
  }

  function createResourceForButton(button) {
    const text = button.textContent.trim().toLowerCase();
    return button.dataset.createResource || (text.includes('worker') ? 'workers' : text.includes('customer') ? 'customers' : text.includes('job') ? 'jobs' : text.includes('quote') ? 'quotes' : text.includes('invoice') ? 'invoices' : null);
  }

  function setupCreateButtons() {
    document.querySelectorAll('.primary-button').forEach((button) => {
      if (button.closest('form')) return;
      const text = button.textContent.trim().toLowerCase();
      if (!text.startsWith('+ new ')) return;
      button.addEventListener('click', async () => {
        const resource = createResourceForButton(button);
        const permission = createPermission(resource);
        if (!resource || permission && !hasPermission(permission)) return;
        await preloadLookups();
        openModal(formFor(resource));
      });
    });
  }

  function peopleResource() {
    const active = document.querySelector('[data-people-tab].active');
    return active && active.dataset.peopleTab || 'customers';
  }

  function updatePeopleChrome(resource) {
    const title = document.querySelector('[data-people-title]');
    const copy = document.querySelector('[data-people-copy]');
    const create = document.querySelector('[data-people-create]');
    if (title) title.textContent = resource === 'workers' ? 'Workers' : 'Customers';
    if (copy) copy.textContent = resource === 'workers'
      ? 'Manage field workers, contact details, titles, and active team status.'
      : 'Customer records, balances, and service history will appear here once created.';
    if (create) {
      create.textContent = resource === 'workers' ? '+ New Worker' : '+ New Customer';
      create.dataset.createResource = resource;
      create.hidden = !hasPermission(resource === 'workers' ? 'workers.manage' : 'customers.create');
    }
  }

  async function loadPeopleResource(resource) {
    updatePeopleChrome(resource);
    if (!state.listFilters[resource]) state.listFilters[resource] = 'all';
    const data = await api('/' + resource);
    state[resource] = data;
    renderTable(resource, filteredListData(resource, data));
    setupStatusTabs(resource, data);
    updateListStats(resource, data);
  }

  function setupPeopleTabs() {
    const tabs = document.querySelectorAll('[data-people-tab]');
    if (!tabs.length) return;
    tabs.forEach((tab) => {
      tab.onclick = async () => {
        const resource = tab.dataset.peopleTab || 'customers';
        tabs.forEach((item) => item.classList.toggle('active', item === tab));
        try {
          await loadPeopleResource(resource);
          setStatus('Connected as ' + state.user.name, true);
        } catch (error) {
          setStatus(error.message, false);
        }
      };
    });
  }

  function activeQuoteFilter() {
    const active = document.querySelector('body[data-page="quotes"] [data-status-filter].active');
    return active && active.dataset.statusFilter || 'all';
  }

  function updateQuoteBinNote(filter) {
    const note = document.querySelector('[data-quote-bin-note]');
    if (note) note.hidden = filter !== 'DELETED';
  }

  async function loadQuotesResource(filter) {
    const selected = filter || activeQuoteFilter();
    const deleted = selected === 'DELETED';
    const data = await api('/quotes' + (deleted ? '?deleted=true' : ''));
    state.quotes = data;
    state.listFilters.quotes = deleted ? 'all' : selected;
    renderTable('quotes', deleted ? data : filteredListData('quotes', data));
    updateListStats('quotes', deleted ? [] : data);
    updateQuoteBinNote(selected);
  }

  function setupQuoteTabs() {
    document.querySelectorAll('body[data-page="quotes"] [data-status-filter]').forEach((tab) => {
      tab.classList.toggle('active', (activeQuoteFilter() || 'all') === tab.dataset.statusFilter);
      tab.onclick = async () => {
        const filter = tab.dataset.statusFilter || 'all';
        document.querySelectorAll('body[data-page="quotes"] [data-status-filter]').forEach((item) => item.classList.toggle('active', item === tab));
        try {
          await loadQuotesResource(filter);
          setStatus('Connected as ' + state.user.name, true);
        } catch (error) {
          setStatus(error.message, false);
          showToast(error.message, false);
        }
      };
    });
  }



  function detailItem(label, value) {
    return `<div class="job-detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '-')}</strong></div>`;
  }

  function renderJobAssetSummary(job) {
    const assets = (job.jobAssets || job.assets || []).map((item) => item.asset || item).filter(Boolean);
    if (!assets.length) return '<section class="job-evidence-section"><h4>Linked Assets</h4><div class="empty-state"><div><strong>No linked assets.</strong></div></div></section>';
    return '<section class="job-evidence-section"><h4>Linked Assets</h4><div class="list">' + assets.map((asset) => '<div class="list-item"><span class="initials">' + escapeHtml(String(asset.name || 'AS').slice(0, 2).toUpperCase()) + '</span><div><strong>' + escapeHtml(asset.name || 'Asset') + '</strong><small>' + escapeHtml([asset.assetType, asset.assetTag || asset.serialNumber, asset.locationLabel].filter(Boolean).join(' - ')) + '</small></div>' + badge(asset.status || 'ACTIVE') + '</div>').join('') + '</div></section>';
  }

  function lifecycleActions(job) {
    const status = String(job.status || '').toUpperCase();
    const buttons = [];
    const add = (label, action, primary) => buttons.push(`<button class="${primary ? 'primary-button' : 'secondary-button'} compact" type="button" data-job-lifecycle="${action}">${label}</button>`);
    if (status === 'SCHEDULED' || status === 'DISPATCHED') add('Arrived', 'arrive');
    if (status === 'ARRIVED' || status === 'SCHEDULED' || status === 'DISPATCHED') add('Start', 'start', status === 'ARRIVED');
    if (status === 'IN_PROGRESS') add('Pause', 'pause');
    if (status === 'PAUSED') add('Resume', 'resume', true);
    if (status === 'IN_PROGRESS' || status === 'PAUSED') add('Complete', 'complete', true);
    return buttons.join('');
  }

  function activityTitle(item) {
    return String(item.type || 'STATUS_CHANGED').replace(/_/g, ' ');
  }

  function renderActivityTimeline(items) {
    if (!items.length) return '<div class="empty-state job-activity-empty"><div><strong>No activity yet</strong><span>Lifecycle updates and notes will appear here.</span></div></div>';
    return `<div class="job-timeline">${items.map(renderActivityTimelineItem).join('')}</div>`;
  }

  function renderActivityTimelineItem(item) {
    const actor = item.user && (item.user.name || item.user.email) || item.worker && item.worker.user && item.worker.user.name || 'FieldCore';
    return `<div class="job-timeline-item"><span class="job-timeline-dot"></span><div><div class="job-timeline-head"><strong>${escapeHtml(activityTitle(item))}</strong><small>${escapeHtml(formatDateTime(item.createdAt))}</small></div><small>${escapeHtml(actor)}</small>${item.note ? `<p>${escapeHtml(item.note)}</p>` : ''}</div></div>`;
  }

  function jobEvidenceSummary(job) {
    const evidence = job.completionEvidence || {};
    const proofPhotoCount = Number(evidence.proofPhotoCount != null ? evidence.proofPhotoCount : (job.proofPhotos || []).length);
    const proofRequired = Boolean(job.requiresProofPhotos || evidence.proofPhotosRequired);
    const proofMissing = proofRequired && proofPhotoCount < 1;
    const beforeMissing = Boolean(job.requiresBeforePhotos || evidence.beforePhotosRequired) && Number(evidence.beforePhotoCount || 0) < 1;
    const afterMissing = Boolean(job.requiresAfterPhotos || evidence.afterPhotosRequired) && Number(evidence.afterPhotoCount || 0) < 1;
    const signatureCaptured = Boolean(job.signature || evidence.signatureCaptured);
    const signatureMissing = Boolean(job.requiresSignature || evidence.signatureRequired) && !signatureCaptured;
    const locationMissing = Boolean(job.requiresLocation || evidence.locationRequired) && !evidence.locationCaptured;
    return { proofPhotoCount, proofMissing, beforeMissing, afterMissing, signatureMissing, locationMissing, missing: proofMissing || beforeMissing || afterMissing || signatureMissing || locationMissing };
  }

  function renderCompletionRequirements(job) {
    const summary = jobEvidenceSummary(job);
    const proofLabel = job.requiresProofPhotos ? (summary.proofMissing ? 'Missing' : 'Captured') : "Not required";
    const beforeLabel = job.requiresBeforePhotos ? (summary.beforeMissing ? 'Missing' : 'Captured') : "Not required";
    const afterLabel = job.requiresAfterPhotos ? (summary.afterMissing ? 'Missing' : 'Captured') : "Not required";
    const signatureLabel = job.requiresSignature ? (summary.signatureMissing ? "Missing" : "Captured") : "Not required";
    const locationLabel = job.requiresLocation ? (summary.locationMissing ? "Missing" : "Captured") : "Optional";
    return `<section class="job-evidence-section"><h4>Completion Requirements</h4><div class="job-detail-grid">${detailItem("Proof Photos", proofLabel)}${detailItem("Before Photos", beforeLabel)}${detailItem("After Photos", afterLabel)}${detailItem("Customer Signature", signatureLabel)}${detailItem("Completion Location", locationLabel)}${detailItem("Completion Notes", "Required")}</div></section>`;
  }

  function renderProofPhotos(job, options = {}) {
    const editable = options.editable !== false;
    const photos = job.proofPhotos || [];
    const group = (label, category) => {
      const groupPhotos = photos.filter((photo) => (photo.category || 'GENERAL') === category || category === 'GENERAL' && !['BEFORE', 'AFTER'].includes(photo.category || 'GENERAL'));
      const items = groupPhotos.length ? groupPhotos.map(renderProofPhotoItem).join("") : renderProofEmpty(label);
      const key = 'proof-' + category.toLowerCase();
      const upload = editable ? `<form class="job-proof-form proof-category-upload" data-proof-category="${escapeHtml(category)}"><input type="hidden" name="category" value="${escapeHtml(category)}"><div class="proof-selected-preview" data-evidence-preview="${escapeHtml(key)}"><strong>No photos selected</strong></div><div class="proof-upload-controls"><div class="file-upload-row"><label class="file-upload-button" for="fc-${escapeHtml(key)}">Choose photos</label><span class="file-name" data-evidence-file-name="${escapeHtml(key)}">No files selected</span></div><input id="fc-${escapeHtml(key)}" name="photo" type="file" accept="image/png,image/jpeg,image/webp" data-evidence-input="${escapeHtml(key)}" required multiple hidden><small>PNG, JPG, or WEBP. Max 5MB each. Choose again to replace the current selection.</small></div><div class="field proof-caption-field"><label for="fc-${escapeHtml(key)}-caption">Caption</label><input id="fc-${escapeHtml(key)}-caption" name="caption" maxlength="500" placeholder="${escapeHtml(label)}"></div><div class="fc-form-actions"><button class="secondary-button compact" type="submit">Upload ${escapeHtml(label)}</button></div><p class="fc-form-error" hidden></p></form>` : '';
      return `<div class="proof-category-section" data-proof-category-section="${escapeHtml(category)}"><h5>${escapeHtml(label)}</h5><div class="job-proof-list" data-proof-list="${escapeHtml(category)}">${items}</div>${upload}</div>`;
    };
    return `<section class="job-evidence-section"><h4>Proof Photos</h4>${group('Before Photos', 'BEFORE')}${group('After Photos', 'AFTER')}${group('General Proof Photos', 'GENERAL')}</section>`;
  }

  function proofPhotoCategory(photo) {
    return ['BEFORE', 'AFTER'].includes(photo && photo.category || '') ? photo.category : 'GENERAL';
  }

  function proofCategoryLabel(category) {
    return { BEFORE: 'Before Photos', AFTER: 'After Photos', GENERAL: 'General Proof Photos' }[category] || 'Proof Photos';
  }

  function renderProofPhotoItem(photo) {
    const category = proofPhotoCategory(photo);
    const label = proofCategoryLabel(category);
    const remove = isWorker() ? `<button class="secondary-button compact" type="button" data-proof-delete="${escapeHtml(photo.id)}">Remove</button>` : '';
    return `<div class="job-proof-photo" data-proof-photo-id="${escapeHtml(photo.id)}" data-proof-category="${escapeHtml(category)}"><button class="proof-thumb-button" type="button" data-proof-preview="${escapeHtml(photo.id)}"><img src="${escapeHtml(photo.url)}" alt="Proof photo"></button><div><strong>${escapeHtml(photo.caption || label)}</strong><small>${escapeHtml((photo.category || 'GENERAL').replace(/_/g, ' '))} / ${escapeHtml(formatDateTime(photo.createdAt))}</small></div>${remove}</div>`;
  }

  function renderProofEmpty(label) {
    return `<div class="empty-state compact-empty"><div><strong>No ${escapeHtml(label.toLowerCase())}</strong><span>Upload evidence here.</span></div></div>`;
  }

  function resetProofUploadForm(form) {
    if (!form) return;
    const input = form.querySelector('[data-evidence-input]');
    const key = input && input.dataset.evidenceInput;
    if (input) input.value = '';
    const preview = key && form.querySelector('[data-evidence-preview="' + key + '"]');
    const fileName = key && form.querySelector('[data-evidence-file-name="' + key + '"]');
    if (preview) {
      preview.classList.remove('has-proof-previews');
      preview.innerHTML = '<strong>No photos selected</strong>';
    }
    if (fileName) fileName.textContent = 'No files selected';
    const caption = form.querySelector('[name="caption"]');
    if (caption) caption.value = '';
  }

  function appendProofPhotoToModal(modal, photo) {
    const category = proofPhotoCategory(photo);
    const list = modal.querySelector('[data-proof-list="' + category + '"]');
    if (!list) return;
    const empty = list.querySelector('.empty-state');
    if (empty) empty.remove();
    list.insertAdjacentHTML('afterbegin', renderProofPhotoItem(photo));
  }


  function openProofPhotoPreview(photo) {
    const modal = document.createElement('div');
    modal.className = 'fc-modal';
    modal.innerHTML = '<div class="fc-dialog proof-preview-dialog"><div class="panel-head"><div><h3>' + escapeHtml(photo && photo.caption || 'Proof photo') + '</h3><p class="modal-copy">' + escapeHtml(photo && formatDateTime(photo.createdAt) || '') + '</p></div><button class="icon-button" type="button" data-close>&times;</button></div>' + (photo && photo.url ? '<img src="' + escapeHtml(photo.url) + '" alt="Proof photo">' : '<div class="empty-state"><div><strong>Photo not available</strong></div></div>') + '</div>';
    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest('[data-close]')) modal.remove();
    });
    document.body.appendChild(modal);
  }

  function renderSignature(job, options = {}) {
    const editable = options.editable !== false;
    const signature = job.signature;
    const preview = signature ? '<button class="signature-preview-box has-signature" type="button" data-signature-preview><img src="' + escapeHtml(signature.signatureUrl) + '" alt="Customer signature"><span>' + escapeHtml(signature.signerName || 'Customer signature') + '</span><small>' + escapeHtml(formatDateTime(signature.createdAt)) + '</small></button>' : '<button class="signature-preview-box" type="button" data-signature-preview><strong>Signature not available</strong></button>';
    const actions = editable ? '<div class="row-actions"><button class="primary-button compact" type="button" data-signature-capture>Sign</button><button class="secondary-button compact" type="button" data-signature-delete ' + (signature ? '' : 'disabled') + '>Delete</button></div>' : '';
    const signerField = editable ? '<div class="field signature-signer-field"><label for="fc-signer-name">Signer Name</label><input id="fc-signer-name" name="signerName" maxlength="160" data-signature-signer-name value="' + escapeHtml(signature && signature.signerName || '') + '"></div>' : '';
    return '<section class="job-evidence-section" data-signature-section><div class="signature-section-head"><h4>Customer Signature</h4>' + actions + '</div>' + preview + signerField + '<p class="fc-form-error" data-signature-message hidden></p></section>';
  }

  function dataUrlToFile(dataUrl, filename) {
    const parts = dataUrl.split(',');
    const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/png';
    const binary = atob(parts[1] || '');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new File([bytes], filename, { type: mime });
  }

  function openSignaturePreview(signature) {
    const modal = document.createElement('div');
    modal.className = 'fc-modal';
    modal.innerHTML = '<div class="fc-dialog signature-preview-dialog"><div class="panel-head"><h3>Customer Signature</h3><button class="icon-button" type="button" data-close>&times;</button></div>' + (signature ? '<img src="' + escapeHtml(signature.signatureUrl) + '" alt="Customer signature">' : '<div class="empty-state"><div><strong>Signature not available</strong></div></div>') + '</div>';
    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest('[data-close]')) modal.remove();
    });
    document.body.appendChild(modal);
  }

  function openSignatureCapture(job) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fc-modal signature-capture-modal';
      modal.innerHTML = '<div class="signature-capture-screen"><canvas></canvas><p class="fc-form-error" data-signature-capture-message hidden></p><div class="signature-capture-actions"><button class="secondary-button" type="button" data-signature-clear>Clear</button><button class="primary-button" type="button" data-signature-done>Done</button></div></div>';
      const canvas = modal.querySelector('canvas');
      const context = canvas.getContext('2d');
      const message = modal.querySelector('[data-signature-capture-message]');
      let drawing = false;
      let hasInk = false;
      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        const scale = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(rect.width * scale));
        canvas.height = Math.max(1, Math.floor(rect.height * scale));
        context.setTransform(scale, 0, 0, scale, 0, 0);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, rect.width, rect.height);
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.lineWidth = 4;
        context.strokeStyle = '#08152f';
      };
      const point = (event) => {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
      };
      const startDraw = (event) => {
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        drawing = true;
        const next = point(event);
        context.beginPath();
        context.moveTo(next.x, next.y);
      };
      const moveDraw = (event) => {
        if (!drawing) return;
        event.preventDefault();
        const next = point(event);
        context.lineTo(next.x, next.y);
        context.stroke();
        hasInk = true;
      };
      const endDraw = (event) => {
        drawing = false;
        if (event && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      };
      modal.querySelector('[data-signature-clear]').addEventListener('click', () => {
        resize();
        hasInk = false;
        if (message) message.hidden = true;
      });
      modal.querySelector('[data-signature-done]').addEventListener('click', () => {
        if (!hasInk) {
          if (message) { message.textContent = 'Please sign before saving.'; message.hidden = false; }
          return;
        }
        const file = dataUrlToFile(canvas.toDataURL('image/png'), 'signature.png');
        modal.remove();
        resolve(file);
      });
      canvas.addEventListener('pointerdown', startDraw);
      canvas.addEventListener('pointermove', moveDraw);
      canvas.addEventListener('pointerup', endDraw);
      canvas.addEventListener('pointercancel', endDraw);
      document.body.appendChild(modal);
      resize();
      window.setTimeout(resize, 0);
    });
  }

  async function uploadSignatureFile(jobId, file, signerName) {
    const formData = new FormData();
    formData.append('signature', file, 'signature.png');
    formData.append('signerName', signerName || '');
    const response = await fetch(API_BASE + '/jobs/' + jobId + '/signature', { method: 'POST', credentials: 'include', body: formData });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error && payload.error.message || 'HTTP ' + response.status);
    return payload.data;
  }

  function setupEvidenceUploadPreviews(root) {
    root.querySelectorAll('[data-evidence-input]').forEach((input) => {
      const key = input.dataset.evidenceInput;
      const preview = root.querySelector('[data-evidence-preview=' + key + ']');
      const fileName = root.querySelector('[data-evidence-file-name=' + key + ']');
      const updateSelectedFiles = (nextFiles) => {
        const transfer = new DataTransfer();
        nextFiles.forEach((selected) => transfer.items.add(selected));
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      input.addEventListener('change', () => {
        const files = Array.from(input.files || []);
        const file = files[0];
        const isProofInput = key.indexOf('proof') === 0;
        if (!file) {
          if (fileName) fileName.textContent = isProofInput ? 'No files selected' : 'No file selected';
          if (preview) preview.innerHTML = isProofInput ? '<strong>No photos selected</strong>' : 'Sign';
          return;
        }
        if (fileName) fileName.textContent = files.length > 1 ? files.length + ' files selected' : file.name;
        if (!preview) return;
        if (isProofInput) {
          preview.classList.add('has-proof-previews');
          preview.replaceChildren();
          files.forEach((selected, index) => {
            const item = document.createElement('div');
            item.className = 'proof-preview-item';
            const image = document.createElement('img');
            image.alt = 'Proof photo preview ' + (index + 1);
            const label = document.createElement('span');
            label.textContent = selected.name;
            const remove = document.createElement('button');
            remove.className = 'proof-preview-remove';
            remove.type = 'button';
            remove.textContent = 'Remove';
            remove.addEventListener('click', () => {
              updateSelectedFiles(files.filter((_, fileIndex) => fileIndex !== index));
            });
            item.append(image, label, remove);
            preview.appendChild(item);
            const reader = new FileReader();
            reader.addEventListener('load', () => { image.src = reader.result; });
            reader.readAsDataURL(selected);
          });
          return;
        }
        const reader = new FileReader();
        reader.addEventListener('load', () => {
          const image = document.createElement('img');
          image.src = reader.result;
          image.alt = 'Signature preview';
          preview.replaceChildren(image);
        });
        reader.readAsDataURL(file);
      });
    });
  }
  async function uploadJobEvidence(jobId, path, form) {
    const body = form instanceof FormData ? form : new FormData(form);
    const response = await fetch(API_BASE + "/jobs/" + jobId + path, { method: "POST", credentials: "include", body });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error && payload.error.message || "HTTP " + response.status);
    return payload.data;
  }

  async function completeJobWithNotes(job) {
    const summary = jobEvidenceSummary(job);
    const notesRequired = !state.scheduleSettings || state.scheduleSettings.requireCompletionNotes !== false;
    const notes = await openInputModal({ title: "Complete Job", label: notesRequired ? "Completion Notes" : "Completion Notes (Optional)", name: "completionNotes", type: "text", attrs: (notesRequired ? "required " : "") + "maxlength='2000'" });
    if (notesRequired && !notes) return false;
    if (!notesRequired && notes == null) return false;
    const body = { completionNotes: notes };
    if (summary.missing) {
      if (!state.user || state.user.role === "WORKER") throw new Error("Upload required completion evidence before completing this job.");
      const override = await openConfirmModal({ title: "Missing Evidence", message: "This job is missing required completion evidence. Complete anyway with admin override?", okLabel: "Complete Anyway", cancelLabel: "Cancel", closeExisting: false });
      if (!override) return false;
      body.adminOverride = true;
    } else if (state.user && state.user.role !== "WORKER" && !["IN_PROGRESS", "PAUSED"].includes(String(job.status || "").toUpperCase())) body.adminOverride = true;
    await api("/jobs/" + job.id + "/complete", { method: "POST", body: JSON.stringify(body) });
    return true;
  }

  function captureBrowserLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Location capture is not available in this browser.'));
      navigator.geolocation.getCurrentPosition((position) => {
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: new Date().toISOString(), source: 'WORKER_BROWSER' });
      }, () => reject(new Error('Location capture was not allowed or failed.')), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    });
  }

  function renderCompletionLocation(job, options = {}) {
    const editable = options.editable !== false;
    const location = job.completionLocation;
    const status = location
      ? detailItem('Captured', formatDateTime(location.capturedAt)) + detailItem('Accuracy', location.accuracy ? Math.round(Number(location.accuracy)) + ' m' : '-') + detailItem('Latitude', location.latitude) + detailItem('Longitude', location.longitude) + detailItem('Source', String(location.source || '-').replace(/_/g, ' '))
      : detailItem('Location', job.requiresLocation ? 'Missing' : 'Not captured');
    const action = editable ? '<div class="location-capture-actions"><button class="secondary-button compact" type="button" data-location-capture>Capture Location</button></div>' : '';
    return `<section class="job-evidence-section" data-location-section><h4>Completion Location</h4><div class="job-detail-grid">${status}</div>${action}<p class="fc-form-error" data-location-message hidden></p></section>`;
  }

  async function openJobDetail(jobId) {
    closeModal();
    const [job, activity] = await Promise.all([api('/jobs/' + jobId), api('/jobs/' + jobId + '/activity')]);
    const editableEvidence = isWorker();
    const lifecycle = editableEvidence ? '<div class="job-lifecycle-actions">' + lifecycleActions(job) + '</div>' : '';
    const noteForm = editableEvidence ? '<form class="job-note-form"><div class="field"><label for="fc-job-note">Worker Activity Note</label><textarea id="fc-job-note" name="note" maxlength="2000"></textarea></div><div class="fc-form-actions"><button class="secondary-button compact" type="submit">Add Note</button></div><p class="fc-form-error" hidden></p></form>' : '';
    const modal = document.createElement('div');
    modal.className = 'fc-modal';
    modal.innerHTML = `<div class="fc-dialog job-detail-dialog ${editableEvidence ? 'worker-job-detail-dialog' : 'admin-job-detail-dialog'}"><div class="panel-head"><div><h3>${escapeHtml(job.title || 'Job')}</h3><p class="modal-copy">${escapeHtml(job.customer && job.customer.name || 'No customer')}</p></div><button class="icon-button" type="button" data-close>&times;</button></div><div class="job-detail-grid">${detailItem('Customer', job.customer && job.customer.name)}${detailItem('Worker', job.worker && job.worker.user && job.worker.user.name)}${detailItem('Contract', job.contract && (job.contract.contractNumber || job.contract.name))}${detailItem('Scheduled', formatDateTime(job.scheduledStart))}${detailItem('Response Due', formatDateTime(job.responseDueAt))}${detailItem('Completion Due', formatDateTime(job.completionDueAt))}${detailItem('Completed', formatDateTime(job.completedAt))}<div class="job-detail-item"><span>Status</span>${badge(job.status)}</div><div class="job-detail-item"><span>SLA</span>${badge(job.slaStatus || 'NOT_APPLICABLE')}</div></div>${job.completionNotes ? `<div class="job-notes"><span>Completion Notes</span><p>${escapeHtml(job.completionNotes)}</p></div>` : ''}${lifecycle}${renderJobAssetSummary(job)}${renderCompletionRequirements(job)}${renderProofPhotos(job, { editable: editableEvidence })}${renderSignature(job, { editable: editableEvidence })}${renderCompletionLocation(job, { editable: editableEvidence })}${noteForm}<section class="job-activity-section"><h4>Activity Timeline</h4>${renderActivityTimeline(activity || [])}</section></div>`;
    modal.addEventListener('click', async (event) => {
      if (event.target === modal || event.target.closest('[data-close]')) return closeModal();
      const proofDelete = event.target.closest('[data-proof-delete]');
      const proofPreview = event.target.closest('[data-proof-preview]');
      const signatureDelete = event.target.closest('[data-signature-delete]');
      const signatureCapture = event.target.closest('[data-signature-capture]');
      const signaturePreview = event.target.closest('[data-signature-preview]');
      const locationCapture = event.target.closest('[data-location-capture]');
      const actionButton = event.target.closest('[data-job-lifecycle]');
      if (!proofDelete && !proofPreview && !signatureDelete && !signatureCapture && !signaturePreview && !locationCapture && !actionButton) return;
      const action = actionButton && actionButton.dataset.jobLifecycle;
      try {
        if (proofDelete) {
          await api('/jobs/' + job.id + '/proof-photos/' + proofDelete.dataset.proofDelete, { method: 'DELETE' });
          job.proofPhotos = (job.proofPhotos || []).filter((photo) => photo.id !== proofDelete.dataset.proofDelete);
          const item = proofDelete.closest('.job-proof-photo');
          const list = item && item.parentElement;
          const category = item && item.dataset.proofCategory || 'GENERAL';
          if (item) item.remove();
          if (list && !list.querySelector('.job-proof-photo')) list.innerHTML = renderProofEmpty(proofCategoryLabel(category));
          showToast('Proof photo removed.', true);
          return;
        } else if (proofPreview) {
          openProofPhotoPreview((job.proofPhotos || []).find((photo) => photo.id === proofPreview.dataset.proofPreview));
          return;
        } else if (signaturePreview) {
          openSignaturePreview(job.signature);
          return;
        } else if (signatureCapture) {
          const file = await openSignatureCapture(job);
          const signerName = modal.querySelector('[data-signature-signer-name]') && modal.querySelector('[data-signature-signer-name]').value;
          job.signature = await uploadSignatureFile(job.id, file, signerName);
          const section = modal.querySelector('[data-signature-section]');
          if (section) section.outerHTML = renderSignature(job);
          showToast('Signature saved.', true);
          return;
        } else if (signatureDelete) {
          const confirmed = await openConfirmModal({ title: 'Delete Signature', message: 'Are you sure you want to delete this customer signature?', okLabel: 'Delete', cancelLabel: 'Cancel', closeExisting: false });
          if (!confirmed) return;
          await api('/jobs/' + job.id + '/signature', { method: 'DELETE' });
          job.signature = null;
          const section = modal.querySelector('[data-signature-section]');
          if (section) section.outerHTML = renderSignature(job);
          showToast('Signature deleted.', true);
          return;
        } else if (locationCapture) {
          const location = await captureBrowserLocation();
          job.completionLocation = await api('/jobs/' + job.id + '/completion-location', { method: 'POST', body: JSON.stringify(location) });
          const section = modal.querySelector('[data-location-section]');
          if (section) section.outerHTML = renderCompletionLocation(job);
          showToast('Location captured.', true);
          return;
        } else if (action === 'complete') {
          const completed = await completeJobWithNotes(job);
          if (!completed) return;
        } else {
          await api('/jobs/' + job.id + '/' + action, { method: 'POST', body: '{}' });
        }
        await load();
        await openJobDetail(job.id);
      } catch (error) {
        const message = modal.querySelector('[data-signature-message]') || modal.querySelector('.fc-form-error');
        if (message) { message.textContent = error.message; message.hidden = false; }
      }
    });
    setupEvidenceUploadPreviews(modal);
    modal.querySelectorAll('.job-proof-form').forEach((proofForm) => {
      proofForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = event.currentTarget.querySelector('.fc-form-error');
        if (message) message.hidden = true;
        try {
          const files = Array.from(event.currentTarget.photo && event.currentTarget.photo.files || []);
          if (!files.length) {
            if (message) { message.textContent = 'Choose at least one photo before uploading.'; message.hidden = false; }
            return;
          }
          const caption = event.currentTarget.caption && event.currentTarget.caption.value || '';
          const category = event.currentTarget.category && event.currentTarget.category.value || event.currentTarget.dataset.proofCategory || 'GENERAL';
          for (const file of files) {
            const formData = new FormData();
            formData.append('photo', file);
            formData.append('caption', caption);
            formData.append('category', category);
            const photo = await uploadJobEvidence(job.id, '/proof-photos', formData);
            job.proofPhotos = [photo].concat(job.proofPhotos || []);
            appendProofPhotoToModal(modal, photo);
          }
          resetProofUploadForm(event.currentTarget);
          showToast(files.length === 1 ? 'Proof photo uploaded.' : files.length + ' proof photos uploaded.', true);
        } catch (error) {
          if (message) { message.textContent = error.message; message.hidden = false; }
        }
      });
    });
   const noteFormNode = modal.querySelector('.job-note-form');
   if (noteFormNode) noteFormNode.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const note = event.currentTarget.note.value.trim();
      if (!note) return;
      const message = modal.querySelector('.fc-form-error');
      if (message) message.hidden = true;
      try {
        const item = await api('/jobs/' + job.id + '/activity', { method: 'POST', body: JSON.stringify({ note }) });
        const section = modal.querySelector('.job-activity-section');
        const empty = section && section.querySelector('.job-activity-empty');
        if (empty) empty.outerHTML = '<div class="job-timeline"></div>';
        const timeline = section && section.querySelector('.job-timeline');
        if (timeline) timeline.insertAdjacentHTML('afterbegin', renderActivityTimelineItem(item));
        form.reset();
        showToast('Activity note added.', true);
      } catch (error) {
        if (message) { message.textContent = error.message; message.hidden = false; }
      }
    });
    document.body.appendChild(modal);
  }
  async function handleWorkerDashboardAction(event) {
    const button = event.target.closest('[data-worker-dashboard-action]');
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.workerDashboardAction;
    try {
      const job = await api('/jobs/' + id);
      if (action === 'complete') {
        const completed = await completeJobWithNotes(job);
        if (!completed) return;
      } else {
        await api('/jobs/' + id + '/' + action, { method: 'POST', body: '{}' });
      }
      await load();
    } catch (error) {
      setStatus(error.message, false);
    }
  }


  function bookingDetail(label, value) {
    const q = String.fromCharCode(34);
    return '<div class=' + q + 'booking-detail-row' + q + '><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value || '-') + '</strong></div>';
  }

  function openBookingRequestModal(item) {
    const q = String.fromCharCode(34);
    const modal = document.createElement('div');
    modal.className = 'fc-modal';
    const service = item.service && item.service.name || item.serviceName || '-';
    const contact = [item.customerEmail, item.customerPhone].filter(Boolean).join(' / ') || '-';
    const preferred = [formatDate(item.preferredDate), item.preferredTimeWindow && String(item.preferredTimeWindow).replace(/_/g, ' ')].filter(Boolean).join(' / ') || '-';
    const photos = (item.photos || []).map((photo) => '<a class=' + q + 'secondary-button compact' + q + ' href=' + q + escapeHtml(photo.url) + q + ' target=' + q + '_blank' + q + ' rel=' + q + 'noreferrer' + q + '>' + escapeHtml(photo.originalName || photo.filename || 'Photo') + '</a>').join('');
    modal.innerHTML = '<div class=' + q + 'fc-dialog job-detail-dialog booking-detail-dialog' + q + '><div class=' + q + 'panel-head' + q + '><div><h3>Booking Request</h3><p class=' + q + 'modal-copy' + q + '>' + escapeHtml(item.customerName || 'Customer') + '</p></div><button class=' + q + 'icon-button' + q + ' type=' + q + 'button' + q + ' data-close>&times;</button></div><div class=' + q + 'booking-detail-list' + q + '>' + bookingDetail('Reference', item.publicReference) + bookingDetail('Source', item.source) + bookingDetail('Customer', item.customerName) + bookingDetail('Contact', contact) + bookingDetail('Service', service) + bookingDetail('Preferred', preferred) + bookingDetail('Address', item.address) + bookingDetail('City/Suburb', item.city) + bookingDetail('Property Type', item.propertyType) + bookingDetail('Status', String(item.status || '-').replace(/_/g, ' ')) + bookingDetail('Created', formatDateTime(item.createdAt)) + bookingDetail('Converted Job', item.convertedJob && item.convertedJob.title) + (item.accessNotes ? bookingDetail('Access Notes', item.accessNotes) : '') + (item.notes ? bookingDetail('Notes', item.notes) : '') + (item.customerFacingMessage ? bookingDetail('Customer Message', item.customerFacingMessage) : '') + (photos ? '<div class=' + q + 'booking-detail-row booking-detail-photos' + q + '><span>Photos</span><div class=' + q + 'row-actions' + q + '>' + photos + '</div></div>' : '') + '</div><div class=' + q + 'fc-form-actions' + q + '><button class=' + q + 'secondary-button' + q + ' type=' + q + 'button' + q + ' data-close>Close</button></div></div>';
    modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-close]')) modal.remove(); });
    document.body.appendChild(modal);
  }

  function actionSuccessMessage(action) {
    return {
      'booking-review': 'Booking request marked reviewed.',
      'booking-decline': 'Booking request declined.',
      'booking-convert': 'Booking request converted to a job.',
      'booking-quote': 'Quote created from booking request.',
      'quote-send': 'Quote sent.',
      'quote-accept': 'Quote accepted.',
      'quote-reject': 'Quote rejected.',
      'quote-reverse-rejection': 'Quote rejection reversed.',
      'quote-delete': 'Quote moved to Deleted. It will be automatically removed after 30 days.',
      'quote-restore': 'Quote restored.',
      'job-unschedule': 'Job unscheduled.',
      'job-invoice': 'Invoice created from job.',
      'invoice-send': 'Invoice sent.',
      'invoice-void': 'Invoice voided.',
      'invoice-pay': 'Payment recorded.'
    }[action] || 'Action completed.';
  }

  async function handleRowAction(event) {
    const menuButton = event.target.closest('[data-row-action-menu]');
    if (menuButton) {
      const resource = menuButton.dataset.rowActionMenu;
      const id = menuButton.dataset.id;
      const item = state[resource] && state[resource].find((record) => record.id === id);
      if (item) openRowActionMenu(resource, item);
      return;
    }

    const button = event.target.closest('[data-row-action]');
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.rowAction;
    if (button.closest('[data-action-menu-modal]')) closeModal();
    button.disabled = true;
    try {
      if (action === 'booking-view') {
        const item = state['booking-requests'].find((record) => record.id === id) || await api('/booking-requests/' + id);
        openBookingRequestModal(item);
        return;
      }
      if (action === 'booking-review') await api('/booking-requests/' + id + '/review', { method: 'POST', body: '{}' });
      if (action === 'booking-decline') {
        const ok = await openConfirmModal({ title: 'Decline Booking Request', message: 'Decline this customer booking request?', okLabel: 'Decline' });
        if (!ok) return;
        await api('/booking-requests/' + id + '/decline', { method: 'POST', body: '{}' });
      }
      if (action === 'booking-convert') await api('/booking-requests/' + id + '/convert', { method: 'POST', body: '{}' });
      if (action === 'booking-quote') await api('/booking-requests/' + id + '/create-quote', { method: 'POST', body: '{}' });
      if (action === 'quote-send') await api('/quotes/' + id + '/send', { method: 'POST', body: '{}' });
      if (action === 'quote-accept') await api('/quotes/' + id + '/accept', { method: 'POST', body: '{}' });
      if (action === 'quote-reject') await api('/quotes/' + id + '/reject', { method: 'POST', body: '{}' });
      if (action === 'quote-reverse-rejection') await api('/quotes/' + id + '/reverse-rejection', { method: 'POST', body: '{}' });
      if (action === 'quote-delete') {
        const ok = await openConfirmModal({ title: 'Delete Quote', message: 'Move this quote to Deleted? Deleted quotes are automatically removed after 30 days.', okLabel: 'Delete' });
        if (!ok) return;
        await api('/quotes/' + id, { method: 'DELETE' });
      }
      if (action === 'quote-restore') await api('/quotes/' + id + '/restore', { method: 'POST', body: '{}' });
      if (action === 'job-detail') {
        await openJobDetail(id);
        return;
      }
      if (action === 'job-schedule') {
        await openScheduleModal(id, 'schedule');
        return;
      }
      if (action === 'job-reschedule') {
        await openScheduleModal(id, 'reschedule');
        return;
      }
      if (action === 'job-unschedule') await api('/jobs/' + id + '/unschedule', { method: 'POST', body: '{}' });
      if (action === 'job-invoice') await api('/jobs/' + id + '/create-invoice', { method: 'POST', body: '{}' });
      if (action === 'invoice-send') await api('/invoices/' + id + '/send', { method: 'POST', body: '{}' });
      if (action === 'invoice-void') await api('/invoices/' + id + '/void', { method: 'POST', body: '{}' });
      if (action === 'invoice-receipts') {
        await showInvoiceReceipts(id);
        return;
      }
      if (action === 'invoice-pay') {
        const amount = await openInputModal({ title: 'Record Payment', label: 'Payment Amount', name: 'amount', type: 'number', attrs: 'min="0.01" step="0.01" required' });
        if (!amount) return;
        await api('/invoices/' + id + '/payments', { method: 'POST', body: JSON.stringify({ amount: Number(amount), method: 'CASH', status: 'CONFIRMED' }) });
      }
      showToast(actionSuccessMessage(action), true);
      if (page === 'quotes') await loadQuotesResource(activeQuoteFilter());
      else await load();
    } catch (error) {
      setStatus(error.message, false);
      showToast(error.message, false);
    } finally {
      button.disabled = false;
    }
  }

  function workerPreferenceKey() {
    return 'fieldcore-worker-preferences-' + (state.user && state.user.id || 'user');
  }

  function workerPreferences() {
    try { return JSON.parse(localStorage.getItem(workerPreferenceKey()) || '{}'); } catch (error) { return {}; }
  }

  function renderWorkerSettings() {
    const pageEl = document.querySelector('.page');
    if (!pageEl) return;
    const prefs = workerPreferences();
    pageEl.innerHTML = '<div class="hero-row"><div class="hero-copy"><h2>Settings</h2><p>Manage your account, job alerts, and sign-in security.</p></div><span class="api-status" data-api-status>Connected</span></div><section class="settings-layout worker-settings"><aside class="panel settings-tabs" aria-label="Settings sections"><button class="settings-tab active" type="button" data-settings-target="account">Account</button><button class="settings-tab" type="button" data-settings-target="notifications">Notifications</button><button class="settings-tab" type="button" data-settings-target="security">Security</button></aside><div class="settings-panels"><div class="panel settings-panel active" data-settings-panel="account"><div class="panel-head"><h2>Account</h2><span class="badge gray">Worker</span></div><form class="form-grid" data-worker-account-form><div class="field"><label for="workerName">Name</label><input id="workerName" name="name" required maxlength="120" value="' + escapeHtml(state.user && state.user.name || '') + '"></div><div class="field"><label for="workerEmail">Email</label><input id="workerEmail" name="email" type="email" required value="' + escapeHtml(state.user && state.user.email || '') + '"></div><div class="field"><label>Role</label><input value="' + escapeHtml(state.user && state.user.role || 'WORKER') + '" disabled></div><div class="field"><label>Workspace</label><input value="' + escapeHtml(state.user && state.user.company && state.user.company.name || 'FieldCore') + '" disabled></div><div class="form-actions span-2"><button class="primary-button" type="submit">Save Account</button></div><p class="fc-form-error span-2" data-worker-account-message hidden></p></form></div><div class="panel settings-panel" data-settings-panel="notifications" hidden><div class="panel-head"><h2>Notifications</h2><span class="badge gray">Jobs</span></div><form class="form-grid" data-worker-preferences-form><div class="settings-checks span-2"><label><input type="checkbox" name="jobAssigned" ' + (prefs.jobAssigned !== false ? 'checked' : '') + '> New assigned jobs</label><label><input type="checkbox" name="scheduleChanged" ' + (prefs.scheduleChanged !== false ? 'checked' : '') + '> Schedule changes</label><label><input type="checkbox" name="completionReminders" ' + (prefs.completionReminders !== false ? 'checked' : '') + '> Completion evidence reminders</label></div><div class="field span-2"><label for="workerReminderLead">Reminder Lead Time</label><select id="workerReminderLead" name="reminderLead"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option></select></div><div class="form-actions span-2"><button class="primary-button" type="submit">Save Preferences</button></div><p class="fc-form-error span-2" data-worker-preferences-message hidden></p></form></div><div class="panel settings-panel" data-settings-panel="security" hidden><div class="panel-head"><h2>Security</h2><span class="badge blue">Protected</span></div><form class="form-grid" data-worker-password-form><div class="field"><label for="currentPassword">Current Password</label><input id="currentPassword" name="currentPassword" type="password" autocomplete="current-password" required></div><div class="field"><label for="newPassword">New Password</label><input id="newPassword" name="newPassword" type="password" autocomplete="new-password" minlength="12" required></div><div class="field span-2"><label for="confirmPassword">Confirm New Password</label><input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required></div><div class="settings-checks span-2"><label><input type="checkbox" checked disabled> Secure HTTP-only session cookie</label><label><input type="checkbox" checked disabled> Company-scoped account access</label></div><div class="form-actions span-2"><button class="primary-button" type="submit">Update Password</button></div><p class="fc-form-error span-2" data-worker-password-message hidden></p></form></div></div></section>';
    const reminder = pageEl.querySelector('[name="reminderLead"]');
    if (reminder) reminder.value = prefs.reminderLead || '30';
    setupSettings();
    setupWorkerSettings();
  }

  function setFormMessage(selector, textValue, ok) {
    const message = document.querySelector(selector);
    if (!message) return;
    message.textContent = textValue;
    message.classList.toggle('green', ok === true);
    message.hidden = false;
    if (ok === true) showToast(textValue, true);
  }

  function setupWorkerSettings() {
    const accountForm = document.querySelector('[data-worker-account-form]');
    if (accountForm) accountForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(accountForm).entries());
      try {
        state.user = await api('/auth/me', { method: 'PATCH', body: JSON.stringify(body) });
        document.querySelectorAll('[data-current-user-name]').forEach((node) => { node.textContent = state.user.name || state.user.email || 'Signed in'; });
        setFormMessage('[data-worker-account-message]', 'Account saved.', true);
      } catch (error) {
        setFormMessage('[data-worker-account-message]', error.message, false);
      }
    });

    const preferencesForm = document.querySelector('[data-worker-preferences-form]');
    if (preferencesForm) preferencesForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(preferencesForm).entries());
      const prefs = { jobAssigned: body.jobAssigned === 'on', scheduleChanged: body.scheduleChanged === 'on', completionReminders: body.completionReminders === 'on', reminderLead: body.reminderLead || '30' };
      localStorage.setItem(workerPreferenceKey(), JSON.stringify(prefs));
      setFormMessage('[data-worker-preferences-message]', 'Preferences saved.', true);
    });

    const passwordForm = document.querySelector('[data-worker-password-form]');
    if (passwordForm) passwordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(passwordForm).entries());
      if (body.newPassword !== body.confirmPassword) return setFormMessage('[data-worker-password-message]', 'New passwords do not match.', false);
      try {
        await api('/auth/me/password', { method: 'PATCH', body: JSON.stringify({ currentPassword: body.currentPassword, newPassword: body.newPassword }) });
        passwordForm.reset();
        setFormMessage('[data-worker-password-message]', 'Password updated.', true);
      } catch (error) {
        setFormMessage('[data-worker-password-message]', error.message, false);
      }
    });
  }

  function setupAdminSecurity() {
    const passwordForm = document.querySelector('[data-admin-password-form]');
    if (passwordForm) passwordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(passwordForm).entries());
      if (body.newPassword !== body.confirmPassword) return setFormMessage('[data-admin-password-message]', 'New passwords do not match.', false);
      try {
        await api('/auth/me/password', { method: 'PATCH', body: JSON.stringify({ currentPassword: body.currentPassword, newPassword: body.newPassword }) });
        passwordForm.reset();
        setFormMessage('[data-admin-password-message]', 'Password updated.', true);
      } catch (error) {
        setFormMessage('[data-admin-password-message]', error.message, false);
      }
    });

  }

  function settingsPayload(form) {
    const body = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll('input[type="checkbox"][name]').forEach((field) => { body[field.name] = field.checked; });
    ['defaultJobDurationMinutes', 'defaultTravelBufferMinutes'].forEach((key) => { if (body[key] !== '' && body[key] != null) body[key] = Number(body[key]); });
    Object.keys(body).forEach((key) => { if (body[key] === '') delete body[key]; });
    return body;
  }

  async function saveSettingsForm(form, messageSelector, successText) {
    const message = document.querySelector(messageSelector);
    if (message) { message.hidden = true; message.classList.remove('green'); }
    try {
      await api('/company/scheduling-settings', { method: 'PATCH', body: JSON.stringify(settingsPayload(form)) });
      await loadSchedulingSettings();
      if (message) { message.textContent = successText; message.classList.add('green'); message.hidden = false; }
      showToast(successText, true);
    } catch (error) {
      if (message) { message.textContent = error.message; message.hidden = false; }
    }
  }
  function availabilityCacheKey(roleId) {
    return roleId || '';
  }

  function selectedAvailabilitySlot(slots, dayOfWeek) {
    return (slots || []).find((slot) => Number(slot.dayOfWeek) === Number(dayOfWeek) && slot.active !== false);
  }

  function setAvailabilityFields(slot) {
    const start = document.querySelector('[name="startTime"]');
    const end = document.querySelector('[name="endTime"]');
    if (start) start.value = slot && slot.startTime || '08:00';
    if (end) end.value = slot && slot.endTime || '17:00';
  }

  async function loadSelectedAvailability() {
    const form = document.querySelector('[data-availability-form]');
    if (!form || !form.roleId.value) return;
    const message = document.querySelector('[data-availability-message]');
    if (message) { message.hidden = true; message.classList.remove('green'); }
    try {
      const key = availabilityCacheKey(form.roleId.value);
      state.availability[key] = await api('/worker-roles/' + form.roleId.value + '/availability');
      setAvailabilityFields(selectedAvailabilitySlot(state.availability[key], form.dayOfWeek.value));
    } catch (error) {
      if (message) { message.textContent = error.message; message.hidden = false; }
    }
  }

  async function loadSchedulingSettings() {
    if (!document.querySelector('[data-scheduling-form]')) return;
    try {
      const [settings, workers, roles] = await Promise.all([api('/company/scheduling-settings'), api('/workers').catch(() => []), api('/worker-roles').catch(() => [])]);
      state.scheduleSettings = settings;
      state.workers = workers;
      state.roles = roles;
      document.querySelectorAll('[data-scheduling-field]').forEach((field) => {
        if (field.type === 'checkbox') field.checked = Boolean(settings[field.dataset.schedulingField]);
        else field.value = settings[field.dataset.schedulingField] == null ? '' : settings[field.dataset.schedulingField];
      });
      const roleSelect = document.querySelector('[data-availability-role]');
      if (roleSelect) {
        const previous = roleSelect.value;
        roleSelect.innerHTML = optionList(state.roles, 'Select role');
        const firstRole = roleSelect.querySelector('option[value]:not([value=""])');
        roleSelect.value = previous || firstRole && firstRole.value || '';
        await loadSelectedAvailability();
      }
    } catch (error) {
      const message = document.querySelector('[data-scheduling-message]');
      if (message) { message.textContent = error.message; message.hidden = false; }
    }
  }

  function renderNotificationLogs(logs) {
    const card = document.querySelector('[data-notification-log-card]');
    if (!card) return;
    const count = document.querySelector('[data-notification-log-count]');
    const channel = document.querySelector('[data-notification-channel-filter]');
    const status = document.querySelector('[data-notification-status-filter]');
    const filtered = logs.filter((item) => (!channel || !channel.value || item.channel === channel.value) && (!status || !status.value || item.status === status.value));
    if (count) count.textContent = String(filtered.length);
    const controls = '<div class="panel-head card"><h3>Recent Notifications</h3><span class="badge gray" data-notification-log-count>' + filtered.length + '</span></div><div class="notification-filters"><label><span>Channel</span><select data-notification-channel-filter aria-label="Notification channel"><option value="">All channels</option><option value="EMAIL"' + (channel && channel.value === 'EMAIL' ? ' selected' : '') + '>Email</option><option value="WHATSAPP"' + (channel && channel.value === 'WHATSAPP' ? ' selected' : '') + '>WhatsApp</option></select></label><label><span>Status</span><select data-notification-status-filter aria-label="Notification status"><option value="">All statuses</option><option value="SENT"' + (status && status.value === 'SENT' ? ' selected' : '') + '>Sent</option><option value="FAILED"' + (status && status.value === 'FAILED' ? ' selected' : '') + '>Failed</option><option value="SKIPPED"' + (status && status.value === 'SKIPPED' ? ' selected' : '') + '>Skipped</option></select></label></div>';
    if (!filtered.length) {
      card.innerHTML = controls + '<div class="empty-state"><div><strong>No matching notifications.</strong><span>Change the filters or trigger a notification event.</span></div></div>';
      bindNotificationFilters();
      return;
    }
    const rows = filtered.slice(0, 25).map((item) => '<tr><td>' + escapeHtml(String(item.eventType || '-').replace(/_/g, ' ')) + '</td><td>' + escapeHtml(item.channel || '-') + '</td><td>' + escapeHtml(item.recipient || '-') + '</td><td>' + badge(item.status) + '</td><td>' + escapeHtml([item.relatedType, item.relatedId].filter(Boolean).join(' / ') || '-') + '</td><td>' + escapeHtml(formatDateTime(item.sentAt || item.createdAt)) + '</td><td>' + escapeHtml(item.error || '') + '</td></tr>').join('');
    card.innerHTML = controls + '<div class="table-scroll"><table><thead><tr><th>Event</th><th>Channel</th><th>Recipient</th><th>Status</th><th>Related</th><th>Time</th><th>Error</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    bindNotificationFilters();
  }

  function bindNotificationFilters() {
    document.querySelectorAll('[data-notification-channel-filter], [data-notification-status-filter]').forEach((field) => {
      field.onchange = () => renderNotificationLogs(state.notificationLogs || []);
    });
  }

  async function loadNotificationLogs() {
    if (!document.querySelector('[data-notification-log-card]')) return;
    try {
      state.notificationLogs = await api('/notification-logs');
      renderNotificationLogs(state.notificationLogs);
    } catch (error) {
      const card = document.querySelector('[data-notification-log-card]');
      if (card) card.innerHTML = '<div class="empty-state"><div><strong>Notification history unavailable.</strong><span>' + escapeHtml(error.message) + '</span></div></div>';
    }
  }

  const integrationProviders = [
    { provider: 'BREVO', title: 'Brevo Email', channel: 'EMAIL', initials: 'BE', config: [['senderName', 'Sender name'], ['senderEmail', 'Sender email'], ['replyToEmail', 'Reply-to email']], secrets: [['apiKey', 'Brevo API key']] },
    { provider: 'META_WHATSAPP_CLOUD', title: 'Meta WhatsApp Cloud API', channel: 'WHATSAPP', initials: 'WA', config: [['wabaId', 'WABA ID'], ['phoneNumberId', 'Phone number ID'], ['businessPhoneDisplayNumber', 'Display number'], ['defaultTemplateName', 'Default template']], secrets: [['accessToken', 'Permanent access token'], ['webhookVerifyToken', 'Webhook verify token'], ['appSecret', 'App secret']] },
    { provider: 'CLICKATELL', title: 'Clickatell SMS', channel: 'SMS', initials: 'CT', config: [['senderId', 'Sender ID'], ['profileId', 'Profile ID'], ['channel', 'Channel']], secrets: [['apiKey', 'Clickatell API key']] },
    { provider: 'AFRICAS_TALKING', title: "Africa's Talking SMS", channel: 'SMS', initials: 'AT', config: [['senderId', 'Sender ID'], ['shortCode', 'Short code'], ['environment', 'Environment']], secrets: [['username', 'Username'], ['apiKey', "Africa's Talking API key"]] },
    { provider: 'CLOUDFLARE_R2', title: 'Cloudflare R2 Storage', channel: 'STORAGE', initials: 'R2', config: [['accountId', 'Account ID'], ['bucket', 'Bucket'], ['endpoint', 'Endpoint'], ['publicDomain', 'Public domain'], ['region', 'Region']], secrets: [['accessKeyId', 'Access key ID'], ['secretAccessKey', 'Secret access key']] }
  ];

  function integrationByProvider(provider) {
    return (state.integrations || []).find((item) => item.provider === provider);
  }

  function renderIntegrations() {
    const card = document.querySelector('[data-integrations-card]');
    if (!card) return;
    const canManage = hasPermission('integration.manage');
    card.innerHTML = integrationProviders.map((definition) => {
      const item = integrationByProvider(definition.provider) || {};
      const config = item.config || {};
      const configuredSecrets = new Set(item.configuredSecrets || []);
      const status = item.status || 'DISCONNECTED';
      const statusClass = status === 'ACTIVE' || status === 'CONFIGURED' ? 'green' : status === 'ERROR' ? 'red' : 'gray';
      const summary = '<div class="list-item integration-summary"><span class="initials">' + escapeHtml(definition.initials) + '</span><div><strong>' + escapeHtml(definition.title) + '</strong><small>' + escapeHtml(item.lastTestedAt ? 'Last checked ' + formatDateTime(item.lastTestedAt) : 'Not checked yet') + '</small></div><span class="badge ' + statusClass + '">' + escapeHtml(status === 'ACTIVE' || status === 'CONFIGURED' ? 'Connected' : status === 'ERROR' ? 'Needs attention' : 'Not connected') + '</span></div>';
      if (!canManage) return '<article class="integration-card read-only">' + summary + '</article>';
      const configFields = definition.config.map(([key, label]) => '<div class="field"><label>' + escapeHtml(label) + '</label><input name="config.' + escapeHtml(key) + '" value="' + escapeHtml(config[key] || '') + '"></div>').join('');
      const secretFields = definition.secrets.map(([key, label]) => '<div class="field"><label>' + escapeHtml(label) + '</label><input name="secret.' + escapeHtml(key) + '" type="password" placeholder="' + (configuredSecrets.has(key) ? '&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226; saved' : 'Not saved') + '"></div>').join('');
      return '<form class="integration-card" data-integration-form="' + escapeHtml(definition.provider) + '" data-integration-id="' + escapeHtml(item.id || '') + '">' + summary + '<div class="form-grid integration-fields">' + configFields + secretFields + '<div class="form-actions span-2"><button class="primary-button compact" type="submit">Save</button><button class="secondary-button compact" type="button" data-integration-test="' + escapeHtml(item.id || '') + '" ' + (item.id ? '' : 'disabled') + '>Check connection</button><button class="secondary-button compact" type="button" data-integration-disable="' + escapeHtml(item.id || '') + '" ' + (item.id ? '' : 'disabled') + '>Turn off</button></div><p class="fc-form-error span-2" data-integration-message hidden></p></div></form>';
    }).join('');
    if (canManage) bindIntegrationActions();
  }

  function integrationPayload(form) {
    const payload = { provider: form.dataset.integrationForm, config: {}, secrets: {} };
    form.querySelectorAll('input[name^="config."]').forEach((field) => { payload.config[field.name.replace('config.', '')] = field.value || ''; });
    form.querySelectorAll('input[name^="secret."]').forEach((field) => {
      if (field.value) payload.secrets[field.name.replace('secret.', '')] = field.value;
    });
    return payload;
  }

  async function loadIntegrations() {
    if (!document.querySelector('[data-integrations-card]') || !hasPermission('integration.view')) return;
    try {
      const [integrations, logs, storage] = await Promise.all([
        api('/admin/integrations'),
        api('/admin/integrations/message-logs').catch(() => []),
        api('/admin/integrations/storage-usage').catch(() => ({ usage: [], objects: [] }))
      ]);
      state.integrations = integrations;
      state.messageLogs = logs;
      state.storageUsage = storage;
      renderIntegrations();
      renderProviderMessageLogs(logs);
      renderStorageUsage(storage);
    } catch (error) {
      const card = document.querySelector('[data-integrations-card]');
      if (card) card.innerHTML = '<div class="empty-state"><div><strong>Connected apps are unavailable.</strong><span>' + escapeHtml(error.message) + '</span></div></div>';
    }
  }

  function bindIntegrationActions() {
    document.querySelectorAll('[data-integration-form]').forEach((form) => {
      form.onsubmit = async (event) => {
        event.preventDefault();
        const message = form.querySelector('[data-integration-message]');
        if (message) { message.hidden = true; message.classList.remove('green'); }
        try {
          const payload = integrationPayload(form);
          const id = form.dataset.integrationId;
          await api(id ? '/admin/integrations/' + id : '/admin/integrations', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
          if (message) { message.textContent = 'Integration settings saved.'; message.classList.add('green'); message.hidden = false; }
          await loadIntegrations();
        } catch (error) {
          if (message) { message.textContent = error.message; message.hidden = false; }
        }
      };
    });
    document.querySelectorAll('[data-integration-test]').forEach((button) => {
      button.onclick = async () => {
        if (!button.dataset.integrationTest) return;
        try {
          const result = await api('/admin/integrations/' + button.dataset.integrationTest + '/test', { method: 'POST', body: JSON.stringify({}) });
          showToast(result.test && result.test.ok ? 'Connection test passed.' : result.test && result.test.error || 'Connection test failed.', Boolean(result.test && result.test.ok));
          await loadIntegrations();
        } catch (error) {
          showToast(error.message, false);
        }
      };
    });
    document.querySelectorAll('[data-integration-disable]').forEach((button) => {
      button.onclick = async () => {
        if (!button.dataset.integrationDisable) return;
        try {
          await api('/admin/integrations/' + button.dataset.integrationDisable + '/disable', { method: 'POST', body: JSON.stringify({}) });
          showToast('Integration disabled.');
          await loadIntegrations();
        } catch (error) {
          showToast(error.message, false);
        }
      };
    });
  }

  function renderProviderMessageLogs(logs) {
    const card = document.querySelector('[data-message-log-card]');
    if (!card) return;
    const rows = (logs || []).slice(0, 25).map((item) => '<tr><td>' + escapeHtml(item.provider || '-') + '</td><td>' + escapeHtml(item.channel || '-') + '</td><td>' + badge(item.status || '-') + '</td><td>' + escapeHtml(item.recipientMasked || '-') + '</td><td>' + escapeHtml(item.providerMessageId || '-') + '</td><td>' + escapeHtml(formatDateTime(item.sentAt || item.failedAt || item.createdAt)) + '</td><td>' + escapeHtml(item.errorMessageSanitized || '') + '</td></tr>').join('');
    card.innerHTML = '<div class="panel-head card"><h3>Message Logs</h3><span class="badge gray">' + (logs || []).length + '</span></div>' + (rows ? '<div class="table-scroll"><table><thead><tr><th>Provider</th><th>Channel</th><th>Status</th><th>Recipient</th><th>Provider ID</th><th>Time</th><th>Error</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty-state"><div><strong>No provider messages yet.</strong><span>Email, WhatsApp, and SMS attempts will appear here.</span></div></div>');
  }

  const paymentProviderDefinitions = [
    { provider: 'PAYNOW', title: 'Paynow Zimbabwe', initials: 'PN', market: 'ZW', note: 'Zimbabwe customer invoice payments', config: [['mode', 'Mode: test/live'], ['endpoint', 'Endpoint'], ['resultUrl', 'Result/webhook URL'], ['returnUrl', 'Return URL'], ['authemail', 'Auth email']], secrets: [['integrationId', 'Integration ID'], ['integrationKey', 'Integration Key']] },
    { provider: 'OZOW', title: 'Ozow South Africa', initials: 'OZ', market: 'SA', note: 'South African customer invoice payments', config: [['mode', 'Mode: test/live'], ['endpoint', 'Endpoint'], ['countryCode', 'Country code'], ['currencyCode', 'Currency code'], ['notifyUrl', 'Notify/webhook URL'], ['successUrl', 'Success URL'], ['errorUrl', 'Error URL'], ['cancelUrl', 'Cancel URL']], secrets: [['siteCode', 'Site Code'], ['apiKey', 'API Key'], ['privateKey', 'Private Key']] },
    { provider: 'MOCK', title: 'Mock Provider', initials: 'MK', market: 'QA', note: 'Controlled QA payment success/failure', config: [['mockMode', 'Mock mode: true/false'], ['webhookSecret', 'Webhook secret']], secrets: [['apiKey', 'Mock API key']] },
    { provider: 'MANUAL_BANK', title: 'Manual Bank Transfer', initials: 'BT', market: 'QA', note: 'Offline/manual bank transfer records', config: [['instructions', 'Instructions'], ['accountName', 'Account name'], ['bankName', 'Bank name'], ['accountNumber', 'Account number'], ['branchCode', 'Branch code']], secrets: [] }
  ];

  function paymentProviderByProvider(provider) {
    return (state.paymentProviders || []).find((item) => item.provider === provider);
  }

  function paymentProviderPayload(form) {
    const payload = { provider: form.dataset.paymentProviderForm, status: 'ACTIVE', config: {}, secrets: {} };
    form.querySelectorAll('input[name^="config."], textarea[name^="config."]').forEach((field) => {
      const key = field.name.replace('config.', '');
      if (key === 'mockMode') payload.config[key] = String(field.value || '').toLowerCase() === 'true';
      else payload.config[key] = field.value || '';
    });
    form.querySelectorAll('input[name^="secret."]').forEach((field) => {
      if (field.value) payload.secrets[field.name.replace('secret.', '')] = field.value;
    });
    return payload;
  }

  function renderPaymentProviders() {
    const card = document.querySelector('[data-payment-providers-card]');
    if (!card) return;
    card.innerHTML = '<div class="panel-head"><h3>Customer Payment Providers</h3><span class="badge gray">Tenant scoped</span></div>' + paymentProviderDefinitions.map((definition) => {
      const item = paymentProviderByProvider(definition.provider) || {};
      const config = item.config || {};
      const status = item.status || 'DISCONNECTED';
      const statusClass = status === 'ACTIVE' || status === 'CONFIGURED' ? 'green' : status === 'ERROR' ? 'red' : 'gray';
      const configFields = definition.config.map(([key, label]) => {
        const value = config[key] == null ? '' : config[key];
        const input = String(label).toLowerCase().includes('instructions') ? '<textarea name="config.' + escapeHtml(key) + '">' + escapeHtml(value) + '</textarea>' : '<input name="config.' + escapeHtml(key) + '" value="' + escapeHtml(value) + '">';
        return '<div class="field"><label>' + escapeHtml(label) + '</label>' + input + '</div>';
      }).join('');
      const secretFields = definition.secrets.map(([key, label]) => '<div class="field"><label>' + escapeHtml(label) + '</label><input name="secret.' + escapeHtml(key) + '" type="password" placeholder="' + (item.id ? '&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226; saved if previously entered' : 'Not saved') + '"></div>').join('');
      return '<form class="integration-card" ' + (definition.market === 'ZW' ? 'data-zimbabwe-only="true" ' : definition.market === 'SA' ? 'data-south-africa-only="true" ' : '') + 'data-payment-provider-form="' + escapeHtml(definition.provider) + '" data-payment-provider-id="' + escapeHtml(item.id || '') + '"><div class="list-item integration-summary"><span class="initials">' + escapeHtml(definition.initials) + '</span><div><strong>' + escapeHtml(definition.title) + '</strong><small>' + escapeHtml(definition.note + (item.lastTestedAt ? ' / tested ' + formatDateTime(item.lastTestedAt) : ' / not tested')) + '</small></div><span class="badge ' + statusClass + '">' + escapeHtml(status.replace(/_/g, ' ')) + '</span></div><div class="form-grid integration-fields">' + configFields + secretFields + '<div class="form-actions span-2"><button class="primary-button compact" type="submit">Save Provider</button><button class="secondary-button compact" type="button" data-payment-provider-test="' + escapeHtml(item.id || '') + '" ' + (item.id ? '' : 'disabled') + '>Test</button></div><p class="fc-form-error span-2" data-payment-provider-message hidden></p></div></form>';
    }).join('');
    bindPaymentProviderActions();
  }

  async function loadPaymentProviders() {
    if (!document.querySelector('[data-payment-providers-card]')) return;
    try {
      state.paymentProviders = await api('/payment-providers');
      renderPaymentProviders();
    } catch (error) {
      const card = document.querySelector('[data-payment-providers-card]');
      if (card) card.innerHTML = '<div class="empty-state"><div><strong>Payment providers unavailable.</strong><span>' + escapeHtml(error.message) + '</span></div></div>';
    }
  }

  function bindPaymentProviderActions() {
    document.querySelectorAll('[data-payment-provider-form]').forEach((form) => {
      form.onsubmit = async (event) => {
        event.preventDefault();
        const message = form.querySelector('[data-payment-provider-message]');
        if (message) { message.hidden = true; message.classList.remove('green'); }
        try {
          const payload = paymentProviderPayload(form);
          const id = form.dataset.paymentProviderId;
          await api(id ? '/payment-providers/' + id : '/payment-providers', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
          if (message) { message.textContent = 'Payment provider saved.'; message.classList.add('green'); message.hidden = false; }
          await loadPaymentProviders();
        } catch (error) {
          if (message) { message.textContent = error.message; message.hidden = false; }
        }
      };
    });
    document.querySelectorAll('[data-payment-provider-test]').forEach((button) => {
      button.onclick = async () => {
        if (!button.dataset.paymentProviderTest) return;
        try {
          const result = await api('/payment-providers/' + button.dataset.paymentProviderTest + '/test', { method: 'POST', body: JSON.stringify({}) });
          showToast(result.test && result.test.ok ? 'Payment provider test passed.' : result.test && result.test.message || 'Payment provider test failed.', Boolean(result.test && result.test.ok));
          await loadPaymentProviders();
        } catch (error) {
          showToast(error.message, false);
        }
      };
    });
  }


  const SAAS_PRICE_BOOK = {
    ZW: {
      starter: { currency: 'USD', price: 500, label: 'USD 500/month' },
      growth: { currency: 'USD', price: 1500, label: 'USD 1,500/month' },
      business: { currency: 'USD', price: null, label: 'Contact us' }
    },
    SA: {
      starter: { currency: 'ZAR', price: 9500, label: 'R 9,500/month' },
      growth: { currency: 'ZAR', price: 28500, label: 'R 28,500/month' },
      business: { currency: 'ZAR', price: null, label: 'Contact us' }
    }
  };

  function billingMarketLabel() {
    return currentMarket() === 'SA' ? 'South Africa fixed ZAR price book' : 'Zimbabwe / USD price book';
  }

  function regionalPlanPrice(plan, interval) {
    if (!plan) return { label: 'Not set', currency: effectiveFinanceSettings().defaultCurrency || 'USD', price: null };
    if (plan.features && plan.features.customPricing) return { label: 'Contact us', currency: plan.currency || 'USD', price: null };
    const book = SAAS_PRICE_BOOK[currentMarket()] || SAAS_PRICE_BOOK.ZW;
    const regional = book[plan.id];
    if (regional) return regional;
    const currency = plan.currency || 'USD';
    const price = plan.price == null ? null : Number(plan.price || 0);
    return { currency, price, label: currency + ' ' + (price == null ? '-' : price.toLocaleString('en-US')) + '/' + (plan.interval || interval || 'month') };
  }

  function regionalEffectivePrice(plan) {
    const price = regionalPlanPrice(plan).price;
    return price == null ? Number.POSITIVE_INFINITY : Number(price || 0);
  }

  function renderStorageUsage(storage) {
    const card = document.querySelector('[data-storage-usage-card]');
    if (!card) return;
    const usage = storage && storage.usage || [];
    const objects = storage && storage.objects || [];
    const usageRows = usage.slice(0, 12).map((item) => '<tr><td>' + escapeHtml(item.year + '-' + String(item.month).padStart(2, '0')) + '</td><td>' + escapeHtml(item.provider || '-') + '</td><td>' + escapeHtml(item.objectCount || 0) + '</td><td>' + escapeHtml(item.totalBytes || 0) + '</td></tr>').join('');
    const objectRows = objects.slice(0, 8).map((item) => '<tr><td>' + escapeHtml(item.bucket || '-') + '</td><td>' + escapeHtml(item.objectKey || '-') + '</td><td>' + escapeHtml(item.mimeType || '-') + '</td><td>' + escapeHtml(item.sizeBytes || 0) + '</td></tr>').join('');
    card.innerHTML = '<div class="panel-head card"><h3>Storage Usage</h3><span class="badge gray">' + usage.length + '</span></div>' + (usageRows ? '<div class="table-scroll"><table><thead><tr><th>Month</th><th>Provider</th><th>Objects</th><th>Bytes</th></tr></thead><tbody>' + usageRows + '</tbody></table></div>' : '<div class="empty-state compact-empty"><div><strong>No usage rollups yet.</strong><span>R2 uploads will create monthly usage records.</span></div></div>') + (objectRows ? '<div class="table-scroll"><table><thead><tr><th>Bucket</th><th>Object</th><th>Type</th><th>Bytes</th></tr></thead><tbody>' + objectRows + '</tbody></table></div>' : '');
  }

  function renderSaaSBilling(summary) {
    const card = document.querySelector('[data-saas-billing-card]');
    if (!card) return;
    const subscription = summary && summary.subscription || {};
    const plan = summary && summary.plan || {};
    const provider = summary && summary.provider || {};
    const plans = (summary && summary.plans || []).filter((item) => item && item.isActive !== false);
    const status = subscription.status || 'UNKNOWN';
    const statusBadge = '<span class="badge ' + (status === 'ACTIVE' || status === 'FREE_INTERNAL' ? 'green' : status === 'TRIALING' ? 'blue' : status === 'PAST_DUE' ? 'orange' : 'gray') + '">' + escapeHtml(status.replace(/_/g, ' ')) + '</span>';
    const currentPlanId = plan.id || subscription.planId;
    const currentPlan = plans.find((item) => item.id === currentPlanId) || plan;
    const currentPrice = regionalEffectivePrice(currentPlan);
    const sortedPlans = plans.slice().sort((a, b) => regionalEffectivePrice(a) - regionalEffectivePrice(b));
    const upgradePlans = sortedPlans.filter((item) => item.id !== currentPlanId && regionalEffectivePrice(item) > currentPrice);
    const providerText = provider.configured ? (provider.mode === 'manual' ? 'Manual/internal billing mode' : 'Billing provider configured') : 'Billing provider not configured yet';
    const providerCta = provider.configured ? (provider.mode === 'manual' ? 'Plan changes create a manual FieldCore billing request.' : 'Live checkout can process configured provider payments.') : 'Checkout is disabled until a SaaS billing provider is configured. Use manual plan-change requests during QA.';
    const interval = plan.interval || subscription.interval || 'month';
    const nextBillingDate = formatDate(subscription.currentPeriodEnd || subscription.trialEndsAt);
    const trial = subscription.trialDaysRemaining == null ? null : subscription.trialDaysRemaining + ' days remaining';
    const planPriceText = (item) => regionalPlanPrice(item, interval).label;
    const priceText = planPriceText(plan);
    const canCancel = subscription.id && !['FREE_INTERNAL', 'TRIALING'].includes(status) && !plan.features?.customPricing;
    const cancelAction = canCancel ? '<button class="secondary-button compact" type="button" data-billing-cancel>Cancel Plan</button>' : '';

    const limitNames = {
      maxUsers: 'more office/admin users',
      maxWorkers: 'more field workers',
      maxClients: 'more client records',
      maxJobsPerMonth: 'more jobs per month',
      maxPublicBookingsPerMonth: 'more public bookings',
      maxStorageMb: 'more storage',
      maxWhatsAppNotificationsPerMonth: 'higher WhatsApp volume',
      maxEmailNotificationsPerMonth: 'higher email volume'
    };
    const featureNames = {
      whatsappNotifications: 'WhatsApp notifications',
      advancedReports: 'advanced reports',
      customBranding: 'custom branding',
      multiLocation: 'multi-location controls',
      apiAccess: 'API access',
      proofOfWork: 'proof-of-work records',
      clientPortal: 'client portal',
      publicBookingPortal: 'public booking portal',
      annualFirst: 'annual-first commercial terms',
      implementationFee: 'implementation and training package'
    };
    const benefitsFor = (target) => {
      const benefits = [];
      const currentLimits = currentPlan && currentPlan.limits || {};
      const targetLimits = target && target.limits || {};
      Object.keys(limitNames).forEach((key) => {
        const currentValue = currentLimits[key];
        const targetValue = targetLimits[key];
        if (benefits.length >= 5) return;
        if (targetValue == null && currentValue != null) benefits.push('unlimited ' + limitNames[key]);
        else if (Number(targetValue || 0) > Number(currentValue || 0)) benefits.push(limitNames[key]);
      });
      const currentFeatures = currentPlan && currentPlan.features || {};
      const targetFeatures = target && target.features || {};
      Object.keys(featureNames).forEach((key) => {
        if (benefits.length >= 5) return;
        if (!currentFeatures[key] && targetFeatures[key]) benefits.push(featureNames[key]);
      });
      if (!benefits.length && target.description) benefits.push(target.description);
      return benefits.slice(0, 5);
    };
    const upgradeCards = upgradePlans.length ? upgradePlans.map((item) => {
      const benefits = benefitsFor(item);
      const benefitList = benefits.length ? '<ul class="billing-benefit-list">' + benefits.map((benefit) => '<li>' + escapeHtml(benefit) + '</li>').join('') + '</ul>' : '<p class="muted">Higher limits and workspace capacity.</p>';
      const isCustom = Boolean(item.features && item.features.customPricing);
      const annualNote = item.features && item.features.annualFirst ? '<small class="billing-plan-note">Annual-first. Onboarding/training scoped separately.</small>' : '';
      const checkoutDisabled = !provider.configured;
      const action = isCustom
        ? '<button class="primary-button compact" type="button" data-billing-contact="' + escapeHtml(item.id) + '">Contact us</button>'
        : checkoutDisabled
          ? '<button class="secondary-button compact" type="button" disabled title="Configure SAAS_BILLING_PROVIDER before plan changes can be submitted.">Provider required</button>'
          : provider.mode === 'manual'
            ? '<button class="primary-button compact" type="button" data-billing-change-plan="' + escapeHtml(item.id) + '">Request change</button>'
            : '<button class="secondary-button compact" type="button" data-billing-checkout="' + escapeHtml(item.id) + '">Checkout</button><button class="primary-button compact" type="button" data-billing-change-plan="' + escapeHtml(item.id) + '">Change</button>';
      return '<div class="billing-upgrade-card"><div class="billing-plan-head"><div><strong>' + escapeHtml(item.name) + '</strong><span>' + escapeHtml(item.description || 'Upgrade your FieldCore workspace.') + '</span></div></div><div class="billing-plan-price"><strong>' + escapeHtml(planPriceText(item)) + '</strong></div>' + annualNote + benefitList + '<div class="billing-plan-actions">' + action + '</div></div>';
    }).join('') : '<div class="empty-state compact-empty"><div><strong>No upgrade available.</strong><span>This workspace is already on the highest available plan.</span></div></div>';

    card.innerHTML = '<div class="panel-head billing-main-head"><div><h3>FieldCore Subscription</h3><p>' + escapeHtml(providerText) + '</p><p class="muted">' + escapeHtml(billingMarketLabel()) + ' · ' + escapeHtml(providerCta) + '</p></div>' + statusBadge + '</div><div class="billing-essential-grid"><div class="billing-summary-item"><span>Current Plan</span><strong>' + escapeHtml(plan.name || 'No plan') + '</strong><small>' + escapeHtml(priceText) + '</small></div><div class="billing-summary-item"><span>Billing Cycle</span><strong>' + escapeHtml(interval ? 'Every ' + interval : 'Not set') + '</strong><small>' + escapeHtml(nextBillingDate === '-' ? 'Next billing date not set' : 'Next bill: ' + nextBillingDate) + '</small></div><div class="billing-summary-item"><span>Trial / Renewal</span><strong>' + escapeHtml(trial || (subscription.cancelAtPeriodEnd ? 'Cancelling' : 'Active')) + '</strong><small>' + escapeHtml(subscription.cancelAtPeriodEnd ? 'Ends at current period close' : 'Managed by FieldCore') + '</small></div></div><div class="billing-section billing-upgrade-section"><div class="billing-section-head"><div><h3>Upgrade Benefits</h3><p class="muted">Only the useful plan differences are shown here.</p></div>' + cancelAction + '</div><div class="billing-upgrade-grid">' + upgradeCards + '</div></div><p class="fc-form-error billing-message" data-billing-message hidden></p>';
    bindBillingActions();
  }

  async function loadBilling() {
    if (!state.user || state.user.role !== 'OWNER') return;
    if (!document.querySelector('[data-saas-billing-card]')) return;
    try {
      state.billing = await api('/billing/subscription');
      renderSaaSBilling(state.billing);
    } catch (error) {
      const card = document.querySelector('[data-saas-billing-card]');
      if (card) card.innerHTML = '<div class="empty-state"><div><strong>Billing unavailable.</strong><span>' + escapeHtml(error.message) + '</span></div></div>';
    }
  }

  function bindBillingActions() {
    const message = document.querySelector('[data-billing-message]');
    const run = async (fn) => {
      if (message) { message.hidden = true; message.classList.remove('green'); }
      try {
        const result = await fn();
        if (result && result.checkoutUrl) window.location.href = result.checkoutUrl;
        if (message) { message.textContent = result && result.message || 'Billing request saved.'; message.classList.add('green'); message.hidden = false; }
        await loadBilling();
      } catch (error) {
        if (message) { message.textContent = error.message; message.hidden = false; }
      }
    };
    document.querySelectorAll('[data-billing-checkout]').forEach((button) => {
      button.onclick = () => run(() => api('/billing/checkout', { method: 'POST', body: JSON.stringify({ planId: button.dataset.billingCheckout }) }));
    });
    document.querySelectorAll('[data-billing-change-plan]').forEach((button) => {
      button.onclick = () => run(() => api('/billing/change-plan', { method: 'POST', body: JSON.stringify({ planId: button.dataset.billingChangePlan }) }));
    });
    const cancel = document.querySelector('[data-billing-cancel]');
    if (cancel) cancel.onclick = () => run(() => api('/billing/cancel', { method: 'POST', body: JSON.stringify({}) }));
    document.querySelectorAll('[data-billing-contact]').forEach((button) => {
      button.onclick = () => showToast('Enterprise is custom priced. Contact FieldCore to scope onboarding, integrations, SLA controls, and annual terms.', true);
    });
  }

  function selectedPaymentMethods(form) {
    const visible = Array.from(form.querySelectorAll('[data-payment-method-option]')).filter((input) => !input.closest('[hidden]'));
    return visible.filter((input) => input.checked).map((input) => String(input.value || '').toUpperCase()).filter(Boolean);
  }

  function updatePaymentMethodVisibility(form, settings) {
    const countryField = form.querySelector('[name="country"]');
    const market = marketFromCountry(countryField && countryField.value || settings && settings.country || 'ZW');
    const defaults = MARKET_DEFAULTS[market] || MARKET_DEFAULTS.ZW;
    form.querySelectorAll('[data-market-method]').forEach((option) => {
      const availability = option.dataset.marketMethod;
      const normalizedAvailability = availability === 'ZA' ? 'SA' : availability;
      const show = normalizedAvailability === 'ALL' || normalizedAvailability === market;
      option.hidden = !show;
      const input = option.querySelector('input');
      if (input && !show) input.checked = false;
    });
    const checked = selectedPaymentMethods(form);
    if (!checked.length) {
      form.querySelectorAll('[data-payment-method-option]').forEach((input) => { input.checked = defaults.paymentMethods.includes(input.value); });
    }
  }

  function syncPaymentMethodHiddenField(form) {
    const hidden = form.querySelector('[name="allowedPaymentMethods"]');
    if (!hidden) return;
    hidden.value = selectedPaymentMethods(form).join(',');
  }

  function financePayload(form) {
    syncPaymentMethodHiddenField(form);
    const data = Object.fromEntries(new FormData(form).entries());
    const hasField = (name) => Boolean(form.querySelector('[name="' + name + '"]'));
    const existingCountry = state.financeSettings && state.financeSettings.country || (currentMarket() === 'SA' ? 'ZA' : 'ZW');
    const country = hasField('country') && data.country ? String(data.country).toUpperCase() : existingCountry;
    const defaults = financeDefaultsForCountry(country);
    const payload = {};

    if (hasField('country')) payload.country = country;
    if (hasField('timezone')) payload.timezone = data.timezone || defaults.timezone;
    if (hasField('defaultCurrency')) {
      payload.defaultCurrency = data.defaultCurrency ? String(data.defaultCurrency).toUpperCase() : defaults.defaultCurrency;
      payload.allowedCurrencies = [payload.defaultCurrency];
      payload.numberFormat = payload.defaultCurrency === 'ZAR' ? 'en-ZA' : defaults.numberFormat;
    }
    if (hasField('taxName')) payload.taxName = data.taxName || defaults.taxName;
    if (hasField('taxRate')) payload.taxRate = data.taxRate !== '' ? Number(data.taxRate) : undefined;
    if (hasField('invoicePrefix')) payload.invoicePrefix = data.invoicePrefix || undefined;
    if (hasField('receiptPrefix')) payload.receiptPrefix = data.receiptPrefix || undefined;
    if (hasField('quoteExpiryDays')) payload.quoteExpiryDays = data.quoteExpiryDays !== '' ? Number(data.quoteExpiryDays) : undefined;
    if (hasField('paymentTermsDays')) payload.paymentTermsDays = data.paymentTermsDays !== '' ? Number(data.paymentTermsDays) : undefined;
    if (hasField('invoiceFooter')) payload.invoiceFooter = data.invoiceFooter || undefined;
    if (hasField('paymentInstructions')) payload.paymentInstructions = data.paymentInstructions || undefined;

    const bankProofInput = form.querySelector('[name="bankTransferProofRequired"]');
    if (bankProofInput) payload.bankTransferProofRequired = Boolean(bankProofInput.checked);

    const pricesIncludeTaxInput = form.querySelector('[name="pricesIncludeTax"]');
    if (pricesIncludeTaxInput) payload.pricesIncludeTax = Boolean(pricesIncludeTaxInput.checked);

    if (form.querySelector('[data-payment-method-option]')) {
      const paymentMethods = selectedPaymentMethods(form);
      payload.allowedPaymentMethods = paymentMethods.length ? paymentMethods : defaults.paymentMethods;
      if (!payload.allowedCurrencies) payload.allowedCurrencies = defaults.allowedCurrencies;
      if (!payload.numberFormat) payload.numberFormat = defaults.numberFormat;
    }
    return payload;
  }

  function fillFinanceForm(settings) {
    const form = document.querySelector('[data-finance-settings-form]');
    const effective = applyMarketCurrencyForDisplay(settings || {});
    document.querySelectorAll('[data-finance-field]').forEach((field) => {
      const key = field.dataset.financeField;
      const value = effective && effective[key];
      if (field.name === 'allowedPaymentMethods') field.value = Array.isArray(value) ? value.join(',') : '';
      else if (field.type === 'checkbox') field.checked = Boolean(value);
      else field.value = value == null ? '' : value;
    });
    if (!form) return;
    updatePaymentMethodVisibility(form, effective);
    const selected = new Set(Array.isArray(effective.allowedPaymentMethods) ? effective.allowedPaymentMethods : []);
    form.querySelectorAll('[data-payment-method-option]').forEach((input) => {
      if (!input.closest('[hidden]')) input.checked = selected.has(input.value);
    });
    if (!selectedPaymentMethods(form).length) {
      const defaults = financeDefaultsForCountry(effective.country);
      form.querySelectorAll('[data-payment-method-option]').forEach((input) => { input.checked = defaults.paymentMethods.includes(input.value); });
    }
    syncPaymentMethodHiddenField(form);
    if (!form.dataset.financeUiBound) {
      form.dataset.financeUiBound = 'true';
      const countryField = form.querySelector('[name="country"]');
      if (countryField) {
        countryField.addEventListener('change', () => {
          const defaults = financeDefaultsForCountry(countryField.value);
          const currencyField = form.querySelector('[name="defaultCurrency"]');
          const timezoneField = form.querySelector('[name="timezone"]');
          const taxField = form.querySelector('[name="taxName"]');
          if (currencyField) currencyField.value = defaults.defaultCurrency;
          if (timezoneField) timezoneField.value = defaults.timezone;
          if (taxField) taxField.value = defaults.taxName;
          updatePaymentMethodVisibility(form, { country: countryField.value });
          form.querySelectorAll('[data-payment-method-option]').forEach((input) => { input.checked = defaults.paymentMethods.includes(input.value); });
          syncPaymentMethodHiddenField(form);
        });
      }
      form.querySelectorAll('[data-payment-method-option]').forEach((input) => input.addEventListener('change', () => syncPaymentMethodHiddenField(form)));
    }
  }

  function renderFinanceExportLogs(logs) {
    const card = document.querySelector('[data-finance-export-logs-card]');
    if (!card) return;
    const rows = (logs || []).slice(0, 20).map((item) => '<tr><td>' + escapeHtml(item.exportType || '-') + '</td><td>' + escapeHtml(item.provider || '-') + '</td><td>' + escapeHtml(item.fileName || '-') + '</td><td>' + escapeHtml(item.recordCount || 0) + '</td><td>' + escapeHtml(item.status || '-') + '</td><td>' + escapeHtml(formatDateTime(item.createdAt)) + '</td></tr>').join('');
    card.innerHTML = '<div class="panel-head card"><h3>Export Logs</h3><span class="badge gray">' + (logs || []).length + '</span></div>' + (rows ? '<div class="table-scroll"><table><thead><tr><th>Type</th><th>Provider</th><th>File</th><th>Records</th><th>Status</th><th>Created</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty-state"><div><strong>No export logs yet.</strong><span>Export CSV files to create logs.</span></div></div>');
  }

  async function loadFinanceSettings() {
    const canChangeMoney = hasPermission('settings.finance.manage');
    const canDownloadMoney = hasPermission('finance.exports.manage');
    if (!canChangeMoney && !canDownloadMoney) return;
    try {
      const [settings, logs] = await Promise.all([
        canChangeMoney ? api('/company/finance-settings') : Promise.resolve(null),
        canDownloadMoney ? api('/finance/export-logs').catch(() => []) : Promise.resolve([])
      ]);
      if (settings) {
        state.financeSettings = applyMarketCurrencyForDisplay(settings);
        fillFinanceForm(state.financeSettings);
      }
      if (canDownloadMoney) {
        state.financeExportLogs = logs;
        renderFinanceExportLogs(logs);
      }
      if (canChangeMoney) await loadPaymentProviders();
    } catch (error) {
      setFormMessage('[data-finance-message]', error.message, false);
    }
  }

  function bindFinanceIntegrationActions() {
    const form = document.querySelector('[data-finance-integration-form]');
    const message = document.querySelector('[data-finance-integration-message]');
    if (form && !form.dataset.bound) {
      form.dataset.bound = 'true';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (message) { message.hidden = true; message.classList.remove('green'); }
        const data = Object.fromEntries(new FormData(form).entries());
        try {
          await api('/finance/integrations', { method: 'POST', body: JSON.stringify({ provider: data.provider, externalTenantId: data.externalTenantId || undefined, config: data.note ? { note: data.note } : {} }) });
          if (message) { message.textContent = 'Finance integration saved.'; message.classList.add('green'); message.hidden = false; }
          form.reset();
          await loadFinanceSettings();
        } catch (error) {
          if (message) { message.textContent = error.message; message.hidden = false; }
        }
      });
    }
    document.querySelectorAll('[data-finance-connect]').forEach((button) => {
      button.onclick = async () => {
        if (!button.dataset.financeConnect) return;
        try {
          await api('/finance/integrations/' + button.dataset.financeConnect + '/connect', { method: 'POST', body: JSON.stringify({ mockMode: true }) });
          showToast('Finance integration connected in mock mode.', true);
          await loadFinanceSettings();
        } catch (error) {
          showToast(error.message, false);
        }
      };
    });
    document.querySelectorAll('[data-finance-test]').forEach((button) => {
      button.onclick = async () => {
        if (!button.dataset.financeTest) return;
        try {
          const result = await api('/finance/integrations/' + button.dataset.financeTest + '/test', { method: 'POST', body: JSON.stringify({}) });
          showToast(result.test && result.test.message || 'Finance integration checked.', true);
          await loadFinanceSettings();
        } catch (error) {
          showToast(error.message, false);
        }
      };
    });
  }

  function renderSystemStatus(status) {
    const card = document.querySelector('[data-system-status-card]');
    if (!card) return;
    const rows = Object.entries(status || {}).map(([key, value]) => '<tr><td>' + escapeHtml(key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())) + '</td><td>' + escapeHtml(value) + '</td></tr>').join('');
    card.innerHTML = '<div class="panel-head card"><h3>System Status</h3><span class="badge gray">No secrets</span></div><div class="table-scroll"><table><tbody>' + rows + '</tbody></table></div>';
  }

  function renderAuditLogs(logs) {
    const card = document.querySelector('[data-audit-log-card]');
    if (!card) return;
    const rows = (logs || []).slice(0, 50).map((item) => '<tr><td>' + escapeHtml(item.action || '-') + '</td><td>' + escapeHtml(item.entity || '-') + '</td><td>' + escapeHtml(item.entityId || '-') + '</td><td>' + escapeHtml(item.actor && (item.actor.name || item.actor.email) || 'System') + '</td><td>' + escapeHtml(formatDateTime(item.createdAt)) + '</td></tr>').join('');
    card.innerHTML = '<div class="panel-head card"><h3>Recent Audit Logs</h3><span class="badge gray" data-audit-log-count>' + (logs || []).length + '</span></div>' + (rows ? '<div class="table-scroll"><table><thead><tr><th>Action</th><th>Entity</th><th>Record</th><th>Actor</th><th>Time</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty-state"><div><strong>No audit logs yet.</strong><span>Important actions will appear here.</span></div></div>');
  }

  async function loadAdminTools() {
    const card = document.querySelector('[data-audit-log-card]');
    if (!card || !hasPermission('audit.view')) return;
    try {
      renderAuditLogs(await api('/audit-logs'));
    } catch (error) {
      card.innerHTML = '<div class="empty-state"><div><strong>Company activity is unavailable.</strong><span>' + escapeHtml(error.message) + '</span></div></div>';
    }
  }

  function settingsNodeAllowed(node) {
    if (!node || !state.user || state.user.role === 'OWNER') return true;
    const one = node.dataset.requiredPermission;
    if (one && !hasPermission(one)) return false;
    const any = String(node.dataset.requiredAnyPermission || '').split(',').map((item) => item.trim()).filter(Boolean);
    if (any.length && !hasAnyPermission(any)) return false;
    return true;
  }

  function activateSettingsPanel(target) {
    const tabs = Array.from(document.querySelectorAll('[data-settings-target]'));
    const panels = Array.from(document.querySelectorAll('[data-settings-panel]'));
    const selected = tabs.find((tab) => !tab.hidden && tab.dataset.settingsTarget === target) || tabs.find((tab) => !tab.hidden);
    const selectedTarget = selected && selected.dataset.settingsTarget;
    tabs.forEach((tab) => tab.classList.toggle('active', tab === selected));
    panels.forEach((panel) => {
      const allowed = settingsNodeAllowed(panel);
      const active = allowed && panel.dataset.settingsPanel === selectedTarget;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
    return selectedTarget;
  }

  function applySettingsAccess() {
    if (page !== 'settings' || !state.user) return;
    const tabs = Array.from(document.querySelectorAll('[data-settings-target]'));
    const panels = Array.from(document.querySelectorAll('[data-settings-panel]'));
    tabs.forEach((tab) => { tab.hidden = !settingsNodeAllowed(tab); });
    panels.forEach((panel) => { panel.hidden = !settingsNodeAllowed(panel); });

    document.querySelectorAll('[data-required-permission], [data-required-any-permission]').forEach((node) => {
      if (node.matches('[data-settings-target], [data-settings-panel]')) return;
      node.hidden = !settingsNodeAllowed(node);
    });

    const canChangeCompany = hasPermission('company.settings.manage');
    const canChangeBrand = hasPermission('company.branding.manage');
    document.querySelectorAll('[data-profile-field]').forEach((field) => { field.disabled = !canChangeCompany; });
    document.querySelectorAll('[data-branding-field], [data-logo-input]').forEach((field) => { field.disabled = !canChangeBrand; });
    const logoButton = document.querySelector('.file-upload-button');
    if (logoButton) logoButton.hidden = !canChangeBrand;
    const companySave = document.querySelector('[data-branding-form] button[type="submit"]');
    if (companySave) companySave.hidden = !canChangeCompany && !canChangeBrand;

    const current = tabs.find((tab) => tab.classList.contains('active') && !tab.hidden);
    activateSettingsPanel(current && current.dataset.settingsTarget);
  }

  function setupSettings() {
    const tabs = Array.from(document.querySelectorAll('[data-settings-target]'));
    const panels = Array.from(document.querySelectorAll('[data-settings-panel]'));
    if (!tabs.length || !panels.length) return;

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        if (tab.hidden || !settingsNodeAllowed(tab)) return;
        const target = activateSettingsPanel(tab.dataset.settingsTarget);
        if (target === 'finance') loadFinanceSettings();
        if (target === 'notifications' && hasPermission('notifications.view')) loadNotificationLogs();
        if (target === 'integrations' && hasPermission('integration.view')) loadIntegrations();
        if (target === 'admin-tools' && hasPermission('audit.view')) loadAdminTools();
      });
    });
    if (state.user) applySettingsAccess();

    document.querySelectorAll('[data-branding-field], [data-profile-field]').forEach((field) => {
      field.addEventListener('input', updateBrandingPreview);
    });

    const invoiceDefaultsForm = document.querySelector('[data-invoice-defaults-form]');
    if (invoiceDefaultsForm && !invoiceDefaultsForm.dataset.bound) {
      invoiceDefaultsForm.dataset.bound = 'true';
      invoiceDefaultsForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          const settings = applyMarketCurrencyForDisplay(await api('/company/finance-settings', { method: 'PATCH', body: JSON.stringify(financePayload(invoiceDefaultsForm)) }));
          state.financeSettings = settings;
          fillFinanceForm(settings);
          setFormMessage('[data-invoice-defaults-message]', 'Invoice and payment defaults saved.', true);
        } catch (error) {
          setFormMessage('[data-invoice-defaults-message]', error.message, false);
        }
      });
    }

    const financeForm = document.querySelector('[data-finance-settings-form]');
    if (financeForm && !financeForm.dataset.bound) {
      financeForm.dataset.bound = 'true';
      financeForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          const settings = applyMarketCurrencyForDisplay(await api('/company/finance-settings', { method: 'PATCH', body: JSON.stringify(financePayload(financeForm)) }));
          state.financeSettings = settings;
          fillFinanceForm(settings);
          setFormMessage('[data-finance-message]', 'Finance settings saved.', true);
        } catch (error) {
          setFormMessage('[data-finance-message]', error.message, false);
        }
      });
    }

    const input = document.querySelector('[data-logo-input]');
    const preview = document.querySelector('[data-logo-preview]');
    const fileName = document.querySelector('[data-logo-file-name]');

    if (input && preview) {
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];

        if (!file) {
          if (fileName) fileName.textContent = 'No file selected';
          return;
        }

        if (fileName) fileName.textContent = file.name;

        const reader = new FileReader();
        reader.addEventListener('load', () => {
          preview.innerHTML = `<img src="${reader.result}" alt="Company logo preview">`;
        });
        reader.readAsDataURL(file);
      });
    }

    const jobDefaultsForm = document.querySelector('[data-job-defaults-form]');
    if (jobDefaultsForm) {
      jobDefaultsForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        await saveSettingsForm(jobDefaultsForm, '[data-job-defaults-message]', 'Job defaults saved.');
      });
    }

    const schedulingForm = document.querySelector('[data-scheduling-form]');
    if (schedulingForm) {
      schedulingForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        await saveSettingsForm(schedulingForm, '[data-scheduling-message]', 'Scheduling saved.');
      });
    }

    setupAdminSecurity();

    const availabilityForm = document.querySelector('[data-availability-form]');
    if (availabilityForm) {
      availabilityForm.roleId.addEventListener('change', loadSelectedAvailability);
      availabilityForm.dayOfWeek.addEventListener('change', () => {
        const slots = state.availability[availabilityCacheKey(availabilityForm.roleId.value)] || [];
        setAvailabilityFields(selectedAvailabilitySlot(slots, availabilityForm.dayOfWeek.value));
      });
      availabilityForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = document.querySelector('[data-availability-message]');
        if (message) { message.hidden = true; message.classList.remove('green'); }
        const body = Object.fromEntries(new FormData(availabilityForm).entries());
        try {
          const key = availabilityCacheKey(body.roleId);
          const existing = state.availability[key] || await api('/worker-roles/' + body.roleId + '/availability');
          const next = existing.filter((slot) => Number(slot.dayOfWeek) !== Number(body.dayOfWeek)).map((slot) => ({ dayOfWeek: Number(slot.dayOfWeek), startTime: slot.startTime, endTime: slot.endTime, active: slot.active !== false }));
          next.push({ dayOfWeek: Number(body.dayOfWeek), startTime: body.startTime, endTime: body.endTime, active: true });
          state.availability[key] = await api('/worker-roles/' + body.roleId + '/availability', { method: 'PUT', body: JSON.stringify(next) });
          setAvailabilityFields(selectedAvailabilitySlot(state.availability[key], body.dayOfWeek));
          if (message) { message.textContent = 'Role availability saved.'; message.classList.add('green'); message.hidden = false; }
          showToast('Role availability saved.', true);
        } catch (error) {
          if (message) { message.textContent = error.message; message.hidden = false; }
        }
      });
    }

    const form = document.querySelector('[data-branding-form]');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = document.querySelector('[data-branding-message]');
      if (message) {
        message.hidden = true;
        message.classList.remove('green');
      }
      try {
        const canChangeCompany = hasPermission('company.settings.manage');
        const canChangeBrand = hasPermission('company.branding.manage');
        if (!canChangeCompany && !canChangeBrand) throw new Error('You do not have access to change company details.');

        if (canChangeBrand) {
          const logoInput = document.querySelector('[data-logo-input]');
          if (logoInput && logoInput.files && logoInput.files[0]) {
            state.branding = await uploadLogo(logoInput.files[0]);
            const logoUrlField = document.querySelector('[data-branding-field="logoUrl"]');
            if (logoUrlField) logoUrlField.value = state.branding.logoUrl || '';
          }
          state.branding = await api('/company/branding', { method: 'PATCH', body: JSON.stringify(formPayload('[data-branding-field]')) });
        }
        if (canChangeCompany) {
          state.profile = await api('/company/profile', { method: 'PATCH', body: JSON.stringify(formPayload('[data-profile-field]')) });
        }
        applyBranding();
        const savedLabel = canChangeCompany && canChangeBrand ? 'Company details saved.' : canChangeBrand ? 'Brand saved.' : 'Company details saved.';
        if (message) {
          message.textContent = savedLabel;
          message.classList.add('green');
          message.hidden = false;
        }
        showToast(savedLabel, true);
      } catch (error) {
        if (message) {
          message.textContent = error.message;
          message.hidden = false;
        }
      }
    });
  }

  function redirectToLogin() {
    const current = window.location.pathname.split('/').pop() || 'index.html';
    const query = window.location.search || '';
    window.location.href = 'login.html?return=' + encodeURIComponent(current + query);
  }

  function redirectToClientPortal() {
    window.location.href = 'client-portal.html';
  }

  async function uploadLogo(file) {
  const formData = new FormData();
  formData.append('logo', file);

  const response = await fetch(`${API_BASE}/company/branding/logo`, {
    method: 'POST',
    credentials: 'include',
    body: formData
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error && payload.error.message || `HTTP ${response.status}`);
  return payload.data;
}

  async function load() {
    setStatus('Connecting to API...', true);
    try {
      const clientSession = await api('/client/auth/session').catch(() => null);
      if (clientSession) {
        setStatus('Client session active. Redirecting to client portal...', false);
        redirectToClientPortal();
        return;
      }
      state.user = await api('/auth/session');
      if (!state.user) throw new Error('Authentication required');
      document.querySelectorAll('[data-current-user-name]').forEach((node) => { node.textContent = state.user.name || state.user.email || 'Signed in'; });
      document.querySelectorAll('[data-current-user-role]').forEach((node) => { node.textContent = state.user.jobTitle || state.user.roleTemplate && state.user.roleTemplate.name || state.user.role || 'Account'; });
      document.querySelectorAll('[data-account-initials]').forEach((node) => { node.textContent = String(state.user.name || state.user.email || 'FC').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); });
      await loadCompanyBranding();
      applyRoleUi();
      const staffSettingsPermissions = ['company.settings.view', 'company.settings.manage', 'company.branding.manage', 'settings.finance.manage', 'finance.exports.manage', 'notifications.view', 'integration.view', 'integration.manage', 'audit.view'];
      const usesSimpleWorkerSettings = page === 'settings' && isWorker() && !hasAnyPermission(staffSettingsPermissions);
      if (usesSimpleWorkerSettings) {
        renderWorkerSettings();
      } else if (page === 'settings') {
        applySettingsAccess();
        if (hasPermission('company.settings.manage')) await loadSchedulingSettings();
        if (hasPermission('notifications.view')) await loadNotificationLogs();
        if (hasAnyPermission(['settings.finance.manage', 'finance.exports.manage'])) await loadFinanceSettings();
      }
    } catch (error) {
      setStatus('Log in to load company data.', false);
      redirectToLogin();
      return;
    }

    try {
      if (isWorker()) {
        if (page === 'dashboard') renderDashboard(await api('/dashboard'));
        if (page === 'jobs') {
          const data = await api('/jobs');
          state.jobs = data;
          renderWorkerJobsPage(data);
        }
        if (page === 'schedule') {
          const data = await api('/schedule');
          state.schedule = data;
          state.scheduleSettings = { workingDayStart: '08:00', workingDayEnd: '17:00' };
          setupScheduleControls();
          renderSchedule(data, state.scheduleSettings);
        }
        if (page === 'settings') renderWorkerSettings();
        setStatus(`Connected as ${state.user.name}`, true);
        return;
      }
      await preloadLookups();
      if (page === 'dashboard') renderDashboard(await api('/dashboard'));
      if (page === 'reports') await loadReports();
      if (page === 'schedule') {
        const [data, settings] = await Promise.all([api('/schedule'), api('/company/scheduling-settings').catch(() => ({ workingDayStart: '08:00', workingDayEnd: '17:00' }))]);
        state.schedule = data;
        state.scheduleSettings = settings;
        setupScheduleControls();
        renderSchedule(data, settings);
      }
      if (page === 'customers') {
        setupPeopleTabs();
        await loadPeopleResource(peopleResource());
      } else if (page === 'quotes') {
        setupQuoteTabs();
        await loadQuotesResource(activeQuoteFilter());
      } else if (tableConfigs[page] && page !== 'schedule') {
        const data = await api(`/${page}`);
        state[page] = data;
        if (!state.listFilters[page]) state.listFilters[page] = 'all';
        if (page === 'assets') setupAssetCustomerFilter(data);
        renderTable(page, page === 'assets' ? assetsForSelectedCustomer(filteredListData(page, data)) : filteredListData(page, data));
        setupStatusTabs(page, data);
        updateListStats(page, data);
      }
      setStatus(`Connected as ${state.user.name}`, true);
    } catch (error) {
      setStatus(error.message, false);
      if (error.message.includes('permissions')) return;
    }
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-logout]');
    if (!button) return;
    const ok = await openConfirmModal({ title: 'Log Out', message: 'Log out of FieldCore and return to the login screen?', okLabel: 'Log Out' });
    if (!ok) return;
    await api('/auth/logout', { method: 'POST', body: '{}' });
    state.user = null;
    window.location.href = 'login.html';
  });

  function rerenderAfterMarketChange() {
    state.financeSettings = applyMarketCurrencyForDisplay(state.financeSettings);
    fillFinanceForm(state.financeSettings);
    if (state.billing) renderSaaSBilling(state.billing);
    if (page === 'dashboard') api('/dashboard').then(renderDashboard).catch(() => {});
    if (page === 'reports' && state.reports) renderReports(state.reports);
    if (page === 'schedule' && state.schedule) renderSchedule(state.schedule, state.scheduleSettings || {});
    if (tableConfigs[page] && page !== 'schedule' && state[page]) {
      const data = page === 'assets' ? assetsForSelectedCustomer(filteredListData(page, state[page])) : filteredListData(page, state[page]);
      renderTable(page, data);
    }
  }

  window.addEventListener('fieldcore:market-change', rerenderAfterMarketChange);

  document.addEventListener('click', handleWorkerDashboardAction);
  document.addEventListener('click', handleRowAction);
  setupCreateButtons();
  setupSettings();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
