(function () {
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  const page = document.body.dataset.page || '';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function asArray(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  }

  function statusNode() {
    return document.querySelector('[data-status], #status, [data-api-status]');
  }

  function setStatus(message, ok) {
    const node = statusNode();
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('red', ok === false);
  }

  function notifyAction(message, ok = true) {
    if (window.FieldCoreUI) window.FieldCoreUI.notify(message, { type: ok ? 'success' : 'error' });
  }

  function badge(value) {
    return '<span class="badge">' + escapeHtml(String(value || '-').replace(/_/g, ' ')) + '</span>';
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
  }

  async function api(path, options = {}) {
    const response = await fetch(API_BASE + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error((payload.error && payload.error.message) || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload.data;
  }

  function formJson(form) {
    const data = {};
    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) {
      if (value === '') continue;
      const input = form.elements[key];
      if (input && input.type === 'number') data[key] = Number(value);
      else if (value === 'true') data[key] = true;
      else if (value === 'false') data[key] = false;
      else data[key] = value;
    }
    return data;
  }

  function setRows(selector, rows, emptyColspan = 4) {
    const tbody = document.querySelector(selector);
    if (!tbody) return;
    tbody.innerHTML = rows.length ? rows.join('') : `<tr><td colspan="${emptyColspan}" class="muted">No records found.</td></tr>`;
  }

  function optionRows(items, labeler) {
    return '<option value="">Select...</option>' + items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(labeler(item))}</option>`).join('');
  }

  function bindSubmit(selector, handler) {
    const form = document.querySelector(selector);
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await handler(form, formJson(form));
        form.reset();
        setStatus('Saved', true);
        notifyAction('Saved.');
      } catch (error) {
        setStatus(error.message || 'Action failed', false);
        notifyAction(error.message || 'Action failed', false);
      }
    });
  }

  async function loadBranches() {
    const rows = asArray(await api('/branches')).map((branch) => `<tr><td>${escapeHtml(branch.name)}</td><td>${escapeHtml(branch.code || '-')}</td><td>${escapeHtml(branch.city || '-')}</td><td>${escapeHtml(branch.country || '-')}</td><td>${badge(branch.active === false ? 'INACTIVE' : 'ACTIVE')}</td></tr>`);
    setRows('[data-branches]', rows, 5);
    setStatus(`Loaded ${rows.length} branch${rows.length === 1 ? '' : 'es'}`, true);
  }

  function initBranches() {
    bindSubmit('[data-branch-form]', async (form, body) => {
      await api('/branches', { method: 'POST', body: JSON.stringify(body) });
      await loadBranches();
    });
    document.querySelector('[data-refresh]')?.addEventListener('click', loadBranches);
    loadBranches().catch((error) => setStatus(error.message, false));
  }

  async function loadApprovals() {
    const rows = asArray(await api('/approvals/pending')).map((item) => `<tr><td>${escapeHtml(item.eventType || '-')}</td><td>${escapeHtml(item.entityType || '-')}<br><small>${escapeHtml(item.entityId || '')}</small></td><td>${escapeHtml(item.reason || '-')}</td><td>${formatDate(item.createdAt)}</td><td><button class="secondary-button compact" data-approve="${escapeHtml(item.id)}">Approve</button> <button class="secondary-button compact" data-reject="${escapeHtml(item.id)}">Reject</button></td></tr>`);
    setRows('[data-approvals]', rows, 5);
    setStatus(`Loaded ${rows.length} pending approval${rows.length === 1 ? '' : 's'}`, true);
  }

  function initApprovals() {
    bindSubmit('[data-policy-form]', async (form, body) => {
      await api('/approval-policies', { method: 'POST', body: JSON.stringify(body) });
      await loadApprovals();
    });
    bindSubmit('[data-approval-form]', async (form, body) => {
      await api('/approvals', { method: 'POST', body: JSON.stringify(body) });
      await loadApprovals();
    });
    document.querySelector('[data-refresh]')?.addEventListener('click', loadApprovals);
    document.addEventListener('click', async (event) => {
      const approve = event.target.closest('[data-approve]');
      const reject = event.target.closest('[data-reject]');
      if (!approve && !reject) return;
      try {
        const id = approve ? approve.dataset.approve : reject.dataset.reject;
        const route = approve ? 'approve' : 'reject';
        const body = approve ? { decisionNote: 'Approved from admin page' } : { reason: 'Rejected from admin page' };
        await api(`/approvals/${encodeURIComponent(id)}/${route}`, { method: 'POST', body: JSON.stringify(body) });
        await loadApprovals();
        notifyAction(approve ? 'Approval completed.' : 'Approval rejected.');
      } catch (error) { setStatus(error.message, false); notifyAction(error.message, false); }
    });
    loadApprovals().catch((error) => setStatus(error.message, false));
  }

  async function loadInventory() {
    const [items, locations, lowStock, movements] = await Promise.all([
      api('/inventory/items').catch(() => []),
      api('/stock-locations').catch(() => []),
      api('/inventory/low-stock').catch(() => []),
      api('/inventory/movements').catch(() => [])
    ]);
    const inventoryItems = asArray(items);
    const stockLocations = asArray(locations);
    const itemOptions = optionRows(inventoryItems, (item) => item.sku ? `${item.name} (${item.sku})` : item.name);
    const locationOptions = optionRows(stockLocations, (location) => `${location.name}${location.type ? ' · ' + location.type : ''}`);
    document.querySelectorAll('select[name="itemId"]').forEach((select) => { select.innerHTML = itemOptions; });
    document.querySelectorAll('select[name="locationId"]').forEach((select) => { select.innerHTML = locationOptions; });
    setRows('[data-inventory-items]', inventoryItems.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.sku || '-')}</td><td>${escapeHtml(item.unitOfMeasure || 'each')}</td><td>${escapeHtml(item.reorderPoint || '-')}</td></tr>`), 4);
    setRows('[data-low-stock]', asArray(lowStock).map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.availableQuantity ?? '-')}</td><td>${escapeHtml(item.reorderPoint ?? '-')}</td></tr>`), 3);
    setRows('[data-movements]', asArray(movements).slice(0, 20).map((movement) => `<tr><td>${escapeHtml(movement.movementType || movement.type || '-')}</td><td>${escapeHtml(movement.item && movement.item.name || movement.itemId || '-')}</td><td>${escapeHtml(movement.quantity || '-')}</td><td>${escapeHtml(movement.reason || '-')}</td></tr>`), 4);
    setStatus(`Loaded ${inventoryItems.length} inventory item${inventoryItems.length === 1 ? '' : 's'}`, true);
  }

  function initInventory() {
    bindSubmit('#itemForm', async (form, body) => { await api('/inventory/items', { method: 'POST', body: JSON.stringify(body) }); await loadInventory(); });
    bindSubmit('#locationForm', async (form, body) => { await api('/stock-locations', { method: 'POST', body: JSON.stringify(body) }); await loadInventory(); });
    bindSubmit('#adjustForm', async (form, body) => { await api('/inventory/adjustments', { method: 'POST', body: JSON.stringify(body) }); await loadInventory(); });
    loadInventory().catch((error) => setStatus(error.message, false));
  }

  async function loadPurchaseRequests() {
    const rows = asArray(await api('/purchase-requests')).map((item) => `<tr><td>${badge(item.status || 'REQUESTED')}</td><td>${escapeHtml(item.reason || '-')}</td><td>${escapeHtml(item.job && item.job.title || item.jobId || '-')}</td><td><button class="secondary-button compact" data-pr-approve="${escapeHtml(item.id)}">Approve</button> <button class="secondary-button compact" data-pr-reject="${escapeHtml(item.id)}">Reject</button></td></tr>`);
    setRows('[data-purchase-requests]', rows, 4);
    setStatus(`Loaded ${rows.length} request${rows.length === 1 ? '' : 's'}`, true);
  }

  function initPurchaseRequests() {
    bindSubmit('#requestForm', async (form, body) => { await api('/purchase-requests', { method: 'POST', body: JSON.stringify({ ...body, lines: [] }) }); await loadPurchaseRequests(); });
    document.addEventListener('click', async (event) => {
      const approve = event.target.closest('[data-pr-approve]');
      const reject = event.target.closest('[data-pr-reject]');
      if (!approve && !reject) return;
      try {
        if (approve) await api(`/purchase-requests/${encodeURIComponent(approve.dataset.prApprove)}/approve`, { method: 'POST', body: '{}' });
        if (reject) await api(`/purchase-requests/${encodeURIComponent(reject.dataset.prReject)}/reject`, { method: 'POST', body: JSON.stringify({ reason: 'Rejected from admin page' }) });
        await loadPurchaseRequests();
        notifyAction(approve ? 'Request approved.' : 'Request rejected.');
      } catch (error) { setStatus(error.message, false); notifyAction(error.message, false); }
    });
    loadPurchaseRequests().catch((error) => setStatus(error.message, false));
  }

  async function loadPurchaseOrders() {
    const [orders, suppliers, items] = await Promise.all([
      api('/purchase-orders').catch(() => []),
      api('/suppliers').catch(() => []),
      api('/inventory/items').catch(() => [])
    ]);
    const supplierSelect = document.querySelector('select[name="supplierId"]');
    const itemSelect = document.querySelector('select[name="itemId"]');
    if (supplierSelect) supplierSelect.innerHTML = optionRows(asArray(suppliers), (supplier) => supplier.name);
    if (itemSelect) itemSelect.innerHTML = optionRows(asArray(items), (item) => item.sku ? `${item.name} (${item.sku})` : item.name);
    const rows = asArray(orders).map((order) => `<tr><td>${escapeHtml(order.orderNumber || order.id)}</td><td>${badge(order.status || 'DRAFT')}</td><td>${escapeHtml(order.supplier && order.supplier.name || '-')}</td><td>${escapeHtml((order.lines || []).length || 0)}</td><td><button class="secondary-button compact" data-po-approve="${escapeHtml(order.id)}">Approve</button> <button class="secondary-button compact" data-po-send="${escapeHtml(order.id)}">Send</button></td></tr>`);
    setRows('[data-purchase-orders]', rows, 5);
    setStatus(`Loaded ${rows.length} order${rows.length === 1 ? '' : 's'}`, true);
  }

  function initPurchaseOrders() {
    bindSubmit('#supplierForm', async (form, body) => { await api('/suppliers', { method: 'POST', body: JSON.stringify(body) }); await loadPurchaseOrders(); });
    bindSubmit('#poForm', async (form, body) => {
      const payload = { supplierId: body.supplierId, lines: [{ itemId: body.itemId, quantity: body.quantity, unitCost: body.unitCost || 0 }] };
      await api('/purchase-orders', { method: 'POST', body: JSON.stringify(payload) });
      await loadPurchaseOrders();
    });
    document.addEventListener('click', async (event) => {
      const approve = event.target.closest('[data-po-approve]');
      const send = event.target.closest('[data-po-send]');
      if (!approve && !send) return;
      try {
        if (approve) await api(`/purchase-orders/${encodeURIComponent(approve.dataset.poApprove)}/approve`, { method: 'POST', body: '{}' });
        if (send) await api(`/purchase-orders/${encodeURIComponent(send.dataset.poSend)}/send`, { method: 'POST', body: '{}' });
        await loadPurchaseOrders();
        notifyAction(approve ? 'Order approved.' : 'Order sent.');
      } catch (error) { setStatus(error.message, false); notifyAction(error.message, false); }
    });
    loadPurchaseOrders().catch((error) => setStatus(error.message, false));
  }

  const securityEventLabels = {
    LOGIN_SUCCESS: 'Signed in successfully',
    FAILED_LOGIN: 'Failed sign-in attempt',
    LOGIN_LOCKOUT: 'Account temporarily locked after failed sign-ins',
    LOCKED_LOGIN_ATTEMPT: 'Sign-in attempt while account was locked',
    PASSWORD_CHANGED: 'Password changed',
    ROLE_CHANGED: 'Account access changed',
    SESSION_REVOKED: 'A signed-in device was removed',
    ALL_SESSIONS_REVOKED: 'All signed-in devices were removed',
    TWO_FACTOR_ENABLED: 'Two-step verification turned on',
    TWO_FACTOR_DISABLED: 'Two-step verification turned off',
    TWO_FACTOR_FAILURE: 'Two-step verification failed',
    TWO_FACTOR_RECOVERY_CODES_ROTATED: 'Recovery codes replaced',
    TWO_FACTOR_SETUP_REQUIRED: 'Two-step verification setup required',
    DATA_EXPORT_CREATED: 'Company data export created',
    IDENTITY_PROVIDER_CONFIG_CHANGED: 'Company sign-in settings changed'
  };

  function securityEventLabel(value) {
    const key = String(value || '').trim();
    if (securityEventLabels[key]) return securityEventLabels[key];
    return key ? key.replace(/_/g, ' ').toLowerCase().replace(/^./, (char) => char.toUpperCase()) : 'Account activity';
  }

  function deviceLabel(userAgent) {
    const value = String(userAgent || '');
    let browser = 'Browser';
    let device = 'device';
    if (/Edg\//i.test(value)) browser = 'Microsoft Edge';
    else if (/Chrome\//i.test(value)) browser = 'Chrome';
    else if (/Firefox\//i.test(value)) browser = 'Firefox';
    else if (/Safari\//i.test(value)) browser = 'Safari';
    if (/iPhone/i.test(value)) device = 'iPhone';
    else if (/iPad/i.test(value)) device = 'iPad';
    else if (/Android/i.test(value)) device = 'Android device';
    else if (/Windows/i.test(value)) device = 'Windows computer';
    else if (/Macintosh|Mac OS X/i.test(value)) device = 'Mac';
    else if (/Linux/i.test(value)) device = 'Linux computer';
    return `${browser} on ${device}`;
  }

  async function loadSecurityEvents() {
    const rows = asArray(await api('/security/events')).slice(0, 25).map((item) => `<tr><td>${formatDate(item.createdAt)}</td><td>${escapeHtml(securityEventLabel(item.eventType))}</td></tr>`);
    setRows('[data-events]', rows, 2);
  }

  async function loadSessions() {
    const node = document.querySelector('[data-sessions]');
    if (!node) return;
    try {
      const sessions = asArray(await api('/auth/sessions')).filter((session) => !session.revokedAt);
      node.innerHTML = sessions.length ? sessions.map((session) => `<div class="security-session-row">
        <div class="security-session-copy">
          <strong>${escapeHtml(deviceLabel(session.userAgent))}${session.current ? ' <span class="security-current-label">Current</span>' : ''}</strong>
          <span>${session.lastSeenAt ? `Last active ${formatDate(session.lastSeenAt)}` : `Signed in ${formatDate(session.createdAt)}`}</span>
        </div>
        ${session.current ? '' : `<button class="secondary-button compact" type="button" data-revoke-session="${escapeHtml(session.id)}">Sign out</button>`}
      </div>`).join('') : '<div class="security-empty-state"><strong>No signed-in devices to review</strong><span>New device sessions will appear here.</span></div>';
    } catch (error) {
      node.innerHTML = '<div class="security-empty-state"><strong>Could not load signed-in devices</strong><span>Try again in a moment.</span></div>';
    }
  }

  function renderTwoFactorResult(data) {
    const output = document.querySelector('[data-2fa-output]');
    if (!output) return;
    const recoveryCodes = asArray(data && data.recoveryCodes);
    output.hidden = false;
    output.innerHTML = `<strong>Two-step verification is on.</strong>
      <span>Keep these recovery codes somewhere safe. Each code can be used once.</span>
      ${recoveryCodes.length ? `<div class="security-recovery-codes">${recoveryCodes.map((code) => `<code>${escapeHtml(code)}</code>`).join('')}</div>` : ''}`;
  }

  function initSecurityCenter() {
    const passwordForm = document.querySelector('[data-password-form]');
    const passwordToggle = document.querySelector('[data-password-toggle]');
    const passwordCancel = document.querySelector('[data-password-cancel]');
    const passwordMessage = document.querySelector('[data-password-message]');

    const closePasswordForm = () => {
      if (!passwordForm) return;
      passwordForm.hidden = true;
      passwordForm.reset();
      if (passwordMessage) {
        passwordMessage.hidden = true;
        passwordMessage.textContent = '';
      }
      if (passwordToggle) passwordToggle.textContent = 'Change password';
    };

    passwordToggle?.addEventListener('click', () => {
      if (!passwordForm) return;
      const opening = passwordForm.hidden;
      passwordForm.hidden = !opening;
      passwordToggle.textContent = opening ? 'Close' : 'Change password';
      if (opening) passwordForm.querySelector('input')?.focus();
    });

    passwordCancel?.addEventListener('click', closePasswordForm);

    passwordForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(passwordForm).entries());
      if (passwordMessage) {
        passwordMessage.hidden = true;
        passwordMessage.textContent = '';
      }
      if (data.newPassword !== data.confirmPassword) {
        if (passwordMessage) {
          passwordMessage.textContent = 'The new passwords do not match.';
          passwordMessage.hidden = false;
        }
        return;
      }

      const submit = passwordForm.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      try {
        await api('/auth/me/password', {
          method: 'PATCH',
          body: JSON.stringify({
            currentPassword: data.currentPassword,
            newPassword: data.newPassword
          })
        });
        window.location.href = 'login.html?passwordChanged=1';
      } catch (error) {
        if (passwordMessage) {
          passwordMessage.textContent = error.message || 'Could not change your password.';
          passwordMessage.hidden = false;
        }
        if (submit) submit.disabled = false;
      }
    });

    document.querySelector('[data-load-events]')?.addEventListener('click', () => loadSecurityEvents().catch(() => {}));
    document.querySelector('[data-load-sessions]')?.addEventListener('click', () => loadSessions().catch(() => {}));
    document.querySelector('[data-sessions]')?.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-revoke-session]');
      if (!button) return;
      button.disabled = true;
      try {
        await api(`/auth/sessions/${encodeURIComponent(button.dataset.revokeSession)}/revoke`, { method: 'POST', body: '{}' });
        await loadSessions();
        notifyAction('Device signed out.');
      } catch (error) {
        button.disabled = false;
        setStatus(error.message || 'Could not sign out that device.', false);
        notifyAction(error.message || 'Could not sign out that device.', false);
      }
    });
    document.querySelector('[data-enable-2fa]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const data = await api('/auth/2fa/enable', { method: 'POST', body: '{}' });
        renderTwoFactorResult(data);
        button.textContent = '2FA enabled';
        notifyAction('Two-step verification is on.');
      } catch (error) {
        const output = document.querySelector('[data-2fa-output]');
        if (output) {
          output.hidden = false;
          output.innerHTML = `<strong>Could not turn on two-step verification.</strong><span>${escapeHtml(error.message || 'Try again.')}</span>`;
        }
        button.disabled = false;
        notifyAction(error.message || 'Could not turn on two-step verification.', false);
      }
    });
    Promise.allSettled([loadSecurityEvents(), loadSessions()]);
  }

  async function loadMobileSync() {
    const [devices, conflicts] = await Promise.all([
      api('/admin/worker-devices').catch(() => []),
      api('/mobile-sync/conflicts').catch(() => [])
    ]);
    setRows('[data-device-rows]', asArray(devices).map((device) => `<tr><td>${escapeHtml(device.deviceName || device.deviceId || device.id)}</td><td>${escapeHtml(device.platform || '-')}</td><td>${escapeHtml(device.appVersion || '-')}</td><td>${badge(device.revokedAt ? 'REVOKED' : 'ACTIVE')}</td><td>${formatDate(device.lastSyncAt || device.updatedAt)}</td></tr>`), 5);
    setRows('[data-sync-rows]', asArray(conflicts).map((item) => `<tr><td>${badge(item.status || 'CONFLICT')}</td><td>${escapeHtml(item.action || item.actionType || '-')}</td><td>${escapeHtml(item.worker && item.worker.user && item.worker.user.name || item.workerId || '-')}</td><td>${escapeHtml(item.deviceId || '-')}</td><td>${escapeHtml(item.error || item.errorMessage || '-')}</td><td>${formatDate(item.createdAt)}</td></tr>`), 6);
    setStatus('Mobile sync loaded', true);
  }

  function initMobileSync() {
    document.querySelector('[data-refresh]')?.addEventListener('click', () => loadMobileSync().catch((error) => setStatus(error.message, false)));
    loadMobileSync().catch((error) => setStatus(error.message, false));
  }

  async function initExecutiveDashboard() {
    const overview = document.querySelector('[data-overview]');
    const definitions = document.querySelector('[data-definitions]');
    try {
      const data = await api('/analytics/executive').catch(() => api('/reports'));
      if (overview) {
        const metrics = data && data.overview || data || {};
        overview.innerHTML = Object.entries(metrics).slice(0, 8).map(([key, value]) => `<article class="card stat-card"><div class="stat-label">${escapeHtml(key.replace(/([A-Z])/g, ' $1'))}</div><div class="stat-value">${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : value)}</div></article>`).join('') || '<div class="empty-state"><div><strong>No analytics yet</strong><span>Operational metrics will appear here when data exists.</span></div></div>';
      }
      if (definitions) definitions.innerHTML = '<div class="settings-row"><strong>Numbers are company-scoped</strong><span>Metrics are based on real API data and hidden if unavailable.</span></div>';
      setStatus('Executive data loaded', true);
    } catch (error) {
      if (overview) overview.innerHTML = `<div class="empty-state"><div><strong>Executive data unavailable</strong><span>${escapeHtml(error.message)}</span></div></div>`;
      setStatus(error.message, false);
    }
  }

  function initProcurementCosting() {
    setStatus('Procurement costing ready', true);
  }

  function initOnboarding() {
    setStatus('Onboarding tools ready', true);
  }

  function init() {
    const initMap = {
      branches: initBranches,
      approvals: initApprovals,
      inventory: initInventory,
      'purchase-requests': initPurchaseRequests,
      'purchase-orders': initPurchaseOrders,
      'security-center': initSecurityCenter,
      'mobile-sync': initMobileSync,
      'executive-dashboard': initExecutiveDashboard,
      'procurement-costing': initProcurementCosting,
      onboarding: initOnboarding
    };
    if (initMap[page]) initMap[page]();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
