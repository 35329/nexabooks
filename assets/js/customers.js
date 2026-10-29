/* =====================================================================
   customers.js – customer directory, form, detail page.
   Laravel: Customer model + CustomerController (resource), StoreCustomerRequest
   for validation, CustomerPolicy for authorisation. Deleting a customer with
   documents is blocked (use status = Inactive) to protect the ledger.
   ===================================================================== */
window.NB = window.NB || {};

NB.customers = (() => {
  const U = NB.utils; const ui = NB.ui; const C = NB.calc; const { esc } = U;
  const EMIRATES = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];
  const D = () => NB.data.db;

  /* ---------------- List ---------------- */
  function list(params, query) {
    const f = { q: query.q || '', type: query.type || '', status: query.status || '' };
    const v = NB.view.render(`
      ${ui.pageHeader({ title: 'Customer Directory', crumbs: [{ label: 'Customers' }, { label: 'Directory' }], subtitle: 'Businesses and individuals you quote, invoice and collect from.',
        actions: `<button class="btn btn-secondary" id="c-export">${ui.icon('file-spreadsheet')}Export CSV</button><button class="btn btn-primary" id="c-add">${ui.icon('user-plus')}Add customer</button>` })}
      <div class="card">
        <div class="flex flex-wrap gap-2 p-4 border-b border-slate-100">
          ${ui.searchInput('c-q', 'Search by name, email, phone or customer ID…', f.q)}
          ${ui.selectInput('c-type', [{ value: '', label: 'All types' }, 'Business', 'Individual'], f.type, 'Customer type')}
          ${ui.selectInput('c-status', [{ value: '', label: 'All statuses' }, 'Active', 'Inactive'], f.status, 'Status')}
        </div>
        <div id="c-table"></div>
      </div>`);
    const rows = () => D().customers.map(c => ({ ...c, name: NB.data.customerName(c), sum: C.customerSummary(c.id) }));
    const filter = () => {
      const q = f.q.toLowerCase();
      return rows().filter(c => (!q || [c.name, c.contactPerson, c.email, c.phone, c.id, c.trn].some(x => String(x || '').toLowerCase().includes(q)))
        && (!f.type || c.type === f.type) && (!f.status || c.status === f.status));
    };
    const table = ui.dataTable(v.querySelector('#c-table'), [
      { key: 'id', label: 'ID', render: r => `<span class="font-mono text-xs text-slate-500">${r.id}</span>` },
      { key: 'name', label: 'Customer / company', render: r => `<a class="link" href="#/customers/view/${r.id}">${esc(r.name)}</a><div class="text-xs text-slate-500">${esc([r.city, r.country !== 'United Arab Emirates' ? r.country : ''].filter(Boolean).join(', '))}</div>` },
      { key: 'contactPerson', label: 'Contact person' },
      { key: 'email', label: 'Email', render: r => `<span class="text-slate-600">${esc(r.email)}</span>` },
      { key: 'phone', label: 'Phone', render: r => `<span class="whitespace-nowrap">${esc(r.phone)}</span>` },
      { key: 'trn', label: 'TRN', render: r => r.trn ? `<span class="font-mono text-xs">${esc(r.trn)}</span>` : '<span class="text-slate-400">—</span>' },
      { key: 'type', label: 'Type', render: r => `<span class="chip">${r.type}</span>` },
      { key: 'invoiced', label: 'Total invoiced', num: true, value: r => r.sum.invoiced, render: r => U.money(r.sum.invoiced) },
      { key: 'outstanding', label: 'Outstanding', num: true, value: r => r.sum.outstanding, render: r => `<span class="${r.sum.overdue ? 'text-red-600 font-semibold' : ''}">${U.money(r.sum.outstanding)}</span>` },
      { key: 'status', label: 'Status', render: r => ui.badge(r.status) },
      { key: 'actions', label: '', sortable: false, render: r => `<div class="flex justify-end gap-0.5 whitespace-nowrap"><a class="row-action" href="#/customers/view/${r.id}" title="View" aria-label="View ${esc(r.name)}">${ui.icon('eye')}</a><button class="row-action" data-edit="${r.id}" title="Edit" aria-label="Edit ${esc(r.name)}">${ui.icon('pencil')}</button><button class="row-action danger" data-del="${r.id}" title="Delete" aria-label="Delete ${esc(r.name)}">${ui.icon('trash-2')}</button></div>` }
    ], {
      rows: filter(), sort: { key: 'name', dir: 'asc' }, onRowClick: r => NB.go(`customers/view/${r.id}`),
      emptyTitle: 'No customers match your filters', emptyAction: '<button class="btn btn-primary btn-sm" onclick="NB.customers.openForm()">Add customer</button>',
      afterRender: el => {
        U.$$('[data-edit]', el).forEach(b => b.onclick = () => openForm(b.dataset.edit, { onSaved: () => table.setRows(filter()) }));
        U.$$('[data-del]', el).forEach(b => b.onclick = () => remove(b.dataset.del, () => table.setRows(filter())));
      }
    });
    const upd = () => table.setRows(filter());
    v.querySelector('#c-q').addEventListener('input', U.debounce(e => { f.q = e.target.value; upd(); }, 150));
    v.querySelector('#c-type').onchange = e => { f.type = e.target.value; upd(); };
    v.querySelector('#c-status').onchange = e => { f.status = e.target.value; upd(); };
    v.querySelector('#c-add').onclick = () => openForm(null, { onSaved: c => NB.go(`customers/view/${c.id}`) });
    v.querySelector('#c-export').onclick = () => {
      const r = table.rows;
      U.download(`customers-${U.today()}.csv`, U.toCSV([['Customer ID', 'Name', 'Type', 'Contact person', 'Email', 'Phone', 'TRN', 'City', 'Emirate', 'Country', 'Status', 'Total invoiced', 'Outstanding'],
        ...r.map(c => [c.id, c.name, c.type, c.contactPerson, c.email, c.phone, c.trn, c.city, c.emirate, c.country, c.status, c.sum.invoiced.toFixed(2), c.sum.outstanding.toFixed(2)])]), 'text/csv');
      ui.toast(`Exported ${r.length} customers to CSV.`);
    };
  }

  /* ---------------- Form (modal) ---------------- */
  function openForm(id, { onSaved } = {}) {
    const c = id ? NB.data.get('customers', id) : null;
    const x = c || { type: 'Business', country: 'United Arab Emirates', emirate: 'Dubai', status: 'Active' };
    const sameAddr = !c || c.shippingAddress === c.billingAddress;
    const m = ui.modal({
      title: c ? `Edit customer · ${esc(c.id)}` : 'Add customer', size: 'lg',
      body: `<form id="cust-form" novalidate class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${ui.field({ id: 'cf-type', label: 'Customer type', type: 'select', options: ['Business', 'Individual'], value: x.type, required: true })}
        ${ui.field({ id: 'cf-status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], value: x.status })}
        ${ui.field({ id: 'cf-company', label: 'Company name', value: x.companyName, required: x.type === 'Business', placeholder: 'e.g. Al Noor Trading LLC', cls: 'md:col-span-2' })}
        ${ui.field({ id: 'cf-contact', label: 'Contact person', value: x.contactPerson, required: true, placeholder: 'Full name' })}
        ${ui.field({ id: 'cf-email', label: 'Email', type: 'email', value: x.email, required: true, placeholder: 'name@company.ae' })}
        ${ui.field({ id: 'cf-phone', label: 'Phone', type: 'tel', value: x.phone, required: true, placeholder: '+971 50 123 4567' })}
        ${ui.field({ id: 'cf-trn', label: 'TRN (Tax Registration Number)', value: x.trn, placeholder: '15 digits, if VAT registered', help: 'Optional. Shown on tax documents when provided.' })}
        ${ui.field({ id: 'cf-billing', label: 'Billing address', type: 'textarea', rows: 2, value: x.billingAddress, required: true, cls: 'md:col-span-2' })}
        <label class="md:col-span-2 flex items-center gap-2 text-sm text-slate-600 -mt-1"><input type="checkbox" id="cf-same" class="check" ${sameAddr ? 'checked' : ''}> Shipping address is the same as billing</label>
        ${ui.field({ id: 'cf-shipping', label: 'Shipping address', type: 'textarea', rows: 2, value: x.shippingAddress, cls: `md:col-span-2 ${sameAddr ? 'hidden' : ''}` })}
        ${ui.field({ id: 'cf-city', label: 'City', value: x.city, required: true })}
        ${ui.field({ id: 'cf-emirate', label: 'Emirate', type: 'select', options: [{ value: '', label: 'Not applicable (outside UAE)' }, ...EMIRATES], value: x.emirate })}
        ${ui.field({ id: 'cf-country', label: 'Country', value: x.country || 'United Arab Emirates', required: true, attrs: 'list="countries"' })}
        <datalist id="countries">${['United Arab Emirates', 'Saudi Arabia', 'Oman', 'Qatar', 'Bahrain', 'Kuwait', 'India', 'Pakistan', 'United Kingdom', 'Egypt', 'Jordan'].map(n => `<option value="${n}">`).join('')}</datalist>
        ${ui.field({ id: 'cf-notes', label: 'Notes', type: 'textarea', rows: 2, value: x.notes, cls: 'md:col-span-2', placeholder: 'Internal notes (not printed on documents)' })}
      </form>`,
      actions: [{ label: 'Cancel', onClick: mm => mm.close() }, { label: c ? 'Save changes' : 'Add customer', variant: 'primary', icon: 'check', onClick: mm => save(mm) }]
    });
    const el = m.el;
    el.querySelector('#cf-same').onchange = e => el.querySelector('#cf-shipping').closest('div').classList.toggle('hidden', e.target.checked);
    el.querySelector('#cf-type').onchange = e => {
      const lbl = el.querySelector('label[for="cf-company"]');
      lbl.innerHTML = 'Company name' + (e.target.value === 'Business' ? '<span class="req">*</span>' : ' <span class="text-slate-400 font-normal">(optional)</span>');
    };
    el.querySelector('#cf-type').dispatchEvent(new Event('change'));
    el.querySelector('#cust-form').onsubmit = e => { e.preventDefault(); save(m); };

    function save(mm) {
      const g = k => ui.val(k, el);
      const data = {
        type: g('cf-type'), status: g('cf-status'), companyName: g('cf-company'), contactPerson: g('cf-contact'), email: g('cf-email'), phone: g('cf-phone'),
        trn: g('cf-trn').replace(/\s/g, ''), billingAddress: g('cf-billing'), shippingAddress: el.querySelector('#cf-same').checked ? g('cf-billing') : g('cf-shipping'),
        city: g('cf-city'), emirate: g('cf-emirate'), country: g('cf-country'), notes: g('cf-notes')
      };
      const err = {};
      if (data.type === 'Business' && !data.companyName) err['cf-company'] = 'Company name is required for business customers.';
      if (!data.contactPerson) err['cf-contact'] = 'Enter the contact person’s name.';
      if (!data.email) err['cf-email'] = 'Email is required.'; else if (!ui.isEmail(data.email)) err['cf-email'] = 'Enter a valid email address, e.g. name@company.ae.';
      else if (D().customers.some(o => o.email.toLowerCase() === data.email.toLowerCase() && o.id !== id)) err['cf-email'] = 'Another customer already uses this email.';
      if (!data.phone) err['cf-phone'] = 'Phone number is required.'; else if (!ui.isPhone(data.phone)) err['cf-phone'] = 'Enter a valid phone number, e.g. +971 50 123 4567.';
      if (data.trn && !ui.isTRN(data.trn)) err['cf-trn'] = 'A UAE TRN has 15 digits.';
      if (!data.billingAddress) err['cf-billing'] = 'Billing address is required.';
      if (!data.city) err['cf-city'] = 'City is required.';
      if (!data.country) err['cf-country'] = 'Country is required.';
      if (data.country === 'United Arab Emirates' && !data.emirate) err['cf-emirate'] = 'Select the emirate for UAE customers.';
      if (!ui.showErrors(el, err)) return;
      let rec;
      if (c) { rec = NB.data.update('customers', c.id, data); ui.toast(`${NB.data.customerName(rec)} updated.`); }
      else { rec = NB.data.insert('customers', { id: NB.data.nextId('customer', 'CUS'), ...data, createdAt: new Date().toISOString() }); NB.data.save(); ui.toast(`${NB.data.customerName(rec)} added as ${rec.id}.`); }
      mm.close();
      NB.app.refreshChrome();
      if (onSaved) onSaved(rec); else NB.view.refresh();
    }
    return m;
  }

  async function remove(id, after) {
    const c = NB.data.get('customers', id); if (!c) return;
    const docs = ['quotations', 'invoices', 'payments', 'creditNotes', 'recurring'].reduce((n, k) => n + D()[k].filter(x => x.customerId === id).length, 0);
    if (docs) {
      return ui.modal({ title: 'Customer cannot be deleted', size: 'sm', body: `<div class="callout callout-warn">${ui.icon('shield-alert')}<div><b>${esc(NB.data.customerName(c))}</b> has ${docs} linked document${docs > 1 ? 's' : ''} (quotations, invoices, payments or recurring profiles). Deleting would break the account history. Mark the customer as <b>Inactive</b> instead.</div></div>`,
        actions: [{ label: 'Close', onClick: m => m.close() }, { label: 'Mark inactive', variant: 'primary', onClick: m => { NB.data.update('customers', id, { status: 'Inactive' }); m.close(); ui.toast('Customer marked inactive.'); after ? after() : NB.view.refresh(); } }] });
    }
    const ok = await ui.confirm({ title: 'Delete customer?', message: `<b>${esc(NB.data.customerName(c))}</b> (${c.id}) will be permanently removed. This cannot be undone.`, confirmLabel: 'Delete customer', danger: true });
    if (!ok) return;
    NB.data.remove('customers', id);
    ui.toast('Customer deleted.');
    after ? after() : NB.go('customers');
  }

  /* ---------------- Detail page ---------------- */
  function view({ id }) {
    const c = NB.data.get('customers', id);
    if (!c) return NB.view.render(`<div class="card">${ui.emptyState('Customer not found', 'It may have been deleted.', '<a class="btn btn-primary" href="#/customers">Back to customers</a>')}</div>`);
    const s = C.customerSummary(id);
    const name = NB.data.customerName(c);
    const invs = D().invoices.filter(i => i.customerId === id);
    const quos = D().quotations.filter(q => q.customerId === id);
    const pays = D().payments.filter(p => p.customerId === id);
    const cns = D().creditNotes.filter(x => x.customerId === id);
    const recs = D().recurring.filter(r => r.customerId === id);
    const v = NB.view.render(`
      ${ui.pageHeader({
        title: `${esc(name)} <span class="align-middle ml-1">${ui.badge(c.status)}</span>`, crumbs: [{ label: 'Customers', href: '#/customers' }, { label: c.id }],
        subtitle: `${c.type} customer · ${esc(c.id)} · added ${U.fmtDate(c.createdAt.slice(0, 10))}`,
        actions: `<button class="btn btn-secondary" id="cv-edit">${ui.icon('pencil')}Edit</button>
          <a class="btn btn-secondary" href="#/statements?customer=${c.id}">${ui.icon('scroll-text')}Statement</a>
          <button class="btn btn-secondary" id="cv-pay" ${s.outstanding > 0 ? '' : 'disabled title="No outstanding balance"'}>${ui.icon('hand-coins')}Record payment</button>
          <a class="btn btn-secondary" href="#/quotations/new?customer=${c.id}">${ui.icon('file-text')}New quotation</a>
          <a class="btn btn-primary" href="#/invoices/new?customer=${c.id}">${ui.icon('receipt')}New invoice</a>`
      })}
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        ${ui.statCard({ label: 'Total invoiced', value: U.money(s.invoiced), icon: 'receipt', tone: 'navy', sub: `${s.invoiceCount} issued invoice${s.invoiceCount === 1 ? '' : 's'}` })}
        ${ui.statCard({ label: 'Total paid', value: U.money(s.paid), icon: 'hand-coins', tone: 'ok', sub: `${pays.length} payment${pays.length === 1 ? '' : 's'}` })}
        ${ui.statCard({ label: 'Outstanding balance', value: U.money(s.outstanding), icon: 'clock', tone: 'warn', sub: s.credited ? `after ${U.money(s.credited)} credit notes` : '' })}
        ${ui.statCard({ label: 'Overdue', value: U.money(s.overdue), icon: 'triangle-alert', tone: 'bad', sub: `${s.overdueCount} invoice${s.overdueCount === 1 ? '' : 's'} past due` })}
      </div>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div class="space-y-4">
          <div class="card"><div class="card-head"><div class="card-title">Contact details</div></div><div class="card-body">
            <dl class="kv">
              <dt>Contact</dt><dd>${esc(c.contactPerson)}</dd>
              <dt>Email</dt><dd>${esc(c.email)}</dd>
              <dt>Phone</dt><dd>${esc(c.phone)}</dd>
              <dt>TRN</dt><dd>${c.trn ? `<span class="font-mono">${esc(c.trn)}</span>` : '<span class="text-slate-400">Not provided</span>'}</dd>
              <dt>Billing address</dt><dd>${esc(c.billingAddress)}<br>${esc([c.city, c.emirate !== c.city ? c.emirate : ''].filter(Boolean).join(', '))}<br>${esc(c.country)}</dd>
              <dt>Shipping address</dt><dd>${c.shippingAddress && c.shippingAddress !== c.billingAddress ? esc(c.shippingAddress) : '<span class="text-slate-400">Same as billing</span>'}</dd>
              ${c.notes ? `<dt>Notes</dt><dd class="text-slate-600">${esc(c.notes)}</dd>` : ''}
            </dl></div></div>
          <div class="card"><div class="card-head"><div><div class="card-title">Statement of account</div><div class="card-sub">Last 6 months to today</div></div></div><div class="card-body" id="cv-stmt"></div></div>
          ${recs.length ? `<div class="card"><div class="card-head"><div class="card-title">Recurring profiles</div></div><div class="divide-y divide-slate-100">${recs.map(r => `<a href="#/recurring/edit/${r.id}" class="flex items-center justify-between px-[18px] py-3 hover:bg-slate-50 text-sm"><span><b>${r.id}</b> · ${r.frequency}<span class="block text-xs text-slate-500">Next: ${U.fmtDate(r.nextDate)}</span></span><span class="text-right"><span class="tabular font-semibold block">${U.money(C.totals(r.items).total)}</span>${ui.badge(r.status)}</span></a>`).join('')}</div></div>` : ''}
        </div>
        <div class="card xl:col-span-2 min-w-0">
          <div class="flex gap-5 px-[18px] border-b border-slate-200 overflow-x-auto" role="tablist">
            ${[['inv', `Invoices (${invs.length})`], ['quo', `Quotations (${quos.length})`], ['pay', `Payments (${pays.length})`], ['cn', `Credit notes (${cns.length})`]].map(([k, l], i) => `<button class="tab-btn ${i === 0 ? 'active' : ''}" data-tab="${k}" role="tab">${l}</button>`).join('')}
          </div>
          <div id="cv-tab"></div>
        </div>
      </div>`);
    v.querySelector('#cv-edit').onclick = () => openForm(id);
    v.querySelector('#cv-pay').onclick = () => NB.payments.openRecord({ customerId: id });

    const L = C.ledger(id, U.addMonths(U.today(), -6), U.today());
    v.querySelector('#cv-stmt').innerHTML = `<div class="space-y-2 text-sm">
      <div class="flex justify-between"><span class="text-slate-500">Opening balance</span><span class="tabular">${U.money(L.opening)}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">Invoiced</span><span class="tabular">${U.money(L.debits)}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">Payments &amp; credits</span><span class="tabular">-${U.money(L.credits)}</span></div>
      <div class="flex justify-between pt-2 border-t border-slate-100 font-semibold"><span>Closing balance</span><span class="tabular">${U.money(L.closing)}</span></div></div>
      <a href="#/statements?customer=${id}" class="btn btn-secondary btn-sm w-full mt-4">${ui.icon('scroll-text')}Open full statement</a>`;

    const tab = v.querySelector('#cv-tab');
    const tabs = {
      inv: () => ui.dataTable(tab, [
        { key: 'number', label: 'Invoice', render: r => `<a class="link" href="#/invoices/view/${r.id}">${esc(r.number)}</a>` },
        { key: 'date', label: 'Date', render: r => U.fmtDate(r.date) },
        { key: 'dueDate', label: 'Due', render: r => U.fmtDate(r.dueDate) },
        { key: 'total', label: 'Total', num: true, value: r => C.invoiceInfo(r).total, render: r => U.money(C.invoiceInfo(r).total) },
        { key: 'bal', label: 'Balance', num: true, value: r => C.invoiceInfo(r).balance, render: r => U.money(C.invoiceInfo(r).balance) },
        { key: 'status', label: 'Status', value: r => C.invoiceInfo(r).status, render: r => ui.badge(C.invoiceInfo(r).status) }
      ], { rows: invs, sort: { key: 'date', dir: 'desc' }, pageSize: 8, onRowClick: r => NB.go(`invoices/view/${r.id}`), emptyTitle: 'No invoices yet', emptyText: '', emptyAction: `<a class="btn btn-primary btn-sm" href="#/invoices/new?customer=${id}">Create invoice</a>` }),
      quo: () => ui.dataTable(tab, [
        { key: 'number', label: 'Quotation', render: r => `<a class="link" href="#/quotations/view/${r.id}">${esc(r.number)}</a>` },
        { key: 'date', label: 'Date', render: r => U.fmtDate(r.date) },
        { key: 'expiryDate', label: 'Valid until', render: r => U.fmtDate(r.expiryDate) },
        { key: 'total', label: 'Total', num: true, value: r => C.totals(r.items).total, render: r => U.money(C.totals(r.items).total) },
        { key: 'status', label: 'Status', value: r => C.quotationStatus(r), render: r => ui.badge(C.quotationStatus(r)) }
      ], { rows: quos, sort: { key: 'date', dir: 'desc' }, pageSize: 8, onRowClick: r => NB.go(`quotations/view/${r.id}`), emptyTitle: 'No quotations yet', emptyText: '', emptyAction: `<a class="btn btn-primary btn-sm" href="#/quotations/new?customer=${id}">Create quotation</a>` }),
      pay: () => ui.dataTable(tab, [
        { key: 'receiptNumber', label: 'Receipt', render: r => `<a class="link" href="#/receipts/view/${r.id}">${esc(r.receiptNumber)}</a>` },
        { key: 'date', label: 'Date', render: r => U.fmtDate(r.date) },
        { key: 'inv', label: 'Invoice', render: r => { const i = NB.data.get('invoices', r.invoiceId); return i ? `<a class="link" href="#/invoices/view/${i.id}">${esc(i.number)}</a>` : '—'; } },
        { key: 'method', label: 'Method' },
        { key: 'amount', label: 'Amount', num: true, render: r => U.money(r.amount) }
      ], { rows: pays, sort: { key: 'date', dir: 'desc' }, pageSize: 8, emptyTitle: 'No payments recorded', emptyText: '' }),
      cn: () => ui.dataTable(tab, [
        { key: 'number', label: 'Credit note', render: r => `<a class="link" href="#/credit-notes/view/${r.id}">${esc(r.number)}</a>` },
        { key: 'date', label: 'Date', render: r => U.fmtDate(r.date) },
        { key: 'reason', label: 'Reason' },
        { key: 'total', label: 'Amount', num: true, value: r => C.totals(r.items).total, render: r => U.money(C.totals(r.items).total) }
      ], { rows: cns, pageSize: 8, emptyTitle: 'No credit notes', emptyText: '' })
    };
    U.$$('[data-tab]', v).forEach(b => b.onclick = () => { U.$$('[data-tab]', v).forEach(x => x.classList.toggle('active', x === b)); tabs[b.dataset.tab](); });
    tabs.inv();
  }

  NB.route('customers', list);
  NB.route('customers/view/:id', view);

  return { openForm, remove, EMIRATES };
})();
