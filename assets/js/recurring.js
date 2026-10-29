/* =====================================================================
   recurring.js – recurring / monthly invoice profiles.
   PROTOTYPE: invoices are generated manually with "Generate now".
   PRODUCTION (Laravel): a scheduled command (e.g. `invoices:generate-recurring`
   registered in the Scheduler, daily) dispatches a queued job per due profile.
   Duplicate protection uses a unique key (recurring_invoice_id, period_key)
   – the same rule implemented here with NB.calc.periodKey().
   ===================================================================== */
window.NB = window.NB || {};

NB.recurring = (() => {
  const U = NB.utils; const ui = NB.ui; const C = NB.calc; const { esc } = U;
  const D = () => NB.data.db;
  const FREQS = Object.keys(C.FREQ_MONTHS);
  const TERMS = [0, 7, 15, 30, 45, 60];

  function list() {
    const f = { q: '', status: '', freq: '' };
    const v = NB.view.render(`
      ${ui.pageHeader({ title: 'Recurring / Monthly Invoices', crumbs: [{ label: 'Sales & Documents' }, { label: 'Recurring invoices' }], subtitle: 'Retainers, hosting and maintenance contracts billed on a schedule.',
        actions: `<a class="btn btn-primary" href="#/recurring/new">${ui.icon('plus')}New recurring profile</a>` })}
      <div class="callout callout-info mb-4">${ui.icon('calendar-clock')}<div><b>Demo mode – manual generation.</b> Use <b>Generate now</b> to create the invoice for a profile’s next billing period. In the Laravel version, the Scheduler and queued jobs will generate and email these invoices automatically on the scheduled date. Each billing period can be invoiced only once.</div></div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="r-stats"></div>
      <div class="card"><div class="flex flex-wrap gap-2 p-4 border-b border-slate-100">
        ${ui.searchInput('r-q', 'Search profile ID or customer…')}
        ${ui.selectInput('r-status', [{ value: '', label: 'All statuses' }, 'Active', 'Paused', 'Completed'], '', 'Status')}
        ${ui.selectInput('r-freq', [{ value: '', label: 'All frequencies' }, ...FREQS], '', 'Frequency')}
      </div><div id="r-table"></div></div>`);
    const T = U.today();
    const all = () => D().recurring.map(r => ({ ...r, _t: C.totals(r.items), _cust: NB.data.customerName(r.customerId), _last: r.lastInvoiceId ? NB.data.get('invoices', r.lastInvoiceId) : null, _due: r.status === 'Active' && r.nextDate <= T }));
    const filter = () => all().filter(r => (!f.q || [r.id, r._cust].some(x => x.toLowerCase().includes(f.q.toLowerCase()))) && (!f.status || r.status === f.status) && (!f.freq || r.frequency === f.freq));
    const stats = () => {
      const a = all(); const active = a.filter(r => r.status === 'Active');
      const mrr = U.sum(active, r => r._t.taxable / C.FREQ_MONTHS[r.frequency]);
      v.querySelector('#r-stats').innerHTML = [
        ui.statCard({ label: 'Active profiles', value: String(active.length), icon: 'repeat', tone: 'brand', sub: `${a.length - active.length} paused or completed` }),
        ui.statCard({ label: 'Monthly recurring revenue', value: U.money(mrr), icon: 'trending-up', tone: 'ok', sub: 'excl. VAT, normalised per month' }),
        ui.statCard({ label: 'Due to generate', value: String(a.filter(r => r._due).length), icon: 'calendar-clock', tone: 'warn', sub: 'next date today or earlier' }),
        ui.statCard({ label: 'Invoices generated', value: String(D().invoices.filter(i => i.recurringId).length), icon: 'receipt', tone: 'navy', sub: 'from recurring profiles' })
      ].join(''); ui.icons(v.querySelector('#r-stats'));
    };
    stats();
    const table = ui.dataTable(v.querySelector('#r-table'), [
      { key: 'id', label: 'Profile ID', render: r => `<a class="link" href="#/recurring/edit/${r.id}">${r.id}</a>` },
      { key: '_cust', label: 'Customer', render: r => `<a href="#/customers/view/${r.customerId}" class="hover:text-brand-600">${esc(r._cust)}</a>` },
      { key: 'frequency', label: 'Frequency', render: r => `<span class="chip">${r.frequency}</span>` },
      { key: 'amt', label: 'Amount (incl. VAT)', num: true, value: r => r._t.total, render: r => `<b>${U.money(r._t.total)}</b>` },
      { key: 'startDate', label: 'Start date', render: r => U.fmtDate(r.startDate) },
      { key: 'nextDate', label: 'Next invoice', render: r => r.status === 'Completed' ? '<span class="text-slate-400">—</span>' : `${U.fmtDate(r.nextDate)}${r._due ? ' <span class="badge badge-warn">Due</span>' : ''}` },
      { key: 'status', label: 'Status', render: r => ui.badge(r.status) },
      { key: 'last', label: 'Last generated', value: r => r._last ? r._last.date : '', render: r => r._last ? `<a class="link" href="#/invoices/view/${r._last.id}">${esc(r._last.number)}</a><div class="text-[11px] text-slate-500">${U.fmtDate(r._last.date)}</div>` : '<span class="text-slate-400">None yet</span>' },
      { key: 'a', label: '', sortable: false, render: r => `<div class="flex justify-end gap-1 whitespace-nowrap">
        <button class="btn btn-xs ${r._due ? 'btn-primary' : 'btn-secondary'}" data-gen="${r.id}" ${r.status !== 'Active' ? 'disabled' : ''}>${ui.icon('zap')}Generate now</button>
        <button class="row-action" data-toggle="${r.id}" title="${r.status === 'Paused' ? 'Resume' : 'Pause'}" aria-label="${r.status === 'Paused' ? 'Resume' : 'Pause'} ${r.id}" ${r.status === 'Completed' ? 'disabled' : ''}>${ui.icon(r.status === 'Paused' ? 'play' : 'pause')}</button>
        <a class="row-action" href="#/recurring/edit/${r.id}" title="Edit" aria-label="Edit ${r.id}">${ui.icon('pencil')}</a></div>` }
    ], {
      rows: filter(), sort: { key: 'nextDate', dir: 'asc' }, emptyTitle: 'No recurring profiles', emptyAction: '<a class="btn btn-primary btn-sm" href="#/recurring/new">Create profile</a>',
      afterRender: el => {
        U.$$('[data-gen]', el).forEach(b => b.onclick = () => generate(b.dataset.gen, () => { table.setRows(filter()); stats(); NB.app.refreshChrome(); }));
        U.$$('[data-toggle]', el).forEach(b => b.onclick = () => toggle(b.dataset.toggle, () => { table.setRows(filter()); stats(); NB.app.refreshChrome(); }));
      }
    });
    const upd = () => table.setRows(filter());
    v.querySelector('#r-q').addEventListener('input', U.debounce(e => { f.q = e.target.value; upd(); }, 150));
    v.querySelector('#r-status').onchange = e => { f.status = e.target.value; upd(); };
    v.querySelector('#r-freq').onchange = e => { f.freq = e.target.value; upd(); };
  }

  function toggle(id, after) {
    const r = NB.data.get('recurring', id);
    const status = r.status === 'Paused' ? 'Active' : 'Paused';
    NB.data.update('recurring', id, { status });
    ui.toast(`${id} ${status === 'Active' ? 'resumed' : 'paused'}.`);
    after ? after() : NB.view.refresh();
  }

  /** Generate the invoice for the profile's next billing period (once per period). */
  async function generate(id, after) {
    const r = NB.data.get('recurring', id);
    if (r.status !== 'Active') return ui.notAvailable('Profile not active', `${esc(id)} is ${r.status.toLowerCase()}. Resume it before generating invoices.`);
    if (r.endDate && r.nextDate > r.endDate) { NB.data.update('recurring', id, { status: 'Completed' }); return ui.notAvailable('Profile completed', `The end date (${U.fmtDate(r.endDate)}) has passed, so the profile is now completed.`); }
    const key = C.periodKey(r.nextDate, r.frequency);
    const dup = D().invoices.find(i => i.recurringId === id && i.recurringPeriod === key && i.status !== 'Cancelled');
    if (dup) {
      return ui.modal({ title: 'Already invoiced', size: 'sm', body: `<div class="callout callout-warn">${ui.icon('shield-alert')}<div>Billing period <b>${esc(key)}</b> for ${esc(id)} was already invoiced on <b>${esc(dup.number)}</b>. Generating again would bill the customer twice.</div></div>`, actions: [{ label: 'Close', onClick: m => m.close() }, { label: `Open ${dup.number}`, variant: 'primary', onClick: m => { m.close(); NB.go(`invoices/view/${dup.id}`); } }] });
    }
    const T = U.today();
    const pr = C.periodRange(r.nextDate, r.frequency);
    const t = C.totals(r.items);
    const early = r.nextDate > T;
    const ok = await ui.confirm({ title: 'Generate invoice now?', icon: 'zap', confirmLabel: 'Generate invoice',
      message: `Create and issue an invoice of <b>${U.money(t.total)}</b> for <b>${esc(NB.data.customerName(r.customerId))}</b> covering <b>${U.fmtDate(pr.from)} – ${U.fmtDate(pr.to)}</b> (period ${esc(key)}).${early ? `<br><br><span class="text-amber-700">This period is scheduled for ${U.fmtDate(r.nextDate)}, so the invoice will be issued early.</span>` : ''}` });
    if (!ok) return;
    const inv = {
      id: U.uid('inv'), number: NB.data.nextNumber('invoice', T), date: T, dueDate: U.addDays(T, r.dueDays), customerId: r.customerId, items: JSON.parse(JSON.stringify(r.items)),
      quotationId: null, recurringId: r.id, recurringPeriod: key, status: 'Sent', issuedAt: new Date().toISOString(),
      paymentTerms: r.dueDays ? `Payment due within ${r.dueDays} days` : 'Payment due on receipt', notes: `Billing period: ${U.fmtDate(pr.from)} – ${U.fmtDate(pr.to)}${r.notes ? '\n' + r.notes : ''}`, poNumber: '', createdAt: new Date().toISOString()
    };
    NB.data.insert('invoices', inv);
    const next = C.nextRecurringDate(r.nextDate, r.frequency);
    const completed = r.endDate && next > r.endDate;
    NB.data.update('recurring', id, { lastInvoiceId: inv.id, nextDate: next, status: completed ? 'Completed' : r.status });
    ui.toast(`${inv.number} generated for ${key}. Next invoice: ${completed ? 'none (profile completed)' : U.fmtDate(next)}.`, 'ok', { duration: 6000, action: { label: 'Open invoice', onClick: () => NB.go(`invoices/view/${inv.id}`) } });
    after ? after() : NB.view.refresh();
  }

  function form(params, query) {
    const r = params.id ? NB.data.get('recurring', params.id) : null;
    if (params.id && !r) return NB.go('recurring');
    const T = U.today(); const s = D().settings;
    const x = r || { customerId: query.customer || '', frequency: 'Monthly', startDate: T, endDate: '', nextDate: T, dueDays: s.defaultDueDays, status: 'Active', items: [], notes: 'Thank you for your continued business.' };
    const gen = r ? U.sortBy(D().invoices.filter(i => i.recurringId === r.id), i => i.date, 'desc') : [];
    const v = NB.view.render(`
      ${ui.pageHeader({ title: r ? `Recurring profile ${r.id} <span class="align-middle ml-1">${ui.badge(r.status)}</span>` : 'New recurring profile', crumbs: [{ label: 'Recurring invoices', href: '#/recurring' }, { label: r ? r.id : 'New' }],
        actions: `<a class="btn btn-ghost" href="#/recurring">Cancel</a>${r && r.status !== 'Completed' ? `<button class="btn btn-secondary" id="rf-toggle">${ui.icon(r.status === 'Paused' ? 'play' : 'pause')}${r.status === 'Paused' ? 'Resume' : 'Pause'}</button><button class="btn btn-secondary" id="rf-gen" ${r.status !== 'Active' ? 'disabled' : ''}>${ui.icon('zap')}Generate now</button>` : ''}` })}
      ${r ? `<div class="callout callout-info mb-4">${ui.icon('info')}<div>Changes apply to invoices generated from now on. Invoices already generated are not modified.</div></div>` : ''}
      <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <div class="space-y-4 min-w-0">
          <div class="card"><div class="card-head"><div class="card-title">Schedule</div></div><div class="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
            <div id="rf-cust" class="md:col-span-2"></div>
            ${ui.field({ id: 'rf-freq', label: 'Frequency', type: 'select', options: FREQS, value: x.frequency, required: true })}
            ${ui.field({ id: 'rf-status', label: 'Status', type: 'select', options: r && r.status === 'Completed' ? ['Completed', 'Active'] : ['Active', 'Paused'], value: x.status })}
            ${ui.field({ id: 'rf-start', label: 'Start date', type: 'date', value: x.startDate, required: true })}
            ${ui.field({ id: 'rf-end', label: 'End date', type: 'date', value: x.endDate || '', help: 'Optional – leave blank to bill until cancelled.' })}
            ${ui.field({ id: 'rf-next', label: 'Next invoice date', type: 'date', value: x.nextDate, required: true, help: 'The billing period starts on this date.' })}
            ${ui.field({ id: 'rf-due', label: 'Payment terms', type: 'select', options: [...new Set([...TERMS, x.dueDays])].map(d => ({ value: d, label: d ? `Net ${d} days` : 'Due on receipt' })), value: x.dueDays })}
          </div></div>
          <div class="card"><div class="card-head"><div class="card-title">Invoice line items</div><span class="card-sub">VAT code per line</span></div><div class="card-body" id="rf-items"></div></div>
          <div class="card"><div class="card-head"><div class="card-title">Notes &amp; payment instructions</div></div><div class="card-body">${ui.field({ id: 'rf-notes', label: 'Notes printed on each invoice', type: 'textarea', rows: 3, value: x.notes, help: 'The billing period is added automatically. Bank details come from the company profile.' })}</div></div>
        </div>
        <div class="xl:sticky xl:top-20 space-y-4">
          <div class="card"><div class="card-head"><div class="card-title">Amount per invoice</div></div><div class="card-body" id="rf-totals"></div>
            <div class="px-[18px] pb-[18px]"><button class="btn btn-primary w-full" id="rf-save">${ui.icon('check')}${r ? 'Save changes' : 'Create profile'}</button></div></div>
          ${r ? `<div class="card"><div class="card-head"><div class="card-title">Generated invoices</div><span class="card-sub">${gen.length}</span></div>${gen.length ? `<div class="divide-y divide-slate-100">${gen.map(i => { const inf = C.invoiceInfo(i); return `<a href="#/invoices/view/${i.id}" class="flex justify-between gap-2 px-[18px] py-2.5 text-sm hover:bg-slate-50"><span><span class="link">${esc(i.number)}</span><span class="block text-xs text-slate-500">Period ${esc(i.recurringPeriod || '—')} · ${U.fmtDate(i.date)}</span></span><span class="text-right">${ui.badge(inf.status)}</span></a>`; }).join('')}</div>` : '<div class="px-[18px] py-4 text-sm text-slate-500">No invoices generated yet.</div>'}</div>` : ''}
        </div>
      </div>`);
    const picker = NB.lineItems.customerPicker(v.querySelector('#rf-cust'), x.customerId);
    const drawTotals = t => {
      const freq = v.querySelector('#rf-freq').value;
      v.querySelector('#rf-totals').innerHTML = NB.lineItems.totalsPanel(t, `<div class="text-xs text-slate-500 pt-2">Billed ${freq.toLowerCase()} · ≈ ${U.money(t.taxable / C.FREQ_MONTHS[freq])} per month excl. VAT</div>`);
    };
    const editor = NB.lineItems.mount(v.querySelector('#rf-items'), JSON.parse(JSON.stringify(x.items)), { onChange: drawTotals });
    const startEl = v.querySelector('#rf-start'), nextEl = v.querySelector('#rf-next');
    if (!r) startEl.onchange = () => { nextEl.value = startEl.value; };
    v.querySelector('#rf-freq').onchange = () => drawTotals(editor.totals());
    if (r && v.querySelector('#rf-toggle')) v.querySelector('#rf-toggle').onclick = () => toggle(r.id);
    if (r && v.querySelector('#rf-gen')) v.querySelector('#rf-gen').onclick = () => generate(r.id);
    v.querySelector('#rf-save').onclick = () => {
      const data = { customerId: picker.get(), frequency: ui.val('rf-freq', v), status: ui.val('rf-status', v), startDate: startEl.value, endDate: ui.val('rf-end', v) || null, nextDate: nextEl.value, dueDays: +ui.val('rf-due', v), items: editor.getItems(), notes: v.querySelector('#rf-notes').value.trim() };
      const err = {};
      if (!data.customerId) err['doc-customer'] = 'Select a customer.';
      if (!data.startDate) err['rf-start'] = 'Enter the start date.';
      if (data.endDate && data.endDate < data.startDate) err['rf-end'] = 'End date must be after the start date.';
      if (!data.nextDate) err['rf-next'] = 'Enter the next invoice date.'; else if (data.nextDate < data.startDate) err['rf-next'] = 'Next invoice date cannot be before the start date.';
      else if (data.endDate && data.nextDate > data.endDate) err['rf-next'] = 'Next invoice date is after the end date.';
      if (!ui.showErrors(v, err)) return;
      const ie = editor.validate(); if (ie) return ui.toast(ie, 'err');
      if (r) { NB.data.update('recurring', r.id, data); ui.toast(`${r.id} updated.`); NB.go('recurring'); }
      else {
        const rec = NB.data.insert('recurring', { id: NB.data.nextId('recurring', 'RP'), ...data, lastInvoiceId: null, createdAt: new Date().toISOString() });
        NB.data.save();
        ui.toast(`Recurring profile ${rec.id} created. Next invoice: ${U.fmtDate(rec.nextDate)}.`);
        NB.go('recurring');
      }
    };
  }

  NB.route('recurring', list);
  NB.route('recurring/new', form);
  NB.route('recurring/edit/:id', form);
  return { generate };
})();
