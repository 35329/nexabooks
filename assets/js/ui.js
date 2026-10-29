/* =====================================================================
   ui.js – reusable UI components (→ Blade components in Laravel:
   <x-badge>, <x-stat-card>, <x-modal>, <x-data-table>, <x-form.input> …)
   ===================================================================== */
window.NB = window.NB || {};

NB.ui = (() => {
  const U = NB.utils;
  const { esc } = U;

  /** Replace <i data-lucide="name"> placeholders inside root with Lucide SVGs (only un-rendered ones). */
  const pascal = s => s.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
  function icons(root = document) {
    if (!window.lucide) return;
    root.querySelectorAll('i[data-lucide]').forEach(el => {
      const name = el.getAttribute('data-lucide');
      const node = lucide.icons[pascal(name)];
      if (!node) return;
      const [tag, attrs, children] = node;
      const svg = lucide.createElement([tag, { ...attrs, 'data-lucide': name, 'aria-hidden': 'true', class: `lucide lucide-${name} ${el.getAttribute('class') || ''}`.trim() }, children]);
      el.replaceWith(svg);
    });
  }
  const icon = (name, cls = '') => `<i data-lucide="${name}" class="${cls}"></i>`;

  /* ---------- Status badges ---------- */
  const BADGE = {
    'Paid': 'ok', 'Accepted': 'ok', 'Active': 'ok', 'Issued': 'ok', 'Converted': 'purple',
    'Partially Paid': 'warn', 'Sent': 'info', 'Pending': 'warn', 'Paused': 'warn',
    'Overdue': 'bad', 'Rejected': 'bad', 'Cancelled': 'neutral', 'Expired': 'neutral', 'Draft': 'neutral',
    'Inactive': 'neutral', 'Completed': 'teal', 'Void': 'neutral'
  };
  const LABEL = { 'Converted': 'Converted to Invoice' };
  const badge = (status, label) => `<span class="badge badge-${BADGE[status] || 'neutral'}">${esc(label || LABEL[status] || status)}</span>`;

  /* ---------- Page header with breadcrumbs ---------- */
  function pageHeader({ title, subtitle = '', crumbs = [], actions = '' }) {
    const c = crumbs.length ? `<nav class="crumbs" aria-label="Breadcrumb">${crumbs.map((b, i) =>
      (i ? icon('chevron-right') : '') + (b.href ? `<a href="${b.href}">${esc(b.label)}</a>` : `<span class="text-slate-700 font-medium">${esc(b.label)}</span>`)).join('')}</nav>` : '';
    return `<div class="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
      <div class="min-w-0">${c}<h1 class="page-title">${title}</h1>${subtitle ? `<p class="text-sm text-slate-500 mt-1">${subtitle}</p>` : ''}</div>
      ${actions ? `<div class="flex flex-wrap items-center gap-2 no-print">${actions}</div>` : ''}
    </div>`;
  }

  /* ---------- Stat card ---------- */
  function statCard({ label, value, icon: ic, tone = 'brand', trend = null, trendLabel = 'vs previous period', sub = '', href = '' }) {
    const tones = { brand: 'bg-brand-50 text-brand-600', ok: 'bg-emerald-50 text-emerald-700', warn: 'bg-amber-50 text-amber-700', bad: 'bg-red-50 text-red-700', navy: 'bg-slate-100 text-navy-800', teal: 'bg-teal-50 text-teal-700' };
    let t = '';
    if (trend !== null && isFinite(trend)) {
      const dir = trend > 0.05 ? 'up' : trend < -0.05 ? 'down' : 'flat';
      t = `<span class="trend ${dir}">${icon(dir === 'up' ? 'trending-up' : dir === 'down' ? 'trending-down' : 'minus')}${Math.abs(trend).toFixed(1)}%</span><span class="text-[11.5px] text-slate-500">${esc(trendLabel)}</span>`;
    }
    const tag = href ? 'a' : 'div';
    return `<${tag} ${href ? `href="${href}"` : ''} class="card stat-card ${href ? 'hover:border-brand-200 transition' : ''}">
      <div class="flex items-start justify-between gap-3"><span class="stat-label">${esc(label)}</span><span class="stat-icon ${tones[tone]}">${icon(ic)}</span></div>
      <div class="stat-value">${value}</div>
      <div class="flex items-center gap-2 flex-wrap min-h-[22px]">${t}${sub ? `<span class="text-[11.5px] text-slate-500">${sub}</span>` : ''}</div>
    </${tag}>`;
  }
  /** Percentage change; null when the previous value is 0 (no meaningful comparison). */
  const change = (cur, prev) => prev ? ((cur - prev) / Math.abs(prev)) * 100 : null;

  function emptyState(title, text = '', action = '', ic = 'inbox') {
    return `<div class="empty-state"><div class="empty-icon">${icon(ic)}</div><div class="font-semibold text-slate-700">${esc(title)}</div>${text ? `<p class="text-sm mt-1 max-w-sm mx-auto">${esc(text)}</p>` : ''}${action ? `<div class="mt-4">${action}</div>` : ''}</div>`;
  }

  /* ---------- Toasts ---------- */
  function toast(message, type = 'ok', opts = {}) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', type === 'err' ? 'alert' : 'status');
    el.innerHTML = `${icon(type === 'err' ? 'circle-x' : type === 'warn' ? 'triangle-alert' : type === 'info' ? 'info' : 'circle-check')}<div class="flex-1">${esc(message)}</div>${opts.action ? `<button class="toast-action">${esc(opts.action.label)}</button>` : ''}`;
    root.appendChild(el); icons(el);
    while (root.children.length > 3) root.firstElementChild.remove();
    if (opts.action) el.querySelector('.toast-action').onclick = () => { opts.action.onClick(); el.remove(); };
    setTimeout(() => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 260); }, opts.duration || 3800);
  }

  /* ---------- Modal ---------- */
  const openModals = [];
  function modal({ title, body = '', size = '', actions = [], onOpen, onClose, footer = true }) {
    const root = document.getElementById('modal-root');
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    const id = U.uid('m');
    back.innerHTML = `<div class="modal ${size ? 'modal-' + size : ''}" role="dialog" aria-modal="true" aria-labelledby="${id}">
      <div class="modal-head"><h2 class="modal-title" id="${id}">${title}</h2><button class="icon-btn" data-close aria-label="Close dialog">${icon('x')}</button></div>
      <div class="modal-body">${body}</div>
      ${footer && actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.variant ? 'btn-' + a.variant : 'btn-secondary'}" data-action="${i}" ${a.id ? `id="${a.id}"` : ''}>${a.icon ? icon(a.icon) : ''}${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`;
    const prevFocus = document.activeElement;
    root.appendChild(back);
    const api = {
      el: back.querySelector('.modal'),
      close() {
        back.remove(); openModals.splice(openModals.indexOf(api), 1);
        document.removeEventListener('keydown', onKey);
        if (onClose) onClose();
        if (prevFocus && prevFocus.focus) prevFocus.focus();
      }
    };
    openModals.push(api);
    const onKey = e => {
      if (openModals[openModals.length - 1] !== api) return;
      if (e.key === 'Escape') api.close();
      if (e.key === 'Tab') { // simple focus trap
        const f = U.$$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', api.el).filter(x => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', e => { if (e.target === back) api.close(); });
    back.querySelector('[data-close]').onclick = () => api.close();
    U.$$('[data-action]', back).forEach(b => b.onclick = () => actions[+b.dataset.action].onClick(api, b));
    icons(back);
    if (onOpen) onOpen(api);
    setTimeout(() => { const first = api.el.querySelector('.modal-body input:not([type=hidden]):not([readonly]), .modal-body select, .modal-body textarea'); (first || api.el.querySelector('[data-close]')).focus(); }, 30);
    return api;
  }

  /** Confirmation dialog → Promise<boolean>. */
  function confirm({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', danger = false, icon: ic }) {
    return new Promise(resolve => {
      let done = false;
      const m = modal({
        title, size: 'sm',
        body: `<div class="flex gap-3"><div class="w-10 h-10 rounded-full grid place-items-center shrink-0 ${danger ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-600'}">${icon(ic || (danger ? 'triangle-alert' : 'info'))}</div><div class="text-sm text-slate-600 leading-relaxed pt-1">${message}</div></div>`,
        actions: [
          { label: 'Cancel', onClick: mm => { done = true; resolve(false); mm.close(); } },
          { label: confirmLabel, variant: danger ? 'danger' : 'primary', onClick: mm => { done = true; resolve(true); mm.close(); } }
        ],
        onClose: () => { if (!done) resolve(false); }
      });
      return m;
    });
  }

  /** Explains a feature that is simulated or deferred to the Laravel build (no silent failures). */
  function notAvailable(feature, reason) {
    modal({ title: esc(feature), size: 'sm', body: `<div class="callout callout-info">${icon('info')}<div>${reason}</div></div>`, actions: [{ label: 'Got it', variant: 'primary', onClick: m => m.close() }] });
  }

  /* ---------- Form fields ---------- */
  function field({ id, label, type = 'text', value = '', required = false, options = null, placeholder = '', help = '', cls = '', attrs = '', rows = 3 }) {
    const v = esc(value ?? '');
    let input;
    if (type === 'select') {
      input = `<select id="${id}" name="${id}" class="form-select" ${required ? 'required' : ''} ${attrs}>${options.map(o => {
        const ov = typeof o === 'object' ? o.value : o; const ol = typeof o === 'object' ? o.label : o;
        return `<option value="${esc(ov)}" ${String(ov) === String(value ?? '') ? 'selected' : ''}>${esc(ol)}</option>`;
      }).join('')}</select>`;
    } else if (type === 'textarea') {
      input = `<textarea id="${id}" name="${id}" rows="${rows}" class="form-textarea" placeholder="${esc(placeholder)}" ${required ? 'required' : ''} ${attrs}>${v}</textarea>`;
    } else {
      input = `<input id="${id}" name="${id}" type="${type}" value="${v}" class="form-input" placeholder="${esc(placeholder)}" ${required ? 'required' : ''} ${attrs}>`;
    }
    return `<div class="${cls}"><label for="${id}" class="form-label">${esc(label)}${required ? '<span class="req" aria-hidden="true">*</span>' : ''}</label>${input}<div class="form-error hidden" id="${id}-error"></div>${help ? `<div class="form-help">${help}</div>` : ''}</div>`;
  }
  const val = (id, root = document) => { const el = root.querySelector('#' + id); return el ? el.value.trim() : ''; };
  function clearErrors(root) {
    U.$$('.is-invalid', root).forEach(el => el.classList.remove('is-invalid'));
    U.$$('.form-error', root).forEach(el => { el.classList.add('hidden'); el.textContent = ''; });
  }
  /** errors: { fieldId: message }. Returns true when valid. */
  function showErrors(root, errors) {
    clearErrors(root);
    const keys = Object.keys(errors);
    keys.forEach(k => {
      const el = root.querySelector('#' + k); const er = root.querySelector('#' + k + '-error');
      if (el) { el.classList.add('is-invalid'); el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', k + '-error'); }
      if (er) { er.textContent = errors[k]; er.classList.remove('hidden'); }
    });
    if (keys.length) { const first = root.querySelector('#' + keys[0]); if (first) first.focus(); }
    return keys.length === 0;
  }
  const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  const isPhone = s => /^[+\d][\d\s\-()]{6,}$/.test(s);
  const isTRN = s => /^\d{15}$/.test(s.replace(/\s/g, ''));

  /* ---------- Data table: sorting + pagination ---------- */
  /**
   * columns: [{ key, label, sortable=true, num=false, render(row) → html, value(row) → sortable value, cls }]
   * opts: { rows, pageSize=10, emptyTitle, emptyText, onRowClick(row), rowAttrs(row), sort: {key, dir}, footer(rows) → html }
   */
  function dataTable(container, columns, opts = {}) {
    const state = { rows: opts.rows || [], page: 1, pageSize: opts.pageSize || 10, sort: opts.sort || null };
    function sorted() {
      if (!state.sort) return state.rows;
      const col = columns.find(c => c.key === state.sort.key); if (!col) return state.rows;
      const get = col.value || (r => r[col.key]);
      return U.sortBy(state.rows, get, state.sort.dir);
    }
    function render() {
      const rows = sorted();
      const pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
      state.page = Math.min(state.page, pages);
      const start = (state.page - 1) * state.pageSize;
      const pageRows = rows.slice(start, start + state.pageSize);
      const head = columns.map(c => {
        const sortable = c.sortable !== false && c.label;
        const sortedCls = state.sort && state.sort.key === c.key ? 'sorted' : '';
        const ind = sortable ? `<span class="sort-ind">${sortedCls ? (state.sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>` : '';
        return `<th class="${c.num ? 'num' : ''} ${sortable ? 'sortable' : ''} ${sortedCls} ${c.thCls || ''}" ${sortable ? `data-sort="${c.key}" tabindex="0" aria-sort="${sortedCls ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"` : ''}>${esc(c.label || '')}${ind}</th>`;
      }).join('');
      const body = pageRows.map((r, i) => `<tr class="${opts.onRowClick ? 'clickable' : ''}" data-idx="${start + i}" ${opts.rowAttrs ? opts.rowAttrs(r) : ''}>${columns.map(c => `<td class="${c.num ? 'num' : ''} ${c.cls || ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('');
      const pager = rows.length > state.pageSize ? pagerHtml(state.page, pages, rows.length, start, pageRows.length) :
        (rows.length ? `<div class="pager"><span>${rows.length} record${rows.length === 1 ? '' : 's'}</span></div>` : '');
      container.innerHTML = rows.length
        ? `<div class="table-wrap"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${opts.footer ? `<tfoot>${opts.footer(rows)}</tfoot>` : ''}</table></div>${pager}`
        : emptyState(opts.emptyTitle || 'No records found', opts.emptyText || 'Try adjusting your search or filters.', opts.emptyAction || '');
      U.$$('th[data-sort]', container).forEach(th => {
        const go = () => {
          const k = th.dataset.sort;
          state.sort = state.sort && state.sort.key === k ? { key: k, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' };
          render();
        };
        th.onclick = go; th.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
      });
      U.$$('[data-page]', container).forEach(b => b.onclick = () => { state.page = +b.dataset.page; render(); });
      if (opts.onRowClick) U.$$('tbody tr', container).forEach(tr => tr.addEventListener('click', e => {
        if (e.target.closest('a, button, input, select, label')) return;
        opts.onRowClick(rows[+tr.dataset.idx]);
      }));
      if (opts.afterRender) opts.afterRender(container, pageRows);
      icons(container);
    }
    function pagerHtml(page, pages, total, start, n) {
      const btns = [];
      const add = p => btns.push(`<button class="pager-btn ${p === page ? 'active' : ''}" data-page="${p}" aria-label="Page ${p}">${p}</button>`);
      for (let p = 1; p <= pages; p++) {
        if (p === 1 || p === pages || Math.abs(p - page) <= 1) add(p);
        else if (btns[btns.length - 1] !== '…') btns.push('…');
      }
      return `<div class="pager"><span>Showing ${start + 1}–${start + n} of ${total}</span><div class="flex items-center gap-1">
        <button class="pager-btn" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>${btns.map(b => b === '…' ? '<span class="px-1">…</span>' : b).join('')}<button class="pager-btn" data-page="${page + 1}" ${page === pages ? 'disabled' : ''} aria-label="Next page">›</button></div></div>`;
    }
    render();
    return { setRows(rows) { state.rows = rows; state.page = 1; render(); }, render, get rows() { return sorted(); } };
  }

  /* ---------- Filter bar helpers ---------- */
  function searchInput(id, placeholder = 'Search…', value = '') {
    return `<div class="relative flex-1 min-w-[200px]">${icon('search', 'absolute left-3 top-1/2 -translate-y-1/2 !w-4 !h-4 text-slate-400 pointer-events-none')}<input id="${id}" type="search" class="form-input pl-9" placeholder="${esc(placeholder)}" value="${esc(value)}" aria-label="${esc(placeholder)}"></div>`;
  }
  function selectInput(id, options, value = '', label = '') {
    return `<select id="${id}" class="form-select w-auto min-w-[150px]" aria-label="${esc(label || id)}">${options.map(o => {
      const ov = typeof o === 'object' ? o.value : o; const ol = typeof o === 'object' ? o.label : o;
      return `<option value="${esc(ov)}" ${String(ov) === String(value) ? 'selected' : ''}>${esc(ol)}</option>`;
    }).join('')}</select>`;
  }
  const PRESETS = [
    { value: 'this-month', label: 'This month' }, { value: 'last-month', label: 'Last month' }, { value: 'last-3', label: 'Last 3 months' },
    { value: 'last-6', label: 'Last 6 months' }, { value: 'last-12', label: 'Last 12 months' }, { value: 'this-year', label: 'This year' },
    { value: 'last-year', label: 'Last year' }, { value: 'all', label: 'All time' }, { value: 'custom', label: 'Custom range' }
  ];
  /** Date range selector: preset select + from/to inputs. Calls onChange({from,to,preset}). */
  function dateRange(container, { preset = 'last-6', from, to, onChange, idPrefix = 'dr' }) {
    let r = from && to ? { from, to } : U.rangePreset(preset);
    container.innerHTML = `<div class="flex flex-wrap items-center gap-2">
      ${selectInput(idPrefix + '-preset', PRESETS, from && to ? 'custom' : preset, 'Date range')}
      <input type="date" id="${idPrefix}-from" class="form-input w-[150px]" value="${r.from}" aria-label="From date">
      <span class="text-slate-400 text-sm">to</span>
      <input type="date" id="${idPrefix}-to" class="form-input w-[150px]" value="${r.to}" aria-label="To date">
    </div>`;
    const sel = container.querySelector(`#${idPrefix}-preset`), f = container.querySelector(`#${idPrefix}-from`), t = container.querySelector(`#${idPrefix}-to`);
    const emit = () => onChange && onChange({ from: f.value, to: t.value, preset: sel.value });
    sel.onchange = () => { if (sel.value !== 'custom') { const p = U.rangePreset(sel.value); f.value = p.from; t.value = p.to; } emit(); };
    [f, t].forEach(el => el.onchange = () => {
      if (f.value && t.value && f.value > t.value) { toast('The start date must be on or before the end date.', 'err'); return; }
      sel.value = 'custom'; emit();
    });
    return { get: () => ({ from: f.value, to: t.value }) };
  }

  /* ---------- Dropdown menu (row "more" actions etc.) ---------- */
  function dropdown(trigger, items) {
    closeDropdowns();
    const panel = document.createElement('div');
    panel.className = 'dropdown-panel fixed py-1.5 w-56 nb-dropdown';
    panel.innerHTML = items.map((it, i) => it === '-' ? '<div class="menu-sep"></div>' :
      `<button class="menu-item ${it.danger ? '!text-red-600' : ''}" data-i="${i}" ${it.disabled ? 'disabled style="opacity:.45;cursor:not-allowed"' : ''}>${icon(it.icon || 'dot')}<span>${esc(it.label)}</span></button>`).join('');
    document.body.appendChild(panel);
    const r = trigger.getBoundingClientRect();
    const w = 224; let left = Math.min(r.right - w, window.innerWidth - w - 8); left = Math.max(8, left);
    let top = r.bottom + 6; if (top + panel.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - panel.offsetHeight - 6);
    panel.style.left = left + 'px'; panel.style.top = top + 'px';
    U.$$('[data-i]', panel).forEach(b => b.onclick = e => { e.stopPropagation(); const it = items[+b.dataset.i]; if (it.disabled) return; closeDropdowns(); it.onClick(); });
    icons(panel);
    setTimeout(() => document.addEventListener('click', closeDropdowns, { once: true }), 0);
  }
  const closeDropdowns = () => U.$$('.nb-dropdown').forEach(p => p.remove());
  window.addEventListener('scroll', closeDropdowns, true);
  window.addEventListener('resize', closeDropdowns);

  /* ---------- Customer select options ---------- */
  function customerOptions(selected, { includeInactive = false, placeholder = 'Select a customer…' } = {}) {
    const list = U.sortBy(NB.data.db.customers.filter(c => includeInactive || c.status === 'Active' || c.id === selected), c => NB.data.customerName(c));
    return `<option value="">${esc(placeholder)}</option>` + list.map(c => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(NB.data.customerName(c))} · ${c.id}</option>`).join('');
  }

  /* ---------- Chart helpers ---------- */
  const charts = [];
  const PALETTE = { navy: '#16284d', blue: '#2856e0', sky: '#7aa2f7', green: '#138a52', orange: '#e08a1e', red: '#c42b2b', grey: '#94a0b8', teal: '#0d8b8b', purple: '#6b3fd1' };
  const SERIES = ['#2856e0', '#16284d', '#0d8b8b', '#e08a1e', '#6b3fd1', '#7aa2f7', '#138a52', '#c42b2b', '#94a0b8', '#b65fa4'];
  function chart(canvas, config) {
    if (!window.Chart || !canvas) return null;
    const c = new Chart(canvas, config);
    charts.push(c);
    return c;
  }
  function destroyCharts() { while (charts.length) { try { charts.pop().destroy(); } catch (e) { /* ignore */ } } }
  if (window.Chart) {
    Chart.defaults.font.family = 'Inter, ui-sans-serif, system-ui, sans-serif';
    Chart.defaults.font.size = 11.5;
    Chart.defaults.color = '#5d6985';
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.boxHeight = 10;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.tooltip.backgroundColor = '#0f1d3a';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.maintainAspectRatio = false;
  }
  const moneyTicks = { callback: v => U.compactMoney(v).replace(U.currency() + ' ', '') };
  const moneyTooltip = { callbacks: { label: ctx => `${ctx.dataset.label || ctx.label}: ${U.money(ctx.parsed.y ?? ctx.parsed.x ?? ctx.parsed)}` } };
  const gridColor = '#edf0f5';

  return {
    icons, icon, badge, pageHeader, statCard, change, emptyState, toast, modal, confirm, notAvailable,
    field, val, clearErrors, showErrors, isEmail, isPhone, isTRN, dataTable, searchInput, selectInput, dateRange, PRESETS,
    dropdown, closeDropdowns, customerOptions, chart, destroyCharts, PALETTE, SERIES, moneyTicks, moneyTooltip, gridColor
  };
})();
