(function(){
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  const page = document.body.dataset.page || 'dashboard';
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const state = { user: null, customers: [], services: [], workers: [], jobs: [] };

  const tableConfigs = {
    customers: {
      columns: ['Customer', 'Contact', 'Address', 'Jobs', 'Balance'],
      emptyTitle: 'No customers yet',
      emptyText: 'Create your first customer to fill this directory.',
      row: (item) => [item.name, [item.email, item.phone].filter(Boolean).join(' / ') || '-', item.address || '-', (item.jobs || []).length, money.format((item.invoices || []).filter((i) => i.status !== 'PAID').reduce((sum, i) => sum + Number(i.amount || 0), 0))]
    },
    jobs: {
      columns: ['Job', 'Customer', 'Worker', 'Status', 'Scheduled', 'Total'],
      emptyTitle: 'No jobs yet',
      emptyText: 'Create your first job to populate operations.',
      row: (item) => [item.title, item.customer && item.customer.name || '-', item.worker && item.worker.user && item.worker.user.name || '-', badge(item.status), formatDate(item.scheduledStart), money.format(Number(item.total || 0))]
    },
    quotes: {
      columns: ['Quote', 'Customer', 'Status', 'Amount', 'Valid Until'],
      emptyTitle: 'No quotes yet',
      emptyText: 'Create your first quote to start the pipeline.',
      row: (item) => [item.title, item.customer && item.customer.name || '-', badge(item.status), money.format(Number(item.amount || 0)), formatDate(item.validUntil)]
    },
    invoices: {
      columns: ['Invoice', 'Customer', 'Status', 'Amount', 'Due'],
      emptyTitle: 'No invoices yet',
      emptyText: 'Create your first invoice to start billing.',
      row: (item) => [item.number, item.customer && item.customer.name || '-', badge(item.status), money.format(Number(item.amount || 0)), formatDate(item.dueDate)]
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

  function badge(value) {
    const normalized = String(value || '').toLowerCase();
    const color = normalized.includes('overdue') || normalized.includes('reject') || normalized.includes('cancel') ? 'red' : normalized.includes('progress') || normalized.includes('sent') || normalized.includes('scheduled') ? 'orange' : normalized.includes('draft') || normalized.includes('new') ? 'gray' : 'blue';
    return `<span class="badge ${color}">${escapeHtml(String(value || '-').replace(/_/g, ' '))}</span>`;
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
    const rows = data.map((item) => `<tr>${config.row(item).map((cell) => `<td>${String(cell).startsWith('<span') ? cell : escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
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

    const input = document.querySelector('[data-logo-input]');
    const preview = document.querySelector('[data-logo-preview]');
    if (!input || !preview) return;
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        preview.innerHTML = `<img src="${reader.result}" alt="Company logo preview">`;
      });
      reader.readAsDataURL(file);
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

  async function load() {
    setStatus('Connecting to API...', true);
    try {
      state.user = await api('/auth/session');
      if (!state.user) throw new Error('Authentication required');
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
        renderTable(page, data);
        updateListStats(page, data);
      }
      setStatus(`Connected as ${state.user.name}`, true);
    } catch (error) {
      setStatus(error.message, false);
      if (error.message.includes('permissions')) return;
    }
  }

  setupCreateButtons();
  setupSettings();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();


