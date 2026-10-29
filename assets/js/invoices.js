/* =====================================================================
   invoices.js – invoice list, editor, detail view and actions.
   Status is DERIVED (see NB.calc.invoiceInfo); only Draft / Sent /
   Cancelled are stored. Laravel: Invoice + InvoiceItem models,
   InvoiceController, IssueInvoice / CancelInvoice actions, InvoicePolicy.
   ===================================================================== */
window.NB = window.NB || {};

NB.invoices = (() => {
  const U = NB.utils; const ui = NB.ui; const C = NB.calc; const { esc } = U;
  const D = () => NB.data.db;
  const STATUSES = ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'];
  const TERMS = [{ v: 0, l: 'Due on receipt' }, { v: 7, l: 'Net 7 days' }, { v: 15, l: 'Net 15 days' }, { v: 30, l: 'Net 30 days' }, { v: 45, l: 'Net 45 days' }, { v: 60, l: 'Net 60 days' }];

  /* ---------------- List ---------------- */
  function list(params, query) {
    const f = { q: query.q || '', status: query.status || '', customer: query.customer || '', preset: 'all', from: '', to: '' };
    const v = NB.view.render(`
      ${ui.pageHeader({ title: 'Invoices', crumbs: [{ label: 'Sales & Documents' }, { label: 'Invoices' }], subtitle: 'Issue invoices, track balances and collect payments. Statuses update automatically from payments and due dates.',
        actions: `<button class="btn btn-secondary" id="i-export">${ui.icon('file-spreadsheet')}Export CSV</button><button class="btn btn-secondary" id="i-pay">${ui.icon('hand-coins')}Record payment</button><a class="btn btn-primary" href="#/invoices/new">${ui.icon('plus')}New invoice</a>` })}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="i-stats"></div>
      <div class="card">
        <div class="flex flex-wrap gap-2 p-4 border-b border-slate-100">
          ${ui.searchInput('i-q', 'Search invoice number, customer or PO…', f.q)}
          ${ui.selectInput('i-status', [{ value: '', label: 'All statuses' }, ...STATUSES], f.status, 'Status')}
          <select id="i-cust" class="form-select w-auto max-w-[240px]" aria-label="Customer">${ui.customerOptions(f.customer, { includeInactive: true, placeholder: 'All customers' })}</select>
          <div id="i-range"></div>
        </div>
        <div class="flex flex-wrap gap-1.5 px-4 py-2.5 border-b border-slate-100" id="i-chips"></div>
        <div id="i-table"></div>
      </div>`);
    const all = () => D().invoices.map(i => ({ ...i, _info: C.invoiceInfo(i), _cust: NB.data.customerName(i.customerId) }));
    const filter = () => {
      const q = f.q.toLowerCase();
      return all().filter(r => (!q || r.number.toLowerCase().includes(q) || r._cust.toLowerCase().includes(q) || (r.poNumber || '').toLowerCase().includes(q))
        && (!f.status || r._info.status === f.status) && (!f.customer || r.customerId === f.customer) && (!f.from || (r.date >= f.from && r.date <= f.to)));
    };
    const stats = rows => {
      const issued = rows.filter(r => C.isIssued(r));
      const od = issued.filter(r => r._info.status === 'Overdue');
      v.querySelector('#i-stats').innerHTML = [
        ui.statCard({ label: 'Invoiced (incl. VAT)', value: U.money(U.sum(issued, r => r._info.total)), icon: 'receipt', tone: 'navy', sub: `${issued.length} issued invoices in view` }),
        ui.statCard({ label: 'Collected', value: U.money(U.sum(issued, r => r._info.paid)), icon: 'hand-coins', tone: 'ok', sub: 'payments on these invoices' }),
        ui.statCard({ label: 'Outstanding', value: U.money(U.sum(issued, r => r._info.balance)), icon: 'clock', tone: 'warn', sub: `${issued.filter(r => r._info.balance > 0).length} open invoices` }),
        ui.statCard({ label: 'Overdue', value: U.money(U.sum(od, r => r._info.balance)), icon: 'triangle-alert', tone: 'bad', sub: `${od.length} past due date` })
      ].join('');
      const counts = Object.fromEntries(STATUSES.map(s => [s, 0])); all().forEach(r => counts[r._info.status]++);
      v.querySelector('#i-chips').innerHTML = [['', 'All', all().length], ...STATUSES.map(s => [s, s, counts[s]])].map(([val, l, n]) =>
        `<button class="btn btn-xs ${f.status === val ? 'btn-dark' : 'btn-ghost'}" data-chip="${val}">${l} <span class="opacity-60">${n}</span></button>`).join('');
      U.$$('[data-chip]', v).forEach(b => b.onclick = () => { f.status = b.dataset.chip; v.querySelector('#i-status').value = f.status; upd(); });
      ui.icons(v.querySelector('#i-stats'));
    };
    const table = ui.dataTable(v.querySelector('#i-table'), [
      { key: 'number', label: 'Invoice no.', render: r => `<a class="link" href="#/invoices/view/${r.id}">${esc(r.number)}</a>${r.recurringId ? ` <span class="chip" title="Generated from ${r.recurringId}">${ui.icon('repeat', '!w-3 !h-3')}</span>` : ''}${r.quotationId ? ` <span class="chip" title="From quotation">Q</span>` : ''}` },
      { key: 'date', label: 'Invoice date', render: r => U.fmtDate(r.date) },
      { key: 'dueDate', label: 'Due date', render: r => `<span class="${r._info.status === 'Overdue' ? 'text-red-600 font-medium' : ''}">${U.fmtDate(r.dueDate)}</span>${r._info.daysOverdue ? `<div class="text-[11px] text-red-600">${r._info.daysOverdue} days overdue</div>` : ''}` },
      { key: '_cust', label: 'Customer', render: r => `<a href="#/customers/view/${r.customerId}" class="hover:text-brand-600">${esc(r._cust)}</a>` },
      { key: 'total', label: 'Total', num: true, value: r => r._info.total, render: r => U.money(r._info.total) },
      { key: 'paid', label: 'Paid', num: true, value: r => r._info.paid, render: r => r._info.paid ? U.num(r._info.paid) : '<span class="text-slate-400">—</span>' },
      { key: 'balance', label: 'Balance', num: true, value: r => r._info.balance, render: r => `<b class="${r._info.status === 'Overdue' ? 'text-red-600' : ''}">${C.isIssued(r) ? U.money(r._info.balance) : '<span class="text-slate-400 font-normal">—</span>'}</b>` },
      { key: 'st', label: 'Status', value: r => r._info.status, render: r => ui.badge(r._info.status) },
      { key: 'a', label: '', sortable: false, render: r => `<div class="flex justify-end gap-0.5 whitespace-nowrap">
        ${C.isIssued(r) && r._info.balance > 0 ? `<button class="row-action" data-pay="${r.id}" title="Record payment" aria-label="Record payment for ${r.number}">${ui.icon('hand-coins')}</button>` : ''}
        <a class="row-action" href="#/invoices/view/${r.id}" title="View" aria-label="View ${r.number}">${ui.icon('eye')}</a>
        <button class="row-action" data-more="${r.id}" title="More actions" aria-label="More actions for ${r.number}">${ui.icon('ellipsis')}</button></div>` }
    ], {
      rows: filter(), sort: { key: 'date', dir: 'desc' }, onRowClick: r => NB.go(`invoices/view/${r.id}`),
      emptyTitle: 'No invoices match these filters', emptyAction: '<a class="btn btn-primary btn-sm" href="#/invoices/new">New invoice</a>',
      footer: rows => { const iss = rows.filter(r => C.isIssued(r)); return `<tr><td colspan="4">Totals (${iss.length} issued)</td><td class="num">${U.money(U.sum(iss, r => r._info.total))}</td><td class="num">${U.num(U.sum(iss, r => r._info.paid))}</td><td class="num">${U.money(U.sum(iss, r => r._info.balance))}</td><td colspan="2"></td></tr>`; },
      afterRender: el => {
        U.$$('[data-pay]', el).forEach(b => b.onclick = () => NB.payments.openRecord({ invoiceId: b.dataset.pay }));
        U.$$('[data-more]', el).forEach(b => b.onclick = e => { e.stopPropagation(); ui.dropdown(b, actionsFor(NB.data.get('invoices', b.dataset.more))); });
      }
    });
    const upd = () => { const rows = filter(); table.setRows(rows); stats(rows); };
    ui.dateRange(v.querySelector('#i-range'), { preset: 'all', idPrefix: 'i-dr', onChange: r => { f.from = r.preset === 'all' ? '' : r.from; f.to = r.to; upd(); } });
    stats(filter());
    v.querySelector('#i-q').addEventListener('input', U.debounce(e => { f.q = e.target.value; upd(); }, 150));
    v.querySelector('#i-status').onchange = e => { f.status = e.target.value; upd(); };
    v.querySelector('#i-cust').onchange = e => { f.customer = e.target.value; upd(); };
    v.querySelector('#i-pay').onclick = () => NB.payments.openRecord();
    v.querySelector('#i-export').onclick = () => {
      const r = table.rows;
      U.download(`invoices-${U.today()}.csv`, U.toCSV([['Invoice no.', 'Invoice date', 'Due date', 'Customer ID', 'Customer', 'Taxable amount', 'VAT', 'Total', 'Paid', 'Credited', 'Balance', 'Status', 'Days overdue'],
        ...r.map(i => [i.number, i.date, i.dueDate, i.customerId, i._cust, i._info.taxable.toFixed(2), i._info.vat.toFixed(2), i._info.total.toFixed(2), i._info.paid.toFixed(2), i._info.credited.toFixed(2), i._info.balance.toFixed(2), i._info.status, i._info.daysOverdue])]), 'text/csv');
      ui.toast(`Exported ${r.length} invoices.`);
    };
  }

  function actionsFor(inv) {
    const info = C.invoiceInfo(inv);
    const issued = C.isIssued(inv);
    return [
      { label: 'Preview', icon: 'eye', onClick: () => NB.docs.preview('invoice', inv.id) },
      { label: 'Print', icon: 'printer', onClick: () => { const d = NB.docs.build('invoice', inv.id); NB.docs.print(d.html, d.title); } },
      { label: 'Export PDF', icon: 'download', onClick: () => { const d = NB.docs.build('invoice', inv.id); NB.docs.exportPdf(d.html, d.filename); } },
      '-',
      { label: 'Issue invoice', icon: 'send', disabled: inv.status !== 'Draft', onClick: () => issue(inv) },
      { label: 'Record payment', icon: 'hand-coins', disabled: !issued || info.balance <= 0, onClick: () => NB.payments.openRecord({ invoiceId: inv.id }) },
      { label: 'View payments', icon: 'list-checks', disabled: !info.paid, onClick: () => NB.payments.historyModal(inv.id) },
      { label: 'Create credit note', icon: 'file-minus', disabled: !issued || info.balance <= 0, onClick: () => NB.go(`credit-notes/new?invoice=${inv.id}`) },
      { label: 'Customer statement', icon: 'scroll-text', onClick: () => NB.go(`statements?customer=${inv.customerId}`) },
      '-',
      { label: 'Edit', icon: 'pencil', disabled: inv.status === 'Cancelled', onClick: () => NB.go(`invoices/edit/${inv.id}`) },
      { label: 'Duplicate', icon: 'copy', onClick: () => duplicate(inv) },
      { label: 'Cancel invoice', icon: 'ban', danger: true, disabled: !issued, onClick: () => cancel(inv) },
      { label: 'Delete draft', icon: 'trash-2', danger: true, disabled: inv.status !== 'Draft', onClick: () => removeDraft(inv) }
    ];
  }

  async function issue(inv) {
    const ok = await ui.confirm({ title: 'Issue invoice?', icon: 'send', message: `<b>${esc(inv.number)}</b> will be issued to ${esc(NB.data.customerName(inv.customerId))} and count towards receivables. Email delivery is simulated in this prototype.`, confirmLabel: 'Issue invoice' });
    if (!ok) return;
    NB.data.update('invoices', inv.id, { status: 'Sent', issuedAt: new Date().toISOString() });
    ui.toast(`${inv.number} issued.`);
    NB.view.refresh();
  }

  async function cancel(inv) {
    const info = C.invoiceInfo(inv);
    if (info.paid || info.credited) {
      return ui.modal({ title: 'Invoice cannot be cancelled', size: 'sm', body: `<div class="callout callout-warn">${ui.icon('shield-alert')}<div><b>${esc(inv.number)}</b> has ${info.paid ? `payments of ${U.money(info.paid)}` : ''}${info.paid && info.credited ? ' and ' : ''}${info.credited ? `credit notes of ${U.money(info.credited)}` : ''} recorded against it. Issue a credit note for the remaining balance instead, so the customer ledger stays accurate. Refunds are not supported in this prototype.</div></div>`, actions: [{ label: 'Close', variant: 'primary', onClick: m => m.close() }] });
    }
    const ok = await ui.confirm({ title: 'Cancel invoice?', message: `<b>${esc(inv.number)}</b> (${U.money(info.total)}) will be cancelled and excluded from revenue, receivables and statements. The number is kept for audit purposes and will not be reused.`, confirmLabel: 'Cancel invoice', danger: true });
    if (!ok) return;
    NB.data.update('invoices', inv.id, { status: 'Cancelled', cancelledAt: new Date().toISOString() });
    if (inv.quotationId) { /* quotation stays Converted: the link is historical */ }
    ui.toast(`${inv.number} cancelled.`);
    NB.view.refresh();
  }

  function duplicate(inv) {
    const T = U.today();
    const due = U.diffDays(inv.dueDate, inv.date);
    const copy = { ...JSON.parse(JSON.stringify(inv)), id: U.uid('inv'), number: NB.data.nextNumber('invoice', T), date: T, dueDate: U.addDays(T, due), status: 'Draft', quotationId: null, recurringId: null, recurringPeriod: null, createdAt: new Date().toISOString() };
    ['issuedAt', 'cancelledAt', 'updatedAt', 'key'].forEach(k => delete copy[k]);
    NB.data.insert('invoices', copy);
    ui.toast(`Duplicated as draft ${copy.number}.`);
    NB.go(`invoices/edit/${copy.id}`);
  }

  async function removeDraft(inv) {
    const ok = await ui.confirm({ title: 'Delete draft invoice?', message: `Draft <b>${esc(inv.number)}</b> will be permanently deleted.`, confirmLabel: 'Delete draft', danger: true });
    if (!ok) return;
    NB.data.remove('invoices', inv.id);
    const q = D().quotations.find(x => x.convertedInvoiceId === inv.id);
    if (q) NB.data.update('quotations', q.id, { status: 'Accepted', convertedInvoiceId: null });
    ui.toast('Draft deleted.');
    NB.go('invoices');
  }

  /* ---------------- Editor ---------------- */
  function form(params, query) {
    const inv = params.id ? NB.data.get('invoices', params.id) : null;
    if (params.id && !inv) return NB.go('invoices');
    if (inv && inv.status === 'Cancelled') { ui.toast('Cancelled invoices cannot be edited.', 'warn'); return NB.go(`invoices/view/${inv.id}`); }
    const T = U.today(); const s = D().settings; const co = D().company;
    const dueDays = inv ? U.diffDays(inv.dueDate, inv.date) : s.defaultDueDays;
    const x = inv || { customerId: query.customer || '', date: T, dueDate: U.addDays(T, s.defaultDueDays), items: [], notes: 'Thank you for your business.', paymentTerms: `Payment due within ${s.defaultDueDays} days`, poNumber: '' };
    const info = inv ? C.invoiceInfo(inv) : null;
    const quo = inv && inv.quotationId ? NB.data.get('quotations', inv.quotationId) : null;
    const v = NB.view.render(`
      ${ui.pageHeader({ title: inv ? `Edit ${esc(inv.number)}` : 'New invoice', crumbs: [{ label: 'Invoices', href: '#/invoices' }, { label: inv ? inv.number : 'New' }],
        actions: `<a class="btn btn-ghost" href="${inv ? `#/invoices/view/${inv.id}` : '#/invoices'}">Cancel</a>` })}
      ${info && (info.paid || info.credited) ? `<div class="callout callout-warn mb-4">${ui.icon('triangle-alert')}<div>This invoice already has ${U.money(info.paid + info.credited)} in payments/credits. The new total cannot be lower than that amount.</div></div>` : ''}
      <form id="if" novalidate class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <div class="space-y-4 min-w-0">
          <div class="card"><div class="card-head"><div class="card-title">Customer &amp; invoice details</div></div><div class="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
            <div id="if-cust" class="md:row-span-3"></div>
            ${ui.field({ id: 'if-number', label: 'Invoice number', value: inv ? inv.number : NB.data.previewNumber('invoice', x.date), attrs: 'readonly', help: inv ? '' : 'Assigned automatically when saved.' })}
            <div class="grid grid-cols-2 gap-3">${ui.field({ id: 'if-date', label: 'Invoice date', type: 'date', value: x.date, required: true })}${ui.field({ id: 'if-terms', label: 'Payment terms', type: 'select', options: [...TERMS.map(t => ({ value: t.v, label: t.l })), ...(TERMS.some(t => t.v === dueDays) ? [] : [{ value: dueDays, label: `Net ${dueDays} days` }])], value: dueDays })}</div>
            <div class="grid grid-cols-2 gap-3">${ui.field({ id: 'if-due', label: 'Due date', type: 'date', value: x.dueDate, required: true })}${ui.field({ id: 'if-po', label: 'Customer PO no.', value: x.poNumber, placeholder: 'Optional' })}</div>
            ${quo ? `<div class="md:col-span-2 text-sm text-slate-600">Reference quotation: <a class="link" href="#/quotations/view/${quo.id}">${esc(quo.number)}</a></div>` : ''}
          </div></div>
          <div class="card"><div class="card-head"><div class="card-title">Line items</div><span class="card-sub">Prices excl. VAT · discounts per line</span></div><div class="card-body" id="if-items"></div></div>
          <div class="card"><div class="card-head"><div class="card-title">Payment terms, notes &amp; bank details</div></div><div class="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
            ${ui.field({ id: 'if-pterms', label: 'Payment terms text', type: 'textarea', rows: 3, value: x.paymentTerms })}
            ${ui.field({ id: 'if-notes', label: 'Notes to customer', type: 'textarea', rows: 3, value: x.notes })}
            <div class="md:col-span-2 rounded-lg border border-slate-200 px-4 py-3 text-[12.5px] text-slate-600 flex flex-wrap gap-x-8 gap-y-1">
              <span><b class="text-slate-800">Bank:</b> ${esc(co.bankName)}</span><span><b class="text-slate-800">IBAN:</b> ${esc(co.iban)}</span><span><b class="text-slate-800">SWIFT:</b> ${esc(co.swift)}</span>
              <a class="link ml-auto" href="#/settings/company">Edit bank details</a></div>
          </div></div>
        </div>
        <div class="xl:sticky xl:top-20 space-y-4">
          <div class="card"><div class="card-head"><div class="card-title">Summary</div>${ui.badge(info ? info.status : 'Draft')}</div><div class="card-body" id="if-totals"></div>
            <div class="px-[18px] pb-[18px] grid gap-2">
              <button type="button" class="btn btn-primary w-full" data-save="Sent">${ui.icon('send')}${inv && inv.status !== 'Draft' ? 'Save changes' : 'Save &amp; issue'}</button>
              ${!inv || inv.status === 'Draft' ? `<button type="button" class="btn btn-secondary w-full" data-save="Draft">${ui.icon('save')}Save as draft</button>` : ''}
              <button type="button" class="btn btn-ghost w-full" data-preview>${ui.icon('eye')}Preview document</button>
            </div></div>
          <div class="callout callout-info text-[12px]">${ui.icon('info')}<div>The document title shows “Tax Invoice” only when the company is set as VAT registered with a TRN (Settings → Tax). Validate tax invoice requirements with the FTA before go-live.</div></div>
        </div>
      </form>`);
    const picker = NB.lineItems.customerPicker(v.querySelector('#if-cust'), x.customerId);
    const extra = t => info ? `<div class="flex justify-between text-sm pt-2"><span class="text-slate-500">Amount paid</span><span class="tabular">-${U.money(info.paid)}</span></div>${info.credited ? `<div class="flex justify-between text-sm"><span class="text-slate-500">Credit notes</span><span class="tabular">-${U.money(info.credited)}</span></div>` : ''}<div class="flex justify-between text-sm font-semibold"><span>Outstanding</span><span class="tabular">${U.money(t.total - info.paid - info.credited)}</span></div>` : `<div class="flex justify-between text-sm pt-2"><span class="text-slate-500">Amount paid</span><span class="tabular">${U.money(0)}</span></div><div class="flex justify-between text-sm font-semibold"><span>Outstanding</span><span class="tabular">${U.money(t.total)}</span></div>`;
    const editor = NB.lineItems.mount(v.querySelector('#if-items'), JSON.parse(JSON.stringify(x.items)), { onChange: t => { v.querySelector('#if-totals').innerHTML = NB.lineItems.totalsPanel(t, extra(t)); } });
    const dateEl = v.querySelector('#if-date'), dueEl = v.querySelector('#if-due'), termsEl = v.querySelector('#if-terms'), ptEl = v.querySelector('#if-pterms');
    const syncDue = () => { dueEl.value = U.addDays(dateEl.value, +termsEl.value); ptEl.value = +termsEl.value === 0 ? 'Payment due on receipt' : `Payment due within ${termsEl.value} days`; };
    dateEl.onchange = () => { if (!inv) v.querySelector('#if-number').value = NB.data.previewNumber('invoice', dateEl.value); syncDue(); };
    termsEl.onchange = syncDue;
    const collect = () => ({ customerId: picker.get(), date: dateEl.value, dueDate: dueEl.value, poNumber: ui.val('if-po', v), items: editor.getItems(), paymentTerms: ptEl.value.trim(), notes: v.querySelector('#if-notes').value.trim() });
    const validate = data => {
      const err = {};
      if (!data.customerId) err['doc-customer'] = 'Select a customer or add a new one.';
      if (!data.date) err['if-date'] = 'Enter the invoice date.';
      if (!data.dueDate) err['if-due'] = 'Enter the due date.'; else if (data.dueDate < data.date) err['if-due'] = 'Due date cannot be before the invoice date.';
      const ok = ui.showErrors(v, err);
      const itemErr = editor.validate();
      if (itemErr) { ui.toast(itemErr, 'err'); return false; }
      if (info && C.totals(data.items).total < info.paid + info.credited - 0.004) { ui.toast(`Total cannot be less than ${U.money(info.paid + info.credited)} already paid/credited.`, 'err'); return false; }
      if (inv && inv.customerId !== data.customerId && (info.paid || info.credited)) { ui.toast('The customer cannot be changed after payments are recorded.', 'err'); return false; }
      return ok;
    };
    U.$$('[data-save]', v).forEach(b => b.onclick = () => {
      const data = collect(); if (!validate(data)) return;
      let rec;
      if (inv) {
        const status = inv.status === 'Draft' ? b.dataset.save : inv.status;
        rec = NB.data.update('invoices', inv.id, { ...data, status, ...(status === 'Sent' && inv.status === 'Draft' ? { issuedAt: new Date().toISOString() } : {}) });
      } else {
        rec = NB.data.insert('invoices', { id: U.uid('inv'), number: NB.data.nextNumber('invoice', data.date), ...data, quotationId: null, recurringId: null, recurringPeriod: null, status: b.dataset.save, createdAt: new Date().toISOString(), ...(b.dataset.save === 'Sent' ? { issuedAt: new Date().toISOString() } : {}) });
        NB.data.save();
      }
      ui.toast(`Invoice ${rec.number} ${rec.status === 'Draft' ? 'saved as draft' : 'saved and issued'}.`);
      NB.go(`invoices/view/${rec.id}`);
    });
    v.querySelector('[data-preview]').onclick = () => {
      const data = collect();
      if (!data.customerId) return ui.toast('Select a customer to preview the document.', 'warn');
      const tmp = { id: inv ? inv.id : 'preview', number: inv ? inv.number : NB.data.previewNumber('invoice', data.date), status: inv ? inv.status : 'Draft', quotationId: inv ? inv.quotationId : null, recurringId: inv ? inv.recurringId : null, ...data };
      ui.modal({ title: 'Preview (unsaved)', size: 'xl', body: '<div id="pv"></div>', actions: [{ label: 'Close', variant: 'primary', onClick: m => m.close() }],
        onOpen: m => NB.docs.mountPreview(m.el.querySelector('#pv'), NB.docs.invoice(tmp)) });
    };
  }

  /* ---------------- Detail ---------------- */
  function view({ id }) {
    const inv = NB.data.get('invoices', id);
    if (!inv) return NB.view.render(`<div class="card">${ui.emptyState('Invoice not found', '', '<a class="btn btn-primary" href="#/invoices">Back to invoices</a>')}</div>`);
    const info = C.invoiceInfo(inv);
    const issued = C.isIssued(inv);
    const pays = U.sortBy(C.paymentsFor(id), p => p.date);
    const cns = C.creditNotesFor(id);
    const quo = inv.quotationId ? NB.data.get('quotations', inv.quotationId) : null;
    const v = NB.view.render(`
      ${ui.pageHeader({ title: `Invoice ${esc(inv.number)} <span class="align-middle ml-1">${ui.badge(info.status)}</span>`, crumbs: [{ label: 'Invoices', href: '#/invoices' }, { label: inv.number }],
        subtitle: `${esc(NB.data.customerName(inv.customerId))} · dated ${U.fmtDate(inv.date)} · due ${U.fmtDate(inv.dueDate)}${info.daysOverdue ? ` · <span class="text-red-600 font-semibold">${info.daysOverdue} days overdue</span>` : ''}`,
        actions: `${inv.status === 'Draft' ? `<button class="btn btn-primary" id="iv-issue">${ui.icon('send')}Issue invoice</button>` : ''}
          ${issued && info.balance > 0 ? `<button class="btn btn-primary" id="iv-pay">${ui.icon('hand-coins')}Record payment</button>` : ''}
          ${inv.status !== 'Cancelled' ? `<a class="btn btn-secondary" href="#/invoices/edit/${inv.id}">${ui.icon('pencil')}Edit</a>` : ''}
          <button class="btn btn-secondary" id="iv-pdf">${ui.icon('download')}PDF</button>
          <button class="btn btn-secondary" id="iv-print">${ui.icon('printer')}Print</button>
          <button class="btn btn-secondary" id="iv-more" aria-label="More actions">${ui.icon('ellipsis')}</button>` })}
      ${inv.status === 'Draft' ? `<div class="callout callout-info mb-4">${ui.icon('file-clock')}<div>This invoice is a <b>draft</b>. It is not included in receivables, statements or reports until it is issued.</div></div>` : ''}
      ${inv.status === 'Cancelled' ? `<div class="callout callout-warn mb-4">${ui.icon('ban')}<div>This invoice was cancelled${inv.cancelledAt ? ` on ${U.fmtDate(inv.cancelledAt.slice(0, 10))}` : ''}. It is excluded from all financial totals.</div></div>` : ''}
      <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <div class="min-w-0"><div class="flex items-center justify-between mb-2"><span class="text-xs text-slate-500">Document preview</span><a class="text-xs link" href="#/settings/templates">Change default template</a></div><div id="iv-doc"></div></div>
        <div class="space-y-4 xl:sticky xl:top-20">
          <div class="card"><div class="card-head"><div class="card-title">Balance</div>${ui.badge(info.status)}</div><div class="card-body space-y-2 text-sm">
            <div class="flex justify-between"><span class="text-slate-500">Invoice total</span><span class="tabular font-semibold">${U.money(info.total)}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">VAT included</span><span class="tabular">${U.money(info.vat)}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Payments received</span><span class="tabular text-emerald-700">-${U.money(info.paid)}</span></div>
            ${info.credited ? `<div class="flex justify-between"><span class="text-slate-500">Credit notes</span><span class="tabular text-amber-700">-${U.money(info.credited)}</span></div>` : ''}
            <div class="flex justify-between pt-3 border-t border-slate-200"><span class="font-display font-extrabold">Balance due</span><span class="tabular font-display font-extrabold text-lg ${info.status === 'Overdue' ? 'text-red-600' : ''}">${U.money(issued ? info.balance : 0)}</span></div>
            ${issued && info.total ? `<div class="h-2 rounded-full bg-slate-100 overflow-hidden mt-2"><div class="h-full bg-emerald-500" style="width:${Math.min(100, ((info.paid + info.credited) / info.total) * 100)}%"></div></div><div class="text-xs text-slate-500">${Math.round(((info.paid + info.credited) / info.total) * 100)}% settled</div>` : ''}
          </div></div>
          <div class="card"><div class="card-head"><div class="card-title">Payments &amp; receipts</div><span class="card-sub">${pays.length}</span></div>
            ${pays.length ? `<div class="divide-y divide-slate-100">${pays.map(p => `<div class="flex items-center justify-between gap-2 px-[18px] py-2.5 text-sm"><div class="min-w-0"><a class="link" href="#/receipts/view/${p.id}">${esc(p.receiptNumber)}</a><div class="text-xs text-slate-500">${U.fmtDate(p.date)} · ${esc(p.method)}${p.reference ? ' · ' + esc(p.reference) : ''}</div></div><div class="text-right shrink-0"><div class="tabular font-semibold">${U.money(p.amount)}</div><button class="text-xs link" data-receipt="${p.id}">Receipt</button></div></div>`).join('')}</div>`
              : `<div class="px-[18px] py-4 text-sm text-slate-500">No payments recorded yet.</div>`}
            ${issued && info.balance > 0 ? `<div class="px-[18px] pb-4 pt-1"><button class="btn btn-secondary btn-sm w-full" id="iv-pay2">${ui.icon('plus')}Record payment</button></div>` : ''}
          </div>
          ${cns.length ? `<div class="card"><div class="card-head"><div class="card-title">Credit notes</div></div><div class="divide-y divide-slate-100">${cns.map(c => `<a href="#/credit-notes/view/${c.id}" class="flex justify-between px-[18px] py-2.5 text-sm hover:bg-slate-50"><span><span class="link">${esc(c.number)}</span><span class="block text-xs text-slate-500">${U.fmtDate(c.date)} · ${esc(c.reason)}</span></span><span class="tabular font-semibold">${U.money(C.totals(c.items).total)}</span></a>`).join('')}</div></div>` : ''}
          <div class="card"><div class="card-head"><div class="card-title">Related</div></div><div class="card-body text-sm space-y-2">
            <div class="flex justify-between gap-2"><span class="text-slate-500">Customer</span><a class="link text-right" href="#/customers/view/${inv.customerId}">${esc(NB.data.customerName(inv.customerId))}</a></div>
            ${quo ? `<div class="flex justify-between"><span class="text-slate-500">Quotation</span><a class="link" href="#/quotations/view/${quo.id}">${esc(quo.number)}</a></div>` : ''}
            ${inv.recurringId ? `<div class="flex justify-between"><span class="text-slate-500">Recurring profile</span><a class="link" href="#/recurring/edit/${inv.recurringId}">${esc(inv.recurringId)}</a></div><div class="flex justify-between"><span class="text-slate-500">Billing period</span><span>${esc(inv.recurringPeriod)}</span></div>` : ''}
            ${inv.poNumber ? `<div class="flex justify-between"><span class="text-slate-500">PO number</span><span>${esc(inv.poNumber)}</span></div>` : ''}
            <a class="btn btn-ghost btn-sm -ml-2" href="#/statements?customer=${inv.customerId}">${ui.icon('scroll-text')}View customer statement</a>
          </div></div>
        </div>
      </div>`);
    NB.docs.mountPreview(v.querySelector('#iv-doc'), NB.docs.invoice(inv));
    const on = (sel, fn) => { const el = v.querySelector(sel); if (el) el.onclick = fn; };
    on('#iv-issue', () => issue(inv));
    on('#iv-pay', () => NB.payments.openRecord({ invoiceId: id }));
    on('#iv-pay2', () => NB.payments.openRecord({ invoiceId: id }));
    on('#iv-pdf', e => { const d = NB.docs.build('invoice', id); NB.docs.exportPdf(d.html, d.filename, e.currentTarget); });
    on('#iv-print', () => { const d = NB.docs.build('invoice', id); NB.docs.print(d.html, d.title); });
    on('#iv-more', e => { e.stopPropagation(); ui.dropdown(e.currentTarget, actionsFor(inv)); });
    U.$$('[data-receipt]', v).forEach(b => b.onclick = () => NB.docs.preview('receipt', b.dataset.receipt));
  }

  NB.route('invoices', list);
  NB.route('invoices/new', form);
  NB.route('invoices/edit/:id', form);
  NB.route('invoices/view/:id', view);

  return { actionsFor, issue, cancel };
})();
