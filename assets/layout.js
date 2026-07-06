(function () {
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';

  const adminPages = [
    ['dashboard', 'Dashboard', 'index.html', 'dashboard'],
    ['jobs', 'Jobs', 'jobs.html', 'briefcase'],
    ['schedule', 'Schedule', 'schedule.html', 'schedule'],
    ['map', 'Map', 'map.html', 'map'],
    ['booking-requests', 'Booking Requests', 'booking-requests.html', 'inbox'],
    ['customers', 'People/Members', 'customers.html', 'users'],
    ['assets', 'Assets', 'assets.html', 'briefcase'],
    ['service-contracts', 'Contracts', 'service-contracts.html', 'file'],
    ['inventory', 'Inventory', 'inventory.html', 'briefcase'],
    ['purchase-requests', 'Purchase Requests', 'purchase-requests.html', 'inbox'],
    ['purchase-orders', 'Purchase Orders', 'purchase-orders.html', 'receipt'],
    ['quotes', 'Quotes', 'quotes.html', 'file'],
    ['invoices', 'Invoices', 'invoices.html', 'receipt'],
    ['reports', 'Reports', 'reports.html', 'chart'],
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

  function nav(current, role) {
    const pages = role === 'WORKER' ? workerPages : adminPages;
    const normalized = normalizePages(pages);

    return normalized
      .map(([key, label, href, iconName]) => {
        return `<a class="nav-link${key === current ? ' active' : ''}" href="${href}">
          <span class="nav-icon">${icon(iconName)}</span>${label}
        </a>`;
      })
      .join('');
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
      <nav class="nav">${nav(current, null)}</nav>
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
      <div class="page-mount"></div>
    </main>`;

    const mount = shell.querySelector('.page-mount');
    content.forEach((node) => mount.appendChild(node));

    document.body.appendChild(shell);

    shell.querySelector('.menu-toggle').addEventListener('click', () => {
      document.body.classList.toggle('nav-open');
    });

    loadRoleNavigation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
