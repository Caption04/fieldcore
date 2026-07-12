(function () {
  if (document.body.dataset.page !== 'members') return;

  let data = { currentUser: null, members: [], invitations: [], templates: [], permissions: { keys: [], groups: {}, catalog: [], dependencies: {} }, branches: [], teams: [] };
  const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : '—';

  async function api(path, options = {}) {
    const response = await fetch('/api' + path, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error && payload.error.message || `HTTP ${response.status}`);
    return payload.data;
  }

  function can(permission) {
    return new Set(data.currentUser && data.currentUser.effectivePermissions || []).has(permission);
  }

  function validateForm(form) {
    if (window.FieldCoreFormUX) return window.FieldCoreFormUX.validateForm(form);
    if (form && form.checkValidity()) return true;
    const invalid = form && form.querySelector(':invalid');
    if (invalid) invalid.focus();
    return false;
  }

  function accessLabel(type) {
    return ({ COMPANY: 'Whole company', BRANCH: 'Selected branches', TEAM: 'Selected teams', SELF: 'Own work only' })[type] || 'Whole company';
  }

  const permissionLabels = {
    'dashboard.operational.view': 'View work summary',
    'dashboard.financial.view': 'View money summary',
    'dashboard.executive.view': 'View business performance',
    'customers.view': 'View customers',
    'customers.create': 'Add customers',
    'customers.edit': 'Edit customers',
    'customers.delete': 'Delete customers',
    'jobs.view': 'View jobs',
    'jobs.create': 'Add jobs',
    'jobs.edit': 'Edit jobs',
    'jobs.assign': 'Assign jobs',
    'jobs.cancel': 'Cancel jobs',
    'jobs.review': 'Review jobs',
    'job.reassign.after_dispatch': 'Move jobs after dispatch',
    'schedule.view': 'View the schedule',
    'schedule.manage': 'Change the schedule',
    'schedule.override': 'Override schedule warnings',
    'workers.view': 'View workers',
    'workers.manage': 'Manage workers',
    'workers.location.view': 'View worker locations',
    'teams.manage': 'Manage teams',
    'bookings.view': 'View booking requests',
    'bookings.manage': 'Manage booking requests',
    'quotes.view': 'View quotes',
    'quotes.create': 'Create quotes',
    'quotes.edit': 'Edit quotes',
    'quotes.send': 'Send quotes',
    'quote.discount.approve': 'Approve quote discounts',
    'invoices.view': 'View invoices',
    'invoices.create': 'Create invoices',
    'invoices.edit': 'Edit invoices',
    'invoices.send': 'Send invoices',
    'invoice.void': 'Cancel invoices',
    'invoice.discount.approve': 'Approve invoice discounts',
    'payments.view': 'View payments',
    'payments.manage': 'Manage payments',
    'payment.refund': 'Approve refunds',
    'settings.finance.manage': 'Change money settings',
    'finance.exports.manage': 'Download money reports',
    'finance.integrations.manage': 'Manage accounting links',
    'reports.money.view': 'View money reports',
    'reports.work.view': 'View job reports',
    'reports.workers.view': 'View worker reports',
    'reports.sales.view': 'View sales and customer reports',
    'reports.stock.view': 'View stock reports',
    'inventory.view': 'View stock',
    'inventory.manage': 'Manage stock',
    'stock.adjust': 'Change stock counts',
    'purchaseRequest.create': 'Ask to buy stock',
    'purchaseRequest.approve': 'Approve stock requests',
    'purchaseOrder.manage': 'Manage purchase orders',
    'purchaseOrder.send': 'Send purchase orders',
    'purchaseOrder.approve': 'Approve purchase orders',
    'company.settings.view': 'View company settings',
    'company.settings.manage': 'Change company settings',
    'company.branding.manage': 'Change company brand',
    'members.view': 'View company members',
    'members.invite': 'Invite members',
    'members.manage': 'Manage members',
    'roles.manage': 'Manage roles',
    'permissions.manage': 'Change member access',
    'security.view': 'View account security',
    'security.manage': 'Change security settings',
    'audit.view': 'View company activity',
    'notifications.view': 'View sent messages',
    'integration.view': 'View connected apps',
    'integration.manage': 'Manage connected apps',
    'branch.view': 'View branches',
    'branch.manage': 'Manage branches',
    'team.view': 'View teams',
    'team.manage': 'Manage teams',
    'approval.policy.manage': 'Set approval rules',
    'approval.request.decide': 'Approve requests',
    'mobile.sync.manage': 'Manage worker app sync',
    'contract.automation.manage': 'Manage contract rules',
    'contract.sla.override': 'Override service deadlines'
  };

  const permissionGroupLabels = {
    Dashboard: 'Home',
    Workforce: 'Workers',
    Scheduling: 'Schedule',
    Finance: 'Money',
    Reports: 'Reports',
    Inventory: 'Stock',
    Company: 'Company settings',
    People: 'Team access',
    Messages: 'Sent messages',
    Integrations: 'Connected apps',
    Organization: 'Branches and teams',
    Enterprise: 'Advanced tools'
  };

  function permissionCatalogGroups() {
    if (Array.isArray(data.permissions.catalog) && data.permissions.catalog.length) return data.permissions.catalog;
    return Object.entries(data.permissions.groups || {}).map(([key, keys]) => ({ key, label: permissionGroupLabels[key] || key, help: '', permissions: keys.map((permissionKey) => ({ key: permissionKey, label: permissionLabels[permissionKey] })) }));
  }

  function permissionMeta(key) {
    for (const group of permissionCatalogGroups()) {
      const found = (group.permissions || []).find((item) => item.key === key);
      if (found) return found;
    }
    return { key, label: permissionLabels[key] };
  }

  function permissionLabel(key) {
    const meta = permissionMeta(key);
    return meta.label || key.split('.').slice(1).join(' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function selectedPermissions(root) {
    return Array.from(root.querySelectorAll('input[name="permissions"]:checked')).map((input) => input.value);
  }

  function permissionEditor(selected = []) {
    const selectedSet = new Set(selected);
    return permissionCatalogGroups().map((group) => {
      const items = (group.permissions || []).map((item) => `<label class="permission-choice"><input type="checkbox" name="permissions" value="${escapeHtml(item.key)}"${selectedSet.has(item.key) ? ' checked' : ''}><span><strong>${escapeHtml(item.label || permissionLabel(item.key))}</strong>${item.help ? `<small>${escapeHtml(item.help)}</small>` : ''}</span></label>`).join('');
      return `<fieldset class="permission-group"><legend><span>${escapeHtml(group.label || group.key)}</span><button type="button" data-select-category>Select all</button></legend>${group.help ? `<p class="permission-group-help">${escapeHtml(group.help)}</p>` : ''}${items}</fieldset>`;
    }).join('');
  }

  function permissionDependencies(key) {
    return Array.isArray(data.permissions.dependencies && data.permissions.dependencies[key]) ? data.permissions.dependencies[key] : [];
  }

  function permissionDependents(key) {
    return Object.entries(data.permissions.dependencies || {}).filter(([, dependencies]) => Array.isArray(dependencies) && dependencies.includes(key)).map(([dependent]) => dependent);
  }

  function setPermissionState(root, key, checked, visited = new Set()) {
    if (visited.has(key)) return;
    visited.add(key);
    const box = root.querySelector(`input[name="permissions"][value="${CSS.escape(key)}"]`);
    if (box) box.checked = checked;
    const linked = checked ? permissionDependencies(key) : permissionDependents(key);
    linked.forEach((linkedKey) => setPermissionState(root, linkedKey, checked, visited));
  }

  function normalizePermissionDependencies(root) {
    selectedPermissions(root).forEach((key) => setPermissionState(root, key, true));
  }

  function updateCategoryButton(button) {
    const boxes = Array.from(button.closest('fieldset').querySelectorAll('input[type="checkbox"]'));
    button.textContent = boxes.length && boxes.every((box) => box.checked) ? 'Clear' : 'Select all';
  }

  function bindCategoryButtons(root, onChange) {
    root.querySelectorAll('[data-select-category]').forEach((button) => {
      updateCategoryButton(button);
      button.onclick = () => {
        const boxes = Array.from(button.closest('fieldset').querySelectorAll('input[name="permissions"]'));
        const shouldSelect = !boxes.every((box) => box.checked);
        boxes.forEach((box) => setPermissionState(root, box.value, shouldSelect));
        normalizePermissionDependencies(root);
        root.querySelectorAll('[data-select-category]').forEach(updateCategoryButton);
        if (onChange) onChange();
      };
    });
  }

  function scopePickerHtml(type, selectedIds = []) {
    if (!['BRANCH', 'TEAM'].includes(type)) return '';
    const items = type === 'BRANCH' ? data.branches : data.teams;
    const name = type === 'BRANCH' ? 'branches' : 'teams';
    if (!items.length) return `<p class="scope-empty">Create ${type === 'BRANCH' ? 'a branch' : 'a team'} first.</p>`;
    const selected = new Set(selectedIds);
    return `<label>${type === 'BRANCH' ? 'Choose branches' : 'Choose teams'}</label><select name="scopeIds" multiple required aria-label="Choose ${name}">${items.map((item) => `<option value="${escapeHtml(item.id)}"${selected.has(item.id) ? ' selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select><small>Hold Ctrl to choose more than one.</small>`;
  }

  function savedRoleOptions(selectedId = '') {
    return `<option value="">Create a new role</option>${data.templates.map((item) => `<option value="${escapeHtml(item.id)}"${item.id === selectedId ? ' selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}`;
  }

  function setPermissionBoxes(permissionWrap, permissions, onChange) {
    permissionWrap.innerHTML = permissionEditor(permissions);
    normalizePermissionDependencies(permissionWrap);
    permissionWrap.querySelectorAll('input[name="permissions"]').forEach((box) => {
      box.addEventListener('change', () => {
        setPermissionState(permissionWrap, box.value, box.checked);
        permissionWrap.querySelectorAll('[data-select-category]').forEach(updateCategoryButton);
        if (onChange) onChange();
      });
    });
    bindCategoryButtons(permissionWrap, onChange);
  }

  function bindAccessForm(modal, form, initial = {}) {
    const permissionWrap = modal.querySelector('[data-permission-editor]');
    const fullAccess = form.querySelector('[name="fullAccess"]');
    const scopeWrap = modal.querySelector('[data-scope-picker]');
    const savedRole = form.querySelector('[name="roleTemplateId"]');
    let changingAll = false;

    function permissionBoxes() {
      return Array.from(permissionWrap.querySelectorAll('input[name="permissions"]'));
    }

    function syncFullAccess() {
      if (changingAll) return;
      const boxes = permissionBoxes();
      fullAccess.checked = Boolean(boxes.length && boxes.every((box) => box.checked));
    }

    function rebuildPermissions(permissions) {
      setPermissionBoxes(permissionWrap, permissions, syncFullAccess);
      syncFullAccess();
    }

    function updateScope(selectedIds = []) {
      const needsChoice = ['BRANCH', 'TEAM'].includes(form.scopeType.value);
      scopeWrap.hidden = !needsChoice;
      scopeWrap.innerHTML = needsChoice ? scopePickerHtml(form.scopeType.value, selectedIds) : '';
      if (window.FieldCoreFormUX) window.FieldCoreFormUX.refresh();
    }

    function applyTemplate(template) {
      if (!template) {
        form.roleName.readOnly = false;
        form.roleName.value = '';
        form.fieldWorker.disabled = false;
        form.fieldWorker.checked = false;
        form.scopeType.value = 'COMPANY';
        rebuildPermissions([]);
        updateScope([]);
        return;
      }
      form.roleName.value = template.name || '';
      form.roleName.readOnly = true;
      form.fieldWorker.checked = template.systemRole === 'WORKER';
      form.fieldWorker.disabled = true;
      form.scopeType.value = template.defaultScopeType || 'COMPANY';
      rebuildPermissions(template.defaultPermissions || []);
      updateScope([]);
    }

    if (savedRole) savedRole.onchange = () => applyTemplate(data.templates.find((item) => item.id === savedRole.value));
    form.scopeType.onchange = () => updateScope([]);
    fullAccess.onchange = () => {
      changingAll = true;
      permissionBoxes().forEach((box) => { box.checked = fullAccess.checked; });
      if (fullAccess.checked) normalizePermissionDependencies(permissionWrap);
      permissionWrap.querySelectorAll('[data-select-category]').forEach(updateCategoryButton);
      changingAll = false;
    };

    rebuildPermissions(initial.permissions || []);
    updateScope(initial.scopeIds || []);
    if (savedRole && savedRole.value) {
      form.roleName.readOnly = true;
      form.fieldWorker.disabled = true;
    }
    if (initial.fullAccess) {
      fullAccess.checked = true;
      fullAccess.dispatchEvent(new Event('change'));
    }
    if (window.FieldCoreFormUX) window.FieldCoreFormUX.refresh();
  }

  function renderMembers() {
    document.querySelector('[data-member-count]').textContent = data.members.length;
    document.querySelector('[data-members-body]').innerHTML = data.members.map((member) => {
      const isCurrentUser = Boolean(data.currentUser && member.id === data.currentUser.id);
      const actions = isCurrentUser
        ? '<span class="muted">Your account</span>'
        : `${can('permissions.manage') ? `<button class="secondary-button compact" type="button" data-edit-member="${escapeHtml(member.id)}">Edit</button>` : ''}${can('members.manage') ? `<button class="secondary-button compact${member.disabledAt ? '' : ' danger'}" type="button" data-toggle-member="${escapeHtml(member.id)}">${member.disabledAt ? 'Reactivate' : 'Disable'}</button>` : ''}`;
      return `<tr${isCurrentUser ? ' class="current-member-row"' : ''}>
      <td><strong>${escapeHtml(member.name)}</strong>${isCurrentUser ? '<small class="current-member-label">You</small>' : ''}</td>
      <td>${escapeHtml(member.email)}</td>
      <td>${escapeHtml(member.role === 'OWNER' ? 'Owner' : member.roleTemplate && member.roleTemplate.name || member.jobTitle || 'Team member')}</td>
      <td>${escapeHtml(accessLabel(member.accessScope && member.accessScope.type || member.defaultScopeType || 'COMPANY'))}</td>
      <td><span class="badge ${member.disabledAt ? 'orange' : 'green'}">${member.disabledAt ? 'Disabled' : 'Active'}</span></td>
      <td>${escapeHtml(formatDate(member.lastActivityAt))}</td>
      <td><div class="row-actions">${actions}</div></td>
    </tr>`;
    }).join('') || '<tr><td colspan="7">No members found.</td></tr>';

    document.querySelectorAll('[data-edit-member]').forEach((button) => button.onclick = () => openMember(data.members.find((member) => member.id === button.dataset.editMember)));
    document.querySelectorAll('[data-toggle-member]').forEach((button) => button.onclick = () => toggleMember(data.members.find((member) => member.id === button.dataset.toggleMember)));
  }

  function renderInvites() {
    const pending = data.invitations.filter((item) => item.status === 'PENDING');
    document.querySelector('[data-invite-count]').textContent = pending.length;
    document.querySelector('[data-invites-body]').innerHTML = pending.map((invite) => `<tr>
      <td><strong>${escapeHtml(invite.email)}</strong></td>
      <td>${escapeHtml(invite.roleTemplate && invite.roleTemplate.name || invite.jobTitle || 'Team member')}</td>
      <td>${escapeHtml(accessLabel(invite.scopeType))}</td>
      <td>${escapeHtml(formatDate(invite.expiresAt))}</td>
      <td><div class="row-actions"><button class="secondary-button compact" type="button" data-resend="${escapeHtml(invite.id)}">Resend</button><button class="secondary-button compact danger" type="button" data-revoke="${escapeHtml(invite.id)}">Revoke</button></div></td>
    </tr>`).join('') || '<tr><td colspan="5">No pending invitations.</td></tr>';
    document.querySelectorAll('[data-resend]').forEach((button) => button.onclick = () => resendInvitation(data.invitations.find((invite) => invite.id === button.dataset.resend)));
    document.querySelectorAll('[data-revoke]').forEach((button) => button.onclick = async () => {
      const confirmed = await window.FieldCoreUI.confirm({
        title: 'Revoke invitation?',
        message: 'This person will no longer be able to use the invitation link.',
        confirmLabel: 'Revoke invitation',
        danger: true
      });
      if (confirmed) await act(`/member-invitations/${button.dataset.revoke}/revoke`, 'Invitation revoked.');
    });
  }

  function renderTemplates() {
    const target = document.querySelector('[data-role-template-grid]');
    target.innerHTML = data.templates.map((template) => `<article class="mini-card role-template-card"><div><strong>${escapeHtml(template.name)}</strong><span>${escapeHtml(template.description || 'Saved role')}</span></div><div><small>${escapeHtml(accessLabel(template.defaultScopeType))} access</small></div></article>`).join('') || '<div class="empty-state compact-empty"><strong>No saved roles yet</strong><p>Create a role here or while inviting a member.</p></div>';
  }

  function renderTeams() {
    const target = document.querySelector('[data-team-grid]');
    if (!target) return;
    target.innerHTML = data.teams.map((team) => `<article class="mini-card role-template-card"><div><strong>${escapeHtml(team.name)}</strong><span>${escapeHtml(team.description || 'No description')}</span></div><div><small>${team.memberships ? team.memberships.length : 0} members${team.branch ? ` · ${escapeHtml(team.branch.name)}` : ''}</small></div></article>`).join('') || '<div class="empty-state compact-empty"><strong>No teams yet</strong><p>Create a team when workers need to share jobs or a supervisor.</p></div>';
  }

  function notice(text, ok = true) {
    if (window.FieldCoreUI) {
      window.FieldCoreUI.notify(text, { type: ok ? 'success' : 'error' });
      return;
    }
    console[ok ? 'info' : 'error'](text);
  }

  async function act(path, success) {
    try {
      await api(path, { method: 'POST', body: '{}' });
      await load();
      notice(success);
    } catch (error) {
      notice(error.message, false);
    }
  }

  async function resendInvitation(invite) {
    if (!invite) return;
    try {
      const result = await api(`/member-invitations/${invite.id}/resend`, { method: 'POST', body: '{}' });
      await load();
      notice('Invitation sent again.');
      if (result && result.delivery && result.delivery.setupUrl) showInviteResult({ email: invite.email, delivery: result.delivery });
    } catch (error) {
      notice(error.message, false);
    }
  }

  function modalShell(title, subtitle, body) {
    const modal = document.createElement('div');
    modal.className = 'fc-modal';
    modal.innerHTML = `<div class="fc-dialog member-dialog"><div class="panel-head"><div><h2>${escapeHtml(title)}</h2>${subtitle ? `<p class="muted">${escapeHtml(subtitle)}</p>` : ''}</div><button class="icon-button" type="button" data-close aria-label="Close">×</button></div>${body}</div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelectorAll('[data-close]').forEach((button) => button.onclick = close);
    if (window.FieldCoreFormUX) window.FieldCoreFormUX.refresh();
    return { modal, close };
  }

  function roleAndAccessFields() {
    return `<div class="field span-2"><label>Use a role template</label><select name="roleTemplateId">${savedRoleOptions()}</select><small>Pick a saved role, or create a new one.</small></div>
      <div class="field span-2"><label>Role</label><input name="roleName" required minlength="2" placeholder="e.g. Operations Manager"></div>
      <label class="member-choice span-2">
        <input name="fieldWorker" type="checkbox">
        <span class="member-choice-box" aria-hidden="true"></span>
        <span class="member-choice-copy"><strong>Works in the field</strong><small>Turn this on if they will use the worker app to complete jobs.</small></span>
      </label>
      <label class="member-choice span-2">
        <input name="fullAccess" type="checkbox">
        <span class="member-choice-box" aria-hidden="true"></span>
        <span class="member-choice-copy"><strong>Give access to all company tools</strong><small class="ownership-note"><em>*Not Ownership*</em></small></span>
      </label>
      <div class="permission-help span-2"><strong>Choose what they can use</strong><span>Select the tools this role needs.</span></div>
      <div class="permission-editor span-2" data-permission-editor></div>
      <div class="field span-2 access-area-field"><label>Which work can they see?</label><select name="scopeType"><option value="COMPANY">All company work</option><option value="BRANCH">Work in selected branches</option><option value="TEAM">Work for selected teams</option><option value="SELF">Only work assigned to them</option></select><small>This only limits the jobs, customers, and workers they can see.</small></div>
      <div class="field span-2" data-scope-picker hidden></div>`;
  }

  function accessFormHtml(submitLabel) {
    return `<form data-access-form class="form-grid">
      ${roleAndAccessFields()}
      <p class="fc-form-error span-2" data-form-error hidden></p>
      <div class="fc-form-actions span-2"><button class="secondary-button" type="button" data-close>Cancel</button><button class="primary-button" type="submit">${escapeHtml(submitLabel)}</button></div>
    </form>`;
  }

  function readAccessBody(form) {
    const values = new FormData(form);
    return {
      jobTitle: String(values.get('roleName') || '').trim(),
      roleName: String(values.get('roleName') || '').trim(),
      roleTemplateId: values.get('roleTemplateId') || undefined,
      systemRole: values.get('fieldWorker') === 'on' ? 'WORKER' : 'ADMIN',
      fullAccess: values.get('fullAccess') === 'on',
      permissions: selectedPermissions(form),
      scopeType: values.get('scopeType'),
      branchIds: values.get('scopeType') === 'BRANCH' ? values.getAll('scopeIds') : [],
      teamIds: values.get('scopeType') === 'TEAM' ? values.getAll('scopeIds') : []
    };
  }

  function showInviteResult(result) {
    const delivery = result && result.delivery || {};
    const testLink = delivery.setupUrl;
    const emailSent = delivery.status === 'SENT';
    const { modal } = modalShell(emailSent ? 'Invitation ready' : 'Invitation saved', emailSent ? 'The member can use the email link to join.' : 'Email could not be sent. You can resend it later.', `<div class="invite-result">
      <div class="invite-result-row"><strong>Email</strong><span>${escapeHtml(result.email)}</span></div>
      ${testLink ? `<div class="field"><label>Test link</label><div class="copy-link-row"><input value="${escapeHtml(testLink)}" readonly data-test-invite-link><button class="secondary-button compact" type="button" data-copy-test-link>Copy</button></div><small>Shown only during local console testing.</small></div>` : ''}
      <div class="fc-form-actions"><button class="primary-button" type="button" data-close>Done</button></div>
    </div>`);
    const copy = modal.querySelector('[data-copy-test-link]');
    if (copy) copy.onclick = async () => {
      const value = modal.querySelector('[data-test-invite-link]').value;
      await navigator.clipboard.writeText(value);
      copy.textContent = 'Copied';
      notice('Invitation link copied.');
    };
  }

  function openInvite() {
    const { modal, close } = modalShell('Invite member', 'They will get a secure link to set their password.', `<form data-invite-member-form class="form-grid">
      <div class="field span-2"><label>Email</label><input name="email" type="email" autocomplete="email" required></div>
      ${roleAndAccessFields()}
      <p class="fc-form-error span-2" data-form-error hidden></p>
      <div class="fc-form-actions span-2"><button class="secondary-button" type="button" data-close>Cancel</button><button class="primary-button" type="submit">Send invitation</button></div>
    </form>`);
    const form = modal.querySelector('form');
    bindAccessForm(modal, form, {});
    form.onsubmit = async (event) => {
      event.preventDefault();
      const errorNode = modal.querySelector('[data-form-error]');
      errorNode.hidden = true;
      if (!validateForm(form)) return;
      const body = { email: form.email.value.trim(), ...readAccessBody(form) };
      try {
        const result = await api('/member-invitations', { method: 'POST', body: JSON.stringify(body) });
        close();
        await load();
        showInviteResult(result);
      } catch (error) {
        errorNode.textContent = error.message;
        errorNode.hidden = false;
      }
    };
  }

  function openMember(member) {
    if (!member || member.role === 'OWNER') return;
    const { modal, close } = modalShell(`Edit ${member.name}`, 'Change what this person can use.', accessFormHtml('Save changes'));
    const form = modal.querySelector('form');
    const companyTemplate = data.templates.find((template) => member.roleTemplate && template.id === member.roleTemplate.id);
    form.roleTemplateId.value = companyTemplate ? companyTemplate.id : '';
    form.roleName.value = member.roleTemplate && member.roleTemplate.name || member.jobTitle || 'Team member';
    form.fieldWorker.checked = member.role === 'WORKER';
    form.scopeType.value = member.accessScope && member.accessScope.type || member.defaultScopeType || 'COMPANY';
    const scopeIds = form.scopeType.value === 'BRANCH' ? member.accessScope && member.accessScope.branchIds || [] : form.scopeType.value === 'TEAM' ? member.accessScope && member.accessScope.teamIds || [] : [];
    bindAccessForm(modal, form, { permissions: member.effectivePermissions || [], scopeIds, fullAccess: member.fullBusinessAccess === true });
    form.onsubmit = async (event) => {
      event.preventDefault();
      const errorNode = modal.querySelector('[data-form-error]');
      errorNode.hidden = true;
      if (!validateForm(form)) return;
      try {
        await api(`/members/${member.id}/access`, { method: 'PATCH', body: JSON.stringify(readAccessBody(form)) });
        close();
        await load();
        notice('Member access updated.');
      } catch (error) {
        errorNode.textContent = error.message;
        errorNode.hidden = false;
      }
    };
  }

  async function toggleMember(member) {
    if (!member || member.role === 'OWNER') return;
    const disabled = !member.disabledAt;
    const confirmed = await window.FieldCoreUI.confirm({
      title: `${disabled ? 'Disable' : 'Reactivate'} ${member.name}?`,
      message: disabled ? 'They will not be able to sign in until you reactivate them.' : 'They will be able to sign in again.',
      confirmLabel: disabled ? 'Disable member' : 'Reactivate member',
      danger: disabled
    });
    if (!confirmed) return;
    try {
      await api(`/members/${member.id}/status`, { method: 'PATCH', body: JSON.stringify({ disabled }) });
      await load();
      notice(`${member.name} ${disabled ? 'disabled' : 'reactivated'}.`);
    } catch (error) {
      notice(error.message, false);
    }
  }

  function openRole() {
    const { modal, close } = modalShell('Create role', 'Save a role your company can use again.', `<form class="form-grid" data-role-form>
      <div class="field span-2"><label>Role</label><input name="name" required minlength="2" placeholder="e.g. Night Shift Supervisor"></div>
      <label class="member-choice span-2">
        <input name="fieldWorker" type="checkbox">
        <span class="member-choice-box" aria-hidden="true"></span>
        <span class="member-choice-copy"><strong>Works in the field</strong><small>Turn this on if this role will use the worker app to complete jobs.</small></span>
      </label>
      <div class="field span-2"><label>Short note <span class="optional-label">Optional</span></label><input name="description" maxlength="500" placeholder="What this role does"></div>
      <div class="field span-2"><label>Access area</label><select name="defaultScopeType"><option value="COMPANY">Whole company</option><option value="BRANCH">Selected branches</option><option value="TEAM">Selected teams</option><option value="SELF">Only their own work</option></select></div>
      <div class="permission-help span-2"><strong>Choose what they can do</strong></div>
      <div class="span-2 permission-editor" data-permission-editor>${permissionEditor([])}</div>
      <p class="fc-form-error span-2" data-form-error hidden></p>
      <div class="fc-form-actions span-2"><button class="secondary-button" type="button" data-close>Cancel</button><button class="primary-button" type="submit">Save role</button></div>
    </form>`);
    bindCategoryButtons(modal);
    const form = modal.querySelector('form');
    form.onsubmit = async (event) => {
      event.preventDefault();
      const errorNode = modal.querySelector('[data-form-error]');
      errorNode.hidden = true;
      if (!validateForm(form)) return;
      const body = { name: form.name.value.trim(), description: form.description.value.trim() || undefined, systemRole: form.fieldWorker.checked ? 'WORKER' : 'ADMIN', defaultScopeType: form.defaultScopeType.value, permissions: selectedPermissions(form) };
      try {
        await api('/role-templates', { method: 'POST', body: JSON.stringify(body) });
        close();
        await load();
        notice('Role saved.');
      } catch (error) {
        errorNode.textContent = error.message;
        errorNode.hidden = false;
      }
    };
  }

  function openTeam() {
    const { modal, close } = modalShell('Create team', 'Group workers who share jobs or a supervisor.', `<form class="form-grid" data-team-form><div class="field"><label>Team name</label><input name="name" required minlength="2" placeholder="e.g. Harare Service Team A"></div><div class="field"><label>Branch <span class="optional-label">Optional</span></label><select name="branchId"><option value="">No branch</option>${data.branches.map((branch) => `<option value="${escapeHtml(branch.id)}">${escapeHtml(branch.name)}</option>`).join('')}</select></div><div class="field span-2"><label>Description <span class="optional-label">Optional</span></label><input name="description" maxlength="500"></div><p class="fc-form-error span-2" data-form-error hidden></p><div class="fc-form-actions span-2"><button class="secondary-button" type="button" data-close>Cancel</button><button class="primary-button" type="submit">Create team</button></div></form>`);
    const form = modal.querySelector('form');
    form.onsubmit = async (event) => {
      event.preventDefault();
      const errorNode = modal.querySelector('[data-form-error]');
      errorNode.hidden = true;
      if (!validateForm(form)) return;
      const body = { name: form.name.value.trim(), description: form.description.value.trim() || undefined, branchId: form.branchId.value || undefined };
      try {
        await api('/teams', { method: 'POST', body: JSON.stringify(body) });
        close();
        await load();
        notice('Team created.');
      } catch (error) {
        errorNode.textContent = error.message;
        errorNode.hidden = false;
      }
    };
  }

  async function load() {
    [data.currentUser, data.members, data.invitations, data.templates, data.permissions, data.branches, data.teams] = await Promise.all([
      api('/auth/session'), api('/members'), api('/member-invitations'), api('/role-templates'), api('/permissions'), api('/branches').catch(() => []), api('/teams').catch(() => [])
    ]);
    renderMembers();
    renderInvites();
    renderTemplates();
    renderTeams();
    const inviteButton = document.querySelector('[data-open-invite]');
    const roleButton = document.querySelector('[data-create-role]');
    const teamButton = document.querySelector('[data-create-team]');
    if (inviteButton) inviteButton.hidden = !can('members.invite');
    if (roleButton) roleButton.hidden = !can('roles.manage');
    if (teamButton) teamButton.hidden = !can('team.manage');
  }

  document.querySelector('[data-open-invite]').onclick = openInvite;
  document.querySelector('[data-create-role]').onclick = openRole;
  const createTeamButton = document.querySelector('[data-create-team]');
  if (createTeamButton) createTeamButton.onclick = openTeam;
  document.querySelectorAll('[data-member-view]').forEach((tab) => tab.onclick = () => {
    document.querySelectorAll('[data-member-view]').forEach((item) => item.classList.toggle('active', item === tab));
    document.querySelectorAll('[data-member-panel]').forEach((panel) => { panel.hidden = panel.dataset.memberPanel !== tab.dataset.memberView; });
  });
  load().catch((error) => { document.querySelector('[data-members-body]').innerHTML = `<tr><td colspan="8">${escapeHtml(error.message)}</td></tr>`; });
})();
