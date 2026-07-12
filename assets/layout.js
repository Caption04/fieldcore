(function () {
  if (!document.querySelector('script[src*="form-ux.js"]')) {
    const formUx = document.createElement('script');
    formUx.src = 'assets/form-ux.js';
    formUx.defer = true;
    formUx.dataset.fieldcoreFormUx = 'true';
    document.head.appendChild(formUx);
  }

  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  let currentPermissionSet = new Set();

  const adminPages = [
    ['dashboard', 'Dashboard', 'index.html', 'dashboard'],
    ['jobs', 'Jobs', 'jobs.html', 'briefcase'],
    ['schedule', 'Schedule', 'schedule.html', 'schedule'],
    ['map', 'Map', 'map.html', 'map'],
    ['booking-requests', 'Booking Requests', 'booking-requests.html', 'inbox'],
    ['customers', 'Customers', 'customers.html', 'users'],
    ['members', 'Company Members', 'members.html', 'users'],
    ['branches', 'Branches', 'branches.html', 'map'],
    ['approvals', 'Approvals', 'approvals.html', 'inbox'],
    ['assets', 'Assets', 'assets.html', 'briefcase'],
    ['service-contracts', 'Contracts', 'service-contracts.html', 'file'],
    ['contract-automation', 'Contract Automation', 'contract-automation.html', 'settings'],
    ['inventory', 'Inventory', 'inventory.html', 'briefcase'],
    ['purchase-requests', 'Purchase Requests', 'purchase-requests.html', 'inbox'],
    ['purchase-orders', 'Purchase Orders', 'purchase-orders.html', 'receipt'],
    ['procurement-costing', 'Procurement Costing', 'procurement-costing.html', 'chart'],
    ['quotes', 'Quotes', 'quotes.html', 'file'],
    ['invoices', 'Invoices', 'invoices.html', 'receipt'],
    ['collections', 'Collections', 'collections.html', 'receipt'],
    ['mobile-sync', 'Mobile Sync', 'mobile-sync.html', 'settings'],
    ['reports', 'Reports', 'reports.html', 'chart'],
    ['executive-dashboard', 'Executive Dashboard', 'executive-dashboard.html', 'chart'],
    ['onboarding', 'Onboarding', 'onboarding.html', 'settings'],
    ['security-center', 'Security', 'security-center.html', 'settings'],
    ['settings', 'Settings', 'settings.html', 'settings']
  ];

  const workerPages = [
    ['dashboard', 'Dashboard', 'index.html', 'dashboard'],
    ['jobs', 'My Jobs', 'jobs.html', 'briefcase'],
    ['schedule', 'My Schedule', 'schedule.html', 'schedule'],
    ['map', 'Location', 'map.html', 'map']
  ];

  const icons = {
    dashboard: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5h8v2"/><path d="M3 12h18"/>',
    schedule: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
    receipt: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 12h6M9 17h6"/>',
    chart: '<path d="M5 20v-8"/><path d="M12 20V4"/><path d="M19 20v-5"/><path d="M3 21h18"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>',
    settings: '<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.8 1.8 0 0 0 15 19.4a1.8 1.8 0 0 0-1 .6 1.8 1.8 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.1a1.8 1.8 0 0 0-.4-1.1 1.8 1.8 0 0 0-1-.6 1.8 1.8 0 0 0-1.98.36l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-.6-1 1.8 1.8 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.1a1.8 1.8 0 0 0 1.1-.4 1.8 1.8 0 0 0 .6-1 1.8 1.8 0 0 0-.36-1.98l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.8 1.8 0 0 0 9 4.6a1.8 1.8 0 0 0 1-.6 1.8 1.8 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.1a1.8 1.8 0 0 0 .4 1.1 1.8 1.8 0 0 0 1 .6 1.8 1.8 0 0 0 1.98-.36l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.8 1.8 0 0 0 19.4 9c.1.36.3.7.6 1 .3.3.64.5 1.1.6h.1a2 2 0 1 1 0 4h-.1a1.8 1.8 0 0 0-1.1.4 1.8 1.8 0 0 0-.6 1Z"/>'
  };

  function normalizePages(pages) {
    return pages.map((page) => page[2].endsWith('.html') ? page : [page[0], page[1], page[2] + '.html', page[3]]);
  }

  function activePage() {
    const key = document.body.dataset.page;
    if (key) return key;

    const file = window.location.pathname.split('/').pop() || 'index.html';
    const allPages = normalizePages([...adminPages, ...workerPages]);
    const match = allPages.find((page) => page[2] === file);

    return match ? match[0] : 'dashboard';
  }

  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.file}</svg>`;
  }

  const adminNavGroups = [
    ['Core', 'Daily work', ['dashboard', 'jobs', 'schedule', 'map', 'booking-requests', 'customers', 'members']],
    ['Money', 'Quotes & payments', ['quotes', 'invoices', 'collections']],
    ['Enterprise', 'Advanced operations', ['branches', 'approvals', 'assets', 'service-contracts', 'contract-automation', 'inventory', 'purchase-requests', 'purchase-orders', 'procurement-costing', 'mobile-sync', 'reports', 'executive-dashboard', 'onboarding']],
    ['Workspace', 'Company setup', ['settings']]
  ];

  const pagePermissions = {
    dashboard: 'dashboard.operational.view', jobs: 'jobs.view', schedule: 'schedule.view', map: 'workers.location.view', 'booking-requests': 'bookings.view', customers: 'customers.view', members: 'members.view',
    quotes: 'quotes.view', invoices: 'invoices.view', collections: 'payments.view', branches: 'branch.view', approvals: 'approval.request.decide',
    assets: 'contract.automation.manage', 'service-contracts': 'contract.automation.manage', 'contract-automation': 'contract.automation.manage',
    inventory: 'inventory.view', 'purchase-requests': 'purchaseRequest.create', 'purchase-orders': 'purchaseOrder.manage', 'procurement-costing': 'inventory.manage',
    'mobile-sync': 'mobile.sync.manage', reports: 'finance.reports.view', 'executive-dashboard': 'dashboard.executive.view', onboarding: 'company.settings.manage',
    settings: 'company.settings.view', 'security-center': 'security.view'
  };

  function navLink([key, label, href, iconName], current) {
    return `<a class="nav-link${key === current ? ' active' : ''}" href="${href}">
      <span class="nav-icon">${icon(iconName)}</span>${label}
    </a>`;
  }

  function nav(current, role, permissions) {
    const permissionSet = new Set(permissions || []);
    if (!role) return '';
    if (role === 'WORKER') {
      const combined = new Map([...normalizePages(workerPages), ...normalizePages(adminPages)].map((page) => [page[0], page]));
      return Array.from(combined.values())
        .filter((page) => !pagePermissions[page[0]] || permissionSet.has(pagePermissions[page[0]]))
        .map((page) => navLink(page, current))
        .join('');
    }

    const normalized = normalizePages(adminPages).filter((page) => !pagePermissions[page[0]] || permissionSet.has(pagePermissions[page[0]]));
    const byKey = new Map(normalized.map((page) => [page[0], page]));
    return adminNavGroups.map(([title, purpose, keys]) => {
      const links = keys.map((key) => byKey.get(key)).filter(Boolean);
      if (!links.length) return '';
      const isOpen = links.some((page) => page[0] === current);
      return `<details class="nav-group"${isOpen ? ' open' : ''}>
        <summary class="nav-group-title">
          <span class="nav-group-copy"><span>${title}</span><small>${purpose}</small></span>
          <span class="nav-group-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div class="nav-group-links">${links.map((page) => navLink(page, current)).join('')}</div>
      </details>`;
    }).join('');
  }

  function shouldShowQuickCard(current, role, permissions) {
    if (!role || role === 'WORKER') return false;
    if (current === 'settings' || current === 'no-access') return false;
    const permissionSet = new Set(permissions || []);
    return permissionSet.has('jobs.create') && permissionSet.has('jobs.view');
  }

  function quickCard() {
    return `<div class="quick-card" data-quick-card hidden>
      <strong>Quick Create</strong>
      <p>Create a new job, quote, or invoice in seconds.</p>
      <a href="jobs.html">+ New Job</a>
    </div>`;
  }

  function accountInitials(user) {
    return String(user && (user.name || user.email) || 'FC')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  function renderAccountIdentity(user) {
    if (!user) return;
    document.querySelectorAll('[data-current-user-name]').forEach((node) => {
      node.textContent = user.name || user.email || 'Account';
    });
    document.querySelectorAll('[data-current-user-role]').forEach((node) => {
      node.textContent = user.jobTitle || user.roleTemplate && user.roleTemplate.name || user.role || 'Account';
    });
    document.querySelectorAll('[data-account-initials]').forEach((node) => {
      node.textContent = accountInitials(user);
    });
  }

  function renderRoleNavigation(user) {
    const role = user && user.role;
    const current = activePage();
    const navNode = document.querySelector('.sidebar .nav');
    const quick = document.querySelector('[data-quick-card]');

    currentPermissionSet = new Set(user && user.effectivePermissions || []);
    if (navNode) navNode.innerHTML = nav(current, role, user && user.effectivePermissions);
    renderAccountIdentity(user);

    if (quick) {
      quick.hidden = !shouldShowQuickCard(current, role, user && user.effectivePermissions);
    }

    document.body.dataset.userRole = role || '';
    document.querySelectorAll('[data-owner-only]').forEach((node) => { node.hidden = role !== 'OWNER'; });
    const permissionSet = new Set(user && user.effectivePermissions || []);
    document.querySelectorAll('[data-required-permission]').forEach((node) => { node.hidden = !permissionSet.has(node.dataset.requiredPermission); });
  }

  async function loadRoleNavigation() {
    try {
      const response = await fetch(`${API_BASE}/auth/session`, {
        credentials: 'include'
      });

      const payload = await response.json().catch(() => ({}));
      const user = payload && payload.data;
      const role = user && user.role;

      if (role) renderRoleNavigation(user);
    } catch (error) {
      // Keep admin-shaped default while login modal loads.
    }
  }

  function searchBox() {
    return `<div class="global-search-shell">
      <label for="globalSearch">System search</label>
      <input id="globalSearch" type="search" placeholder="Search system..." autocomplete="off" data-global-search>
      <div class="global-search-results" data-global-search-results hidden></div>
    </div>`;
  }

  function pageSearchBox() {
    return `<div class="page-search-shell" data-page-search-shell>
      <input type="search" placeholder="Search this section..." aria-label="Search this section" data-page-search autocomplete="off">
      <div class="page-search-results" data-page-search-results hidden></div>
    </div>`;
  }

  function accountMenu() {
    return `<div class="account-menu" data-account-menu>
      <button class="account-trigger" type="button" data-account-trigger aria-haspopup="menu" aria-expanded="false">
        <span class="account-avatar" data-account-initials>FC</span>
        <span class="account-trigger-copy"><strong data-current-user-name>Signed in</strong><small data-current-user-role>Account</small></span>
        <span class="account-chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="account-dropdown" role="menu" data-account-dropdown hidden>
        <a role="menuitem" href="settings.html" data-required-permission="company.settings.view" hidden>Settings</a>
        <a role="menuitem" href="subscription.html" data-required-permission="subscription.view" hidden>FieldCore Subscription</a>
        <a role="menuitem" href="security-center.html" data-required-permission="security.view" hidden>Security</a>
        <button role="menuitem" type="button" data-logout>Log out</button>
      </div>
    </div>`;
  }

  function setupAccountMenu() {
    const menu = document.querySelector('[data-account-menu]');
    const trigger = menu && menu.querySelector('[data-account-trigger]');
    const dropdown = menu && menu.querySelector('[data-account-dropdown]');
    if (!trigger || !dropdown) return;
    const close = () => { dropdown.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
    const open = () => { dropdown.hidden = false; trigger.setAttribute('aria-expanded', 'true'); const first = dropdown.querySelector('[role="menuitem"]:not([hidden])'); if (first) first.focus(); };
    trigger.addEventListener('click', () => dropdown.hidden ? open() : close());
    document.addEventListener('click', (event) => { if (!menu.contains(event.target)) close(); });
    menu.addEventListener('keydown', (event) => { if (event.key === 'Escape') { close(); trigger.focus(); } });

    const logoutButton = menu.querySelector('[data-logout]');
    if (logoutButton) {
      logoutButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        logoutButton.disabled = true;
        logoutButton.textContent = 'Signing out...';
        try {
          await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
          });
        } catch (error) {
          // The local session is still cleared by navigating to the sign-in page.
        }
        window.location.href = 'login.html?loggedOut=1';
      });
    }
  }

  function sectionSearchTargetSelector() {
    return '.table-wrap tbody tr, .table-scroll tbody tr, .data-table tbody tr, .list-item, .settings-row, .worker-location-card, .asset-card, .panel[data-searchable]';
  }

  function cleanSearchText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function searchResultTitle(node) {
    const titleNode = node.querySelector('[data-search-title], td:first-child, th:first-child, h2, h3, h4, strong, a');
    const title = cleanSearchText(titleNode ? titleNode.textContent : node.textContent);
    return title || 'Matching result';
  }

  function jumpToSectionResult(id) {
    const node = document.getElementById(id);
    if (!node) return false;
    node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    node.classList.add('section-search-highlight');
    window.setTimeout(() => node.classList.remove('section-search-highlight'), 1600);
    return true;
  }

  function setupPageSearch() {
    const input = document.querySelector('[data-page-search]');
    const results = document.querySelector('[data-page-search-results]');
    if (!input || !results) return;

    const runSearch = ({ autoJump = false } = {}) => {
      const query = input.value.trim().toLowerCase();
      const targets = Array.from(document.querySelectorAll(sectionSearchTargetSelector()));
      const matches = [];

      targets.forEach((node, index) => {
        const text = cleanSearchText(node.textContent);
        const isMatch = !query || text.toLowerCase().includes(query);
        node.style.display = isMatch ? '' : 'none';
        if (query && isMatch && matches.length < 8) {
          if (!node.id) node.id = `section-search-${Date.now()}-${index}`;
          matches.push({ id: node.id, title: searchResultTitle(node) });
        }
      });

      if (!query) {
        results.hidden = true;
        results.innerHTML = '';
        return false;
      }

      results.hidden = false;
      results.innerHTML = matches.length
        ? matches.map((item) => `<button type="button" class="search-result" data-section-result="${escape(item.id)}"><strong>${escape(item.title)}</strong></button>`).join('')
        : '<div class="search-result muted">No matches in this section.</div>';

      if (autoJump && matches.length) {
        window.setTimeout(() => jumpToSectionResult(matches[0].id), 40);
      }

      return matches.length > 0;
    };

    input.addEventListener('input', () => runSearch());

    results.addEventListener('click', (event) => {
      const button = event.target.closest('[data-section-result]');
      if (!button) return;
      if (jumpToSectionResult(button.dataset.sectionResult)) {
        results.hidden = true;
      }
    });

    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get('fcSearch');
    if (initialQuery) {
      input.value = initialQuery;
      let attempts = 0;
      const trySearchAndJump = () => {
        attempts += 1;
        const found = runSearch({ autoJump: true });
        if (!found && attempts < 10) window.setTimeout(trySearchAndJump, 300);
      };
      window.setTimeout(trySearchAndJump, 150);
    }
  }

  function placePageSearch(shell) {
    const search = shell.querySelector('[data-page-search-shell]');
    const mount = shell.querySelector('.page-mount');
    if (!search || !mount) return;

    const toolbar = mount.querySelector('.toolbar');
    if (toolbar) {
      const row = document.createElement('div');
      row.className = 'section-search-row';
      toolbar.insertAdjacentElement('afterend', row);
      row.appendChild(search);
      return;
    }

    const page = mount.querySelector('.page');
    const hero = page && page.querySelector('.hero-row');
    if (hero) {
      hero.insertAdjacentElement('afterend', search);
      return;
    }

    mount.prepend(search);
  }

  const searchResources = [
    ['jobs', '/jobs', 'Jobs', (item) => item.title || item.number || item.id],
    ['customers', '/customers', 'Customers', (item) => item.name || item.email || item.phone],
    ['quotes', '/quotes', 'Quotes', (item) => item.title || item.number || item.id],
    ['invoices', '/invoices', 'Invoices', (item) => item.number || item.customer && item.customer.name],
    ['booking-requests', '/booking-requests', 'Booking requests', (item) => item.customerName || item.serviceName],
    ['assets', '/assets', 'Assets', (item) => item.name || item.assetTag || item.serialNumber],
    ['service-contracts', '/service-contracts', 'Contracts', (item) => item.name || item.contractNumber],
    ['branches', '/branches', 'Branches', (item) => item.name || item.code || item.city]
  ];

  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function resourceHref(key) {
    const page = adminPages.find((item) => item[0] === key);
    return page ? page[2] : 'index.html';
  }

  function setupGlobalSearch() {
    const input = document.querySelector('[data-global-search]');
    const results = document.querySelector('[data-global-search-results]');
    if (!input || !results) return;
    let timer;

    function hideResults() {
      results.hidden = true;
      results.innerHTML = '';
    }

    input.addEventListener('input', () => {
      window.clearTimeout(timer);
      const query = input.value.trim().toLowerCase();
      if (query.length < 2) {
        hideResults();
        return;
      }
      timer = window.setTimeout(async () => {
        results.hidden = false;
        results.innerHTML = '<div class="search-result muted">Searching...</div>';
        const found = [];
        await Promise.all(searchResources.filter(([key]) => !pagePermissions[key] || currentPermissionSet.has(pagePermissions[key])).map(async ([key, endpoint, label, title]) => {
          try {
            const response = await fetch(`${API_BASE}${endpoint}`, { credentials: 'include' });
            const payload = await response.json().catch(() => ({}));
            const items = Array.isArray(payload.data) ? payload.data : [];
            items.forEach((item) => {
              const text = JSON.stringify(item).toLowerCase();
              if (text.includes(query)) found.push({ key, label, title: title(item) || item.id || label });
            });
          } catch (error) {}
        }));
        results.innerHTML = found.slice(0, 8).map((item) => `<a class="search-result" href="${resourceHref(item.key)}?fcSearch=${encodeURIComponent(query)}"><strong>${escape(item.title)}</strong><span>${escape(item.label)}</span></a>`).join('') || '<div class="search-result muted">No results found.</div>';
      }, 220);
    });

    document.addEventListener('click', (event) => {
      if (event.target.closest('.global-search-shell')) return;
      hideResults();
    });
  }

  function init() {
    const current = activePage();
    const content = Array.from(document.body.children);
    const shell = document.createElement('section');

    shell.className = 'app-shell';
    shell.innerHTML = `<aside class="sidebar" aria-label="Primary navigation">
      <a class="brand" href="index.html">
        <span class="brand-mark">FC</span>
        <span class="brand-name">FieldCore</span>
      </a>
      ${searchBox()}
      <nav class="nav">${nav(current, null)}</nav>
      ${quickCard()}
    </aside>
    <main class="content">
      <div class="content-account-bar"><button class="menu-toggle" type="button">Menu</button>${accountMenu()}</div>
      ${pageSearchBox()}
      <div class="page-mount"></div>
    </main>`;

    const mount = shell.querySelector('.page-mount');
    content.forEach((node) => mount.appendChild(node));
    placePageSearch(shell);

    document.body.appendChild(shell);

    shell.querySelector('.menu-toggle').addEventListener('click', () => {
      document.body.classList.toggle('nav-open');
    });

    setupGlobalSearch();
    setupPageSearch();
    setupAccountMenu();
    loadRoleNavigation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
