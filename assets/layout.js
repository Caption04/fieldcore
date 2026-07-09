(function () {
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';

  const adminPages = [
    ['dashboard', 'Dashboard', 'index.html', 'dashboard'],
    ['jobs', 'Jobs', 'jobs.html', 'briefcase'],
    ['schedule', 'Schedule', 'schedule.html', 'schedule'],
    ['map', 'Map', 'map.html', 'map'],
    ['booking-requests', 'Booking Requests', 'booking-requests.html', 'inbox'],
    ['customers', 'People/Members', 'customers.html', 'users'],
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
    ['security-center', 'Security Center', 'security-center.html', 'settings'],
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
    ['Core', ['dashboard', 'jobs', 'schedule', 'map', 'booking-requests', 'customers']],
    ['Money', ['quotes', 'invoices', 'collections']],
    ['Enterprise', ['branches', 'approvals', 'assets', 'service-contracts', 'contract-automation', 'inventory', 'purchase-requests', 'purchase-orders', 'procurement-costing', 'mobile-sync', 'reports', 'executive-dashboard', 'onboarding', 'security-center']],
    ['Workspace', ['settings']]
  ];

  function navLink([key, label, href, iconName], current) {
    return `<a class="nav-link${key === current ? ' active' : ''}" href="${href}">
      <span class="nav-icon">${icon(iconName)}</span>${label}
    </a>`;
  }

  function nav(current, role) {
    if (role === 'WORKER') {
      return normalizePages(workerPages).map((page) => navLink(page, current)).join('');
    }

    const normalized = normalizePages(adminPages);
    const byKey = new Map(normalized.map((page) => [page[0], page]));
    return adminNavGroups.map(([title, keys]) => {
      const links = keys.map((key) => byKey.get(key)).filter(Boolean);
      const isOpen = links.some((page) => page[0] === current) || title === 'Core';
      return `<details class="nav-group"${isOpen ? ' open' : ''}>
        <summary class="nav-group-title">${title}</summary>
        <div class="nav-group-links">${links.map((page) => navLink(page, current)).join('')}</div>
      </details>`;
    }).join('');
  }

  function shouldShowQuickCard(current, role) {
    if (role === 'WORKER') return false;
    if (current === 'settings') return false;
    return true;
  }

  function quickCard() {
    return `<div class="quick-card" data-quick-card>
      <strong>Quick Create</strong>
      <p>Create a new job, quote, or invoice in seconds.</p>
      <a href="jobs.html">+ New Job</a>
    </div>`;
  }

  function renderRoleNavigation(role) {
    const current = activePage();
    const navNode = document.querySelector('.sidebar .nav');
    const quick = document.querySelector('[data-quick-card]');

    if (navNode) navNode.innerHTML = nav(current, role);

    if (quick) {
      quick.hidden = !shouldShowQuickCard(current, role);
    }

    document.body.dataset.userRole = role || '';
  }

  async function loadRoleNavigation() {
    try {
      const response = await fetch(`${API_BASE}/auth/session`, {
        credentials: 'include'
      });

      const payload = await response.json().catch(() => ({}));
      const user = payload && payload.data;
      const role = user && user.role;

      if (role) renderRoleNavigation(role);
    } catch (error) {
      // Keep admin-shaped default while login modal loads.
    }
  }

  function searchBox() {
    return `<div class="global-search-shell">
      <label for="globalSearch">System search</label>
      <input id="globalSearch" type="search" placeholder="Search jobs, clients, invoices..." autocomplete="off" data-global-search>
      <div class="global-search-results" data-global-search-results hidden></div>
    </div>`;
  }

  function marketSwitcher() {
    const value = localStorage.getItem('fieldcore.market') || 'ZW';
    return `<div class="market-switcher" aria-label="Dashboard region">
      <span>Region</span>
      <button type="button" data-market-value="ZW"${value === 'ZW' ? ' class="active"' : ''}>Zimbabwe</button>
      <button type="button" data-market-value="SA"${value === 'SA' ? ' class="active"' : ''}>South Africa</button>
    </div>`;
  }

  function applyMarketMode(value) {
    const next = value === 'SA' ? 'SA' : 'ZW';
    localStorage.setItem('fieldcore.market', next);
    document.body.dataset.market = next;
    document.querySelectorAll('[data-market-value]').forEach((button) => {
      button.classList.toggle('active', button.dataset.marketValue === next);
    });
  }

  function setupMarketSwitcher() {
    applyMarketMode(localStorage.getItem('fieldcore.market') || 'ZW');
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-market-value]');
      if (!button) return;
      applyMarketMode(button.dataset.marketValue);
    });
  }

  function pageSearchBox() {
    return `<div class="page-search-shell"><input type="search" placeholder="Search this section..." aria-label="Search this section" data-page-search></div>`;
  }

  function setupPageSearch() {
    document.addEventListener('input', (event) => {
      if (!event.target.matches('[data-page-search]')) return;
      const query = event.target.value.trim().toLowerCase();
      const targets = document.querySelectorAll('.table-wrap tbody tr, .table-scroll tbody tr, .settings-list > *, .worker-location-card');
      targets.forEach((node) => {
        if (!query) node.style.display = '';
        else node.style.display = node.textContent.toLowerCase().includes(query) ? '' : 'none';
      });
    });
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
    input.addEventListener('input', () => {
      window.clearTimeout(timer);
      const query = input.value.trim().toLowerCase();
      if (query.length < 2) {
        results.hidden = true;
        results.innerHTML = '';
        return;
      }
      timer = window.setTimeout(async () => {
        results.hidden = false;
        results.innerHTML = '<div class="search-result muted">Searching...</div>';
        const found = [];
        await Promise.all(searchResources.map(async ([key, endpoint, label, title]) => {
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
        results.innerHTML = found.slice(0, 8).map((item) => `<a class="search-result" href="${resourceHref(item.key)}"><strong>${escape(item.title)}</strong><span>${escape(item.label)}</span></a>`).join('') || '<div class="search-result muted">No results found.</div>';
      }, 220);
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
      ${marketSwitcher()}
      ${quickCard()}
      <div class="user">
        <span class="user-photo"></span>
        <span>
          <strong data-current-user-name>Signed in</strong>
          <small data-current-user-role>Account</small>
        </span>
        <button class="icon-button logout-button" type="button" data-logout title="Log out">×</button>
      </div>
    </aside>
    <main class="content">
      <button class="menu-toggle" type="button">Menu</button>
      ${pageSearchBox()}
      <div class="page-mount"></div>
    </main>`;

    const mount = shell.querySelector('.page-mount');
    content.forEach((node) => mount.appendChild(node));

    document.body.appendChild(shell);

    shell.querySelector('.menu-toggle').addEventListener('click', () => {
      document.body.classList.toggle('nav-open');
    });

    setupGlobalSearch();
    setupPageSearch();
    setupMarketSwitcher();
    loadRoleNavigation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
