/* =====================================================================
   credit-notes.js – basic credit notes linked to an invoice.
   A credit note reduces the invoice balance (never below zero). Refunds,
   customer credit balances and journal entries are out of scope for the
   prototype and are clearly labelled as such.
   Laravel: CreditNote + CreditNoteItem models; validate total <= invoice
   balance inside a DB transaction. Confirm FTA tax credit note rules.
   ===================================================================== */
window.NB = window.NB || {};

NB.creditNotes = (() => {
  const U = NB.utils; const ui = NB.ui; const C = NB.calc; const { esc } = U;
  const D = () => NB.data.db;
  const REASONS = ['Scope reduction', 'Pricing error', 'Discount agreed after invoicing', 'Service not delivered', 'Goods returned', 'Other'];

  function list() {
    const f = { q: '' };
    const v = NB.view.render(`
      ${ui.pageHeader({ title: 'Credit Notes', crumbs: [{ label: 'Sales & Documents' }, { label: 'Credit Notes' }], subtitle: 'Adjustments that reduce the balance of an issued invoice, including the related VAT.',
        actions: `<a class="btn btn-primary" href="#/credit-notes/new">${ui.icon('plus')}New credit note</a>` })}
      <div class="callout callout-info mb-4">${ui.icon('info')}<div>Credit notes in this prototype reduce an invoice’s outstanding balance only. Cash refunds, customer credit balances and accounting journals are <b>not implemented</b> and will be designed for the Laravel build.</div></div>
      <div class="card"><div class="flex flex-wrap gap-2 p-4 border-b border-slate-100">${ui.searchInput('cn-q', 'Search credit note, invoice or customer…')}</div><div id="cn-table"></div></div>`);
    const rows = () => D().creditNotes.map(c => { const inv = NB.data.get('invoices', c.invoiceId); return { ...c, _t: C.totals(c.items), _cust: NB.data.customerName(c.customerId), _inv: inv ? inv.number : '—' }; })
      .filter(r => !f.q || [r.number, r._inv, r._cust, r.reason].some(x => x.toLowerCase().includes(f.q.toLowerCase())));
    const table = ui.dataTable(v.querySelector('#cn-table'), [
      { key: 'number', label: 'Credit note', render: r => `<a class="link" href="#/credit-notes/view/${r.id}">${esc(r.number)}</a>` },
      { key: 'date', label: 'Date', render: r => U.fmtDate(r.date) },
      { key: '_cust', label: 'Customer' },
      { key: '_inv', label: 'Invoice', render: r => `<a class="link" href="#/invoices/view/${r.invoiceId}">${esc(r._inv)}</a>` },
      { key: 'reason', label: 'Reason' },
      { key: 'net', label: 'Net', num: true, value: r => r._t.taxable, render: r => U.num(r._t.taxable) },
      { key: 'vat', label: 'VAT adj.', num: true, value: r => r._t.vat, render: r => U.num(r._t.vat) },
      { key: 'total', label: 'Total credit', num: true, value: r => r._t.total, render: r => `<b>${U.money(r._t.total)}</b>` },
      { key: 'status', label: 'Status', render: r => ui.badge(r.status) }
    ], { rows: rows(), sort: { key: 'date', dir: 'desc' }, onRowClick: r => NB.go(`credit-notes/view/${r.id}`), emptyTitle: 'No credit notes yet', emptyAction: '<a class="btn btn-primary btn-sm" href="#/credit-notes/new">New credit note</a>' });
    v.querySelector('#cn-q').addEventListener('input', U.debounce(e => { f.q = e.target.value; table.setRows(rows()); }, 150));
  }

  function form(params, query) {
    const eligible = D().invoices.filter(i => C.isIssued(i) && C.invoiceInfo(i).balance > 0.004);
    let invId = query.invoice && eligible.some(i => i.id === query.invoice) ? query.invoice : '';
    const T = U.today();
    const v = NB.view.render(`
      ${ui.pageHeader({ title: 'New credit note', crumbs: [{ label: 'Credit Notes', href: '#/credit-notes' }, { label: 'New' }], actions: `<a class="btn btn-ghost" href="#/credit-notes">Cancel</a>` })}
      <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <div class="space-y-4 min-w-0">
          <div class="card"><div class="card-head"><div class="card-title">Invoice &amp; reason</div></div><div class="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="md:col-span-2"><label class="form-label" for="cn-inv">Invoice to credit<span class="req">*</span></label><select id="cn-inv" class="form-select"><option value="">Select an issued invoice with a balance…</option>${U.sortBy(eligible, i => i.number, 'desc').map(i => `<option value="${i.id}" ${i.id === invId ? 'selected' : ''}>${esc(i.number)} · ${esc(NB.data.customerName(i.customerId))} · balance ${U.money(C.invoiceInfo(i).balance)}</option>`).join('')}</select><div class="form-error hidden" id="cn-inv-error"></div></div>
            <div id="cn-invinfo" class="md:col-span-2"></div>
            ${ui.field({ id: 'cn-number', label: 'Credit note number', value: NB.data.previewNumber('creditNote', T), attrs: 'readonly', help: 'Assigned automatically when saved.' })}
            ${ui.field({ id: 'cn-date', label: 'Credit note date', type: 'date', value: T, required: true })}
            ${ui.field({ id: 'cn-reason', label: 'Reason', type: 'select', options: REASONS, value: REASONS[0], required: true })}
            ${ui.field({ id: 'cn-notes', label: 'Notes', value: '', placeholder: 'Optional explanation printed on the credit note' })}
          </div></div>
          <div class="card"><div class="card-head"><div class="card-title">Adjustment lines</div><button class="btn btn-ghost btn-sm" id="cn-copy">${ui.icon('copy')}Copy invoice lines</button></div><div class="card-body" id="cn-items"></div></div>
        </div>
        <div class="xl:sticky xl:top-20 space-y-4"><div class="card"><div class="card-head"><div class="card-title">Credit summary</div></div><div class="card-body" id="cn-totals"></div>
          <div class="px-[18px] pb-[18px]"><button class="btn btn-primary w-full" id="cn-save">${ui.icon('check')}Issue credit note</button></div></div>
          <div class="callout callout-warn text-[12px]">${ui.icon('shield-alert')}<div>The VAT adjustment is calculated from each line’s VAT code. Tax credit note requirements must be validated against current FTA guidance before production use.</div></div></div>
      </div>`);
    let editor;
    const invoice = () => invId ? NB.data.get('invoices', invId) : null;
    const extra = t => { const inv = invoice(); if (!inv) return ''; const bal = C.invoiceInfo(inv).balance; return `<div class="flex justify-between text-sm pt-2"><span class="text-slate-500">Invoice balance now</span><span class="tabular">${U.money(bal)}</span></div><div class="flex justify-between text-sm font-semibold ${t.total > bal + 0.004 ? 'text-red-600' : ''}"><span>Balance after credit</span><span class="tabular">${U.money(bal - t.total)}</span></div>`; };
    const mountItems = items => { editor = NB.lineItems.mount(v.querySelector('#cn-items'), items, { onChange: t => { v.querySelector('#cn-totals').innerHTML = NB.lineItems.totalsPanel(t, extra(t)); } }); };
    const drawInv = () => {
      const inv = invoice();
      v.querySelector('#cn-invinfo').innerHTML = inv ? (() => { const inf = C.invoiceInfo(inv); return `<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm"><div><div class="text-xs text-slate-500">Customer</div><div class="font-semibold truncate">${esc(NB.data.customerName(inv.customerId))}</div></div><div><div class="text-xs text-slate-500">Invoice total</div><div class="tabular font-semibold">${U.money(inf.total)}</div></div><div><div class="text-xs text-slate-500">Paid / credited</div><div class="tabular font-semibold">${U.money(inf.paid + inf.credited)}</div></div><div><div class="text-xs text-slate-500">Balance</div><div class="tabular font-extrabold text-brand-700">${U.money(inf.balance)}</div></div></div>`; })() : '';
      if (editor) v.querySelector('#cn-totals').innerHTML = NB.lineItems.totalsPanel(editor.totals(), extra(editor.totals()));
    };
    mountItems([]);
    drawInv();
    v.querySelector('#cn-inv').onchange = e => { invId = e.target.value; drawInv(); };
    v.querySelector('#cn-copy').onclick = () => { const inv = invoice(); if (!inv) return ui.toast('Select an invoice first.', 'warn'); mountItems(JSON.parse(JSON.stringify(inv.items))); ui.toast('Invoice lines copied – reduce quantities or prices to the amount being credited.', 'info'); };
    v.querySelector('#cn-save').onclick = async () => {
      const inv = invoice(); const date = ui.val('cn-date', v);
      const err = {};
      if (!inv) err['cn-inv'] = 'Select the invoice to credit.';
      if (!date) err['cn-date'] = 'Enter the credit note date.'; else if (inv && date < inv.date) err['cn-date'] = 'A credit note cannot be dated before its invoice.';
      if (!ui.showErrors(v, err)) return;
      const ie = editor.validate(); if (ie) return ui.toast(ie, 'err');
      const t = editor.totals(); const bal = C.invoiceInfo(inv).balance;
      if (t.total > bal + 0.004) return ui.toast(`Credit total ${U.money(t.total)} exceeds the invoice balance of ${U.money(bal)}. Customer credit balances and refunds are not supported in this prototype.`, 'err');
      const ok = await ui.confirm({ title: 'Issue credit note?', message: `A credit note of <b>${U.money(t.total)}</b> (incl. VAT ${U.money(t.vat)}) will be issued against <b>${esc(inv.number)}</b>.`, confirmLabel: 'Issue credit note' });
      if (!ok) return;
      const cn = { id: U.uid('cn'), number: NB.data.nextNumber('creditNote', date), date, invoiceId: inv.id, customerId: inv.customerId, reason: ui.val('cn-reason', v), items: editor.getItems(), notes: ui.val('cn-notes', v), status: 'Issued', createdAt: new Date().toISOString() };
      NB.data.insert('creditNotes', cn);
      ui.toast(`Credit note ${cn.number} issued. ${inv.number} balance is now ${U.money(C.invoiceInfo(inv).balance)}.`);
      NB.go(`credit-notes/view/${cn.id}`);
    };
  }

  function view({ id }) {
    const cn = NB.data.get('creditNotes', id);
    if (!cn) return NB.view.render(`<div class="card">${ui.emptyState('Credit note not found', '', '<a class="btn btn-primary" href="#/credit-notes">Back</a>')}</div>`);
    const inv = NB.data.get('invoices', cn.invoiceId);
    const v = NB.view.render(`
      ${ui.pageHeader({ title: `Credit note ${esc(cn.number)}`, crumbs: [{ label: 'Credit Notes', href: '#/credit-notes' }, { label: cn.number }],
        subtitle: `${esc(NB.data.customerName(cn.customerId))} · ${U.fmtDate(cn.date)} · against ${esc(inv ? inv.number : '—')}`,
        actions: `${inv ? `<a class="btn btn-secondary" href="#/invoices/view/${inv.id}">${ui.icon('receipt')}View invoice</a>` : ''}<button class="btn btn-secondary" id="cv-pdf">${ui.icon('download')}Export PDF</button><button class="btn btn-primary" id="cv-print">${ui.icon('printer')}Print</button>` })}
      <div class="max-w-[900px]" id="cv-doc"></div>`);
    NB.docs.mountPreview(v.querySelector('#cv-doc'), NB.docs.creditNote(cn));
    v.querySelector('#cv-pdf').onclick = e => { const d = NB.docs.build('creditNote', id); NB.docs.exportPdf(d.html, d.filename, e.currentTarget); };
    v.querySelector('#cv-print').onclick = () => { const d = NB.docs.build('creditNote', id); NB.docs.print(d.html, d.title); };
  }

  NB.route('credit-notes', list);
  NB.route('credit-notes/new', form);
  NB.route('credit-notes/view/:id', view);
  return {};
})();
