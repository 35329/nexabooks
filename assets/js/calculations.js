/* =====================================================================
   calculations.js – all financial maths in one place.
   Every screen, document, report and the dashboard read figures from
   these functions so numbers always reconcile with the source records.

   Laravel mapping:
   - line()/totals()        → App\Services\DocumentTotalsCalculator (also persist totals on save)
   - invoiceInfo()          → Invoice model accessors (amount_paid, balance_due, status) + InvoiceStatusService
   - ledger()               → App\Services\CustomerLedgerService (SQL UNION of invoices/payments/credit notes)
   - aging()/receivables    → App\Services\Reports\ReceivablesAgingReport
   Rounding: VAT is rounded per line to 2 dp (fils). Confirm the rounding
   method against current UAE FTA guidance before production.
   ===================================================================== */
window.NB = window.NB || {};

NB.calc = (() => {
  const U = NB.utils;
  const r2 = U.round2;
  const db = () => NB.data.db;

  /* ---------- Memo cache, invalidated whenever the dataset revision changes ---------- */
  let cacheRev = -1; let cache = new Map();
  const memo = (key, fn) => {
    const rev = db().rev || 0;
    if (rev !== cacheRev) { cache = new Map(); cacheRev = rev; }
    if (!cache.has(key)) cache.set(key, fn());
    return cache.get(key);
  };

  /* ---------- Line items & document totals ---------- */
  /** item: { qty, unitPrice, discount (% of gross), taxRate (%) } */
  function line(it) {
    const qty = Number(it.qty) || 0;
    const price = Number(it.unitPrice) || 0;
    const discPct = Math.min(Math.max(Number(it.discount) || 0, 0), 100);
    const rate = Number(it.taxRate) || 0;
    const gross = r2(qty * price);
    const discount = r2(gross * discPct / 100);
    const net = r2(gross - discount);
    const vat = r2(net * rate / 100);
    return { gross, discount, net, vat, total: r2(net + vat) };
  }

  /** Totals for a document, with a VAT breakdown per tax code (standard / zero / exempt kept distinct). */
  function totals(items = []) {
    let subtotal = 0, discount = 0, taxable = 0, vat = 0;
    const byTax = {};
    items.forEach(it => {
      const l = line(it);
      subtotal += l.gross; discount += l.discount; taxable += l.net; vat += l.vat;
      const k = it.taxId || 'NA';
      byTax[k] = byTax[k] || { taxId: k, label: it.taxLabel || k, rate: Number(it.taxRate) || 0, category: it.taxCategory || 'standard', net: 0, vat: 0 };
      byTax[k].net = r2(byTax[k].net + l.net);
      byTax[k].vat = r2(byTax[k].vat + l.vat);
    });
    return {
      subtotal: r2(subtotal), discount: r2(discount), taxable: r2(taxable), vat: r2(vat),
      total: r2(taxable + vat), vatBreakdown: Object.values(byTax)
    };
  }

  /* ---------- Invoices ---------- */
  const isIssued = inv => inv && inv.status !== 'Draft' && inv.status !== 'Cancelled';
  const paymentsFor = (invoiceId, asOf) => db().payments.filter(p => p.invoiceId === invoiceId && (!asOf || p.date <= asOf));
  const creditNotesFor = (invoiceId, asOf) => db().creditNotes.filter(c => c.invoiceId === invoiceId && c.status !== 'Void' && (!asOf || c.date <= asOf));

  /**
   * Derived financial position of an invoice as at a date.
   * Status rules: Cancelled/Draft are stored states; everything else is derived from
   * total − payments − credit notes and the due date, so a balance can never show as Paid.
   */
  function invoiceInfo(inv, asOf = U.today()) {
    return memo(`inv:${inv.id}:${asOf}`, () => {
      const t = totals(inv.items);
      const paid = U.sum(paymentsFor(inv.id, asOf), p => p.amount);
      const credited = U.sum(creditNotesFor(inv.id, asOf), c => totals(c.items).total);
      const issued = isIssued(inv);
      const balance = issued ? r2(t.total - paid - credited) : 0;
      let status;
      if (inv.status === 'Cancelled') status = 'Cancelled';
      else if (inv.status === 'Draft') status = 'Draft';
      else if (balance <= 0.004) status = 'Paid';
      else if (inv.dueDate < asOf) status = 'Overdue';
      else if (paid + credited > 0) status = 'Partially Paid';
      else status = 'Sent';
      const daysOverdue = issued && balance > 0 && inv.dueDate < asOf ? U.diffDays(asOf, inv.dueDate) : 0;
      return { ...t, paid, credited, balance, status, daysOverdue, partiallyPaid: issued && paid + credited > 0 && balance > 0 };
    });
  }

  /** Mutually exclusive aging buckets based on days past due. */
  const AGING_BUCKETS = [
    { key: 'current', label: 'Current (not due)' },
    { key: 'd1_30', label: '1–30 days' },
    { key: 'd31_60', label: '31–60 days' },
    { key: 'd61_90', label: '61–90 days' },
    { key: 'd90p', label: '90+ days' }
  ];
  function agingBucket(daysOverdue) {
    if (daysOverdue <= 0) return 'current';
    if (daysOverdue <= 30) return 'd1_30';
    if (daysOverdue <= 60) return 'd31_60';
    if (daysOverdue <= 90) return 'd61_90';
    return 'd90p';
  }
  /** Receivables aging as at a date, optionally for one customer. */
  function aging(asOf = U.today(), customerId = null) {
    const res = { total: 0, count: 0, buckets: Object.fromEntries(AGING_BUCKETS.map(b => [b.key, 0])), invoices: [] };
    db().invoices.filter(i => isIssued(i) && i.date <= asOf && (!customerId || i.customerId === customerId)).forEach(inv => {
      const info = invoiceInfo(inv, asOf);
      if (info.balance > 0.004) {
        const b = agingBucket(info.daysOverdue);
        res.buckets[b] = r2(res.buckets[b] + info.balance);
        res.total = r2(res.total + info.balance);
        res.count++;
        res.invoices.push({ inv, info, bucket: b });
      }
    });
    return res;
  }

  /* ---------- Quotations ---------- */
  function quotationStatus(q, asOf = U.today()) {
    if ((q.status === 'Draft' || q.status === 'Sent') && q.expiryDate && q.expiryDate < asOf) return 'Expired';
    return q.status;
  }

  /* ---------- Customers ---------- */
  function customerSummary(customerId, asOf = U.today()) {
    return memo(`cust:${customerId}:${asOf}`, () => {
      const invs = db().invoices.filter(i => i.customerId === customerId && isIssued(i));
      let invoiced = 0, paid = 0, credited = 0, outstanding = 0, overdue = 0, overdueCount = 0;
      invs.forEach(inv => {
        const info = invoiceInfo(inv, asOf);
        invoiced += info.total; paid += info.paid; credited += info.credited; outstanding += info.balance;
        if (info.status === 'Overdue') { overdue += info.balance; overdueCount++; }
      });
      return { invoiced: r2(invoiced), paid: r2(paid), credited: r2(credited), outstanding: r2(outstanding), overdue: r2(overdue), overdueCount, invoiceCount: invs.length };
    });
  }

  /* ---------- Statement of account ----------
     Opening balance = issued invoices dated BEFORE the start date
                       − payments dated before the start date
                       − credit notes dated before the start date.
     Drafts and cancelled invoices are excluded. Each transaction is placed on its own
     document date. Closing balance = opening + debits − credits for the period.        */
  function ledger(customerId, from, to) {
    const invs = db().invoices.filter(i => i.customerId === customerId && isIssued(i));
    const pays = db().payments.filter(p => p.customerId === customerId);
    const cns = db().creditNotes.filter(c => c.customerId === customerId && c.status !== 'Void');
    const invTotal = inv => totals(inv.items).total;
    const cnTotal = cn => totals(cn.items).total;

    const opening = r2(
      U.sum(invs.filter(i => i.date < from), invTotal)
      - U.sum(pays.filter(p => p.date < from), p => p.amount)
      - U.sum(cns.filter(c => c.date < from), cnTotal)
    );
    const numOf = id => (db().invoices.find(i => i.id === id) || {}).number || '';
    const rows = [];
    invs.filter(i => i.date >= from && i.date <= to).forEach(i => rows.push({
      date: i.date, order: 1, type: 'invoice', id: i.id, ref: i.number,
      desc: `Invoice${i.quotationId ? ' (from quotation)' : ''} – due ${U.fmtDate(i.dueDate)}`, debit: invTotal(i), credit: 0
    }));
    cns.filter(c => c.date >= from && c.date <= to).forEach(c => rows.push({
      date: c.date, order: 2, type: 'credit', id: c.id, ref: c.number, desc: `Credit note against ${numOf(c.invoiceId)}`, debit: 0, credit: cnTotal(c)
    }));
    pays.filter(p => p.date >= from && p.date <= to).forEach(p => rows.push({
      date: p.date, order: 3, type: 'payment', id: p.id, ref: p.receiptNumber,
      desc: `Payment – ${p.method}${p.reference ? ' (' + p.reference + ')' : ''} for ${numOf(p.invoiceId)}`, debit: 0, credit: p.amount
    }));
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.ref.localeCompare(b.ref));
    let bal = opening;
    rows.forEach(r => { bal = r2(bal + r.debit - r.credit); r.balance = bal; });
    const debits = U.sum(rows, r => r.debit);
    const credits = U.sum(rows, r => r.credit);
    const payments = U.sum(rows.filter(r => r.type === 'payment'), r => r.credit);
    const creditNotes = U.sum(rows.filter(r => r.type === 'credit'), r => r.credit);
    const closing = r2(opening + debits - credits);
    const ag = aging(to, customerId);
    return { opening, rows, debits, credits, payments, creditNotes, closing, aging: ag, outstanding: ag.invoices };
  }

  /* ---------- Recurring profiles ---------- */
  const FREQ_MONTHS = { 'Monthly': 1, 'Quarterly': 3, 'Half-Yearly': 6, 'Yearly': 12 };
  const nextRecurringDate = (date, freq) => U.addMonths(date, FREQ_MONTHS[freq] || 1);
  /** Billing period identity used to block duplicate generation for the same profile + period. */
  function periodKey(date, freq) {
    const [y, m] = date.split('-').map(Number);
    if (freq === 'Quarterly') return `${y}-Q${Math.ceil(m / 3)}`;
    if (freq === 'Half-Yearly') return `${y}-H${m <= 6 ? 1 : 2}`;
    if (freq === 'Yearly') return `${y}`;
    return `${y}-${String(m).padStart(2, '0')}`;
  }
  const periodRange = (date, freq) => ({ from: date, to: U.addDays(nextRecurringDate(date, freq), -1) });

  /* ---------- Aggregations used by dashboard & reports ---------- */
  const issuedInvoices = (range, customerId) => db().invoices.filter(i => isIssued(i) && (!range || U.inRange(i.date, range)) && (!customerId || i.customerId === customerId));
  const paymentsIn = (range, customerId) => db().payments.filter(p => (!range || U.inRange(p.date, range)) && (!customerId || p.customerId === customerId));
  const creditNotesIn = (range, customerId) => db().creditNotes.filter(c => c.status !== 'Void' && (!range || U.inRange(c.date, range)) && (!customerId || c.customerId === customerId));
  const expensesIn = range => db().expenses.filter(e => !range || U.inRange(e.date, range));

  /** Sales summary for a period. Revenue = taxable value of issued invoices less credit notes (accrual, excl. VAT). */
  function salesSummary(range, customerId) {
    const invs = issuedInvoices(range, customerId);
    const cns = creditNotesIn(range, customerId);
    const invT = invs.map(i => totals(i.items));
    const cnT = cns.map(c => totals(c.items));
    const netSales = U.sum(invT, t => t.taxable);
    const cnNet = U.sum(cnT, t => t.taxable);
    return {
      count: invs.length,
      gross: U.sum(invT, t => t.total),           // invoiced incl. VAT
      net: netSales,                              // invoiced excl. VAT
      vat: U.sum(invT, t => t.vat),
      discount: U.sum(invT, t => t.discount),
      creditNet: cnNet,
      creditTotal: U.sum(cnT, t => t.total),
      revenue: r2(netSales - cnNet),              // net revenue excl. VAT after credit notes
      collected: U.sum(paymentsIn(range, customerId), p => p.amount)
    };
  }

  function monthlySeries(range, customerId) {
    const months = U.monthsBetween(range.from, range.to);
    const base = Object.fromEntries(months.map(m => [m, { month: m, invoiced: 0, net: 0, vat: 0, revenue: 0, collected: 0, expenses: 0, expenseVat: 0 }]));
    issuedInvoices(range, customerId).forEach(i => {
      const t = totals(i.items); const m = base[U.monthKey(i.date)]; if (!m) return;
      m.invoiced = r2(m.invoiced + t.total); m.net = r2(m.net + t.taxable); m.vat = r2(m.vat + t.vat); m.revenue = r2(m.revenue + t.taxable);
    });
    creditNotesIn(range, customerId).forEach(c => { const m = base[U.monthKey(c.date)]; if (m) m.revenue = r2(m.revenue - totals(c.items).taxable); });
    paymentsIn(range, customerId).forEach(p => { const m = base[U.monthKey(p.date)]; if (m) m.collected = r2(m.collected + p.amount); });
    if (!customerId) expensesIn(range).forEach(e => { const m = base[U.monthKey(e.date)]; if (m) { m.expenses = r2(m.expenses + Number(e.amount)); m.expenseVat = r2(m.expenseVat + Number(e.vat || 0)); } });
    return months.map(m => base[m]);
  }

  return {
    line, totals, isIssued, paymentsFor, creditNotesFor, invoiceInfo, AGING_BUCKETS, agingBucket, aging,
    quotationStatus, customerSummary, ledger, FREQ_MONTHS, nextRecurringDate, periodKey, periodRange,
    issuedInvoices, paymentsIn, creditNotesIn, expensesIn, salesSummary, monthlySeries
  };
})();
