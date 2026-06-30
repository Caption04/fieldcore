(function(){
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  const page = document.body.dataset.page || 'dashboard';
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const receiptMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const state = { user: null, profile: null, branding: null, customers: [], services: [], workers: [], roles: [], jobs: [], invoices: [], availability: {} };

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
    const buttons = [];
    const add = (label, action, primary) => buttons.push('<button class="' + (primary ? 'primary-button' : 'secondary-button') + ' compact" type="button" data-row-action="' + action + '" data-id="' + escapeHtml(item.id) + '">' + label + '</button>');
    if (resource === 'quotes' && item.status === 'DRAFT') add('Send', 'quote-send');
    if (resource === 'quotes' && item.status === 'SENT') add('Accept', 'quote-accept');
    if (resource === 'quotes' && item.status === 'SENT') add('Reject', 'quote-reject');
    if (resource === 'jobs' && item.status !== 'COMPLETED' && item.status !== 'CANCELLED') add('Complete', 'job-complete');
    if (resource === 'jobs' && item.status !== 'COMPLETED' && item.status !== 'CANCELLED') add(item.scheduledStart ? 'Reschedule' : 'Schedule', item.scheduledStart ? 'job-reschedule' : 'job-schedule');
    if (resource === 'jobs' && item.scheduledStart && item.status !== 'COMPLETED' && item.status !== 'CANCELLED') add('Unschedule', 'job-unschedule');
    if (resource === 'jobs' && item.status === 'COMPLETED') add('Invoice', 'job-invoice');
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
      const value = card.querySelector('.stat-value');
      const trend = card.querySelector('.trend');
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
    const totals = data.totals || {};
    setStats([
      { value: totals.jobsToday || 0, trend: totals.jobsToday ? 'Scheduled today' : 'No jobs scheduled' },
      { value: money.format(totals.revenueMonthToDate || 0), trend: 'Month to date' },
      { value: money.format(totals.unpaidInvoices || 0), trend: totals.unpaidInvoices ? 'Outstanding' : 'Nothing outstanding' },
      { value: totals.activeWorkers || 0, trend: totals.activeWorkers ? 'Available workers' : 'No workers online' }
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
    if (resource === 'jobs') setStats(countStatuses(data, ['NEW', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD'], ['Open jobs', 'Active work', 'Finished', 'Paused']));
    if (resource === 'quotes') setStats(countStatuses(data, ['SENT', 'ACCEPTED', 'SENT', 'DRAFT'], ['Open quotes', 'Accepted', 'Sent', 'Drafts']));
    if (resource === 'invoices') setStats(countStatuses(data, ['ALL', 'PAID', 'SENT', 'OVERDUE', 'DRAFT'], ['Total invoices', 'Paid', 'Unpaid', 'Overdue', 'Drafts']));
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
    field('total', 'Total', 'number', 'min="0" step="0.01"')
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
  }

  function setupCreateButtons() {
    document.querySelectorAll('.primary-button').forEach((button) => {
      const text = button.textContent.toLowerCase();
      const resource = text.includes('customer') ? 'customers' : text.includes('job') ? 'jobs' : text.includes('quote') ? 'quotes' : text.includes('invoice') ? 'invoices' : null;
      if (!resource) return;
      button.addEventListener('click', async () => {
        await preloadLookups();
        openModal(formFor(resource));
      });
    });
  }



  async function handleRowAction(event) {
    const button = event.target.closest('[data-row-action]');
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.rowAction;
    try {
      if (action === 'quote-send') await api('/quotes/' + id + '/send', { method: 'POST', body: '{}' });
      if (action === 'quote-accept') await api('/quotes/' + id + '/accept', { method: 'POST', body: '{}' });
      if (action === 'quote-reject') await api('/quotes/' + id + '/reject', { method: 'POST', body: '{}' });
      if (action === 'job-complete') await api('/jobs/' + id + '/complete', { method: 'POST', body: JSON.stringify({ completionNotes: 'Completed from FieldCore web app', adminOverride: true }) });
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

  function showLogin(errorMessage) {
    const config = {
      title: 'Log In',
      fields: field('email', 'Email', 'email', 'required value="owner@fieldcore.test"') + field('password', 'Password', 'password', 'required value="FieldCoreDemo2026!"')
    };
    openModal(config);
    const form = document.querySelector('.fc-modal form');
    form.querySelector('.fc-form-actions').innerHTML = '<button class="primary-button" type="submit">Log In</button>';
    const error = form.querySelector('.fc-form-error');
    if (errorMessage) { error.textContent = errorMessage; error.hidden = false; }
    form.onsubmit = async (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(form).entries());
      try {
        await api('/auth/login', { method: 'POST', body: JSON.stringify(body) });
        closeModal();
        await load();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      }
    };
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
      if (page === 'settings') await loadSchedulingSettings();
    } catch (error) {
      setStatus('Log in to load company data.', false);
      showLogin();
      return;
    }

    try {
      await preloadLookups();
      if (page === 'dashboard') renderDashboard(await api('/dashboard'));
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
    showLogin();
  });  document.addEventListener('click', handleRowAction);
  setupCreateButtons();
  setupSettings();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();


