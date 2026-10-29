/* =====================================================================
   dashboard.js – financial overview. Every figure is computed from the
   records via NB.calc (nothing is hardcoded).
   Laravel: DashboardController@index + App\Services\DashboardMetrics.
   ===================================================================== */
window.NB = window.NB || {};

(() => {
  const U = NB.utils; const ui = NB.ui; const C = NB.calc; const { esc } = U;
  let period = 'last-3';
  try { period = localStorage.getItem('nb_dash_period') || period; } catch (e) { /* ignore */ }

  const PERIODS = [
    { value: 'this-month', label: 'This month' }, { value: 'last-3', label: 'Last 3 months' }, { value: 'last-6', label: 'Last 6 months' },
    { value: 'this-year', label: 'This year' }, { value: 'last-12', label: 'Last 12 months' }
  ];

  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

  function render() {
    const T = U.today();
    const range = U.rangePreset(period);
    const effRange = { from: range.from, to: range.to > T ? T : range.to };
    const prev = U.previousRange(effRange);
    const cur = C.salesSummary(effRange), was = C.salesSummary(prev);
    const ag = C.aging(T), agPrev = C.aging(prev.to);
    const overdueNow = ag.invoices.filter(x => x.bucket !== 'current');
    const overduePrev = agPrev.invoices.filter(x => x.bucket !== 'current');
    const customers = NB.data.db.customers;
    const newCust = customers.filter(c => U.inRange(c.createdAt.slice(0, 10), effRange)).length;
    const newCustPrev = customers.filter(c => U.inRange(c.createdAt.slice(0, 10), prev)).length;
    const periodLabel = PERIODS.find(p => p.value === period).label.toLowerCase();

    const quick = [
      ['Create quotation', 'file-text', 'quotations/new'], ['Create invoice', 'receipt', 'invoices/new'],
      ['Record payment', 'hand-coins', '@pay'], ['Add customer', 'user-plus', '@cust'], ['View reports', 'chart-column', 'reports/sales']
    ];

    const v = NB.view.render(`
      ${ui.pageHeader({
        title: `${greeting()}, Sara`,
        subtitle: `${U.fmtDateLong(T)} · Financial overview for ${esc(NB.data.db.company.tradingName)} · comparing ${esc(periodLabel)} with the previous period`,
        actions: `<label for="dash-period" class="text-sm text-slate-500 hidden sm:block">Period</label>${ui.selectInput('dash-period', PERIODS, period, 'Dashboard period')}`
      })}
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        ${quick.map(([l, ic, h], i) => `<button class="card flex items-center gap-3 px-4 py-3 text-left hover:border-brand-200 hover:shadow-pop transition group ${i === 4 ? 'col-span-2 sm:col-span-1' : ''}" data-quick="${h}">
          <span class="w-9 h-9 rounded-lg grid place-items-center ${i === 0 ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600'} group-hover:scale-105 transition">${ui.icon(ic)}</span>
          <span class="text-[13.5px] font-semibold text-slate-800">${l}</span></button>`).join('')}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4 mb-6">
        ${ui.statCard({ label: 'Total revenue (excl. VAT)', value: U.money(cur.revenue), icon: 'trending-up', tone: 'brand', trend: ui.change(cur.revenue, was.revenue), sub: '', href: '#/reports/revenue' })}
        ${ui.statCard({ label: 'Total invoiced (incl. VAT)', value: U.money(cur.gross), icon: 'receipt', tone: 'navy', trend: ui.change(cur.gross, was.gross), href: '#/reports/sales' })}
        ${ui.statCard({ label: 'Payments received', value: U.money(cur.collected), icon: 'hand-coins', tone: 'ok', trend: ui.change(cur.collected, was.collected), href: '#/reports/payments' })}
        ${ui.statCard({ label: 'Outstanding receivables', value: U.money(ag.total), icon: 'clock', tone: 'warn', trend: ui.change(ag.total, agPrev.total), trendLabel: `vs ${U.fmtDate(prev.to)}`, href: '#/reports/receivables' })}
        ${ui.statCard({ label: 'Overdue invoices', value: `${overdueNow.length} <span class="text-sm font-semibold text-slate-500">· ${U.money(U.sum(overdueNow, x => x.info.balance))}</span>`, icon: 'triangle-alert', tone: 'bad', trend: ui.change(overdueNow.length, overduePrev.length), trendLabel: `vs ${U.fmtDate(prev.to)}`, href: '#/invoices?status=Overdue' })}
        ${ui.statCard({ label: 'Total customers', value: `${customers.filter(c => c.status === 'Active').length}`, icon: 'users', tone: 'teal', sub: `${newCust} new in period${newCustPrev || newCust ? ` (prev. ${newCustPrev})` : ''}`, href: '#/customers' })}
      </div>
      <div class="callout callout-info mb-6 text-[12px]">${ui.icon('info')}<div><b>How these figures are measured.</b> Revenue is the taxable value of issued invoices less credit notes (accrual, excluding VAT). Invoiced includes VAT. Payments are cash actually received. Outstanding and overdue balances are as at today. Drafts and cancelled invoices are excluded.</div></div>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <div class="card xl:col-span-2"><div class="card-head"><div><div class="card-title">Monthly revenue</div><div class="card-sub">Revenue excl. VAT (accrual) vs cash collected</div></div><a href="#/reports/revenue" class="btn btn-ghost btn-sm">Details ${ui.icon('chevron-right')}</a></div><div class="card-body"><div class="chart-box"><canvas id="ch-rev" aria-label="Monthly revenue chart" role="img"></canvas></div></div></div>
        <div class="card"><div class="card-head"><div><div class="card-title">Invoice status</div><div class="card-sub">Invoices dated in the period</div></div></div><div class="card-body"><div class="chart-box"><canvas id="ch-status" aria-label="Invoice status distribution" role="img"></canvas></div></div></div>
      </div>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <div class="card xl:col-span-2"><div class="card-head"><div><div class="card-title">Invoiced vs collected</div><div class="card-sub">Per month, incl. VAT</div></div></div><div class="card-body"><div class="chart-box"><canvas id="ch-ivc" aria-label="Invoiced versus collected chart" role="img"></canvas></div></div></div>
        <div class="card"><div class="card-head"><div><div class="card-title">Top customers by revenue</div><div class="card-sub">Excl. VAT, in the period</div></div></div><div class="card-body"><div class="chart-box"><canvas id="ch-top" aria-label="Top customers chart" role="img"></canvas></div></div></div>
      </div>
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div class="card"><div class="card-head"><div class="card-title">Recent activity</div><span class="card-sub">Latest records</span></div><div id="dash-activity" class="divide-y divide-slate-100"></div></div>
        <div class="card"><div class="card-head"><div><div class="card-title">Receivables ageing</div><div class="card-sub">As at ${U.fmtDate(T)} · ${ag.count} open invoices</div></div><a href="#/reports/receivables" class="btn btn-ghost btn-sm">Report ${ui.icon('chevron-right')}</a></div>
          <div class="card-body space-y-3" id="dash-aging"></div>
          <div class="border-t border-slate-100"><div class="px-[18px] pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Most overdue</div><div id="dash-overdue"></div></div>
        </div>
      </div>`);

    v.querySelector('#dash-period').onchange = e => { period = e.target.value; try { localStorage.setItem('nb_dash_period', period); } catch (er) { /* ignore */ } render(); };
    U.$$('[data-quick]', v).forEach(b => b.onclick = () => {
      const h = b.dataset.quick;
      if (h === '@pay') NB.payments.openRecord(); else if (h === '@cust') NB.customers.openForm(); else NB.go(h);
    });

    /* Charts */
    const series = C.monthlySeries(effRange);
    const labels = series.map(s => U.monthLabel(s.month));
    ui.chart(v.querySelector('#ch-rev'), {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Revenue (excl. VAT)', data: series.map(s => s.revenue), borderColor: ui.PALETTE.blue, backgroundColor: 'rgba(40,86,224,.10)', fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: '#fff', borderWidth: 2.5 },
        { label: 'Collected', data: series.map(s => s.collected), borderColor: ui.PALETTE.green, borderDash: [5, 4], tension: .35, pointRadius: 2, borderWidth: 2, fill: false }
      ] },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { tooltip: ui.moneyTooltip }, scales: { y: { beginAtZero: true, ticks: ui.moneyTicks, grid: { color: ui.gridColor } }, x: { grid: { display: false } } } }
    });
    ui.chart(v.querySelector('#ch-ivc'), {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Invoiced', data: series.map(s => s.invoiced), backgroundColor: ui.PALETTE.navy, borderRadius: 5, maxBarThickness: 26 },
        { label: 'Collected', data: series.map(s => s.collected), backgroundColor: ui.PALETTE.sky, borderRadius: 5, maxBarThickness: 26 }
      ] },
      options: { plugins: { tooltip: ui.moneyTooltip }, scales: { y: { beginAtZero: true, ticks: ui.moneyTicks, grid: { color: ui.gridColor } }, x: { grid: { display: false } } } }
    });
    const statuses = ['Paid', 'Partially Paid', 'Sent', 'Overdue', 'Draft', 'Cancelled'];
    const colors = { 'Paid': ui.PALETTE.green, 'Partially Paid': ui.PALETTE.orange, 'Sent': ui.PALETTE.blue, 'Overdue': ui.PALETTE.red, 'Draft': '#b8c1d3', 'Cancelled': '#5d6985' };
    const counts = Object.fromEntries(statuses.map(s => [s, 0]));
    NB.data.db.invoices.filter(i => U.inRange(i.date, effRange)).forEach(i => { counts[C.invoiceInfo(i).status]++; });
    const used = statuses.filter(s => counts[s]);
    ui.chart(v.querySelector('#ch-status'), {
      type: 'doughnut',
      data: { labels: used, datasets: [{ data: used.map(s => counts[s]), backgroundColor: used.map(s => colors[s]), borderWidth: 2, borderColor: '#fff' }] },
      options: { cutout: '64%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.label}: ${c.parsed} invoice${c.parsed === 1 ? '' : 's'}` } } } }
    });
    const byCust = {};
    C.issuedInvoices(effRange).forEach(i => { byCust[i.customerId] = (byCust[i.customerId] || 0) + C.totals(i.items).taxable; });
    C.creditNotesIn(effRange).forEach(c => { byCust[c.customerId] = (byCust[c.customerId] || 0) - C.totals(c.items).taxable; });
    const top = Object.entries(byCust).sort((a, b) => b[1] - a[1]).slice(0, 6);
    ui.chart(v.querySelector('#ch-top'), {
      type: 'bar',
      data: { labels: top.map(([id]) => { const n = NB.data.customerName(id); return n.length > 22 ? n.slice(0, 21) + '…' : n; }), datasets: [{ label: 'Revenue', data: top.map(t => U.round2(t[1])), backgroundColor: ui.SERIES.slice(0, 6), borderRadius: 5, maxBarThickness: 22 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => U.money(c.parsed.x) } } }, scales: { x: { beginAtZero: true, ticks: ui.moneyTicks, grid: { color: ui.gridColor } }, y: { grid: { display: false } } } }
    });

    /* Activity */
    const act = [];
    NB.data.db.invoices.forEach(i => act.push({ at: i.createdAt, icon: 'receipt', tone: 'bg-navy-800 text-white', text: `Invoice <b>${esc(i.number)}</b> ${i.status === 'Draft' ? 'drafted' : 'created'} for ${esc(NB.data.customerName(i.customerId))}`, amt: C.totals(i.items).total, href: `#/invoices/view/${i.id}` }));
    NB.data.db.payments.forEach(p => act.push({ at: p.createdAt, icon: 'hand-coins', tone: 'bg-emerald-50 text-emerald-700', text: `Payment <b>${esc(p.receiptNumber)}</b> received from ${esc(NB.data.customerName(p.customerId))} · ${esc(p.method)}`, amt: p.amount, href: `#/receipts/view/${p.id}` }));
    NB.data.db.quotations.forEach(q => act.push({ at: q.createdAt, icon: 'file-text', tone: 'bg-brand-50 text-brand-600', text: `Quotation <b>${esc(q.number)}</b> ${q.status === 'Draft' ? 'drafted' : 'issued'} for ${esc(NB.data.customerName(q.customerId))}`, amt: C.totals(q.items).total, href: `#/quotations/view/${q.id}` }));
    NB.data.db.customers.forEach(c => act.push({ at: c.createdAt, icon: 'user-plus', tone: 'bg-teal-50 text-teal-700', text: `Customer <b>${esc(NB.data.customerName(c))}</b> added`, href: `#/customers/view/${c.id}` }));
    NB.data.db.creditNotes.forEach(c => act.push({ at: c.createdAt, icon: 'file-minus', tone: 'bg-amber-50 text-amber-700', text: `Credit note <b>${esc(c.number)}</b> issued to ${esc(NB.data.customerName(c.customerId))}`, amt: C.totals(c.items).total, href: `#/credit-notes/view/${c.id}` }));
    act.sort((a, b) => b.at.localeCompare(a.at));
    v.querySelector('#dash-activity').innerHTML = act.slice(0, 9).map(a => `<a href="${a.href}" class="flex items-center gap-3 px-[18px] py-3 hover:bg-slate-50">
      <span class="w-8 h-8 rounded-lg grid place-items-center shrink-0 ${a.tone}">${ui.icon(a.icon, '!w-4 !h-4')}</span>
      <span class="flex-1 min-w-0 text-[13px] text-slate-700 leading-snug">${a.text}<span class="block text-xs text-slate-400 mt-0.5">${U.relTime(a.at.slice(0, 10))}</span></span>
      ${a.amt !== undefined ? `<span class="text-[13px] font-semibold tabular text-slate-800 whitespace-nowrap">${U.money(a.amt)}</span>` : ''}</a>`).join('');

    /* Ageing bars */
    const max = Math.max(1, ...Object.values(ag.buckets));
    const tone = { current: 'bg-brand-500', d1_30: 'bg-amber-400', d31_60: 'bg-orange-500', d61_90: 'bg-red-500', d90p: 'bg-red-700' };
    v.querySelector('#dash-aging').innerHTML = C.AGING_BUCKETS.map(b => `<div class="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-[13px]">
      <span class="text-slate-600">${b.label}</span><span class="h-2.5 rounded-full bg-slate-100 overflow-hidden"><span class="block h-full rounded-full ${tone[b.key]}" style="width:${(ag.buckets[b.key] / max) * 100}%"></span></span>
      <span class="tabular font-semibold text-slate-800 text-right min-w-[110px]">${U.money(ag.buckets[b.key])}</span></div>`).join('') +
      `<div class="flex justify-between pt-2 border-t border-slate-100 text-sm"><span class="font-semibold">Total outstanding</span><span class="tabular font-extrabold font-display">${U.money(ag.total)}</span></div>`;
    const od = overdueNow.sort((a, b) => b.info.daysOverdue - a.info.daysOverdue).slice(0, 4);
    v.querySelector('#dash-overdue').innerHTML = od.length ? od.map(o => `<a href="#/invoices/view/${o.inv.id}" class="flex items-center justify-between gap-3 px-[18px] py-2.5 hover:bg-slate-50 text-[13px]">
      <span class="min-w-0"><b class="text-slate-800">${esc(o.inv.number)}</b> <span class="text-slate-500">· ${esc(NB.data.customerName(o.inv.customerId))}</span></span>
      <span class="flex items-center gap-2 shrink-0"><span class="badge badge-bad">${o.info.daysOverdue}d</span><span class="tabular font-semibold">${U.money(o.info.balance)}</span></span></a>`).join('')
      : `<div class="px-[18px] py-4 text-sm text-slate-500">No overdue invoices.</div>`;
    ui.icons(v);
  }

  NB.route('dashboard', render);
})();
