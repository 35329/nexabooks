/* =====================================================================
   statements.js – customer statements of account.
   Opening balance rule (see NB.calc.ledger): all issued invoices dated
   before the start date, minus payments and credit notes dated before the
   start date. Drafts and cancelled invoices are excluded. Transactions are
   placed on their own document dates and listed chronologically.
   Laravel: StatementController + CustomerLedgerService; statement PDF via
   the shared document Blade template; optional monthly e-mail job.
   ===================================================================== */
window.NB = window.NB || {};

(() => {
  const U = NB.utils; const ui = NB.ui; const C = NB.calc; const { esc } = U;
  const D = () => NB.data.db;
  const PRESETS = [{ value: 'this-month', label: 'This month' }, { value: 'last-month', label: 'Last month' }, { value: 'last-3', label: 'Last 3 months' }, { value: 'last-6', label: 'Last 6 months' }, { value: 'this-year', label: 'This year' }, { value: 'last-12', label: 'Last 12 months' }, { value: 'custom', label: 'Custom' }];

  function render(params, query) {
    const T = U.today();
    const def = U.rangePreset('last-6');
    const s = { customerId: query.customer || '', from: query.from || def.from, to: query.to || (def.to > T ? T : def.to), statementDate: T, preset: query.from ? 'custom' : 'last-6' };
    const v = NB.view.render(`
      ${ui.pageHeader({ title: 'Customer Statements', crumbs: [{ label: 'Customers' }, { label: 'Statements of account' }], subtitle: 'Generate a statement of account from recorded invoices, payments and credit notes.' })}
      <div class="card mb-4 no-print"><div class="card-body grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_170px_150px_150px_150px_auto] gap-3 items-end">
        <div><label class="form-label" for="st-cust">Customer<span class="req">*</span></label><select id="st-cust" class="form-select">${ui.customerOptions(s.customerId, { includeInactive: true })}</select></div>
        <div><label class="form-label" for="st-preset">Period</label>${ui.selectInput('st-preset', PRESETS, s.preset, 'Period').replace('w-auto min-w-[150px]', 'w-full')}</div>
        <div><label class="form-label" for="st-from">Start date</label><input type="date" id="st-from" class="form-input" value="${s.from}"></div>
        <div><label class="form-label" for="st-to">End date</label><input type="date" id="st-to" class="form-input" value="${s.to}"></div>
        <div><label class="form-label" for="st-date">Statement date</label><input type="date" id="st-date" class="form-input" value="${s.statementDate}"></div>
        <button class="btn btn-primary" id="st-go">${ui.icon('refresh-cw')}Generate</button>
      </div></div>
      <div id="st-out"></div>`);
    const out = v.querySelector('#st-out');
    const els = { cust: v.querySelector('#st-cust'), preset: v.querySelector('#st-preset'), from: v.querySelector('#st-from'), to: v.querySelector('#st-to'), date: v.querySelector('#st-date') };
    els.preset.onchange = () => { if (els.preset.value !== 'custom') { const r = U.rangePreset(els.preset.value); els.from.value = r.from; els.to.value = r.to > T ? T : r.to; } generate(); };
    [els.from, els.to].forEach(e => e.onchange = () => { els.preset.value = 'custom'; });
    els.cust.onchange = generate;
    v.querySelector('#st-go').onclick = generate;

    function picker() {
      const rows = D().customers.map(c => ({ c, s: C.customerSummary(c.id) })).filter(x => x.s.invoiceCount).sort((a, b) => b.s.outstanding - a.s.outstanding);
      out.innerHTML = `<div class="card"><div class="card-head"><div><div class="card-title">Select a customer</div><div class="card-sub">Customers with billing history, highest balance first</div></div></div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Customer</th><th class="num">Invoiced</th><th class="num">Paid</th><th class="num">Outstanding</th><th class="num">Overdue</th><th></th></tr></thead><tbody>
        ${rows.map(x => `<tr class="clickable" data-c="${x.c.id}"><td><b>${esc(NB.data.customerName(x.c))}</b><div class="text-xs text-slate-500">${x.c.id}</div></td><td class="num">${U.money(x.s.invoiced)}</td><td class="num">${U.money(x.s.paid)}</td><td class="num font-semibold">${U.money(x.s.outstanding)}</td><td class="num ${x.s.overdue ? 'text-red-600' : ''}">${U.money(x.s.overdue)}</td><td class="text-right"><button class="btn btn-secondary btn-xs" data-c="${x.c.id}">Statement</button></td></tr>`).join('')}
        </tbody></table></div></div>`;
      U.$$('[data-c]', out).forEach(el => el.onclick = e => { e.stopPropagation(); els.cust.value = el.dataset.c; generate(); });
      ui.icons(out);
    }

    function generate() {
      const p = { customerId: els.cust.value, from: els.from.value, to: els.to.value, statementDate: els.date.value || T };
      if (!p.customerId) return picker();
      if (!p.from || !p.to) return ui.toast('Choose a start and end date.', 'err');
      if (p.from > p.to) return ui.toast('The start date must be on or before the end date.', 'err');
      history.replaceState(null, '', `#/statements?customer=${p.customerId}&from=${p.from}&to=${p.to}`);
      const L = C.ledger(p.customerId, p.from, p.to);
      const cust = NB.data.customer(p.customerId);
      const name = NB.data.customerName(cust);
      out.innerHTML = `
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div><h2 class="font-display font-extrabold text-lg text-slate-900">${esc(name)}</h2><div class="text-sm text-slate-500">${U.fmtDate(p.from)} – ${U.fmtDate(p.to)} · statement dated ${U.fmtDate(p.statementDate)}</div></div>
          <div class="flex flex-wrap gap-2"><a class="btn btn-secondary" href="#/customers/view/${p.customerId}">${ui.icon('user')}View customer</a><button class="btn btn-secondary" id="st-prev">${ui.icon('eye')}Preview document</button><button class="btn btn-secondary" id="st-pdf">${ui.icon('download')}Export PDF</button><button class="btn btn-primary" id="st-print">${ui.icon('printer')}Print statement</button></div>
        </div>
        <div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          ${ui.statCard({ label: 'Opening balance', value: U.money(L.opening), icon: 'book-open', tone: 'navy', sub: `as at ${U.fmtDate(U.addDays(p.from, -1))}` })}
          ${ui.statCard({ label: 'Invoiced in period', value: U.money(L.debits), icon: 'receipt', tone: 'brand', sub: `${L.rows.filter(r => r.type === 'invoice').length} invoices` })}
          ${ui.statCard({ label: 'Payments & credits', value: U.money(L.credits), icon: 'hand-coins', tone: 'ok', sub: `${U.money(L.payments)} paid${L.creditNotes ? ` · ${U.money(L.creditNotes)} credited` : ''}` })}
          ${ui.statCard({ label: 'Closing balance', value: U.money(L.closing), icon: 'scale', tone: L.closing > 0 ? 'warn' : 'ok', sub: `as at ${U.fmtDate(p.to)}` })}
        </div>
        <div class="callout callout-info mb-4 text-[12px]">${ui.icon('info')}<div><b>How this statement is calculated.</b> Opening balance = issued invoices dated before ${U.fmtDate(p.from)}, less payments and credit notes dated before that day. Closing balance = opening + invoices − payments − credit notes in the period. Drafts and cancelled invoices are excluded. ${Math.abs(L.closing - L.aging.total) < 0.01 ? 'The closing balance reconciles to the open invoice balances below.' : `<b class="text-red-700">Check: closing balance differs from open invoices by ${U.money(L.closing - L.aging.total)}.</b>`}</div></div>
        <div class="card mb-4"><div class="card-head"><div class="card-title">Account ledger</div><span class="card-sub">${L.rows.length} transactions</span></div>
          <div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Reference</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody>
            <tr class="bg-slate-50"><td>${U.fmtDate(p.from)}</td><td></td><td class="font-semibold">Opening balance</td><td></td><td></td><td class="num font-semibold">${U.money(L.opening)}</td></tr>
            ${L.rows.map(r => `<tr><td class="whitespace-nowrap">${U.fmtDate(r.date)}</td><td><a class="link" href="${r.type === 'invoice' ? `#/invoices/view/${r.id}` : r.type === 'payment' ? `#/receipts/view/${r.id}` : `#/credit-notes/view/${r.id}`}">${esc(r.ref)}</a></td><td class="text-slate-600">${esc(r.desc)}</td><td class="num">${r.debit ? U.num(r.debit) : ''}</td><td class="num text-emerald-700">${r.credit ? U.num(r.credit) : ''}</td><td class="num font-medium">${U.num(r.balance)}</td></tr>`).join('')}
            ${L.rows.length ? '' : '<tr><td colspan="6" class="text-center text-slate-500 py-6">No transactions in this period.</td></tr>'}
          </tbody><tfoot><tr><td colspan="3">Closing balance (${U.currency()})</td><td class="num">${U.num(L.debits)}</td><td class="num">${U.num(L.credits)}</td><td class="num">${U.num(L.closing)}</td></tr></tfoot></table></div></div>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div class="card"><div class="card-head"><div class="card-title">Ageing as at ${U.fmtDate(p.to)}</div></div><div class="card-body grid grid-cols-2 sm:grid-cols-3 gap-3">
            ${C.AGING_BUCKETS.map(b => `<div class="rounded-lg border border-slate-100 p-3"><div class="text-xs text-slate-500">${b.label}</div><div class="tabular font-semibold mt-0.5 ${b.key !== 'current' && L.aging.buckets[b.key] ? 'text-red-600' : ''}">${U.money(L.aging.buckets[b.key])}</div></div>`).join('')}
            <div class="rounded-lg bg-navy-900 text-white p-3"><div class="text-xs text-slate-300">Total due</div><div class="tabular font-extrabold mt-0.5">${U.money(L.aging.total)}</div></div></div></div>
          <div class="card"><div class="card-head"><div class="card-title">Outstanding invoices</div><span class="card-sub">${L.outstanding.length}</span></div>
            ${L.outstanding.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Invoice</th><th>Due</th><th class="num">Balance</th><th class="num">Overdue</th></tr></thead><tbody>${L.outstanding.map(o => `<tr><td><a class="link" href="#/invoices/view/${o.inv.id}">${esc(o.inv.number)}</a></td><td>${U.fmtDate(o.inv.dueDate)}</td><td class="num">${U.money(o.info.balance)}</td><td class="num ${o.info.daysOverdue ? 'text-red-600' : ''}">${o.info.daysOverdue ? o.info.daysOverdue + ' days' : 'Not due'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="p-4 text-sm text-slate-500">No outstanding invoices at the end of the period.</div>'}
          </div>
        </div>`;
      ui.icons(out);
      const html = () => NB.docs.statement(p);
      const title = `Statement ${name} ${p.from} to ${p.to}`;
      out.querySelector('#st-print').onclick = () => NB.docs.print(html(), title);
      out.querySelector('#st-pdf').onclick = e => NB.docs.exportPdf(html(), U.slug(title) + '.pdf', e.currentTarget);
      out.querySelector('#st-prev').onclick = () => ui.modal({ title: 'Statement of account', size: 'xl', body: '<div id="pv"></div>', onOpen: m => NB.docs.mountPreview(m.el.querySelector('#pv'), html()),
        actions: [{ label: 'Export PDF', icon: 'download', onClick: (m, b) => NB.docs.exportPdf(html(), U.slug(title) + '.pdf', b) }, { label: 'Print', icon: 'printer', variant: 'primary', onClick: () => NB.docs.print(html(), title) }] });
    }
    s.customerId ? generate() : picker();
  }

  NB.route('statements', render);
})();
