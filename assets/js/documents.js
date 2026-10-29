/* =====================================================================
   documents.js – A4 business document templates + print / PDF export.
   Two visual templates: "classic" (navy band) and "modern" (minimal).
   Laravel: resources/views/documents/{classic|modern}/{quotation,invoice,
   receipt,statement,credit-note}.blade.php sharing partials for header,
   party blocks, items table, totals and footer. Production PDFs should be
   rendered server-side (Browsershot/Chromium) from the same Blade views.
   ===================================================================== */
window.NB = window.NB || {};

NB.docs = (() => {
  const U = NB.utils; const { esc, money, num, fmtDate } = U; const ui = NB.ui;
  const D = () => NB.data.db;
  const company = () => D().company;
  const tpl = override => override || D().settings.template || 'classic';

  /** Show "TAX INVOICE"/"TAX CREDIT NOTE" only when the business is set up as VAT registered with a TRN.
      Illustrative only – eligibility and mandatory fields must be validated against current FTA rules. */
  const taxLabelEnabled = () => !!(D().settings.showTaxInvoiceLabel && company().vatRegistered && company().trn);

  /* ---------- Shared partials ---------- */
  function logo() {
    const c = company();
    return `<div class="d-logo">${c.logo ? `<img src="${c.logo}" alt="">` : esc(U.initials(c.tradingName || c.legalName))}</div>`;
  }
  function companyBlock() {
    const c = company();
    const addr = [c.address, [c.poBox, c.city].filter(Boolean).join(', '), [c.emirate !== c.city ? c.emirate : '', c.country].filter(Boolean).join(', ')].filter(Boolean);
    return `<div class="d-company">${logo()}<div>
      <div class="d-company-name">${esc(c.legalName)}</div>
      <div class="d-company-meta">${addr.map(esc).join('<br>')}<br>${esc(c.phone)} · ${esc(c.email)}${c.trn ? `<br><b>TRN: ${esc(c.trn)}</b>` : ''}</div>
    </div></div>`;
  }
  function header({ title, sub = '', meta = [] }, t) {
    if (tpl(t) === 'classic') {
      return `<div class="d-band"><div class="d-head">${companyBlock()}<div><div class="d-title">${esc(title)}</div>${sub ? `<div class="d-title-sub">${esc(sub)}</div>` : ''}</div></div></div>
        <div class="d-meta-row" style="grid-template-columns:repeat(${meta.length},1fr)">${meta.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
    }
    return `<div class="d-head">${companyBlock()}<div><div class="d-title">${esc(title)}</div>${sub ? `<div class="d-title-sub">${esc(sub)}</div>` : ''}
      <dl class="d-meta">${meta.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div></div>`;
  }
  function customerBlock(cust, label = 'Bill to') {
    if (!cust) return `<div><div class="d-box-label">${label}</div><div class="d-party">Customer record not found</div></div>`;
    const name = NB.data.customerName(cust);
    const lines = [cust.companyName && cust.contactPerson ? `Attn: ${cust.contactPerson}` : '', cust.billingAddress, [cust.city, cust.emirate !== cust.city ? cust.emirate : ''].filter(Boolean).join(', '), cust.country, [cust.phone, cust.email].filter(Boolean).join(' · ')].filter(Boolean);
    return `<div><div class="d-box-label">${label}</div><div class="d-party-name">${esc(name)}</div><div class="d-party">${lines.map(esc).join('<br>')}${cust.trn ? `<br><b>Customer TRN: ${esc(cust.trn)}</b>` : ''}</div></div>`;
  }
  function detailsBlock(label, rows) {
    return `<div><div class="d-box-label">${label}</div><dl class="d-bank">${rows.filter(r => r[1]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>`;
  }
  function itemsTable(items) {
    return `<table class="d-items"><thead><tr>
      <th style="width:26px">#</th><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Disc.</th><th class="r">Taxable amt</th><th class="r">VAT</th><th class="r">Amount</th>
    </tr></thead><tbody>${items.map((it, i) => {
      const l = NB.calc.line(it);
      return `<tr><td class="c">${i + 1}</td><td><div class="d-item-title">${esc(it.description)}</div>${it.details ? `<div class="d-item-sub">${esc(it.details)}</div>` : ''}</td>
        <td class="r">${num(it.qty, Number.isInteger(+it.qty) ? 0 : 2)}</td><td class="r">${num(it.unitPrice)}</td>
        <td class="r">${it.discount ? num(it.discount, it.discount % 1 ? 1 : 0) + '%' : '—'}</td><td class="r">${num(l.net)}</td>
        <td class="r">${num(l.vat)}<div class="d-item-sub">${esc(it.taxLabel)}</div></td><td class="r"><b>${num(l.total)}</b></td></tr>`;
    }).join('')}</tbody></table>`;
  }
  function vatSummary(t) {
    const rows = t.vatBreakdown;
    if (!rows.length) return '';
    return `<div class="d-box-label">VAT summary</div><table class="d-vat"><thead><tr><th>VAT code</th><th class="r">Taxable amount</th><th class="r">VAT</th></tr></thead><tbody>
      ${rows.map(v => `<tr><td>${esc(v.label)}${v.category === 'exempt' ? ' (exempt supply)' : v.category === 'zero' ? ' (zero-rated supply)' : ''}</td><td class="r">${num(v.net)}</td><td class="r">${num(v.vat)}</td></tr>`).join('')}
      <tr><td><b>Total</b></td><td class="r"><b>${num(t.taxable)}</b></td><td class="r"><b>${num(t.vat)}</b></td></tr></tbody></table>`;
  }
  function totalsTable(t, extra = []) {
    const cur = U.currency();
    return `<table class="d-totals"><tbody>
      <tr><td>Subtotal</td><td>${num(t.subtotal)}</td></tr>
      ${t.discount ? `<tr><td>Discount</td><td>-${num(t.discount)}</td></tr>` : ''}
      <tr><td>Taxable amount</td><td>${num(t.taxable)}</td></tr>
      <tr><td>VAT</td><td>${num(t.vat)}</td></tr>
      <tr class="d-grand"><td>Total (${cur})</td><td>${num(t.total)}</td></tr>
      ${extra.join('')}
    </tbody></table>`;
  }
  function bankBlock() {
    const c = company();
    return `<div class="d-section"><div class="d-box-label">Bank &amp; payment details</div><dl class="d-bank">
      <dt>Bank</dt><dd>${esc(c.bankName)}</dd><dt>Account name</dt><dd>${esc(c.accountHolder)}</dd><dt>IBAN</dt><dd>${esc(c.iban)}</dd><dt>SWIFT / BIC</dt><dd>${esc(c.swift)}</dd></dl>
      ${c.paymentInstructions ? `<div class="d-text" style="margin-top:6px">${esc(c.paymentInstructions)}</div>` : ''}</div>`;
  }
  function footer(note = '') {
    const c = company();
    return `<div class="d-footer"><div>${esc(c.legalName)}${c.trn ? ` · TRN ${esc(c.trn)}` : ''}<br>${esc(c.address)}, ${esc(c.city)}</div>
      <div style="text-align:right">${esc(c.phone)} · ${esc(c.email)}<br>${esc(c.website)}${note ? ` · ${esc(note)}` : ''}</div></div>`;
  }
  const stamp = (text, tone) => `<div class="d-stamp ${tone}">${esc(text)}</div>`;
  const wrap = (inner, t, extraCls = '') => `<div class="doc tpl-${tpl(t)} ${extraCls}">${inner}</div>`;

  /* ---------- Quotation ---------- */
  function quotation(q, t) {
    const cust = NB.data.customer(q.customerId);
    const tot = NB.calc.totals(q.items);
    const status = NB.calc.quotationStatus(q);
    const st = { Rejected: ['Rejected', 'bad'], Expired: ['Expired', 'neutral'], Draft: ['Draft', 'neutral'], Accepted: ['Accepted', 'ok'] }[status];
    return wrap(`
      ${header({ title: 'Quotation', sub: q.number, meta: [['Quotation no.', q.number], ['Date', fmtDate(q.date)], ['Valid until', fmtDate(q.expiryDate)], ['Customer ID', q.customerId]] }, t)}
      <div class="d-parties">${customerBlock(cust, 'Prepared for')}${detailsBlock('Quotation details', [['Reference', q.number], ['Issued', fmtDate(q.date)], ['Valid until', fmtDate(q.expiryDate)], ['Currency', U.currency()], ['Prepared by', company().tradingName]])}</div>
      ${itemsTable(q.items)}
      <div class="d-summary"><div>${st ? stamp(st[0], st[1]) : ''}${vatSummary(tot)}${q.notes ? `<div class="d-section" style="margin-top:14px"><div class="d-box-label">Notes</div><div class="d-text">${esc(q.notes)}</div></div>` : ''}</div>
        <div>${totalsTable(tot, [`<tr class="d-muted"><td colspan="2">Amount in words: ${esc(U.amountInWords(tot.total))}</td></tr>`])}</div></div>
      ${q.terms ? `<div class="d-section"><div class="d-box-label">Terms &amp; conditions</div><div class="d-text">${esc(q.terms)}</div></div>` : ''}
      <div class="d-grow"></div>
      <div class="d-sign">
        <div><div class="d-box-label">For ${esc(company().legalName)}</div><div class="d-sign-line">Authorised signatory &amp; company stamp</div></div>
        <div><div class="d-box-label">Customer acceptance</div><div class="d-party" style="font-size:10px">We accept this quotation and its terms.</div><div class="d-sign-line" style="margin-top:30px">Name, signature, stamp &amp; date</div></div>
      </div>
      ${footer(`Quotation ${q.number}`)}`, t);
  }

  /* ---------- Invoice ---------- */
  function invoice(inv, t) {
    const cust = NB.data.customer(inv.customerId);
    const info = NB.calc.invoiceInfo(inv);
    const quo = inv.quotationId ? NB.data.get('quotations', inv.quotationId) : null;
    const title = taxLabelEnabled() ? 'Tax Invoice' : 'Invoice';
    const st = { Paid: ['Paid', 'ok'], Cancelled: ['Cancelled', 'bad'], Draft: ['Draft', 'neutral'] }[info.status];
    const extra = [
      `<tr><td>Amount paid</td><td>${info.paid ? '-' : ''}${num(info.paid)}</td></tr>`,
      info.credited ? `<tr><td>Credit notes</td><td>-${num(info.credited)}</td></tr>` : '',
      `<tr class="d-due"><td>Balance due (${U.currency()})</td><td>${num(inv.status === 'Draft' ? info.total : info.balance)}</td></tr>`
    ];
    return wrap(`
      ${header({ title, sub: inv.number, meta: [['Invoice no.', inv.number], ['Invoice date', fmtDate(inv.date)], ['Due date', fmtDate(inv.dueDate)], ['Balance due', money(inv.status === 'Draft' ? info.total : info.balance)]] }, t)}
      <div class="d-parties">${customerBlock(cust)}${detailsBlock('Invoice details', [['Customer ID', inv.customerId], ['Quotation ref.', quo ? quo.number : ''], ['PO number', inv.poNumber], ['Payment terms', inv.paymentTerms], ['Supplier TRN', company().trn], ['Recurring profile', inv.recurringId]])}</div>
      ${itemsTable(inv.items)}
      <div class="d-summary"><div>${st ? stamp(st[0], st[1]) : ''}${vatSummary(info)}</div><div>${totalsTable(info, extra)}
        <div class="d-note">Amount in words: ${esc(U.amountInWords(info.total))}</div></div></div>
      ${bankBlock()}
      ${inv.notes || inv.paymentTerms ? `<div class="d-section"><div class="d-box-label">Terms &amp; notes</div><div class="d-text">${esc([inv.paymentTerms, inv.notes].filter(Boolean).join('\n'))}</div></div>` : ''}
      <div class="d-grow"></div>
      ${footer(`Invoice ${inv.number}`)}`, t);
  }

  /* ---------- Payment receipt (always tied to a payment record) ---------- */
  function receipt(p, t) {
    const inv = NB.data.get('invoices', p.invoiceId);
    const cust = NB.data.customer(p.customerId);
    const total = inv ? NB.calc.totals(inv.items).total : 0;
    // Paid before this receipt: earlier payments (by date, then id) on the same invoice
    const prior = NB.data.db.payments.filter(x => x.invoiceId === p.invoiceId && (x.date < p.date || (x.date === p.date && x.id < p.id)));
    const paidBefore = U.sum(prior, x => x.amount);
    const credits = inv ? U.sum(NB.calc.creditNotesFor(inv.id, p.date), c => NB.calc.totals(c.items).total) : 0;
    const remaining = U.round2(total - paidBefore - credits - p.amount);
    return wrap(`
      ${header({ title: 'Payment Receipt', sub: p.receiptNumber, meta: [['Receipt no.', p.receiptNumber], ['Receipt date', fmtDate(p.date)], ['Method', p.method], ['Invoice', inv ? inv.number : '—']] }, t)}
      <div class="d-parties">${customerBlock(cust, 'Received from')}${detailsBlock('Payment details', [['Payment ID', p.id], ['Method', p.method], ['Transaction ref.', p.reference || '—'], ['Notes', p.notes]])}</div>
      <div class="d-amount-box"><div class="lbl"><div class="d-box-label">Amount received</div><div class="d-words">${esc(U.amountInWords(p.amount))}</div></div><div class="val">${money(p.amount)}</div></div>
      <table class="d-items"><thead><tr><th>Invoice no.</th><th>Invoice date</th><th class="r">Invoice total</th><th class="r">Previously paid${credits ? ' / credited' : ''}</th><th class="r">This payment</th><th class="r">Balance remaining</th></tr></thead>
        <tbody><tr><td><b>${esc(inv ? inv.number : '—')}</b></td><td>${inv ? fmtDate(inv.date) : '—'}</td><td class="r">${num(total)}</td><td class="r">${num(paidBefore + credits)}</td><td class="r"><b>${num(p.amount)}</b></td><td class="r"><b>${num(Math.max(remaining, 0))}</b></td></tr></tbody></table>
      <div class="d-section"><div class="d-text">${remaining <= 0.004 ? 'This payment settles the invoice in full.' : `A balance of ${money(remaining)} remains outstanding on invoice ${esc(inv ? inv.number : '')}.`}</div></div>
      <div class="d-grow"></div>
      <div class="d-sign"><div><div class="d-box-label">Received by</div><div class="d-sign-line">Authorised signature &amp; company stamp</div></div>
        <div style="align-self:end;text-align:right"><div style="font:800 15px Manrope,sans-serif;color:var(--acc)">Thank you for your payment.</div><div class="d-party">We appreciate your business.</div></div></div>
      ${footer(`Receipt ${p.receiptNumber}`)}`, t);
  }

  /* ---------- Credit note ---------- */
  function creditNote(cn, t) {
    const inv = NB.data.get('invoices', cn.invoiceId);
    const cust = NB.data.customer(cn.customerId);
    const tot = NB.calc.totals(cn.items);
    const title = taxLabelEnabled() ? 'Tax Credit Note' : 'Credit Note';
    return wrap(`
      ${header({ title, sub: cn.number, meta: [['Credit note no.', cn.number], ['Date', fmtDate(cn.date)], ['Against invoice', inv ? inv.number : '—'], ['Invoice date', inv ? fmtDate(inv.date) : '—']] }, t)}
      <div class="d-parties">${customerBlock(cust, 'Issued to')}${detailsBlock('Adjustment details', [['Original invoice', inv ? inv.number : '—'], ['Reason', cn.reason], ['Status', cn.status]])}</div>
      ${itemsTable(cn.items)}
      <div class="d-summary"><div>${vatSummary(tot)}${cn.notes ? `<div class="d-section" style="margin-top:14px"><div class="d-box-label">Notes</div><div class="d-text">${esc(cn.notes)}</div></div>` : ''}</div>
        <div>${totalsTable(tot, [`<tr class="d-due"><td>Credit amount (${U.currency()})</td><td>${num(tot.total)}</td></tr>`])}</div></div>
      <div class="d-section"><div class="d-text">This credit note reduces the balance of invoice ${esc(inv ? inv.number : '')}. No cash refund is issued by this document.</div></div>
      <div class="d-grow"></div>
      <div class="d-sign"><div><div class="d-box-label">Authorised by</div><div class="d-sign-line">Authorised signatory</div></div><div></div></div>
      ${footer(`Credit note ${cn.number}`)}`, t);
  }

  /* ---------- Statement of account ---------- */
  function statement({ customerId, from, to, statementDate }, t) {
    const cust = NB.data.customer(customerId);
    const L = NB.calc.ledger(customerId, from, to);
    const ag = L.aging;
    const B = NB.calc.AGING_BUCKETS;
    return wrap(`
      ${header({ title: 'Statement of Account', sub: `${fmtDate(from)} – ${fmtDate(to)}`, meta: [['Statement date', fmtDate(statementDate)], ['Period from', fmtDate(from)], ['Period to', fmtDate(to)], ['Customer ID', customerId]] }, t)}
      <div class="d-parties">${customerBlock(cust, 'Statement for')}${detailsBlock('Account summary', [['Opening balance', money(L.opening)], ['Invoiced in period', money(L.debits)], ['Payments received', money(L.payments)], ['Credit notes', L.creditNotes ? money(L.creditNotes) : ''], ['Closing balance', money(L.closing)]])}</div>
      <div class="d-kpis"><div class="d-kpi"><div class="d-kpi-label">Opening balance</div><div class="d-kpi-value">${num(L.opening)}</div></div>
        <div class="d-kpi"><div class="d-kpi-label">Invoiced</div><div class="d-kpi-value">${num(L.debits)}</div></div>
        <div class="d-kpi"><div class="d-kpi-label">Payments &amp; credits</div><div class="d-kpi-value">${num(L.credits)}</div></div>
        <div class="d-kpi"><div class="d-kpi-label">Closing balance (${U.currency()})</div><div class="d-kpi-value">${num(L.closing)}</div></div></div>
      <table class="d-items"><thead><tr><th style="width:78px">Date</th><th style="width:118px">Reference</th><th>Description</th><th class="r">Debit</th><th class="r">Credit</th><th class="r">Balance</th></tr></thead><tbody>
        <tr><td>${fmtDate(from)}</td><td></td><td><b>Opening balance</b> <span class="d-item-sub">(all activity before ${fmtDate(from)})</span></td><td class="r"></td><td class="r"></td><td class="r"><b>${num(L.opening)}</b></td></tr>
        ${L.rows.map(r => `<tr><td>${fmtDate(r.date)}</td><td><b>${esc(r.ref)}</b></td><td>${esc(r.desc)}</td><td class="r">${r.debit ? num(r.debit) : ''}</td><td class="r">${r.credit ? num(r.credit) : ''}</td><td class="r">${num(r.balance)}</td></tr>`).join('')}
        ${L.rows.length ? '' : `<tr><td colspan="6" style="text-align:center;color:#5b6680">No transactions in this period.</td></tr>`}
        <tr><td>${fmtDate(to)}</td><td></td><td><b>Closing balance</b></td><td class="r"><b>${num(L.debits)}</b></td><td class="r"><b>${num(L.credits)}</b></td><td class="r"><b>${num(L.closing)}</b></td></tr>
      </tbody></table>
      <div class="d-section"><div class="d-box-label">Ageing of balance as at ${fmtDate(to)}</div>
        <table class="d-vat"><thead><tr>${B.map(b => `<th class="r">${esc(b.label)}</th>`).join('')}<th class="r">Total due</th></tr></thead>
        <tbody><tr>${B.map(b => `<td class="r">${num(ag.buckets[b.key])}</td>`).join('')}<td class="r"><b>${num(ag.total)}</b></td></tr></tbody></table></div>
      ${L.outstanding.length ? `<div class="d-section"><div class="d-box-label">Outstanding invoices as at ${fmtDate(to)}</div>
        <table class="d-vat"><thead><tr><th>Invoice</th><th>Date</th><th>Due date</th><th class="r">Total</th><th class="r">Balance</th><th class="r">Days overdue</th></tr></thead><tbody>
        ${L.outstanding.map(o => `<tr><td><b>${esc(o.inv.number)}</b></td><td>${fmtDate(o.inv.date)}</td><td>${fmtDate(o.inv.dueDate)}</td><td class="r">${num(o.info.total)}</td><td class="r">${num(o.info.balance)}</td><td class="r">${o.info.daysOverdue || '—'}</td></tr>`).join('')}
        </tbody></table></div>` : ''}
      ${bankBlock()}
      <div class="d-section"><div class="d-note">Opening balance includes all issued invoices, less payments and credit notes, dated before the start of the period. Draft and cancelled invoices are excluded. Please contact us within 14 days if any item on this statement is incorrect.</div></div>
      <div class="d-grow"></div>
      ${footer('Statement of account')}`, t);
  }

  /* ---------- Report document (used by reports print/PDF) ---------- */
  function report({ title, period, kpis = [], images = [], tables = [] }) {
    return wrap(`
      ${header({ title, sub: period, meta: [['Generated', fmtDate(U.today())], ['Period', period], ['Currency', U.currency()]] }, 'modern')}
      ${kpis.length ? `<div class="d-kpis" style="grid-template-columns:repeat(${Math.min(kpis.length, 4)},1fr)">${kpis.slice(0, 4).map(k => `<div class="d-kpi"><div class="d-kpi-label">${esc(k.label)}</div><div class="d-kpi-value">${esc(k.value)}</div></div>`).join('')}</div>` : ''}
      ${images.map(img => `<div class="d-section"><div class="d-box-label">${esc(img.title)}</div><img class="d-chart-img" src="${img.src}" alt="${esc(img.title)}"></div>`).join('')}
      ${tables.map(tb => `<div class="d-section" style="break-inside:auto;page-break-inside:auto"><div class="d-box-label">${esc(tb.title)}</div><table class="d-report"><thead><tr>${tb.columns.map(c => `<th class="${c.num ? 'r' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${tb.rows.map(r => `<tr>${tb.columns.map((c, i) => `<td class="${c.num ? 'r' : ''}">${esc(r[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('')}
      ${footer('Management report – figures computed from recorded transactions')}`, 'modern', 'doc-report');
  }

  /* ---------- Lookup helper used by list/detail views ---------- */
  function build(type, id, t) {
    const map = {
      quotation: ['quotations', quotation, r => `Quotation ${r.number}`],
      invoice: ['invoices', invoice, r => `${taxLabelEnabled() ? 'Tax Invoice' : 'Invoice'} ${r.number}`],
      receipt: ['payments', receipt, r => `Receipt ${r.receiptNumber}`],
      creditNote: ['creditNotes', creditNote, r => `Credit Note ${r.number}`]
    }[type];
    const rec = NB.data.get(map[0], id);
    if (!rec) return null;
    const title = map[2](rec);
    return { html: map[1](rec, t), title, filename: U.slug(title) + '.pdf', record: rec };
  }

  /* ---------- On-screen preview, scaled to fit ---------- */
  function mountPreview(container, html) {
    container.innerHTML = `<div class="doc-stage"><div class="doc-fit-outer"><div class="doc-fit"><div class="doc-paper">${html}</div></div></div></div>`;
    const stage = container.querySelector('.doc-stage'), outer = container.querySelector('.doc-fit-outer'), fit = container.querySelector('.doc-fit'), paper = container.querySelector('.doc-paper');
    const refit = () => {
      const avail = stage.clientWidth - (window.innerWidth < 640 ? 16 : 48);
      const s = Math.min(1, avail / 794);
      fit.style.transform = `scale(${s})`;
      outer.style.width = 794 * s + 'px';
      outer.style.height = paper.offsetHeight * s + 'px';
      stage.style.padding = window.innerWidth < 640 ? '8px' : '24px';
    };
    refit();
    if (window.ResizeObserver) { const ro = new ResizeObserver(refit); ro.observe(stage); }
    U.$$('img', paper).forEach(img => img.addEventListener('load', refit));
  }

  /** Modal preview with print + PDF actions. */
  function preview(type, id, extraActions = []) {
    let current = tpl();
    const doc = build(type, id, current);
    if (!doc) return ui.toast('Document not found.', 'err');
    const m = ui.modal({
      title: esc(doc.title), size: 'xl',
      body: `<div class="flex flex-wrap items-center justify-between gap-2 mb-3"><div class="flex items-center gap-2 text-sm"><span class="text-slate-500">Template</span>
          ${ui.selectInput('pv-tpl', [{ value: 'classic', label: 'Classic' }, { value: 'modern', label: 'Modern' }], current, 'Template')}</div>
          <span class="text-xs text-slate-500">A4 · ${U.currency()} · prices in ${U.currency()}</span></div><div id="pv-stage"></div>`,
      actions: [...extraActions, { label: 'Export PDF', icon: 'download', onClick: (mm, b) => exportPdf(build(type, id, current).html, doc.filename, b) },
        { label: 'Print', icon: 'printer', variant: 'primary', onClick: () => print(build(type, id, current).html, doc.title) }]
    });
    const stage = m.el.querySelector('#pv-stage');
    mountPreview(stage, doc.html);
    m.el.querySelector('#pv-tpl').onchange = e => { current = e.target.value; mountPreview(stage, build(type, id, current).html); };
    return m;
  }

  /* ---------- Print ---------- */
  function print(html, title) {
    const root = document.getElementById('print-root');
    root.innerHTML = html;
    const oldTitle = document.title;
    if (title) document.title = title;
    document.body.classList.add('print-mode');
    const done = () => { document.body.classList.remove('print-mode'); root.innerHTML = ''; document.title = oldTitle; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    waitForImages(root).then(() => {
      try { window.print(); }
      catch (e) { done(); ui.notAvailable('Print', 'This browser blocked the print dialog. Open the prototype directly in Chrome, Edge, Safari or Firefox to print.'); }
    });
  }
  function waitForImages(root) {
    const imgs = U.$$('img', root).filter(i => !i.complete);
    return Promise.all(imgs.map(i => new Promise(r => { i.onload = i.onerror = r; }))).then(() => (document.fonts ? document.fonts.ready : null));
  }

  /* ---------- PDF export (html2canvas → jsPDF), with page breaks between table rows ---------- */
  async function exportPdf(html, filename, button) {
    if (!window.jspdf || !window.html2canvas) {
      return ui.notAvailable('PDF export unavailable', 'The PDF libraries could not be loaded (are you offline?). Use <b>Print → Save as PDF</b> instead. The Laravel version will generate PDFs on the server.');
    }
    if (button) button.classList.add('is-loading');
    const host = document.createElement('div');
    host.id = 'pdf-host'; host.innerHTML = html;
    document.body.appendChild(host);
    try {
      await waitForImages(host);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
      const PAGE_W = 210, PAGE_H = 297, TOP_MARGIN_MM = 10, BOTTOM_MARGIN_MM = 12;
      const pxPerMm = 794 / PAGE_W;
      const docs = U.$$('.doc', host);
      let first = true;
      for (const el of docs) {
        const scale = 2;
        // Single-page documents fill exactly one PDF page (A4 minus bottom margin) instead of spilling over
        el.style.minHeight = Math.floor((PAGE_H - BOTTOM_MARGIN_MM) * pxPerMm) + 'px';
        const canvas = await html2canvas(el, { scale, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: 794 });
        const totalH = el.offsetHeight;
        const baseTop = el.getBoundingClientRect().top;
        // Candidate break positions: bottoms of rows and blocks that must not be split
        const cuts = U.$$('tr, .d-summary, .d-section, .d-sign, .d-kpis, .d-parties, .d-amount-box, .d-footer, .d-chart-img, .d-meta-row, .d-band', el)
          .map(n => Math.round(n.getBoundingClientRect().bottom - baseTop)).filter(v => v > 0 && v < totalH).sort((a, b) => a - b);
        let start = 0, page = 0;
        while (start < totalH - 2) {
          const topPad = page === 0 ? 0 : TOP_MARGIN_MM * pxPerMm;
          const avail = (PAGE_H - BOTTOM_MARGIN_MM) * pxPerMm - topPad;
          let end = start + avail;
          if (end >= totalH) end = totalH;
          else {
            const c = cuts.filter(v => v <= end && v > start + avail * 0.35);
            if (c.length) end = c[c.length - 1];
          }
          const slice = document.createElement('canvas');
          slice.width = canvas.width; slice.height = Math.ceil((end - start) * scale);
          slice.getContext('2d').drawImage(canvas, 0, start * scale, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
          if (!first) pdf.addPage();
          first = false;
          pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, page === 0 ? 0 : TOP_MARGIN_MM, PAGE_W, (end - start) / pxPerMm);
          start = end; page++;
        }
      }
      const n = pdf.getNumberOfPages();
      for (let i = 1; i <= n; i++) {
        pdf.setPage(i); pdf.setFontSize(7.5); pdf.setTextColor(110, 120, 140);
        pdf.text(`Page ${i} of ${n}`, PAGE_W - 14, PAGE_H - 6, { align: 'right' });
      }
      pdf.save(filename);
      ui.toast(`Downloaded ${filename}`);
    } catch (e) {
      console.error(e);
      ui.toast('PDF export failed. Use Print → Save as PDF instead.', 'err');
    } finally {
      host.remove();
      if (button) button.classList.remove('is-loading');
    }
  }

  return { quotation, invoice, receipt, creditNote, statement, report, build, preview, mountPreview, print, exportPdf, taxLabelEnabled };
})();
