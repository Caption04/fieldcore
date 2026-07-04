(function(){
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  const page = document.body.dataset.page || 'dashboard';
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const receiptMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const state = { user: null, profile: null, branding: null, customers: [], services: [], workers: [], roles: [], jobs: [], invoices: [], availability: {}, notificationLogs: [], billing: null };

  const tableConfigs = {
    customers: {
      columns: ['Customer', 'Contact', 'Address', 'Jobs', 'Balance'],
      emptyTitle: 'No customers yet',
      emptyText: 'Create your first customer to fill this directory.',
      row: (item) => [item.name, [item.email, item.phone].filter(Boolean).join(' / ') || '-', item.address || '-', (item.jobs || []).length, money.format((item.invoices || []).filter((i) => i.status !== 'PAID').reduce((sum, i) => sum + Number(i.amount || 0), 0))]
    },
    jobs: {
      columns: ['Job', 'Customer', 'Worker', 'Status', 'Scheduled', 'Total', 'Actions'],
      emptyTitle: 'No jobs yet',
      emptyText: 'Create your first job to populate operations.',
      row: (item) => [item.title, item.customer && item.customer.name || '-', item.worker && item.worker.user && item.worker.user.name || '-', badge(item.status), formatDate(item.scheduledStart), money.format(Number(item.total || 0)), rowActions('jobs', item)]
    },
    quotes: {
      columns: ['Quote', 'Customer', 'Status', 'Total', 'Valid Until', 'Actions'],
      emptyTitle: 'No quotes yet',
      emptyText: 'Create your first quote to start the pipeline.',
      row: (item) => [item.title, item.customer && item.customer.name || '-', badge(item.status), money.format(Number(item.total || item.amount || 0)), formatDate(item.validUntil), rowActions('quotes', item)]
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
    document.querySelectorAll('[data-api-status]').forEach((node) => {
      node.textContent = message;
      node.classList.toggle('red', ok === false);
    });
  }


  function syncModalScrollLock() {
    document.body.classList.toggle('modal-open', Boolean(document.querySelector('.fc-modal')));
  }

  if (window.MutationObserver) {
    new MutationObserver(syncModalScrollLock).observe(document.body, { childList: true });
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
    const allowedHrefs = new Set(['index.html', 'jobs.html', 'schedule.html', 'map.html', 'settings.html']);
    document.querySelectorAll('.nav-link').forEach((link) => {
      const href = (link.getAttribute('href') || '').split('/').pop();
      const workerAllowed = allowedHrefs.has(href);
      link.hidden = isWorker() && !workerAllowed;
      if (href === 'jobs.html') setLinkLabel(link, isWorker() ? 'My Jobs' : 'Jobs');
      if (href === 'schedule.html') setLinkLabel(link, isWorker() ? 'My Schedule' : 'Schedule');
    });
    document.body.classList.toggle('worker-role', Boolean(isWorker()));
    document.querySelectorAll('.quick-card').forEach((node) => { node.hidden = Boolean(isWorker()); });
    document.querySelectorAll('.primary-button').forEach((button) => {
      if (!button.closest('form') && button.textContent.trim().toLowerCase().startsWith('+ new ')) button.hidden = Boolean(isWorker());
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


  function rowActions(resource, item) {
    if (isWorker()) {
      return resource === 'jobs' ? workerJobActions(item, true) : '';
    }
    const buttons = [];
    const add = (label, action, primary) => buttons.push('<button class="' + (primary ? 'primary-button' : 'secondary-button') + ' compact" type="button" data-row-action="' + action + '" data-id="' + escapeHtml(item.id) + '">' + label + '</button>');
    if (resource === 'quotes' && item.status === 'DRAFT') add('Send', 'quote-send');
    if (resource === 'quotes' && item.status === 'SENT') add('Accept', 'quote-accept');
    if (resource === 'quotes' && item.status === 'SENT') add('Reject', 'quote-reject');
    if (resource === 'jobs') add('Details', 'job-detail', true);
    if (resource === 'jobs' && item.status !== 'COMPLETED' && item.status !== 'CANCELLED') add(item.scheduledStart ? 'Reschedule' : 'Schedule', item.scheduledStart ? 'job-reschedule' : 'job-schedule');
    if (resource === 'jobs' && item.scheduledStart && item.status !== 'COMPLETED' && item.status !== 'CANCELLED') add('Unschedule', 'job-unschedule');
    if (resource === 'jobs' && item.status === 'COMPLETED') add('Invoice', 'job-invoice');
    if (resource === 'booking-requests') {
      add('View', 'booking-view', true);
      if (item.status === 'NEW') add('Mark Reviewed', 'booking-review');
      if (item.status !== 'CONVERTED' && item.status !== 'DECLINED') add('Decline', 'booking-decline');
      if (item.status !== 'CONVERTED' && item.status !== 'DECLINED') add('Convert to Job', 'booking-convert');
      if (item.status !== 'CONVERTED' && item.status !== 'DECLINED') add('Create Quote', 'booking-quote');
    }
    if (resource === 'invoices') {
      const status = String(item.status || '').toUpperCase();
      const hasReceipts = Array.isArray(item.receipts) && item.receipts.length > 0;
      if (status === 'DRAFT') add('Send', 'invoice-send');
      if (status !== 'PAID' && status !== 'VOID') add('Record Payment', 'invoice-pay');
      if (hasReceipts) add(status === 'PARTIALLY_PAID' || item.receipts.length > 1 ? 'View Receipts' : 'View Receipt', 'invoice-receipts', status === 'PAID');
      if (status !== 'VOID' && status !== 'PAID') add('Void', 'invoice-void');
    }
    return '<div class="row-actions">' + buttons.join('') + '</div>';
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

  function buildScheduleGrid(grid, settings) {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const hours = scheduleHours(settings);
    grid.style.gridTemplateColumns = '92px repeat(7, minmax(0, 1fr))';
    grid.innerHTML = '<div class="schedule-head">Time</div>' + days.map((day) => `<div class="schedule-head">${day}</div>`).join('') + hours.map((hour) => '<div class="time-cell">' + hourLabel(hour) + '</div>' + days.map(() => '<div class="schedule-cell"></div>').join('')).join('');
    return hours;
  }

  function eventTone(item) {
    const status = String(item.conflictStatus || item.status || '').toLowerCase();
    if (status.includes('conflict') || status.includes('override')) return 'orange';
    if (status.includes('complete')) return 'green';
    return '';
  }

  function renderSchedule(data, settings) {
    const card = document.querySelector('.table-card');
    const grid = document.querySelector('.schedule-grid');
    if (!card || !grid) return;
    const hours = buildScheduleGrid(grid, settings);
    const cells = Array.from(grid.querySelectorAll('.schedule-cell'));
    const empty = card.querySelector('.empty-state');
    if (empty) empty.hidden = data.length > 0;
    data.forEach((item) => {
      if (!item.startsAt) return;
      const row = scheduleRowIndex(item.startsAt, hours);
      const column = scheduleDayIndex(item.startsAt);
      const cell = cells[row * 7 + column];
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
  function renderTable(resource, data) {
    const config = tableConfigs[resource];
    const card = document.querySelector('.table-card');
    if (!card || !config) return;
    if (!data.length) {
      card.innerHTML = `<div class="empty-state"><div><strong>${config.emptyTitle}</strong><span>${config.emptyText}</span></div></div><footer class="table-footer"><span>Showing 0 ${resource}</span><div class="pager"><span class="page-dot active">1</span></div></footer>`;
      return;
    }
    const rows = data.map((item) => `<tr>${config.row(item).map((cell) => `<td>${String(cell).startsWith('<span') || String(cell).startsWith('<div') ? cell : escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
    card.innerHTML = `<div class="table-scroll"><table><thead><tr>${config.columns.map((name) => `<th>${escapeHtml(name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div><footer class="table-footer"><span>Showing ${data.length} ${resource}</span><div class="pager"><span class="page-dot active">1</span></div></footer>`;
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
    return '<div class="table-scroll"><table><thead><tr>' + columns.map((column) => '<th>' + escapeHtml(column.label) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((row) => '<tr>' + columns.map((column) => '<td>' + (column.html ? column.value(row) : escapeHtml(column.value(row))) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  }

  function renderReports(data) {
    const root = document.querySelector('[data-reports-root]');
    if (!root) return;
    const filters = data.filters || {};
    const options = data.options || {};
    const overview = data.overview || {};
    const revenue = data.revenue || {};
    const invoices = data.invoices || {};
    const jobs = data.jobs || {};
    const quotes = data.quotes || {};
    const customers = data.customers || {};
    const exportBase = '/api/reports/export?' + reportQueryFromForm().toString();
    root.innerHTML = '<div class="hero-row"><div class="hero-copy"><h2>Business Performance</h2><p>Company-scoped analytics from ' + escapeHtml(formatDate(filters.startDate)) + ' to ' + escapeHtml(formatDate(filters.endDate)) + '.</p></div><span class="api-status" data-api-status>Connected</span></div>' +
      '<form class="panel form-grid" data-report-filters><div class="field"><label for="reportPeriod">Period</label><select id="reportPeriod" name="period"><option value="last30days">Last 30 days</option><option value="today">Today</option><option value="thisMonth">This month</option><option value="lastMonth">Last month</option><option value="thisYear">This year</option></select></div><div class="field"><label for="reportStart">Start</label><input id="reportStart" name="startDate" type="date"></div><div class="field"><label for="reportEnd">End</label><input id="reportEnd" name="endDate" type="date"></div><div class="field"><label for="reportService">Service</label><select id="reportService" name="serviceId">' + reportOptionList(options.services, 'All services', filters.serviceId) + '</select></div><div class="field"><label for="reportWorker">Worker</label><select id="reportWorker" name="workerId">' + reportOptionList(options.workers, 'All workers', filters.workerId) + '</select></div><div class="field"><label for="reportCustomer">Customer</label><select id="reportCustomer" name="customerId">' + reportOptionList(options.customers, 'All customers', filters.customerId) + '</select></div><div class="form-actions span-2"><button class="primary-button" type="submit">Apply Filters</button><a class="secondary-button" href="' + escapeHtml(exportBase + (exportBase.endsWith('?') ? '' : '&') + 'section=revenue') + '">Export Revenue CSV</a><a class="secondary-button" href="' + escapeHtml(exportBase + (exportBase.endsWith('?') ? '' : '&') + 'section=invoices') + '">Export Invoices CSV</a><a class="secondary-button" href="' + escapeHtml(exportBase + (exportBase.endsWith('?') ? '' : '&') + 'section=jobs') + '">Export Jobs CSV</a></div><p class="fc-form-error span-2" data-report-message hidden></p></form>' +
      '<section class="stats"><article class="card stat-card"><div class="stat-label">Paid Revenue</div><div class="stat-value">' + money.format(overview.totalRevenue || 0) + '</div><div class="trend">Confirmed payments</div></article><article class="card stat-card"><div class="stat-label">Unpaid Invoices</div><div class="stat-value">' + money.format(overview.unpaidInvoiceTotal || 0) + '</div><div class="trend">' + escapeHtml(invoices.unpaidCount || 0) + ' open invoices</div></article><article class="card stat-card"><div class="stat-label">Jobs Completed</div><div class="stat-value">' + escapeHtml(overview.completedJobs || 0) + '</div><div class="trend">' + escapeHtml(jobs.completionRate || 0) + '% completion rate</div></article><article class="card stat-card"><div class="stat-label">Quote Acceptance</div><div class="stat-value">' + escapeHtml(overview.quoteAcceptanceRate || 0) + '%</div><div class="trend">Sent quote outcomes</div></article></section>' +
      '<section class="split"><div class="panel"><div class="panel-head"><h2>Revenue</h2><span class="badge green">' + money.format(revenue.totalRevenue || 0) + '</span></div>' + reportTable([{ label: 'Date', value: (row) => row.date }, { label: 'Revenue', value: (row) => money.format(row.value) }], revenue.byPeriod || [], 'No confirmed payments in this range.') + '</div><aside class="panel"><div class="panel-head"><h3>Unpaid Invoices</h3><span class="badge gray">' + money.format(invoices.unpaidTotal || 0) + '</span></div>' + reportTable([{ label: 'Customer', value: (row) => row.name }, { label: 'Count', value: (row) => row.count }, { label: 'Total', value: (row) => money.format(row.total) }], invoices.topUnpaidCustomers || [], 'No unpaid invoices.') + '</aside></section>' +
      '<section class="split"><div class="panel"><div class="panel-head"><h2>Jobs</h2><span class="badge blue">' + escapeHtml(jobs.completedCount || 0) + ' completed</span></div>' + reportTable([{ label: 'Service', value: (row) => row.name }, { label: 'Jobs', value: (row) => row.count }], jobs.byService || [], 'No jobs in this range.') + '</div><aside class="panel"><div class="panel-head"><h3>Worker Performance</h3></div>' + reportTable([{ label: 'Worker', value: (row) => row.name }, { label: 'Assigned', value: (row) => row.assigned }, { label: 'Completed', value: (row) => row.completed }, { label: 'Rate', value: (row) => row.completionRate + '%' }], data.workers || [], 'No worker activity in this range.') + '</aside></section>' +
      '<section class="split"><div class="panel"><div class="panel-head"><h2>Services</h2></div>' + reportTable([{ label: 'Service', value: (row) => row.name }, { label: 'Bookings', value: (row) => row.bookingRequests }, { label: 'Jobs', value: (row) => row.jobs }, { label: 'Revenue', value: (row) => money.format(row.revenue) }], data.services || [], 'No service activity in this range.') + '</div><aside class="panel"><div class="panel-head"><h3>Quote Conversion</h3><span class="badge blue">' + escapeHtml(quotes.acceptanceRate || 0) + '%</span></div>' + reportTable([{ label: 'Service', value: (row) => row.name }, { label: 'Quotes', value: (row) => row.quotes }, { label: 'Accepted', value: (row) => row.accepted }, { label: 'Rate', value: (row) => row.acceptanceRate + '%' }], quotes.byService || [], 'No quotes in this range.') + '</aside></section>' +
      '<section class="panel"><div class="panel-head"><h2>Customers</h2><span class="badge gray">' + escapeHtml(customers.totalCustomers || 0) + ' total</span></div>' + reportTable([{ label: 'Customer', value: (row) => row.name }, { label: 'Revenue', value: (row) => money.format(row.revenue) }, { label: 'Unpaid', value: (row) => money.format(row.unpaidTotal) }, { label: 'Jobs', value: (row) => row.jobs }, { label: 'Last Payment', value: (row) => formatDate(row.lastPaymentDate) }], customers.topCustomers || [], 'No customer history yet.') + '</section>';
    const form = document.querySelector('[data-report-filters]');
    if (form) {
      form.elements.period.value = filters.period || 'last30days';
      form.elements.startDate.value = filters.period === 'custom' ? String(filters.startDate || '').slice(0, 10) : '';
      form.elements.endDate.value = filters.period === 'custom' ? String(filters.endDate || '').slice(0, 10) : '';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        await loadReports();
      });
    }
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
      setStats([{ value: data.length, trend: 'Total records' }, { value: data.length, trend: 'Active accounts' }, { value: money.format(balance), trend: 'Outstanding' }, { value: average(data.map((c) => (c.jobs || []).length)), trend: 'Per customer' }]);
    }
    if (resource === 'jobs') setStats(countStatuses(data, ['NEW', 'IN_PROGRESS', 'COMPLETED', 'PAUSED'], ['Open jobs', 'Active work', 'Finished', 'Paused']));
    if (resource === 'quotes') setStats(countStatuses(data, ['SENT', 'ACCEPTED', 'SENT', 'DRAFT'], ['Open quotes', 'Accepted', 'Sent', 'Drafts']));
    if (resource === 'invoices') setStats(countStatuses(data, ['ALL', 'PAID', 'SENT', 'OVERDUE', 'DRAFT'], ['Total invoices', 'Paid', 'Unpaid', 'Overdue', 'Drafts']));
    if (resource === 'booking-requests') setStats(countStatuses(data, ['NEW', 'REVIEWED', 'CONVERTED', 'DECLINED'], ['Awaiting review', 'Ready to convert', 'Jobs created', 'Not proceeding']));
  }

  function average(values) {
    if (!values.length) return '0';
    return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1).replace('.0', '');
  }

  function countStatuses(data, statuses, trends) {
    return statuses.map((status, index) => ({ value: status === 'ALL' ? data.length : data.filter((item) => item.status === status).length, trend: trends[index] }));
  }

  async function preloadLookups() {
    const requests = [];
    if (['jobs', 'quotes', 'invoices', 'schedule'].includes(page)) requests.push(api('/customers').then((d) => state.customers = d).catch(() => []));
    if (['jobs', 'quotes', 'invoices'].includes(page)) requests.push(api('/services').then((d) => state.services = d).catch(() => []));
    if (['jobs', 'schedule'].includes(page)) requests.push(api('/workers').then((d) => state.workers = d).catch(() => []));
    if (['quotes', 'invoices', 'schedule'].includes(page)) requests.push(api('/jobs').then((d) => state.jobs = d).catch(() => []));
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

  function checkboxField(name, label) {
    const q = String.fromCharCode(34);
    return "<div class=" + q + "field checkbox-field" + q + "><label for=" + q + "fc-" + name + q + "><input id=" + q + "fc-" + name + q + " name=" + q + name + q + " type=" + q + "checkbox" + q + "> " + escapeHtml(label) + "</label></div>";
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
    if (resource === 'jobs') return {
  title: 'New Job',
  action: '/jobs',
  fields:
    field('title', 'Title', 'text', 'required') +
    select('customerId', 'Customer', optionList(state.customers, 'Select customer'), true) +
    select('serviceId', 'Service', optionList(state.services, 'No service'), false) +
    select('workerId', 'Worker', optionList(state.workers, 'No worker'), false) +
    field('scheduledStart', 'Scheduled Start', 'datetime-local') +
    field('durationMinutes', 'Duration Minutes', 'number', 'min="1" value="60"') +
    field('travelBufferMinutes', 'Travel Buffer Minutes', 'number', 'min="0" value="0"') +
    field('total', 'Total', 'number', 'min="0" step="0.01"') +
    formSection('Completion Requirements') +
    checkboxField('requiresProofPhotos', 'Require proof of work photo') +
    checkboxField('requiresBeforePhotos', 'Require before photo') +
    checkboxField('requiresAfterPhotos', 'Require after photo') +
    checkboxField('requiresSignature', 'Require customer signature') +
    checkboxField('requiresLocation', 'Require completion location')
};
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
                const override = await openConfirmModal({
                  title: 'Schedule Conflict',
                  message: 'This schedule has a conflict. You can edit the time, worker, or buffer, or override it if you intentionally want to allow it.',
                  detail,
                  cancelLabel: 'Edit Schedule',
                  okLabel: 'Override Anyway',
                  closeExisting: false
                });

                if (!override) return;
                body.adminOverride = true;
              }
            }

            await api(config.action, { method: 'POST', body: JSON.stringify(body) });
            closeModal();
            await load();
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
          const override = await openConfirmModal({
            title: 'Schedule Conflict',
            message: 'This schedule has a conflict. You can edit the time, worker, or buffer, or override it if you intentionally want to allow it.',
            detail: message,
            cancelLabel: 'Edit Schedule',
            okLabel: 'Override Anyway',
            closeExisting: false
          });
          if (!override) return;
          body.adminOverride = true;
        }
        await api('/jobs/' + jobId + '/' + (mode === 'reschedule' ? 'reschedule' : 'schedule'), { method: 'POST', body: JSON.stringify(body) });
        closeModal();
        await load();
      } catch (err) {
        if (err.status === 409 && err.details && err.details.conflicts) {
          const detail = err.details.conflicts.map((item) => item.message).join('\n');
          const override = await openConfirmModal({
            title: 'Schedule Conflict',
            message: 'This schedule has a conflict. You can edit the time, worker, or buffer, or override it if you intentionally want to allow it.',
            detail,
            cancelLabel: 'Edit Schedule',
            okLabel: 'Override Anyway',
            closeExisting: false
          });
          if (override) {
            body.adminOverride = true;
            try {
              await api('/jobs/' + jobId + '/' + (mode === 'reschedule' ? 'reschedule' : 'schedule'), { method: 'POST', body: JSON.stringify(body) });
              closeModal();
              await load();
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

  function setupCreateButtons() {
    document.querySelectorAll('.primary-button').forEach((button) => {
      if (button.closest('form')) return;
      const text = button.textContent.trim().toLowerCase();
      if (!text.startsWith('+ new ')) return;
      const resource = text.includes('customer') ? 'customers' : text.includes('job') ? 'jobs' : text.includes('quote') ? 'quotes' : text.includes('invoice') ? 'invoices' : null;
      if (!resource) return;
      button.addEventListener('click', async () => {
        await preloadLookups();
        openModal(formFor(resource));
      });
    });
  }



  function detailItem(label, value) {
    return `<div class="job-detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '-')}</strong></div>`;
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
    return `<div class="job-timeline">${items.map((item) => {
      const actor = item.user && (item.user.name || item.user.email) || item.worker && item.worker.user && item.worker.user.name || 'FieldCore';
      return `<div class="job-timeline-item"><span class="job-timeline-dot"></span><div><div class="job-timeline-head"><strong>${escapeHtml(activityTitle(item))}</strong><small>${escapeHtml(formatDateTime(item.createdAt))}</small></div><small>${escapeHtml(actor)}</small>${item.note ? `<p>${escapeHtml(item.note)}</p>` : ''}</div></div>`;
    }).join('')}</div>`;
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

  function renderProofPhotos(job) {
    const photos = job.proofPhotos || [];
    const group = (label, category) => {
      const groupPhotos = photos.filter((photo) => (photo.category || 'GENERAL') === category || category === 'GENERAL' && !['BEFORE', 'AFTER'].includes(photo.category || 'GENERAL'));
      const items = groupPhotos.length ? groupPhotos.map((photo) => `<div class="job-proof-photo"><button class="proof-thumb-button" type="button" data-proof-preview="${escapeHtml(photo.id)}"><img src="${escapeHtml(photo.url)}" alt="Proof photo"></button><div><strong>${escapeHtml(photo.caption || label)}</strong><small>${escapeHtml((photo.category || 'GENERAL').replace(/_/g, ' '))} / ${escapeHtml(formatDateTime(photo.createdAt))}</small></div><button class="secondary-button compact" type="button" data-proof-delete="${escapeHtml(photo.id)}">Remove</button></div>`).join("") : `<div class="empty-state compact-empty"><div><strong>No ${escapeHtml(label.toLowerCase())}</strong><span>Upload evidence here.</span></div></div>`;
      return `<h5>${escapeHtml(label)}</h5><div class="job-proof-list">${items}</div>`;
    };
    return `<section class="job-evidence-section"><h4>Proof Photos</h4>${group('Before Photos', 'BEFORE')}${group('After Photos', 'AFTER')}${group('General Proof Photos', 'GENERAL')}<form class="job-proof-form"><div class="form-grid"><div class='field span-2'><label for='fc-proof-photo'>Photo</label><div class='evidence-upload proof-upload-panel'><div class='proof-selected-preview' data-evidence-preview='proof'><strong>No photos selected</strong></div><div class='logo-upload-controls'><div class='file-upload-row'><label class='file-upload-button' for='fc-proof-photo'>Choose photos</label><span class='file-name' data-evidence-file-name='proof'>No files selected</span></div><input id='fc-proof-photo' name='photo' type='file' accept='image/png,image/jpeg,image/webp' data-evidence-input='proof' required multiple hidden><small>Upload one or more PNG, JPG, or WEBP proof photos. Max 5MB each.</small></div></div></div><div class="field"><label for="fc-proof-category">Category</label><select id="fc-proof-category" name="category"><option value="GENERAL">General</option><option value="BEFORE">Before</option><option value="AFTER">After</option><option value="DAMAGE">Damage</option><option value="ISSUE">Issue</option><option value="EXTRA_WORK">Extra Work</option><option value="CUSTOMER_APPROVAL">Customer Approval</option></select></div><div class="field"><label for="fc-proof-caption">Caption</label><input id="fc-proof-caption" name="caption" maxlength="500"></div></div><div class="fc-form-actions"><button class="secondary-button compact" type="submit">Upload Photo</button></div><p class="fc-form-error" hidden></p></form></section>`;
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

  function renderSignature(job) {
    const signature = job.signature;
    const preview = signature ? '<button class="signature-preview-box has-signature" type="button" data-signature-preview><img src="' + escapeHtml(signature.signatureUrl) + '" alt="Customer signature"><span>' + escapeHtml(signature.signerName || 'Customer signature') + '</span><small>' + escapeHtml(formatDateTime(signature.createdAt)) + '</small></button>' : '<button class="signature-preview-box" type="button" data-signature-preview><strong>Signature not available</strong></button>';
    return '<section class="job-evidence-section"><div class="signature-section-head"><h4>Customer Signature</h4><div class="row-actions"><button class="primary-button compact" type="button" data-signature-capture>Sign</button><button class="secondary-button compact" type="button" data-signature-delete ' + (signature ? '' : 'disabled') + '>Delete</button></div></div>' + preview + '<div class="field signature-signer-field"><label for="fc-signer-name">Signer Name</label><input id="fc-signer-name" name="signerName" maxlength="160" data-signature-signer-name value="' + escapeHtml(signature && signature.signerName || '') + '"></div><p class="fc-form-error" data-signature-message hidden></p></section>';
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
        if (!file) {
          if (fileName) fileName.textContent = key === 'proof' ? 'No files selected' : 'No file selected';
          if (preview) preview.innerHTML = key === 'signature' ? 'Sign' : '<strong>No photos selected</strong>';
          return;
        }
        if (fileName) fileName.textContent = files.length > 1 ? files.length + ' files selected' : file.name;
        if (!preview) return;
        if (key === 'proof') {
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
    const notes = await openInputModal({ title: "Complete Job", label: "Completion Notes", name: "completionNotes", type: "text", attrs: "required maxlength='2000'" });
    if (!notes) return false;
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

  function renderCompletionLocation(job) {
    const location = job.completionLocation;
    const status = location ? detailItem('Location Captured', formatDateTime(location.capturedAt)) + detailItem('Accuracy', location.accuracy ? Math.round(Number(location.accuracy)) + ' m' : '-') : detailItem('Location', job.requiresLocation ? 'Missing' : 'Not captured');
    return `<section class="job-evidence-section"><div class="signature-section-head"><h4>Completion Location</h4><button class="secondary-button compact" type="button" data-location-capture>Capture</button></div><div class="job-detail-grid">${status}</div><p class="fc-form-error" data-location-message hidden></p></section>`;
  }

  async function openJobDetail(jobId) {
    closeModal();
    const [job, activity] = await Promise.all([api('/jobs/' + jobId), api('/jobs/' + jobId + '/activity')]);
    const modal = document.createElement('div');
    modal.className = 'fc-modal';
    modal.innerHTML = `<div class="fc-dialog job-detail-dialog"><div class="panel-head"><div><h3>${escapeHtml(job.title || 'Job')}</h3><p class="modal-copy">${escapeHtml(job.customer && job.customer.name || 'No customer')}</p></div><button class="icon-button" type="button" data-close>&times;</button></div><div class="job-detail-grid">${detailItem('Customer', job.customer && job.customer.name)}${detailItem('Worker', job.worker && job.worker.user && job.worker.user.name)}${detailItem('Scheduled', formatDateTime(job.scheduledStart))}${detailItem('Completed', formatDateTime(job.completedAt))}<div class="job-detail-item"><span>Status</span>${badge(job.status)}</div></div>${job.completionNotes ? `<div class="job-notes"><span>Completion Notes</span><p>${escapeHtml(job.completionNotes)}</p></div>` : ''}<div class="job-lifecycle-actions">${lifecycleActions(job)}</div>${renderCompletionRequirements(job)}${renderProofPhotos(job)}${renderSignature(job)}${renderCompletionLocation(job)}<form class="job-note-form"><div class="field"><label for="fc-job-note">Activity Note</label><textarea id="fc-job-note" name="note" maxlength="2000"></textarea></div><div class="fc-form-actions"><button class="secondary-button compact" type="submit">Add Note</button></div><p class="fc-form-error" hidden></p></form><section class="job-activity-section"><h4>Activity Timeline</h4>${renderActivityTimeline(activity || [])}</section></div>`;
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
        } else if (proofPreview) {
          openProofPhotoPreview((job.proofPhotos || []).find((photo) => photo.id === proofPreview.dataset.proofPreview));
          return;
        } else if (signaturePreview) {
          openSignaturePreview(job.signature);
          return;
        } else if (signatureCapture) {
          const file = await openSignatureCapture(job);
          const signerName = modal.querySelector('[data-signature-signer-name]') && modal.querySelector('[data-signature-signer-name]').value;
          await uploadSignatureFile(job.id, file, signerName);
        } else if (signatureDelete) {
          const confirmed = await openConfirmModal({ title: 'Delete Signature', message: 'Are you sure you want to delete this customer signature?', okLabel: 'Delete', cancelLabel: 'Cancel', closeExisting: false });
          if (!confirmed) return;
          await api('/jobs/' + job.id + '/signature', { method: 'DELETE' });
        } else if (locationCapture) {
          const location = await captureBrowserLocation();
          await api('/jobs/' + job.id + '/completion-location', { method: 'POST', body: JSON.stringify(location) });
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
    modal.querySelector('.job-proof-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = event.currentTarget.querySelector('.fc-form-error');
      if (message) message.hidden = true;
      try {
        const files = Array.from(event.currentTarget.photo && event.currentTarget.photo.files || []);
        if (files.length > 1) {
          const caption = event.currentTarget.caption && event.currentTarget.caption.value || '';
          const category = event.currentTarget.category && event.currentTarget.category.value || 'GENERAL';
          for (const file of files) {
            const formData = new FormData();
            formData.append('photo', file);
            formData.append('caption', caption);
            formData.append('category', category);
            await uploadJobEvidence(job.id, '/proof-photos', formData);
          }
        } else {
          await uploadJobEvidence(job.id, '/proof-photos', event.currentTarget);
        }
        await openJobDetail(job.id);
      } catch (error) {
        if (message) { message.textContent = error.message; message.hidden = false; }
      }
    });
   modal.querySelector('.job-note-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const note = event.currentTarget.note.value.trim();
      if (!note) return;
      const message = modal.querySelector('.fc-form-error');
      if (message) message.hidden = true;
      try {
        await api('/jobs/' + job.id + '/activity', { method: 'POST', body: JSON.stringify({ note }) });
        await openJobDetail(job.id);
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
    return '<div class=' + q + 'job-detail-item' + q + '><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value || '-') + '</strong></div>';
  }

  function openBookingRequestModal(item) {
    const q = String.fromCharCode(34);
    const modal = document.createElement('div');
    modal.className = 'fc-modal';
    const service = item.service && item.service.name || item.serviceName || '-';
    const contact = [item.customerEmail, item.customerPhone].filter(Boolean).join(' / ') || '-';
    const preferred = [formatDate(item.preferredDate), item.preferredTimeWindow && String(item.preferredTimeWindow).replace(/_/g, ' ')].filter(Boolean).join(' / ') || '-';
    const photos = (item.photos || []).map((photo) => '<a class=' + q + 'secondary-button compact' + q + ' href=' + q + escapeHtml(photo.url) + q + ' target=' + q + '_blank' + q + ' rel=' + q + 'noreferrer' + q + '>' + escapeHtml(photo.originalName || photo.filename || 'Photo') + '</a>').join('');
    modal.innerHTML = '<div class=' + q + 'fc-dialog job-detail-dialog' + q + '><div class=' + q + 'panel-head' + q + '><div><h3>Booking Request</h3><p class=' + q + 'modal-copy' + q + '>' + escapeHtml(item.customerName || 'Customer') + '</p></div><button class=' + q + 'icon-button' + q + ' type=' + q + 'button' + q + ' data-close>&times;</button></div><div class=' + q + 'job-detail-grid' + q + '>' + bookingDetail('Reference', item.publicReference) + bookingDetail('Source', item.source) + bookingDetail('Customer', item.customerName) + bookingDetail('Contact', contact) + bookingDetail('Service', service) + bookingDetail('Preferred', preferred) + bookingDetail('Address', item.address) + bookingDetail('City/Suburb', item.city) + bookingDetail('Property Type', item.propertyType) + bookingDetail('Status', String(item.status || '-').replace(/_/g, ' ')) + bookingDetail('Created', formatDateTime(item.createdAt)) + bookingDetail('Converted Job', item.convertedJob && item.convertedJob.title) + '</div>' + (item.accessNotes ? '<div class=' + q + 'job-notes' + q + '><span>Access Notes</span><p>' + escapeHtml(item.accessNotes) + '</p></div>' : '') + (item.notes ? '<div class=' + q + 'job-notes' + q + '><span>Notes</span><p>' + escapeHtml(item.notes) + '</p></div>' : '') + (item.customerFacingMessage ? '<div class=' + q + 'job-notes' + q + '><span>Customer Message</span><p>' + escapeHtml(item.customerFacingMessage) + '</p></div>' : '') + (photos ? '<div class=' + q + 'job-notes' + q + '><span>Photos</span><div class=' + q + 'row-actions' + q + '>' + photos + '</div></div>' : '') + '<div class=' + q + 'fc-form-actions' + q + '><button class=' + q + 'secondary-button' + q + ' type=' + q + 'button' + q + ' data-close>Close</button></div></div>';
    modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-close]')) modal.remove(); });
    document.body.appendChild(modal);
  }
  async function handleRowAction(event) {
    const button = event.target.closest('[data-row-action]');
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.rowAction;
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
      await load();
    } catch (error) {
      setStatus(error.message, false);
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
    pageEl.innerHTML = '<div class="hero-row"><div class="hero-copy"><h2>Settings</h2><p>Manage your account, job alerts, and sign-in security.</p></div><span class="api-status" data-api-status>Connected</span></div><section class="settings-layout worker-settings"><aside class="panel settings-tabs" aria-label="Settings sections"><button class="settings-tab active" type="button" data-settings-target="account">Account</button><button class="settings-tab" type="button" data-settings-target="notifications">Notifications</button><button class="settings-tab" type="button" data-settings-target="security">Security</button></aside><div class="settings-panels"><div class="panel settings-panel active" data-settings-panel="account"><div class="panel-head"><h2>Account</h2><span class="badge gray">Worker</span></div><form class="form-grid" data-worker-account-form><div class="field"><label for="workerName">Name</label><input id="workerName" name="name" required maxlength="120" value="' + escapeHtml(state.user && state.user.name || '') + '"></div><div class="field"><label for="workerEmail">Email</label><input id="workerEmail" name="email" type="email" required value="' + escapeHtml(state.user && state.user.email || '') + '"></div><div class="field"><label>Role</label><input value="' + escapeHtml(state.user && state.user.role || 'WORKER') + '" disabled></div><div class="field"><label>Workspace</label><input value="' + escapeHtml(state.user && state.user.company && state.user.company.name || 'FieldCore') + '" disabled></div><div class="form-actions span-2"><button class="primary-button" type="submit">Save Account</button></div><p class="fc-form-error span-2" data-worker-account-message hidden></p></form></div><div class="panel settings-panel" data-settings-panel="notifications" hidden><div class="panel-head"><h2>Notifications</h2><span class="badge gray">Jobs</span></div><form class="form-grid" data-worker-preferences-form><div class="settings-checks span-2"><label><input type="checkbox" name="jobAssigned" ' + (prefs.jobAssigned !== false ? 'checked' : '') + '> New assigned jobs</label><label><input type="checkbox" name="scheduleChanged" ' + (prefs.scheduleChanged !== false ? 'checked' : '') + '> Schedule changes</label><label><input type="checkbox" name="completionReminders" ' + (prefs.completionReminders !== false ? 'checked' : '') + '> Completion evidence reminders</label></div><div class="field span-2"><label for="workerReminderLead">Reminder Lead Time</label><select id="workerReminderLead" name="reminderLead"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option></select></div><div class="form-actions span-2"><button class="primary-button" type="submit">Save Preferences</button></div><p class="fc-form-error span-2" data-worker-preferences-message hidden></p></form></div><div class="panel settings-panel" data-settings-panel="security" hidden><div class="panel-head"><h2>Security</h2><span class="badge blue">Protected</span></div><form class="form-grid" data-worker-password-form><div class="field"><label for="currentPassword">Current Password</label><input id="currentPassword" name="currentPassword" type="password" autocomplete="current-password" required></div><div class="field"><label for="newPassword">New Password</label><input id="newPassword" name="newPassword" type="password" autocomplete="new-password" minlength="8" required></div><div class="field span-2"><label for="confirmPassword">Confirm New Password</label><input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required></div><div class="settings-checks span-2"><label><input type="checkbox" checked disabled> Secure HTTP-only session cookie</label><label><input type="checkbox" checked disabled> Company-scoped account access</label></div><div class="form-actions span-2"><button class="primary-button" type="submit">Update Password</button></div><p class="fc-form-error span-2" data-worker-password-message hidden></p></form></div></div></section>';
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
    const controls = '<div class="panel-head card"><h3>Recent Notifications</h3><span class="badge gray" data-notification-log-count>' + filtered.length + '</span></div><div class="row-actions"><select data-notification-channel-filter aria-label="Notification channel"><option value="">All channels</option><option value="EMAIL"' + (channel && channel.value === 'EMAIL' ? ' selected' : '') + '>Email</option><option value="WHATSAPP"' + (channel && channel.value === 'WHATSAPP' ? ' selected' : '') + '>WhatsApp</option></select><select data-notification-status-filter aria-label="Notification status"><option value="">All statuses</option><option value="SENT"' + (status && status.value === 'SENT' ? ' selected' : '') + '>Sent</option><option value="FAILED"' + (status && status.value === 'FAILED' ? ' selected' : '') + '>Failed</option><option value="SKIPPED"' + (status && status.value === 'SKIPPED' ? ' selected' : '') + '>Skipped</option></select></div>';
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

  function renderSaaSBilling(summary) {
    const card = document.querySelector('[data-saas-billing-card]');
    if (!card) return;
    const subscription = summary && summary.subscription || {};
    const plan = summary && summary.plan || {};
    const provider = summary && summary.provider || {};
    const usageRows = summary && summary.usageRows || [];
    const plans = summary && summary.plans || [];
    const events = summary && summary.events || [];
    const status = subscription.status || 'UNKNOWN';
    const statusBadge = '<span class="badge ' + (status === 'ACTIVE' || status === 'FREE_INTERNAL' ? 'green' : status === 'TRIALING' ? 'blue' : 'gray') + '">' + escapeHtml(status.replace(/_/g, ' ')) + '</span>';
    const trial = subscription.trialDaysRemaining == null ? '-' : subscription.trialDaysRemaining + ' days';
    const period = [formatDate(subscription.currentPeriodStart), formatDate(subscription.currentPeriodEnd)].filter(Boolean).join(' - ') || '-';
    const providerText = provider.configured ? (provider.mode === 'manual' ? 'Manual/internal mode' : 'Configured') : 'Provider not configured';
    const usageTable = usageRows.length ? '<div class="table-scroll"><table><thead><tr><th>Usage</th><th>Used</th><th>Limit</th></tr></thead><tbody>' + usageRows.map((row) => '<tr><td>' + escapeHtml(row.key.replace(/^max/, '').replace(/([A-Z])/g, ' $1')) + '</td><td>' + escapeHtml(row.used == null ? 'Unknown' : row.used) + '</td><td>' + escapeHtml(row.unlimited ? 'Unlimited' : row.limit) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty-state compact-empty"><div><strong>No usage limits.</strong><span>This plan is currently unlimited.</span></div></div>';
    const planCards = plans.map((item) => '<div class="metric-card"><span>' + escapeHtml(item.name) + '</span><strong>' + escapeHtml(item.currency || 'USD') + ' ' + escapeHtml(item.price) + '</strong><small>' + escapeHtml(item.description || item.interval || '') + '</small><div class="row-actions"><button class="secondary-button compact" type="button" data-billing-checkout="' + escapeHtml(item.id) + '">Checkout</button><button class="secondary-button compact" type="button" data-billing-change-plan="' + escapeHtml(item.id) + '">Change</button></div></div>').join('');
    const eventsTable = events.length ? '<div class="table-scroll"><table><thead><tr><th>Event</th><th>Status</th><th>Provider</th><th>Time</th></tr></thead><tbody>' + events.slice(0, 8).map((event) => '<tr><td>' + escapeHtml(event.eventType || '-') + '</td><td>' + escapeHtml(event.status || '-') + '</td><td>' + escapeHtml(event.provider || '-') + '</td><td>' + escapeHtml(formatDateTime(event.createdAt)) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty-state compact-empty"><div><strong>No billing events yet.</strong><span>Checkout and plan changes will appear here.</span></div></div>';
    card.innerHTML = '<div class="panel-head"><h3>FieldCore Subscription</h3>' + statusBadge + '</div><div class="metrics-grid"><div class="metric-card"><span>Current Plan</span><strong>' + escapeHtml(plan.name || 'No plan') + '</strong><small>' + escapeHtml(plan.interval || '') + '</small></div><div class="metric-card"><span>Trial Remaining</span><strong>' + escapeHtml(trial) + '</strong><small>Managed by FieldCore</small></div><div class="metric-card"><span>Billing Period</span><strong>' + escapeHtml(period) + '</strong><small>' + escapeHtml(subscription.cancelAtPeriodEnd ? 'Cancels at period end' : providerText) + '</small></div></div><div class="panel-head card"><h3>Usage</h3><span class="badge gray">Company scoped</span></div>' + usageTable + '<div class="panel-head card"><h3>Available Plans</h3><button class="secondary-button compact" type="button" data-billing-cancel>Cancel</button></div><div class="metrics-grid">' + planCards + '</div><div class="panel-head card"><h3>Billing Events</h3><span class="badge gray">No secrets</span></div>' + eventsTable + '<p class="fc-form-error" data-billing-message hidden></p>';
    bindBillingActions();
  }

  async function loadBilling() {
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
    if (!document.querySelector('[data-system-status-card]')) return;
    try {
      const [status, logs] = await Promise.all([api('/system/status'), api('/audit-logs')]);
      renderSystemStatus(status);
      renderAuditLogs(logs);
    } catch (error) {
      const card = document.querySelector('[data-system-status-card]');
      if (card) card.innerHTML = '<div class="empty-state"><div><strong>Admin tools unavailable.</strong><span>' + escapeHtml(error.message) + '</span></div></div>';
    }
  }

  function setupSettings() {
    const tabs = Array.from(document.querySelectorAll('[data-settings-target]'));
    const panels = Array.from(document.querySelectorAll('[data-settings-panel]'));
    if (!tabs.length || !panels.length) return;

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.settingsTarget;
        tabs.forEach((item) => item.classList.toggle('active', item === tab));
        panels.forEach((panel) => {
          const active = panel.dataset.settingsPanel === target;
          panel.classList.toggle('active', active);
          panel.hidden = !active;
        });
        if (target === 'billing') loadBilling();
        if (target === 'notifications') loadNotificationLogs();
        if (target === 'admin-tools') loadAdminTools();
      });
    });

    document.querySelectorAll('[data-branding-field], [data-profile-field]').forEach((field) => {
      field.addEventListener('input', updateBrandingPreview);
    });

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

        const logoInput = document.querySelector('[data-logo-input]');
        if (logoInput && logoInput.files && logoInput.files[0]) {
          state.branding = await uploadLogo(logoInput.files[0]);
          const logoUrlField = document.querySelector('[data-branding-field="logoUrl"]');
          if (logoUrlField) logoUrlField.value = state.branding.logoUrl || '';
        }
        state.profile = await api('/company/profile', { method: 'PATCH', body: JSON.stringify(formPayload('[data-profile-field]')) });
        state.branding = await api('/company/branding', { method: 'PATCH', body: JSON.stringify(formPayload('[data-branding-field]')) });
        applyBranding();
        if (message) {
          message.textContent = 'Branding saved.';
          message.classList.add('green');
          message.hidden = false;
        }
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
      state.user = await api('/auth/session');
      if (!state.user) throw new Error('Authentication required');
      document.querySelectorAll('[data-current-user-name]').forEach((node) => { node.textContent = state.user.name || state.user.email || 'Signed in'; });
      document.querySelectorAll('[data-current-user-role]').forEach((node) => { node.textContent = state.user.role || 'Account'; });
      await loadCompanyBranding();
      applyRoleUi();
      if (isWorker() && !['dashboard', 'jobs', 'schedule', 'map', 'settings'].includes(page)) {
        renderWorkerAccessDenied();
        setStatus('Restricted worker area', false);
        return;
      }
      if (page === 'settings' && isWorker()) renderWorkerSettings();
      if (page === 'settings' && !isWorker()) {
        await loadSchedulingSettings();
        await loadNotificationLogs();
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
          renderSchedule(data, { workingDayStart: '08:00', workingDayEnd: '17:00' });
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
        renderSchedule(data, settings);
      }
      if (tableConfigs[page] && page !== 'schedule') {
        const data = await api(`/${page}`);
        state[page] = data;
        renderTable(page, data);
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
  document.addEventListener('click', handleWorkerDashboardAction);
  document.addEventListener('click', handleRowAction);
  setupCreateButtons();
  setupSettings();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();



