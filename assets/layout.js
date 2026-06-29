(function(){
  const pages=[
    ["dashboard","Dashboard","index.html","dashboard"],["jobs","Jobs","jobs.html","briefcase"],["schedule","Schedule","schedule.html","schedule"],["map","Map","map.html","map"],["customers","Customers","customers.html","users"],["quotes","Quotes","quotes.html","file"],["invoices","Invoices","invoices.html","receipt"],["reports","Reports","reports.html","chart"],["settings","Settings","settings.html","settings"]
  ];
  const normalized=pages.map(p=>p[2].endsWith('.html')?p:[p[0],p[1],p[2]+'.html',p[3]]);
  const icons={
    dashboard:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5h8v2"/><path d="M3 12h18"/>',
    schedule:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
    file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
    receipt:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 12h6M9 17h6"/>',
    chart:'<path d="M5 20v-8"/><path d="M12 20V4"/><path d="M19 20v-5"/><path d="M3 21h18"/>',
    settings:'<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.8 1.8 0 0 0 15 19.4a1.8 1.8 0 0 0-1 .6 1.8 1.8 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.1a1.8 1.8 0 0 0-.4-1.1 1.8 1.8 0 0 0-1-.6 1.8 1.8 0 0 0-1.98.36l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-.6-1 1.8 1.8 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.1a1.8 1.8 0 0 0 1.1-.4 1.8 1.8 0 0 0 .6-1 1.8 1.8 0 0 0-.36-1.98l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.8 1.8 0 0 0 9 4.6a1.8 1.8 0 0 0 1-.6 1.8 1.8 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.1a1.8 1.8 0 0 0 .4 1.1 1.8 1.8 0 0 0 1 .6 1.8 1.8 0 0 0 1.98-.36l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.8 1.8 0 0 0 19.4 9c.1.36.3.7.6 1 .3.3.64.5 1.1.6h.1a2 2 0 1 1 0 4h-.1a1.8 1.8 0 0 0-1.1.4 1.8 1.8 0 0 0-.6 1Z"/>'
  };
  function activePage(){const key=document.body.dataset.page;if(key)return key;const file=window.location.pathname.split('/').pop()||'index.html';const match=normalized.find(p=>p[2]===file);return match?match[0]:'dashboard'}
  function icon(name){return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`}
  function nav(current){return normalized.map(([key,label,href,iconName])=>`<a class="nav-link${key===current?' active':''}" href="${href}"><span class="nav-icon">${icon(iconName)}</span>${label}</a>`).join('')}
  function init(){
    const current=activePage();
    const content=Array.from(document.body.children);
    const shell=document.createElement('section');
    shell.className='app-shell';
    shell.innerHTML=`<aside class="sidebar" aria-label="Primary navigation"><a class="brand" href="index.html"><span class="brand-mark">FC</span><span class="brand-name">FieldCore</span></a><nav class="nav">${nav(current)}</nav>${current==="settings"?"":"<div class=\"quick-card\"><strong>Quick Create</strong><p>Create a new job, quote, or invoice in seconds.</p><a href=\"jobs.html\">+ New Job</a></div>"}<div class="user"><span class="user-photo"></span><span><strong>Jack Thompson</strong><small>Admin</small></span><span class="user-caret">⌄</span></div></aside><main class="content"><button class="menu-toggle" type="button">Menu</button><div class="page-mount"></div></main>`;
    const mount=shell.querySelector('.page-mount');
    content.forEach(n=>mount.appendChild(n));
    document.body.appendChild(shell);
    shell.querySelector('.menu-toggle').addEventListener('click',()=>document.body.classList.toggle('nav-open'));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

