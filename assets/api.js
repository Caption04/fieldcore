(function(){
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  const page = document.body.dataset.page || 'dashboard';
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const receiptMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const state = { user: null, profile: null, branding: null, customers: [], services: [], workers: [], jobs: [], invoices: [] };

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
    if (!response.ok) throw new Error(payload.error && payload.error.message || `HTTP ${response.status}`);
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

  function optionList(items, label) {
    return `<option value="">${label}</option>${items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name || item.title || item.number || item.user && item.user.name || 'Record')}</option>`).join('')}`;
  }

  function field(name, label, type, attrs) {
    return `<div class="field"><label for="fc-${name}">${label}</label><input id="fc-${name}" name="${name}" type="${type || 'text'}" ${attrs || ''}></div>`;
  }

  function select(name, label, options, required) {
    return `<div class="field"><label for="fc-${name}">${label}</label><select id="fc-${name}" name="${name}" ${required ? 'required' : ''}>${options}</select></div>`;
  }

  function formFor(resource) {
    if (resource === 'customers') return { title: 'New Customer', action: '/customers', fields: field('name', 'Name', 'text', 'required') + field('email', 'Email', 'email') + field('phone', 'Phone') + field('address', 'Address') };
    if (resource === 'jobs') return { title: 'New Job', action: '/jobs', fields: field('title', 'Title', 'text', 'required') + select('customerId', 'Customer', optionList(state.customers, 'Select customer'), true) + select('serviceId', 'Service', optionList(state.services, 'No service'), false) + select('workerId', 'Worker', optionList(state.workers, 'No worker'), false) + field('scheduledStart', 'Scheduled Start', 'datetime-local') + field('total', 'Total', 'number', 'min="0" step="0.01"') };
    if (resource === 'quotes') return { title: 'New Quote', action: '/quotes', fields: field('title', 'Title', 'text', 'required') + select('customerId', 'Customer', optionList(state.customers, 'Select customer'), true) + select('serviceId', 'Service', optionList(state.services, 'No service'), false) + field('amount', 'Amount', 'number', 'min="0" step="0.01"') + field('validUntil', 'Valid Until', 'date') };
    if (resource === 'invoices') return { title: 'New Invoice', action: '/invoices', fields: field('number', 'Number') + select('customerId', 'Customer', optionList(state.customers, 'Select customer'), true) + select('jobId', 'Job', optionList(state.jobs, 'No job'), false) + field('amount', 'Amount', 'number', 'min="0" step="0.01"') + field('dueDate', 'Due Date', 'date') };
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
        await api(config.action, { method: 'POST', body: JSON.stringify(body) });
        closeModal();
        await load();
      } catch (err) {
        error.textContent = err.message;
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
      if (action === 'job-invoice') await api('/jobs/' + id + '/create-invoice', { method: 'POST', body: '{}' });
      if (action === 'invoice-send') await api('/invoices/' + id + '/send', { method: 'POST', body: '{}' });
      if (action === 'invoice-void') await api('/invoices/' + id + '/void', { method: 'POST', body: '{}' });
      if (action === 'invoice-receipts') {
        await showInvoiceReceipts(id);
        return;
      }
      if (action === 'invoice-pay') {
        const amount = window.prompt('Payment amount');
        if (!amount) return;
        await api('/invoices/' + id + '/payments', { method: 'POST', body: JSON.stringify({ amount: Number(amount), method: 'CASH', status: 'CONFIRMED' }) });
      }
      await load();
    } catch (error) {
      setStatus(error.message, false);
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
      await loadCompanyBranding();
    } catch (error) {
      setStatus('Log in to load company data.', false);
      showLogin();
      return;
    }

    try {
      await preloadLookups();
      if (page === 'dashboard') renderDashboard(await api('/dashboard'));
      if (tableConfigs[page]) {
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

  document.addEventListener('click', handleRowAction);
  setupCreateButtons();
  setupSettings();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();


