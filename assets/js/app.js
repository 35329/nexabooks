/* =====================================================================
   app.js – application shell: hash router, sidebar, top bar (global
   search, quick create, notifications, profile) and boot sequence.
   Laravel: routes/web.php + layouts/app.blade.php; each NB.route() below
   corresponds to a named route / controller action.
   ===================================================================== */
window.NB = window.NB || {};

(() => {
  const U = NB.utils; const ui = NB.ui; const { esc } = U;

  /* ---------------- Navigation definition ---------------- */
  const NAV = [
    { title: 'Overview', items: [{ label: 'Dashboard', icon: 'layout-dashboard', href: 'dashboard' }] },
    { title: 'Sales & Documents', items: [
      { label: 'Quotations', icon: 'file-text', href: 'quotations', count: () => NB.data.db.quotations.filter(q => NB.calc.quotationStatus(q) === 'Sent').length },
      { label: 'Invoices', icon: 'receipt', href: 'invoices', count: () => NB.data.db.invoices.filter(i => NB.calc.invoiceInfo(i).status === 'Overdue').length, countTitle: 'overdue' },
      { label: 'Recurring / Monthly', icon: 'repeat', href: 'recurring', count: () => NB.data.db.recurring.filter(r => r.status === 'Active' && r.nextDate <= U.today()).length, countTitle: 'due to generate' },
      { label: 'Payment Receipts', icon: 'receipt-text', href: 'receipts' },
      { label: 'Credit Notes', icon: 'file-minus', href: 'credit-notes' }
    ] },
    { title: 'Customers', items: [
      { label: 'Customer Directory', icon: 'users', href: 'customers' },
      { label: 'Customer Statements', icon: 'scroll-text', href: 'statements' }
    ] },
    { title: 'Finance', items: [
      { label: 'Payments', icon: 'credit-card', href: 'payments' },
      { label: 'Expenses', icon: 'wallet', href: 'expenses' }
    ] },
    { title: 'Reports', items: [
      { label: 'Sales Reports', icon: 'chart-column', href: 'reports/sales' },
      { label: 'Invoice Reports', icon: 'file-check-2', href: 'reports/invoices' },
      { label: 'Payment Reports', icon: 'hand-coins', href: 'reports/payments' },
      { label: 'Customer Reports', icon: 'user', href: 'reports/customers' },
      { label: 'Outstanding Receivables', icon: 'clock', href: 'reports/receivables' },
      { label: 'Monthly Revenue', icon: 'chart-line', href: 'reports/revenue' },
      { label: 'Expense Reports', icon: 'piggy-bank', href: 'reports/expenses' }
    ] },
    { title: 'Settings', items: [
      { label: 'Company Profile', icon: 'building-2', href: 'settings/company' },
      { label: 'Document Templates', icon: 'palette', href: 'settings/templates' },
      { label: 'Tax Settings', icon: 'percent', href: 'settings/tax' },
      { label: 'Numbering Settings', icon: 'hash', href: 'settings/numbering' }
    ] }
  ];

  /* ---------------- Router ---------------- */
  const routes = [];
  NB.route = (pattern, handler) => routes.push({ parts: pattern.split('/'), handler, pattern });
  NB.go = path => { const h = '#/' + path.replace(/^#?\/?/, ''); if (location.hash === h) resolve(); else location.hash = h; };
  function parseHash() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    const [path, qs] = h.split('?');
    return { path: path || 'dashboard', query: Object.fromEntries(new URLSearchParams(qs || '')) };
  }
  function resolve() {
    const { path, query } = parseHash();
    const segs = path.split('/');
    let match = null, params = {};
    for (const r of routes) {
      if (r.parts.length !== segs.length) continue;
      const p = {};
      if (r.parts.every((part, i) => part.startsWith(':') ? (p[part.slice(1)] = segs[i], true) : part === segs[i])) { match = r; params = p; break; }
    }
    ui.destroyCharts(); ui.closeDropdowns();
    document.body.classList.remove('sidebar-open'); U.$('#sidebar-overlay').classList.add('hidden');
    closePanels();
    while (document.querySelector('.modal-backdrop')) document.querySelector('.modal-backdrop [data-close]').click();
    NB.current = { path, query, params };
    try {
      if (match) match.handler(params, query);
      else NB.view.render(ui.pageHeader({ title: 'Page not found' }) + `<div class="card">${ui.emptyState('This page does not exist', 'The link may be outdated.', '<a href="#/dashboard" class="btn btn-primary">Go to dashboard</a>', 'compass')}</div>`);
    } catch (e) {
      console.error(e);
      NB.view.render(`<div class="card p-6"><div class="callout callout-warn">${ui.icon('triangle-alert')}<div><b>Something went wrong while rendering this view.</b><br>${esc(e.message)}</div></div></div>`);
    }
    refreshChrome();
  }

  NB.view = {
    el: () => document.getElementById('view'),
    render(html) {
      const v = this.el(); v.innerHTML = html; ui.icons(v);
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
      return v;
    },
    /** Re-run the current route (after data changes). */
    refresh() { resolve(); }
  };

  /* ---------------- Sidebar ---------------- */
  function renderNav() {
    const { path } = parseHash();
    const nav = U.$('#sidebar-nav');
    nav.innerHTML = NAV.map(sec => `<div class="nav-group"><div class="nav-section-title">${esc(sec.title)}</div><div class="space-y-0.5">${sec.items.map(it => {
      const active = path === it.href || path.startsWith(it.href + '/');
      const n = it.count ? it.count() : 0;
      return `<a href="#/${it.href}" class="nav-link ${active ? 'active' : ''}" title="${esc(it.label)}" ${active ? 'aria-current="page"' : ''}>${ui.icon(it.icon)}<span>${esc(it.label)}</span>${n ? `<span class="nav-count" title="${n} ${esc(it.countTitle || 'open')}">${n}</span>` : ''}</a>`;
    }).join('')}</div></div>`).join('');
    ui.icons(nav);
  }
  function renderBrand() {
    const c = NB.data.db.company;
    U.$('#brand-company').textContent = c.tradingName || c.legalName;
    U.$('#brand-mark').innerHTML = c.logo ? `<img src="${c.logo}" alt="">` : 'N';
  }

  /* ---------------- Notifications (computed from data) ---------------- */
  function notifications() {
    const T = U.today(); const out = [];
    const overdue = NB.data.db.invoices.map(i => ({ i, info: NB.calc.invoiceInfo(i) })).filter(x => x.info.status === 'Overdue').sort((a, b) => b.info.daysOverdue - a.info.daysOverdue);
    overdue.slice(0, 4).forEach(({ i, info }) => out.push({ icon: 'triangle-alert', tone: 'text-red-600 bg-red-50', title: `${i.number} is ${info.daysOverdue} days overdue`, text: `${NB.data.customerName(i.customerId)} · ${U.money(info.balance)} due`, href: `#/invoices/view/${i.id}` }));
    if (overdue.length > 4) out.push({ icon: 'receipt', tone: 'text-red-600 bg-red-50', title: `${overdue.length - 4} more overdue invoices`, text: 'Review receivables ageing', href: '#/reports/receivables' });
    NB.data.db.recurring.filter(r => r.status === 'Active' && r.nextDate <= T).forEach(r => out.push({ icon: 'calendar-clock', tone: 'text-amber-700 bg-amber-50', title: `Recurring invoice due: ${r.id}`, text: `${NB.data.customerName(r.customerId)} · scheduled ${U.fmtDate(r.nextDate)}`, href: '#/recurring' }));
    NB.data.db.quotations.filter(q => q.status === 'Sent' && q.expiryDate >= T && U.diffDays(q.expiryDate, T) <= 7).forEach(q => out.push({ icon: 'clock', tone: 'text-brand-600 bg-brand-50', title: `${q.number} expires ${U.relTime(q.expiryDate)}`, text: NB.data.customerName(q.customerId), href: `#/quotations/view/${q.id}` }));
    const drafts = NB.data.db.invoices.filter(i => i.status === 'Draft').length;
    if (drafts) out.push({ icon: 'file-clock', tone: 'text-slate-600 bg-slate-100', title: `${drafts} draft invoice${drafts > 1 ? 's' : ''} not issued`, text: 'Review and issue to customers', href: '#/invoices?status=Draft' });
    return out;
  }
  function renderNotifications() {
    const list = notifications();
    const dot = U.$('#notif-count');
    dot.textContent = list.length > 9 ? '9+' : list.length; dot.classList.toggle('hidden', !list.length);
    U.$('#notif-panel').innerHTML = `<div class="flex items-center justify-between px-4 py-3 border-b border-slate-100"><span class="font-display font-bold text-sm">Notifications</span><span class="text-xs text-slate-500">${list.length} item${list.length === 1 ? '' : 's'}</span></div>
      <div class="max-h-[380px] overflow-y-auto py-1">${list.length ? list.map(n => `<a href="${n.href}" class="flex gap-3 px-4 py-2.5 hover:bg-slate-50"><span class="w-8 h-8 rounded-lg grid place-items-center shrink-0 ${n.tone}">${ui.icon(n.icon, '!w-4 !h-4')}</span><span class="min-w-0"><span class="block text-[13px] font-semibold text-slate-800">${esc(n.title)}</span><span class="block text-xs text-slate-500 truncate">${esc(n.text)}</span></span></a>`).join('') : ui.emptyState('You are all caught up', 'No overdue invoices or pending actions.', '', 'bell')}</div>
      <div class="px-4 py-2.5 border-t border-slate-100 text-[11px] text-slate-500">Computed live from your records. Email/SMS alerts arrive with the Laravel build.</div>`;
    ui.icons(U.$('#notif-panel'));
  }

  /* ---------------- Global search ---------------- */
  function search(q) {
    q = q.trim().toLowerCase(); if (q.length < 2) return [];
    const has = (...v) => v.some(x => String(x || '').toLowerCase().includes(q));
    const res = [];
    NB.data.db.customers.filter(c => has(c.companyName, c.contactPerson, c.email, c.phone, c.id, c.trn)).slice(0, 5)
      .forEach(c => res.push({ group: 'Customers', icon: 'user', title: NB.data.customerName(c), sub: `${c.id} · ${c.email}`, href: `#/customers/view/${c.id}` }));
    NB.data.db.invoices.filter(i => has(i.number, NB.data.customerName(i.customerId), i.poNumber)).slice(0, 5)
      .forEach(i => { const info = NB.calc.invoiceInfo(i); res.push({ group: 'Invoices', icon: 'receipt', title: i.number, sub: `${NB.data.customerName(i.customerId)} · ${U.money(info.total)} · ${info.status}`, href: `#/invoices/view/${i.id}` }); });
    NB.data.db.quotations.filter(x => has(x.number, NB.data.customerName(x.customerId))).slice(0, 4)
      .forEach(x => res.push({ group: 'Quotations', icon: 'file-text', title: x.number, sub: `${NB.data.customerName(x.customerId)} · ${NB.calc.quotationStatus(x)}`, href: `#/quotations/view/${x.id}` }));
    NB.data.db.payments.filter(p => has(p.receiptNumber, p.id, p.reference, NB.data.customerName(p.customerId))).slice(0, 4)
      .forEach(p => res.push({ group: 'Receipts & payments', icon: 'receipt-text', title: `${p.receiptNumber} · ${U.money(p.amount)}`, sub: `${NB.data.customerName(p.customerId)} · ${p.method}`, href: `#/receipts/view/${p.id}` }));
    NB.data.db.creditNotes.filter(c => has(c.number, NB.data.customerName(c.customerId))).slice(0, 3)
      .forEach(c => res.push({ group: 'Credit notes', icon: 'file-minus', title: c.number, sub: NB.data.customerName(c.customerId), href: `#/credit-notes/view/${c.id}` }));
    return res;
  }
  function bindSearch() {
    const input = U.$('#global-search'), panel = U.$('#search-results');
    let active = -1, results = [];
    const draw = () => {
      if (!input.value.trim() || input.value.trim().length < 2) { panel.classList.add('hidden'); return; }
      results = search(input.value);
      let lastGroup = '';
      panel.innerHTML = results.length ? '<div class="py-1">' + results.map((r, i) => {
        const g = r.group !== lastGroup ? `<div class="px-4 pt-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">${esc(r.group)}</div>` : '';
        lastGroup = r.group;
        return `${g}<a href="${r.href}" class="menu-item ${i === active ? 'is-active' : ''}" data-i="${i}">${ui.icon(r.icon)}<span class="min-w-0"><span class="block font-semibold truncate">${esc(r.title)}</span><span class="block text-xs text-slate-500 truncate">${esc(r.sub)}</span></span></a>`;
      }).join('') + '</div>' : `<div class="px-4 py-6 text-sm text-slate-500 text-center">No matches for “${esc(input.value)}”</div>`;
      panel.classList.remove('hidden'); ui.icons(panel);
      U.$$('a', panel).forEach(a => a.addEventListener('click', () => { panel.classList.add('hidden'); input.value = ''; }));
    };
    input.addEventListener('input', U.debounce(() => { active = -1; draw(); }, 120));
    input.addEventListener('focus', draw);
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, results.length - 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); draw(); }
      else if (e.key === 'Enter' && results[Math.max(active, 0)]) { location.hash = results[Math.max(active, 0)].href; panel.classList.add('hidden'); input.value = ''; input.blur(); }
      else if (e.key === 'Escape') { panel.classList.add('hidden'); input.blur(); }
    });
    document.addEventListener('click', e => { if (!e.target.closest('#search-results') && e.target !== input) panel.classList.add('hidden'); });
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); input.focus(); }
    });
  }

  /* ---------------- Top bar panels ---------------- */
  const PANELS = ['#notif-panel', '#profile-panel', '#quick-new-menu'];
  function closePanels(except) { PANELS.forEach(p => { if (p !== except) U.$(p).classList.add('hidden'); }); }
  function togglePanel(sel) { const el = U.$(sel); const open = el.classList.contains('hidden'); closePanels(sel); el.classList.toggle('hidden', !open); }

  const QUICK = [
    { label: 'New quotation', icon: 'file-text', run: () => NB.go('quotations/new') },
    { label: 'New invoice', icon: 'receipt', run: () => NB.go('invoices/new') },
    { label: 'Record payment', icon: 'hand-coins', run: () => NB.payments.openRecord() },
    { label: 'Add customer', icon: 'user-plus', run: () => NB.customers.openForm() },
    { label: 'Recurring profile', icon: 'repeat', run: () => NB.go('recurring/new') },
    { label: 'Credit note', icon: 'file-minus', run: () => NB.go('credit-notes/new') },
    { label: 'Add expense', icon: 'wallet', run: () => NB.expenses.openForm() }
  ];
  function renderMenus() {
    const qn = U.$('#quick-new-menu');
    qn.innerHTML = QUICK.map((q, i) => `<button class="menu-item" data-q="${i}">${ui.icon(q.icon)}${esc(q.label)}</button>`).join('');
    U.$$('[data-q]', qn).forEach(b => b.onclick = () => { closePanels(); QUICK[+b.dataset.q].run(); });
    const pp = U.$('#profile-panel');
    pp.innerHTML = `<div class="px-4 py-3 border-b border-slate-100"><div class="font-semibold text-sm">Sara Al Amiri</div><div class="text-xs text-slate-500">Finance Manager · demo user</div></div>
      <a href="#/settings/company" class="menu-item">${ui.icon('building-2')}Company profile</a>
      <a href="#/settings/templates" class="menu-item">${ui.icon('palette')}Document templates</a>
      <button class="menu-item" data-act="about">${ui.icon('info')}About this prototype</button>
      <div class="menu-sep"></div>
      <button class="menu-item" data-act="reset">${ui.icon('rotate-ccw')}Reset demo data</button>
      <button class="menu-item" data-act="logout">${ui.icon('log-out')}Sign out</button>`;
    U.$$('a', pp).forEach(a => a.addEventListener('click', () => closePanels()));
    pp.querySelector('[data-act="reset"]').onclick = () => { closePanels(); NB.app.resetDemo(); };
    pp.querySelector('[data-act="about"]').onclick = () => { closePanels(); about(); };
    pp.querySelector('[data-act="logout"]').onclick = () => { closePanels(); ui.notAvailable('Sign out', 'This prototype has no authentication. The Laravel application will add secure login, roles and permissions (e.g. Owner, Accountant, Sales).'); };
    ui.icons(qn); ui.icons(pp);
  }
  function about() {
    ui.modal({
      title: 'About this prototype', size: 'lg', body: `<div class="space-y-3 text-sm text-slate-600 leading-relaxed">
        <p><b class="text-slate-800">NexaBooks UAE</b> is a clickable frontend prototype for client review. All workflows run in the browser and data is saved to this browser's LocalStorage.</p>
        <div class="callout callout-warn">${ui.icon('shield-alert')}<div>This prototype is <b>not</b> FTA-approved or certified, and does not claim UAE VAT compliance. Tax invoice fields, credit note requirements, rounding and VAT return reporting must be validated against current Federal Tax Authority guidance before production.</div></div>
        <ul class="list-disc pl-5 space-y-1"><li>No authentication, permissions or server-side validation (planned for Laravel).</li><li>Recurring invoices are generated manually with “Generate now”; Laravel Scheduler + queued jobs will automate this.</li><li>PDFs are rendered in the browser for demo purposes; production PDFs will be generated server-side.</li><li>Email sending is simulated (status changes only).</li></ul>
        <p class="text-xs text-slate-500">Demo dataset seeded on ${U.fmtDate(NB.data.db.seededOn)} · Storage: ${NB.data.storageOk ? 'LocalStorage active' : 'LocalStorage unavailable – changes are lost on refresh'}</p></div>`,
      actions: [{ label: 'Close', variant: 'primary', onClick: m => m.close() }]
    });
  }

  function refreshChrome() { renderNav(); renderNotifications(); renderBrand(); }

  NB.app = {
    refreshChrome,
    async resetDemo() {
      const ok = await ui.confirm({ title: 'Reset demo data?', message: 'All customers, documents, payments, settings and changes made in this browser will be replaced with the original fictional dataset. This cannot be undone.', confirmLabel: 'Reset data', danger: true });
      if (!ok) return;
      NB.data.reset();
      ui.toast('Demo data restored.');
      NB.go('dashboard');
    }
  };

  /* ---------------- Boot ---------------- */
  function boot() {
    NB.data.load();
    try { if (localStorage.getItem('nb_sidebar') === 'collapsed') document.body.classList.add('sidebar-collapsed'); } catch (e) { /* ignore */ }
    U.$('#btn-sidebar').onclick = () => {
      if (window.innerWidth < 1024) {
        const open = !document.body.classList.contains('sidebar-open');
        document.body.classList.toggle('sidebar-open', open);
        U.$('#sidebar-overlay').classList.toggle('hidden', !open);
      } else {
        document.body.classList.toggle('sidebar-collapsed');
        try { localStorage.setItem('nb_sidebar', document.body.classList.contains('sidebar-collapsed') ? 'collapsed' : 'open'); } catch (e) { /* ignore */ }
      }
    };
    U.$('#sidebar-overlay').onclick = () => { document.body.classList.remove('sidebar-open'); U.$('#sidebar-overlay').classList.add('hidden'); };
    U.$('#btn-notifications').onclick = e => { e.stopPropagation(); togglePanel('#notif-panel'); };
    U.$('#btn-profile').onclick = e => { e.stopPropagation(); togglePanel('#profile-panel'); };
    U.$('#btn-quick-new').onclick = e => { e.stopPropagation(); togglePanel('#quick-new-menu'); };
    document.addEventListener('click', e => { if (!e.target.closest('.dropdown-panel') && !e.target.closest('#btn-notifications, #btn-profile, #btn-quick-new')) closePanels(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanels(); });
    renderMenus(); bindSearch();
    ui.icons(document.querySelector('header'));
    window.addEventListener('hashchange', resolve);
    if (!location.hash) history.replaceState(null, '', '#/dashboard');
    resolve();
    if (!NB.data.storageOk) ui.toast('Browser storage is unavailable – changes will not survive a refresh.', 'warn', { duration: 7000 });
    if (!window.Chart || !window.lucide) ui.toast('Some CDN libraries failed to load. Check your internet connection.', 'warn', { duration: 7000 });
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
