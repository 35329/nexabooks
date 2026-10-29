/* =====================================================================
   quotations.js – quotation list, editor, detail view, status workflow
   and conversion to invoice.
   Laravel: Quotation + QuotationItem models, QuotationController,
   ConvertQuotationToInvoice action (wrapped in DB::transaction with a
   unique index on invoices.quotation_id to prevent duplicate conversion).
   ===================================================================== */
window.NB = window.NB || {};

NB.quotations = (() => {
  const U = NB.utils; const ui = NB.ui; const C = NB.calc; const { esc } = U;
  const D = () => NB.data.db;
  const STATUSES = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted'];

  /* ---------------- List ---------------- */
  function list(params, query) {
    const f = { q: query.q || '', status: query.status || '', customer: query.customer || '' };
    const v = NB.view.render(`
      ${ui.pageHeader({ title: 'Quotations', crumbs: [{ label: 'Sales & Documents' }, { label: 'Quotations' }], subtitle: 'Prepare, send and track quotations, then convert accepted ones into invoices.',
        actions: `<button class="btn btn-secondary" id="q-export">${ui.icon('file-spreadsheet')}Export CSV</button><a class="btn btn-primary" href="#/quotations/new">${ui.icon('plus')}New quotation</a>` })}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="q-stats"></div>
      <div class="card">
        <div class="flex flex-wrap gap-2 p-4 border-b border-slate-100">
          ${ui.searchInput('q-q', 'Search quotation number or customer…', f.q)}
          ${ui.selectInput('q-status', [{ value: '', label: 'All statuses' }, ...STATUSES.map(s => ({ value: s, label: s === 'Converted' ? 'Converted to Invoice' : s }))], f.status, 'Status')}
          <select id="q-cust" class="form-select w-auto max-w-[260px]" aria-label="Customer">${ui.customerOptions(f.customer, { includeInactive: true, placeholder: 'All customers' })}</select>
        </div>
        <div id="q-table"></div>
      </div>`);
    const all = () => D().quotations.map(q => ({ ...q, _status: C.quotationStatus(q), _t: C.totals(q.items), _cust: NB.data.customerName(q.customerId) }));
    const filter = () => {
      const q = f.q.toLowerCase();
      return all().filter(r => (!q || r.number.toLowerCase().includes(q) || r._cust.toLowerCase().includes(q)) && (!f.status || r._status === f.status) && (!f.customer || r.customerId === f.customer));
    };
    const stats = () => {
      const rows = all();
      const open = rows.filter(r => r._status === 'Sent');
      const decided = rows.filter(r => ['Accepted', 'Converted', 'Rejected'].includes(r._status));
      const won = decided.filter(r => r._status !== 'Rejected');
      v.querySelector('#q-stats').innerHTML = [
        ui.statCard({ label: 'Total quoted', value: U.money(U.sum(rows, r => r._t.total)), icon: 'file-text', tone: 'navy', sub: `${rows.length} quotations` }),
        ui.statCard({ label: 'Awaiting response', value: U.money(U.sum(open, r => r._t.total)), icon: 'send', tone: 'brand', sub: `${open.length} sent` }),
        ui.statCard({ label: 'Won (accepted / converted)', value: U.money(U.sum(won, r => r._t.total)), icon: 'circle-check', tone: 'ok', sub: `${won.length} quotations` }),
        ui.statCard({ label: 'Win rate', value: decided.length ? U.pct(won.length / decided.length * 100, 0) : '—', icon: 'gauge', tone: 'teal', sub: 'of decided quotations' })
      ].join('');
      ui.icons(v.querySelector('#q-stats'));
    };
    stats();
    const table = ui.dataTable(v.querySelector('#q-table'), [
      { key: 'number', label: 'Quotation no.', render: r => `<a class="link" href="#/quotations/view/${r.id}">${esc(r.number)}</a>` },
      { key: 'date', label: 'Date', render: r => U.fmtDate(r.date) },
      { key: 'expiryDate', label: 'Valid until', render: r => `<span class="${r._status === 'Expired' ? 'text-red-600' : ''}">${U.fmtDate(r.expiryDate)}</span>` },
      { key: '_cust', label: 'Customer', render: r => `<a href="#/customers/view/${r.customerId}" class="hover:text-brand-600">${esc(r._cust)}</a>` },
      { key: 'sub', label: 'Subtotal', num: true, value: r => r._t.taxable, render: r => U.num(r._t.taxable) },
      { key: 'vat', label: 'VAT', num: true, value: r => r._t.vat, render: r => U.num(r._t.vat) },
      { key: 'total', label: 'Total', num: true, value: r => r._t.total, render: r => `<b>${U.money(r._t.total)}</b>` },
      { key: '_status', label: 'Status', render: r => ui.badge(r._status) },
      { key: 'a', label: '', sortable: false, render: r => `<div class="flex justify-end gap-0.5 whitespace-nowrap"><a class="row-action" href="#/quotations/view/${r.id}" title="View" aria-label="View ${r.number}">${ui.icon('eye')}</a>${r.status !== 'Converted' ? `<a class="row-action" href="#/quotations/edit/${r.id}" title="Edit" aria-label="Edit ${r.number}">${ui.icon('pencil')}</a>` : ''}<button class="row-action" data-more="${r.id}" title="More actions" aria-label="More actions for ${r.number}">${ui.icon('ellipsis')}</button></div>` }
    ], {
      rows: filter(), sort: { key: 'date', dir: 'desc' }, onRowClick: r => NB.go(`quotations/view/${r.id}`),
      emptyTitle: 'No quotations found', emptyAction: '<a class="btn btn-primary btn-sm" href="#/quotations/new">New quotation</a>',
      afterRender: el => U.$$('[data-more]', el).forEach(b => b.onclick = e => { e.stopPropagation(); ui.dropdown(b, actionsFor(NB.data.get('quotations', b.dataset.more), () => { table.setRows(filter()); stats(); NB.app.refreshChrome(); })); })
    });
    const upd = () => table.setRows(filter());
    v.querySelector('#q-q').addEventListener('input', U.debounce(e => { f.q = e.target.value; upd(); }, 150));
    v.querySelector('#q-status').onchange = e => { f.status = e.target.value; upd(); };
    v.querySelector('#q-cust').onchange = e => { f.customer = e.target.value; upd(); };
    v.querySelector('#q-export').onclick = () => {
      const r = table.rows;
      U.download(`quotations-${U.today()}.csv`, U.toCSV([['Quotation no.', 'Date', 'Valid until', 'Customer ID', 'Customer', 'Subtotal (excl. VAT)', 'VAT', 'Total', 'Status'],
        ...r.map(q => [q.number, q.date, q.expiryDate, q.customerId, q._cust, q._t.taxable.toFixed(2), q._t.vat.toFixed(2), q._t.total.toFixed(2), q._status])]), 'text/csv');
      ui.toast(`Exported ${r.length} quotations.`);
    };
  }

  /** Context actions shared by list dropdown and detail page. */
  function actionsFor(q, after) {
    const st = C.quotationStatus(q);
    return [
      { label: 'Preview', icon: 'eye', onClick: () => NB.docs.preview('quotation', q.id) },
      { label: 'Print', icon: 'printer', onClick: () => { const d = NB.docs.build('quotation', q.id); NB.docs.print(d.html, d.title); } },
      { label: 'Export PDF', icon: 'download', onClick: () => { const d = NB.docs.build('quotation', q.id); NB.docs.exportPdf(d.html, d.filename); } },
      '-',
      { label: 'Mark as sent', icon: 'send', disabled: st !== 'Draft', onClick: () => setStatus(q, 'Sent', after) },
      { label: 'Mark as accepted', icon: 'circle-check', disabled: !['Sent', 'Expired'].includes(st), onClick: () => setStatus(q, 'Accepted', after) },
      { label: 'Mark as rejected', icon: 'circle-x', disabled: !['Sent', 'Expired', 'Accepted'].includes(st), onClick: () => setStatus(q, 'Rejected', after) },
      { label: 'Convert to invoice', icon: 'arrow-right-left', disabled: ['Converted', 'Rejected', 'Draft'].includes(st), onClick: () => convert(q.id) },
      '-',
      { label: 'Duplicate', icon: 'copy', onClick: () => duplicate(q) },
      { label: 'Delete draft', icon: 'trash-2', danger: true, disabled: q.status !== 'Draft', onClick: () => removeDraft(q, after) }
    ];
  }

  async function setStatus(q, status, after) {
    const msgs = { Sent: 'Quotation marked as sent. (Email delivery is simulated in this prototype.)', Accepted: 'Quotation marked as accepted.', Rejected: 'Quotation marked as rejected.' };
    if (status === 'Rejected') {
      const ok = await ui.confirm({ title: 'Mark as rejected?', message: `Quotation <b>${esc(q.number)}</b> will be closed as rejected and can no longer be converted.`, confirmLabel: 'Mark rejected', danger: true });
      if (!ok) return;
    }
    if (status === 'Accepted' && C.quotationStatus(q) === 'Expired') {
      const ok = await ui.confirm({ title: 'Accept an expired quotation?', message: `This quotation expired on ${U.fmtDate(q.expiryDate)}. Confirm the customer accepted the quoted prices.`, confirmLabel: 'Mark accepted' });
      if (!ok) return;
    }
    NB.data.update('quotations', q.id, { status, [`${status.toLowerCase()}At`]: new Date().toISOString() });
    ui.toast(msgs[status]);
    after ? after() : NB.view.refresh();
  }

  /** Convert to invoice – blocked if an invoice already references this quotation. */
  async function convert(id) {
    const q = NB.data.get('quotations', id);
    const existing = D().invoices.find(i => i.quotationId === id) || (q.convertedInvoiceId && NB.data.get('invoices', q.convertedInvoiceId));
    if (existing) {
      return ui.modal({ title: 'Already converted', size: 'sm', body: `<div class="callout callout-info">${ui.icon('info')}<div>Quotation <b>${esc(q.number)}</b> was already converted to invoice <b>${esc(existing.number)}</b>. Converting again would bill the customer twice.</div></div>`,
        actions: [{ label: 'Close', onClick: m => m.close() }, { label: `Open ${existing.number}`, variant: 'primary', onClick: m => { m.close(); NB.go(`invoices/view/${existing.id}`); } }] });
    }
    const st = C.quotationStatus(q);
    const ok = await ui.confirm({
      title: 'Convert to invoice?', icon: 'arrow-right-left',
      message: `A draft invoice will be created for <b>${esc(NB.data.customerName(q.customerId))}</b> with the same line items, prices, discounts, VAT codes and notes (${U.money(C.totals(q.items).total)}).${st !== 'Accepted' ? ' The quotation will also be marked as accepted.' : ''}`,
      confirmLabel: 'Create invoice'
    });
    if (!ok) return;
    const T = U.today();
    const s = D().settings;
    const inv = {
      id: U.uid('inv'), number: NB.data.nextNumber('invoice', T), date: T, dueDate: U.addDays(T, s.defaultDueDays), customerId: q.customerId,
      items: JSON.parse(JSON.stringify(q.items)), quotationId: q.id, recurringId: null, recurringPeriod: null, status: 'Draft',
      paymentTerms: `Payment due within ${s.defaultDueDays} days`, notes: q.notes || '', poNumber: '', createdAt: new Date().toISOString()
    };
    NB.data.insert('invoices', inv);
    NB.data.update('quotations', q.id, { status: 'Converted', convertedInvoiceId: inv.id, acceptedAt: q.acceptedAt || new Date().toISOString() });
    ui.toast(`Invoice ${inv.number} created from ${q.number}. Review and issue it.`);
    NB.go(`invoices/view/${inv.id}`);
  }

  function duplicate(q) {
    const T = U.today();
    const copy = { ...JSON.parse(JSON.stringify(q)), id: U.uid('quo'), number: NB.data.nextNumber('quotation', T), date: T, expiryDate: U.addDays(T, D().settings.quotationValidityDays), status: 'Draft', convertedInvoiceId: null, createdAt: new Date().toISOString() };
    delete copy.sentAt; delete copy.acceptedAt; delete copy.rejectedAt;
    NB.data.insert('quotations', copy);
    ui.toast(`Duplicated as ${copy.number} (draft).`);
    NB.go(`quotations/edit/${copy.id}`);
  }

  async function removeDraft(q, after) {
    const ok = await ui.confirm({ title: 'Delete draft quotation?', message: `Draft <b>${esc(q.number)}</b> will be permanently deleted.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    NB.data.remove('quotations', q.id);
    ui.toast('Draft quotation deleted.');
    after ? after() : NB.go('quotations');
  }

  /* ---------------- Editor ---------------- */
  function form(params, query) {
    const q = params.id ? NB.data.get('quotations', params.id) : null;
    if (params.id && !q) return NB.go('quotations');
    if (q && q.status === 'Converted') { ui.toast('Converted quotations are locked. Edit the invoice instead.', 'warn'); return NB.go(`quotations/view/${q.id}`); }
    const T = U.today(); const s = D().settings;
    const x = q || { customerId: query.customer || '', date: T, expiryDate: U.addDays(T, s.quotationValidityDays), items: [], terms: s.quotationTerms, notes: 'Thank you for the opportunity to quote.' };
    const v = NB.view.render(`
      ${ui.pageHeader({ title: q ? `Edit ${esc(q.number)}` : 'New quotation', crumbs: [{ label: 'Quotations', href: '#/quotations' }, { label: q ? q.number : 'New' }],
        actions: `<a class="btn btn-ghost" href="${q ? `#/quotations/view/${q.id}` : '#/quotations'}">Cancel</a>` })}
      <form id="qf" novalidate class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <div class="space-y-4 min-w-0">
          <div class="card"><div class="card-head"><div class="card-title">Customer &amp; dates</div></div><div class="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
            <div id="qf-cust" class="md:row-span-3"></div>
            ${ui.field({ id: 'qf-number', label: 'Quotation number', value: q ? q.number : NB.data.previewNumber('quotation', x.date), attrs: 'readonly', help: q ? '' : 'Assigned automatically when saved.' })}
            ${ui.field({ id: 'qf-date', label: 'Quotation date', type: 'date', value: x.date, required: true })}
            ${ui.field({ id: 'qf-expiry', label: 'Valid until', type: 'date', value: x.expiryDate, required: true, help: `Default validity: ${s.quotationValidityDays} days` })}
          </div></div>
          <div class="card"><div class="card-head"><div class="card-title">Line items</div><span class="card-sub">Discounts are a percentage of each line</span></div><div class="card-body" id="qf-items"></div></div>
          <div class="card"><div class="card-head"><div class="card-title">Terms &amp; notes</div></div><div class="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
            ${ui.field({ id: 'qf-terms', label: 'Terms and conditions', type: 'textarea', rows: 6, value: x.terms })}
            ${ui.field({ id: 'qf-notes', label: 'Notes to customer', type: 'textarea', rows: 6, value: x.notes })}
          </div></div>
        </div>
        <div class="xl:sticky xl:top-20 space-y-4">
          <div class="card"><div class="card-head"><div class="card-title">Summary</div>${q ? ui.badge(C.quotationStatus(q)) : ui.badge('Draft')}</div><div class="card-body" id="qf-totals"></div>
            <div class="px-[18px] pb-[18px] grid gap-2">
              <button type="button" class="btn btn-primary w-full" data-save="Sent">${ui.icon('send')}${q && q.status !== 'Draft' ? 'Save changes' : 'Save &amp; mark as sent'}</button>
              ${!q || q.status === 'Draft' ? `<button type="button" class="btn btn-secondary w-full" data-save="Draft">${ui.icon('save')}Save as draft</button>` : ''}
              <button type="button" class="btn btn-ghost w-full" data-preview>${ui.icon('eye')}Preview document</button>
            </div></div>
          <div class="callout callout-info text-[12px]">${ui.icon('info')}<div>VAT is calculated per line from the selected VAT code. Zero-rated and exempt supplies are shown separately on the document.</div></div>
        </div>
      </form>`);
    const picker = NB.lineItems.customerPicker(v.querySelector('#qf-cust'), x.customerId);
    const editor = NB.lineItems.mount(v.querySelector('#qf-items'), JSON.parse(JSON.stringify(x.items)), { onChange: t => { v.querySelector('#qf-totals').innerHTML = NB.lineItems.totalsPanel(t); } });
    v.querySelector('#qf-date').onchange = e => {
      if (!q) v.querySelector('#qf-number').value = NB.data.previewNumber('quotation', e.target.value);
      v.querySelector('#qf-expiry').value = U.addDays(e.target.value, s.quotationValidityDays);
    };
    const collect = () => ({
      customerId: picker.get(), date: ui.val('qf-date', v), expiryDate: ui.val('qf-expiry', v), items: editor.getItems(),
      terms: v.querySelector('#qf-terms').value.trim(), notes: v.querySelector('#qf-notes').value.trim()
    });
    const validate = data => {
      const err = {};
      if (!data.customerId) err['doc-customer'] = 'Select a customer or add a new one.';
      if (!data.date) err['qf-date'] = 'Enter the quotation date.';
      if (!data.expiryDate) err['qf-expiry'] = 'Enter the expiry date.'; else if (data.expiryDate < data.date) err['qf-expiry'] = 'Valid-until date must be on or after the quotation date.';
      const ok = ui.showErrors(v, err);
      const itemErr = editor.validate();
      if (itemErr) { ui.toast(itemErr, 'err'); return false; }
      return ok;
    };
    U.$$('[data-save]', v).forEach(b => b.onclick = () => {
      const data = collect(); if (!validate(data)) return;
      let rec;
      if (q) {
        const status = q.status === 'Draft' ? b.dataset.save : q.status;
        rec = NB.data.update('quotations', q.id, { ...data, status });
      } else {
        rec = NB.data.insert('quotations', { id: U.uid('quo'), number: NB.data.nextNumber('quotation', data.date), ...data, status: b.dataset.save, convertedInvoiceId: null, createdAt: new Date().toISOString() });
        NB.data.save();
      }
      ui.toast(`Quotation ${rec.number} saved${rec.status === 'Sent' ? ' and marked as sent' : ' as draft'}.`);
      NB.go(`quotations/view/${rec.id}`);
    });
    v.querySelector('[data-preview]').onclick = () => {
      const data = collect();
      if (!data.customerId) return ui.toast('Select a customer to preview the document.', 'warn');
      const tmp = { id: 'preview', number: q ? q.number : NB.data.previewNumber('quotation', data.date), status: q ? q.status : 'Draft', ...data };
      ui.modal({ title: 'Preview (unsaved)', size: 'xl', body: '<div id="pv"></div>', actions: [{ label: 'Close', variant: 'primary', onClick: m => m.close() }],
        onOpen: m => NB.docs.mountPreview(m.el.querySelector('#pv'), NB.docs.quotation(tmp)) });
    };
  }

  /* ---------------- Detail ---------------- */
  function view({ id }) {
    const q = NB.data.get('quotations', id);
    if (!q) return NB.view.render(`<div class="card">${ui.emptyState('Quotation not found', '', '<a class="btn btn-primary" href="#/quotations">Back to quotations</a>')}</div>`);
    const st = C.quotationStatus(q);
    const t = C.totals(q.items);
    const inv = q.convertedInvoiceId ? NB.data.get('invoices', q.convertedInvoiceId) : null;
    const canConvert = !['Converted', 'Rejected', 'Draft'].includes(st);
    const v = NB.view.render(`
      ${ui.pageHeader({ title: `Quotation ${esc(q.number)} <span class="align-middle ml-1">${ui.badge(st)}</span>`, crumbs: [{ label: 'Quotations', href: '#/quotations' }, { label: q.number }],
        subtitle: `${esc(NB.data.customerName(q.customerId))} · issued ${U.fmtDate(q.date)} · valid until ${U.fmtDate(q.expiryDate)}`,
        actions: `${q.status !== 'Converted' ? `<a class="btn btn-secondary" href="#/quotations/edit/${q.id}">${ui.icon('pencil')}Edit</a>` : ''}
          <button class="btn btn-secondary" id="qv-pdf">${ui.icon('download')}PDF</button>
          <button class="btn btn-secondary" id="qv-print">${ui.icon('printer')}Print</button>
          ${canConvert ? `<button class="btn btn-primary" id="qv-convert">${ui.icon('arrow-right-left')}Convert to invoice</button>` : ''}
          <button class="btn btn-secondary" id="qv-more" aria-label="More actions">${ui.icon('ellipsis')}</button>` })}
      ${st === 'Expired' ? `<div class="callout callout-warn mb-4">${ui.icon('clock')}<div>This quotation expired on ${U.fmtDate(q.expiryDate)}. You can still record the customer’s decision, or duplicate it with new dates.</div></div>` : ''}
      ${inv ? `<div class="callout callout-ok mb-4">${ui.icon('circle-check')}<div>Converted to invoice <a class="link" href="#/invoices/view/${inv.id}">${esc(inv.number)}</a>. The quotation is now locked to prevent duplicate billing.</div></div>` : ''}
      <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
        <div class="min-w-0"><div class="flex items-center justify-between mb-2"><span class="text-xs text-slate-500">Document preview · template: <b id="qv-tpl-name">${D().settings.template === 'modern' ? 'Modern' : 'Classic'}</b></span><a class="text-xs link" href="#/settings/templates">Change default template</a></div><div id="qv-doc"></div></div>
        <div class="space-y-4 xl:sticky xl:top-20">
          <div class="card"><div class="card-head"><div class="card-title">Summary</div>${ui.badge(st)}</div><div class="card-body">${NB.lineItems.totalsPanel(t)}</div></div>
          <div class="card"><div class="card-head"><div class="card-title">Workflow</div></div><div class="card-body grid gap-2">
            <button class="btn btn-secondary w-full justify-start" data-st="Sent" ${st !== 'Draft' ? 'disabled' : ''}>${ui.icon('send')}Mark as sent</button>
            <button class="btn btn-secondary w-full justify-start" data-st="Accepted" ${!['Sent', 'Expired'].includes(st) ? 'disabled' : ''}>${ui.icon('circle-check')}Mark as accepted</button>
            <button class="btn btn-secondary w-full justify-start" data-st="Rejected" ${!['Sent', 'Expired', 'Accepted'].includes(st) ? 'disabled' : ''}>${ui.icon('circle-x')}Mark as rejected</button>
            <p class="text-[11.5px] text-slate-500 mt-1">Draft → Sent → Accepted → Converted. Expiry is derived from the valid-until date.</p>
          </div></div>
          <div class="card"><div class="card-head"><div class="card-title">Customer</div></div><div class="card-body text-sm"><a class="link" href="#/customers/view/${q.customerId}">${esc(NB.data.customerName(q.customerId))}</a><div class="text-slate-500 text-xs mt-1">${esc(q.customerId)}</div>
            <a class="btn btn-ghost btn-sm mt-3 -ml-2" href="#/statements?customer=${q.customerId}">${ui.icon('scroll-text')}Customer statement</a></div></div>
        </div>
      </div>`);
    NB.docs.mountPreview(v.querySelector('#qv-doc'), NB.docs.quotation(q));
    v.querySelector('#qv-pdf').onclick = e => { const d = NB.docs.build('quotation', id); NB.docs.exportPdf(d.html, d.filename, e.currentTarget); };
    v.querySelector('#qv-print').onclick = () => { const d = NB.docs.build('quotation', id); NB.docs.print(d.html, d.title); };
    if (canConvert) v.querySelector('#qv-convert').onclick = () => convert(id);
    v.querySelector('#qv-more').onclick = e => { e.stopPropagation(); ui.dropdown(e.currentTarget, actionsFor(q)); };
    U.$$('[data-st]', v).forEach(b => b.onclick = () => setStatus(q, b.dataset.st));
  }

  NB.route('quotations', list);
  NB.route('quotations/new', form);
  NB.route('quotations/edit/:id', form);
  NB.route('quotations/view/:id', view);

  return { convert, actionsFor };
})();
