/* =====================================================================
   payments.js – record payments (partial / multiple), payments register,
   payment receipts list and receipt documents.
   Every receipt IS a payment record (receiptNumber is unique), so a
   receipt can never exist without a recorded payment.
   Laravel: Payment model (belongsTo Invoice, Customer), RecordPayment
   action inside DB::transaction with a row lock on the invoice to stop
   over-payment races; receipts rendered from resources/views/documents.
   ===================================================================== */
window.NB = window.NB || {};

NB.payments = (() => {
  const U = NB.utils; const ui = NB.ui; const C = NB.calc; const { esc } = U;
  const D = () => NB.data.db;
  const METHODS = ['Cash', 'Bank Transfer', 'Card', 'Cheque', 'Other'];

  const openInvoices = customerId => D().invoices.filter(i => C.isIssued(i) && (!customerId || i.customerId === customerId) && C.invoiceInfo(i).balance > 0.004);

  /* ---------------- Record payment (modal) ---------------- */
  function openRecord({ invoiceId = '', customerId = '' } = {}) {
    const preInv = invoiceId ? NB.data.get('invoices', invoiceId) : null;
    if (preInv && !C.isIssued(preInv)) {
      return ui.notAvailable('Payment cannot be recorded', preInv.status === 'Draft' ? `Invoice <b>${esc(preInv.number)}</b> is still a draft. Issue it first, then record the payment.` : `Invoice <b>${esc(preInv.number)}</b> is cancelled.`);
    }
    if (preInv && C.invoiceInfo(preInv).balance <= 0.004) return ui.notAvailable('Invoice already settled', `Invoice <b>${esc(preInv.number)}</b> has no outstanding balance.`);
    let cust = preInv ? preInv.customerId : customerId;
    const custWithOpen = [...new Set(openInvoices().map(i => i.customerId))];
    if (!custWithOpen.length) return ui.notAvailable('Nothing to collect', 'There are no issued invoices with an outstanding balance.');
    const m = ui.modal({
      title: 'Record payment', size: 'lg',
      body: `<form id="pf" novalidate class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label class="form-label" for="pf-cust">Customer<span class="req">*</span></label><select id="pf-cust" class="form-select"><option value="">Select customer…</option>${U.sortBy(custWithOpen, id => NB.data.customerName(id)).map(id => `<option value="${id}" ${id === cust ? 'selected' : ''}>${esc(NB.data.customerName(id))}</option>`).join('')}</select><div class="form-error hidden" id="pf-cust-error"></div></div>
        <div><label class="form-label" for="pf-inv">Invoice<span class="req">*</span></label><select id="pf-inv" class="form-select"></select><div class="form-error hidden" id="pf-inv-error"></div></div>
        <div id="pf-info" class="md:col-span-2"></div>
        ${ui.field({ id: 'pf-date', label: 'Payment date', type: 'date', value: U.today(), required: true })}
        <div><label class="form-label" for="pf-amount">Amount received (${U.currency()})<span class="req">*</span></label>
          <div class="flex gap-2"><input id="pf-amount" type="number" min="0.01" step="0.01" class="form-input text-right tabular"><button type="button" class="btn btn-secondary shrink-0" id="pf-full">Full balance</button></div>
          <div class="form-error hidden" id="pf-amount-error"></div><div class="form-help" id="pf-remaining"></div></div>
        ${ui.field({ id: 'pf-method', label: 'Payment method', type: 'select', options: METHODS, value: 'Bank Transfer', required: true })}
        ${ui.field({ id: 'pf-ref', label: 'Transaction / reference no.', placeholder: 'e.g. FT-12345, cheque number' })}
        ${ui.field({ id: 'pf-notes', label: 'Bank or payment notes', type: 'textarea', rows: 2, cls: 'md:col-span-2', placeholder: 'Optional – e.g. bank name for cheques, card last 4 digits' })}
        <div class="md:col-span-2 text-xs text-slate-500">A receipt number (${esc(NB.data.previewNumber('receipt', U.today()))}) is assigned when you save. Over-payments and advance payments are not supported in this prototype.</div>
      </form>`,
      actions: [{ label: 'Cancel', onClick: mm => mm.close() }, { label: 'Save payment', variant: 'primary', icon: 'check', onClick: mm => save(mm) }]
    });
    const el = m.el;
    const custSel = el.querySelector('#pf-cust'), invSel = el.querySelector('#pf-inv'), amt = el.querySelector('#pf-amount');
    const drawInvoices = (selected) => {
      const list = cust ? U.sortBy(openInvoices(cust), i => i.date) : [];
      invSel.innerHTML = `<option value="">${cust ? 'Select invoice…' : 'Select a customer first'}</option>` + list.map(i => { const inf = C.invoiceInfo(i); return `<option value="${i.id}" ${i.id === selected ? 'selected' : ''}>${esc(i.number)} · balance ${U.money(inf.balance)}${inf.status === 'Overdue' ? ' · overdue' : ''}</option>`; }).join('');
      if (!selected && list.length === 1) invSel.value = list[0].id;
      drawInfo();
    };
    const drawInfo = () => {
      const inv = invSel.value ? NB.data.get('invoices', invSel.value) : null;
      if (!inv) { el.querySelector('#pf-info').innerHTML = ''; el.querySelector('#pf-remaining').textContent = ''; return; }
      const inf = C.invoiceInfo(inv);
      el.querySelector('#pf-info').innerHTML = `<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm">
        <div><div class="text-xs text-slate-500">Invoice total</div><div class="tabular font-semibold">${U.money(inf.total)}</div></div>
        <div><div class="text-xs text-slate-500">Paid so far</div><div class="tabular font-semibold">${U.money(inf.paid)}</div></div>
        <div><div class="text-xs text-slate-500">${inf.credited ? 'Credited' : 'Due date'}</div><div class="tabular font-semibold">${inf.credited ? U.money(inf.credited) : U.fmtDate(inv.dueDate)}</div></div>
        <div><div class="text-xs text-slate-500">Balance due</div><div class="tabular font-extrabold text-brand-700">${U.money(inf.balance)}</div></div></div>`;
      if (!amt.value) amt.value = inf.balance.toFixed(2);
      remaining();
    };
    const remaining = () => {
      const inv = invSel.value ? NB.data.get('invoices', invSel.value) : null; if (!inv) return;
      const bal = C.invoiceInfo(inv).balance; const a = parseFloat(amt.value) || 0;
      const r = U.round2(bal - a);
      el.querySelector('#pf-remaining').textContent = a > 0 ? (r > 0 ? `Partial payment – ${U.money(r)} will remain outstanding.` : r === 0 ? 'This settles the invoice in full.' : `Exceeds the balance by ${U.money(-r)}.`) : '';
    };
    custSel.onchange = () => { cust = custSel.value; amt.value = ''; drawInvoices(); };
    invSel.onchange = () => { amt.value = ''; drawInfo(); };
    amt.oninput = remaining;
    el.querySelector('#pf-full').onclick = () => { const inv = NB.data.get('invoices', invSel.value); if (inv) { amt.value = C.invoiceInfo(inv).balance.toFixed(2); remaining(); } };
    drawInvoices(invoiceId);
    el.querySelector('#pf').onsubmit = e => { e.preventDefault(); save(m); };

    function save(mm) {
      const inv = invSel.value ? NB.data.get('invoices', invSel.value) : null;
      const amount = U.round2(parseFloat(amt.value));
      const date = ui.val('pf-date', el);
      const err = {};
      if (!custSel.value) err['pf-cust'] = 'Select the paying customer.';
      if (!inv) err['pf-inv'] = 'Select the invoice being paid.';
      if (!(amount > 0)) err['pf-amount'] = 'Enter an amount greater than zero.';
      else if (inv && amount > C.invoiceInfo(inv).balance + 0.004) err['pf-amount'] = `Amount cannot exceed the balance of ${U.money(C.invoiceInfo(inv).balance)}. Advance payments are not supported in this prototype.`;
      if (!date) err['pf-date'] = 'Enter the payment date.';
      else if (inv && date < inv.date) err['pf-date'] = `Payment date cannot be before the invoice date (${U.fmtDate(inv.date)}).`;
      else if (date > U.today()) err['pf-date'] = 'Payment date cannot be in the future.';
      if (!ui.showErrors(el, err)) return;
      const p = {
        id: NB.data.nextId('payment', 'PAY'), receiptNumber: NB.data.nextNumber('receipt', date), invoiceId: inv.id, customerId: inv.customerId,
        date, amount, method: ui.val('pf-method', el), reference: ui.val('pf-ref', el), notes: ui.val('pf-notes', el), createdAt: new Date().toISOString()
      };
      NB.data.insert('payments', p);
      const inf = C.invoiceInfo(inv);
      mm.close();
      ui.toast(`Payment of ${U.money(amount)} recorded · ${p.receiptNumber}. ${inv.number} is now ${inf.status.toLowerCase()}.`, 'ok', { duration: 6000, action: { label: 'View receipt', onClick: () => NB.go(`receipts/view/${p.id}`) } });
      NB.view.refresh();
    }
    return m;
  }

  /** Payment history for one invoice. */
  function historyModal(invoiceId) {
    const inv = NB.data.get('invoices', invoiceId); const info = C.invoiceInfo(inv);
    const pays = U.sortBy(C.paymentsFor(invoiceId), p => p.date);
    let run = 0;
    ui.modal({
      title: `Payment history · ${esc(inv.number)}`, size: 'lg',
      body: `<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Receipt</th><th>Method</th><th>Reference</th><th class="num">Amount</th><th class="num">Paid to date</th></tr></thead><tbody>
        ${pays.map(p => { run = U.round2(run + p.amount); return `<tr><td>${U.fmtDate(p.date)}</td><td><a class="link" href="#/receipts/view/${p.id}">${esc(p.receiptNumber)}</a></td><td>${esc(p.method)}</td><td>${esc(p.reference || '—')}</td><td class="num">${U.money(p.amount)}</td><td class="num">${U.money(run)}</td></tr>`; }).join('') || '<tr><td colspan="6" class="text-center text-slate-500">No payments yet.</td></tr>'}
        </tbody><tfoot><tr><td colspan="4">Invoice total ${U.money(info.total)}${info.credited ? ` · credited ${U.money(info.credited)}` : ''}</td><td class="num">${U.money(info.paid)}</td><td class="num">Balance ${U.money(info.balance)}</td></tr></tfoot></table></div>`,
      actions: [{ label: 'Close', variant: 'primary', onClick: m => m.close() }]
    });
  }

  /* ---------------- Shared payment table ---------------- */
  function paymentTable(container, rows, { receiptMode = false } = {}) {
    return ui.dataTable(container, [
      ...(receiptMode
        ? [{ key: 'receiptNumber', label: 'Receipt no.', render: r => `<a class="link" href="#/receipts/view/${r.id}">${esc(r.receiptNumber)}</a>` }]
        : [{ key: 'id', label: 'Payment ID', render: r => `<button class="link font-mono text-xs" data-detail="${r.id}">${r.id}</button>` }]),
      { key: 'date', label: receiptMode ? 'Receipt date' : 'Payment date', render: r => U.fmtDate(r.date) },
      { key: '_cust', label: 'Customer', render: r => `<a href="#/customers/view/${r.customerId}" class="hover:text-brand-600">${esc(r._cust)}</a>` },
      { key: '_inv', label: 'Invoice', render: r => r._invId ? `<a class="link" href="#/invoices/view/${r._invId}">${esc(r._inv)}</a>` : '—' },
      { key: 'method', label: 'Method', render: r => `<span class="chip">${esc(r.method)}</span>` },
      { key: 'reference', label: 'Reference', render: r => esc(r.reference || '—') },
      ...(receiptMode ? [] : [{ key: 'receiptNumber', label: 'Receipt no.', render: r => `<a class="link" href="#/receipts/view/${r.id}">${esc(r.receiptNumber)}</a>` }]),
      { key: 'amount', label: 'Amount', num: true, render: r => `<b>${U.money(r.amount)}</b>` },
      { key: 'a', label: '', sortable: false, render: r => `<div class="flex justify-end gap-0.5"><a class="row-action" href="#/receipts/view/${r.id}" title="View receipt" aria-label="View receipt ${r.receiptNumber}">${ui.icon('eye')}</a><button class="row-action" data-print="${r.id}" title="Print receipt" aria-label="Print receipt ${r.receiptNumber}">${ui.icon('printer')}</button><button class="row-action" data-pdf="${r.id}" title="Export PDF" aria-label="Export receipt ${r.receiptNumber} as PDF">${ui.icon('download')}</button></div>` }
    ], {
      rows, sort: { key: 'date', dir: 'desc' }, pageSize: 12,
      footer: rs => `<tr><td colspan="${receiptMode ? 6 : 7}">Total (${rs.length} payments)</td><td class="num">${U.money(U.sum(rs, r => r.amount))}</td><td></td></tr>`,
      emptyTitle: 'No payments match these filters',
      afterRender: el => {
        U.$$('[data-print]', el).forEach(b => b.onclick = () => { const d = NB.docs.build('receipt', b.dataset.print); NB.docs.print(d.html, d.title); });
        U.$$('[data-pdf]', el).forEach(b => b.onclick = () => { const d = NB.docs.build('receipt', b.dataset.pdf); NB.docs.exportPdf(d.html, d.filename, b); });
        U.$$('[data-detail]', el).forEach(b => b.onclick = () => detailModal(b.dataset.detail));
      }
    });
  }
  const enrich = p => { const inv = NB.data.get('invoices', p.invoiceId); return { ...p, _cust: NB.data.customerName(p.customerId), _inv: inv ? inv.number : '', _invId: inv ? inv.id : '' }; };

  function detailModal(id) {
    const p = NB.data.get('payments', id); const inv = NB.data.get('invoices', p.invoiceId);
    ui.modal({ title: `Payment ${esc(p.id)}`, body: `<dl class="kv">
      <dt>Receipt no.</dt><dd><a class="link" href="#/receipts/view/${p.id}">${esc(p.receiptNumber)}</a></dd>
      <dt>Date</dt><dd>${U.fmtDate(p.date)}</dd><dt>Customer</dt><dd><a class="link" href="#/customers/view/${p.customerId}">${esc(NB.data.customerName(p.customerId))}</a></dd>
      <dt>Invoice</dt><dd>${inv ? `<a class="link" href="#/invoices/view/${inv.id}">${esc(inv.number)}</a> · balance now ${U.money(C.invoiceInfo(inv).balance)}` : '—'}</dd>
      <dt>Amount</dt><dd class="font-bold">${U.money(p.amount)}</dd><dt>Method</dt><dd>${esc(p.method)}</dd><dt>Reference</dt><dd>${esc(p.reference || '—')}</dd><dt>Notes</dt><dd>${esc(p.notes || '—')}</dd>
      <dt>Recorded</dt><dd>${esc(p.createdAt.length > 10 ? new Date(p.createdAt).toLocaleString('en-GB') : U.fmtDate(p.createdAt))}</dd></dl>`,
      actions: [{ label: 'Payment history', icon: 'list-checks', onClick: m => { m.close(); historyModal(p.invoiceId); } }, { label: 'View receipt', variant: 'primary', icon: 'receipt-text', onClick: m => { m.close(); NB.go(`receipts/view/${p.id}`); } }] });
  }

  /* ---------------- Payments register (Finance) ---------------- */
  function listView(receiptMode) {
    return (params, query) => {
      const f = { q: query.q || '', method: '', customer: query.customer || '', from: '', to: '' };
      const v = NB.view.render(`
        ${ui.pageHeader({
          title: receiptMode ? 'Payment Receipts' : 'Payments', crumbs: receiptMode ? [{ label: 'Sales & Documents' }, { label: 'Payment Receipts' }] : [{ label: 'Finance' }, { label: 'Payments' }],
          subtitle: receiptMode ? 'Every receipt is generated from a recorded customer payment. Print or export any receipt.' : 'All customer payments received against invoices. Expenses are tracked separately.',
          actions: `<button class="btn btn-secondary" id="p-export">${ui.icon('file-spreadsheet')}Export CSV</button><button class="btn btn-primary" id="p-new">${ui.icon('plus')}Record payment</button>`
        })}
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="p-stats"></div>
        <div class="card"><div class="flex flex-wrap gap-2 p-4 border-b border-slate-100">
          ${ui.searchInput('p-q', receiptMode ? 'Search receipt, invoice, customer or reference…' : 'Search payment ID, receipt, invoice, customer or reference…', f.q)}
          ${ui.selectInput('p-method', [{ value: '', label: 'All methods' }, ...METHODS], '', 'Payment method')}
          <select id="p-cust" class="form-select w-auto max-w-[240px]" aria-label="Customer">${ui.customerOptions(f.customer, { includeInactive: true, placeholder: 'All customers' })}</select>
          <div id="p-range"></div></div><div id="p-table"></div></div>`);
      const filter = () => {
        const q = f.q.toLowerCase();
        return D().payments.map(enrich).filter(p => (!q || [p.id, p.receiptNumber, p._inv, p._cust, p.reference].some(x => String(x || '').toLowerCase().includes(q)))
          && (!f.method || p.method === f.method) && (!f.customer || p.customerId === f.customer) && (!f.from || (p.date >= f.from && p.date <= f.to)));
      };
      const stats = rows => {
        const byMethod = U.groupBy(rows, r => r.method);
        const top = Object.entries(byMethod).map(([k, a]) => [k, U.sum(a, x => x.amount)]).sort((a, b) => b[1] - a[1])[0];
        const thisMonth = rows.filter(r => r.date.slice(0, 7) === U.today().slice(0, 7));
        v.querySelector('#p-stats').innerHTML = [
          ui.statCard({ label: 'Total received', value: U.money(U.sum(rows, r => r.amount)), icon: 'hand-coins', tone: 'ok', sub: `${rows.length} payments in view` }),
          ui.statCard({ label: 'This month', value: U.money(U.sum(thisMonth, r => r.amount)), icon: 'calendar', tone: 'brand', sub: `${thisMonth.length} payments` }),
          ui.statCard({ label: 'Average payment', value: U.money(rows.length ? U.sum(rows, r => r.amount) / rows.length : 0), icon: 'coins', tone: 'navy' }),
          ui.statCard({ label: 'Top method', value: top ? esc(top[0]) : '—', icon: 'credit-card', tone: 'teal', sub: top ? U.money(top[1]) : '' })
        ].join('');
        ui.icons(v.querySelector('#p-stats'));
      };
      const table = paymentTable(v.querySelector('#p-table'), filter(), { receiptMode });
      const upd = () => { const r = filter(); table.setRows(r); stats(r); };
      stats(filter());
      ui.dateRange(v.querySelector('#p-range'), { preset: 'all', idPrefix: 'p-dr', onChange: r => { f.from = r.preset === 'all' ? '' : r.from; f.to = r.to; upd(); } });
      v.querySelector('#p-q').addEventListener('input', U.debounce(e => { f.q = e.target.value; upd(); }, 150));
      v.querySelector('#p-method').onchange = e => { f.method = e.target.value; upd(); };
      v.querySelector('#p-cust').onchange = e => { f.customer = e.target.value; upd(); };
      v.querySelector('#p-new').onclick = () => openRecord();
      v.querySelector('#p-export').onclick = () => {
        const r = table.rows;
        U.download(`${receiptMode ? 'receipts' : 'payments'}-${U.today()}.csv`, U.toCSV([['Payment ID', 'Receipt no.', 'Date', 'Customer ID', 'Customer', 'Invoice', 'Method', 'Reference', 'Amount'],
          ...r.map(p => [p.id, p.receiptNumber, p.date, p.customerId, p._cust, p._inv, p.method, p.reference, p.amount.toFixed(2)])]), 'text/csv');
        ui.toast(`Exported ${r.length} records.`);
      };
    };
  }

  /* ---------------- Receipt document view ---------------- */
  function receiptView({ id }) {
    const p = NB.data.get('payments', id);
    if (!p) return NB.view.render(`<div class="card">${ui.emptyState('Receipt not found', 'Receipts exist only for recorded payments.', '<a class="btn btn-primary" href="#/receipts">Back to receipts</a>')}</div>`);
    const inv = NB.data.get('invoices', p.invoiceId);
    const v = NB.view.render(`
      ${ui.pageHeader({ title: `Receipt ${esc(p.receiptNumber)}`, crumbs: [{ label: 'Payment Receipts', href: '#/receipts' }, { label: p.receiptNumber }],
        subtitle: `${U.money(p.amount)} from ${esc(NB.data.customerName(p.customerId))} · ${U.fmtDate(p.date)} · ${esc(p.method)}`,
        actions: `${inv ? `<a class="btn btn-secondary" href="#/invoices/view/${inv.id}">${ui.icon('receipt')}View invoice ${esc(inv.number)}</a>` : ''}
          <button class="btn btn-secondary" id="rv-hist">${ui.icon('list-checks')}Payment history</button>
          <button class="btn btn-secondary" id="rv-pdf">${ui.icon('download')}Export PDF</button>
          <button class="btn btn-primary" id="rv-print">${ui.icon('printer')}Print</button>` })}
      <div class="max-w-[900px]" id="rv-doc"></div>`);
    NB.docs.mountPreview(v.querySelector('#rv-doc'), NB.docs.receipt(p));
    v.querySelector('#rv-hist').onclick = () => historyModal(p.invoiceId);
    v.querySelector('#rv-pdf').onclick = e => { const d = NB.docs.build('receipt', id); NB.docs.exportPdf(d.html, d.filename, e.currentTarget); };
    v.querySelector('#rv-print').onclick = () => { const d = NB.docs.build('receipt', id); NB.docs.print(d.html, d.title); };
  }

  NB.route('payments', listView(false));
  NB.route('receipts', listView(true));
  NB.route('receipts/view/:id', receiptView);

  return { openRecord, historyModal, METHODS };
})();
