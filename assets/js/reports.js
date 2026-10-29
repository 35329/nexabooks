/* =====================================================================
   reports.js – reporting module. Each report is a pure "build(filters)"
   function returning KPIs, chart configs and tables computed from the
   records, plus a shared renderer with Refresh / Print / CSV / PDF.
   Definitions used throughout:
     Invoiced  = issued invoice totals incl. VAT (by invoice date)
     Revenue   = taxable value excl. VAT of issued invoices less credit notes
     Collected = payments received (by payment date)
     Outstanding / ageing = unpaid balances as at a date, by days past due
     Expenses  = supplier costs (never mixed with sales or collections)
   Laravel: App\Services\Reports\* query classes + ReportController,
   exports via Laravel Excel / server-side PDF.
   ===================================================================== */
window.NB = window.NB || {};

(() => {
  const U = NB.utils; const ui = NB.ui; const C = NB.calc; const { esc } = U;
  const D = () => NB.data.db;
  const cname = id => NB.data.customerName(id);

  /* ---------- formatting for table cells ---------- */
  const FMT = {
    money: v => U.money(v), num: v => U.num(v), int: v => String(v), pct: v => (v === null || !isFinite(v) ? '—' : U.pct(v)),
    date: v => (v ? U.fmtDate(v) : '—'), text: v => esc(v ?? ''), month: v => (/^\d{4}-\d{2}$/.test(v) ? U.monthLabel(v, true) : esc(v))
  };
  const csvVal = (v, fmt) => fmt === 'money' || fmt === 'num' ? Number(v || 0).toFixed(2) : fmt === 'pct' ? (v === null || !isFinite(v) ? '' : Number(v).toFixed(1)) : fmt === 'month' && /^\d{4}-\d{2}$/.test(v) ? U.monthLabel(v, true) : (v ?? '');
  const col = (label, fmt = 'text', opts = {}) => ({ label, fmt, num: ['money', 'num', 'int', 'pct'].includes(fmt), ...opts });
  const change = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : null);

  /* ---------- chart config helpers ---------- */
  const axisMoney = { beginAtZero: true, ticks: ui.moneyTicks, grid: { color: ui.gridColor } };
  const barChart = (labels, datasets, opts = {}) => ({
    type: 'bar', data: { labels, datasets: datasets.map((d, i) => ({ borderRadius: 5, maxBarThickness: 30, backgroundColor: d.color || ui.SERIES[i], ...d })) },
    options: { indexAxis: opts.horizontal ? 'y' : 'x', plugins: { legend: { display: datasets.length > 1 }, tooltip: ui.moneyTooltip },
      scales: opts.horizontal ? { x: axisMoney, y: { grid: { display: false } } } : { y: { ...axisMoney, stacked: !!opts.stacked }, x: { grid: { display: false }, stacked: !!opts.stacked } } }
  });
  const doughnut = (labels, data, colors, money = true) => ({
    type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: colors || ui.SERIES, borderColor: '#fff', borderWidth: 2 }] },
    options: { cutout: '60%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: c => `${c.label}: ${money ? U.money(c.parsed) : c.parsed}` } } } }
  });
  const lineChart = (labels, datasets) => ({
    type: 'line', data: { labels, datasets: datasets.map((d, i) => ({ borderColor: d.color || ui.SERIES[i], backgroundColor: (d.color || ui.SERIES[i]) + '1a', tension: .35, pointRadius: 3, borderWidth: 2.2, fill: i === 0, ...d })) },
    options: { interaction: { mode: 'index', intersect: false }, plugins: { tooltip: ui.moneyTooltip }, scales: { y: axisMoney, x: { grid: { display: false } } } }
  });

  /* ---------- shared aggregations ---------- */
  function revenueByCustomer(range, customerId) {
    const m = {};
    C.issuedInvoices(range, customerId).forEach(i => { const t = C.totals(i.items); const r = m[i.customerId] = m[i.customerId] || { id: i.customerId, count: 0, net: 0, vat: 0, gross: 0, credit: 0 }; r.count++; r.net += t.taxable; r.vat += t.vat; r.gross += t.total; });
    C.creditNotesIn(range, customerId).forEach(c => { const r = m[c.customerId] = m[c.customerId] || { id: c.customerId, count: 0, net: 0, vat: 0, gross: 0, credit: 0 }; r.credit += C.totals(c.items).taxable; });
    return Object.values(m).map(r => ({ ...r, revenue: U.round2(r.net - r.credit) })).sort((a, b) => b.revenue - a.revenue);
  }
  function revenueByService(range, customerId) {
    const names = Object.fromEntries(D().settings.services.map(s => [s.id, s.name]));
    const m = {};
    C.issuedInvoices(range, customerId).forEach(i => i.items.forEach(it => {
      const k = it.serviceId && names[it.serviceId] ? names[it.serviceId] : 'Custom / other items';
      const l = C.line(it); const r = m[k] = m[k] || { name: k, qty: 0, net: 0, lines: 0 };
      r.qty += Number(it.qty) || 0; r.net = U.round2(r.net + l.net); r.lines++;
    }));
    return Object.values(m).sort((a, b) => b.net - a.net);
  }
  function weekKey(iso) { const d = U.parseISO(iso); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return U.toISO(d); }

  /* ================================================================ */
  /*  REPORT DEFINITIONS                                              */
  /* ================================================================ */
  const REPORTS = {
    sales: {
      title: 'Sales Reports', icon: 'chart-column', desc: 'Invoiced sales by month, customer and service, with period comparison.', filters: ['range', 'customer'],
      build(f) {
        const s = C.salesSummary(f.range, f.customer), p = C.salesSummary(U.previousRange(f.range), f.customer);
        const months = C.monthlySeries(f.range, f.customer);
        const byCust = revenueByCustomer(f.range, f.customer);
        const bySvc = revenueByService(f.range, f.customer);
        const totalNet = U.sum(bySvc, r => r.net) || 1;
        const totalRev = U.sum(byCust, r => r.revenue) || 1;
        return {
          kpis: [
            { label: 'Net revenue (excl. VAT)', value: U.money(s.revenue), trend: change(s.revenue, p.revenue) },
            { label: 'Invoiced (incl. VAT)', value: U.money(s.gross), trend: change(s.gross, p.gross) },
            { label: 'VAT charged', value: U.money(s.vat), trend: change(s.vat, p.vat) },
            { label: 'Invoices issued', value: `${s.count}`, sub: `avg ${U.money(s.count ? s.gross / s.count : 0)}`, trend: change(s.count, p.count) }
          ],
          charts: [
            { title: 'Sales by month', sub: 'Net (excl. VAT) and VAT', span: 2, config: barChart(months.map(m => U.monthLabel(m.month)), [{ label: 'Net sales', data: months.map(m => m.net), color: ui.PALETTE.navy, stack: 's' }, { label: 'VAT', data: months.map(m => m.vat), color: ui.PALETTE.sky, stack: 's' }], { stacked: true }) },
            { title: 'Revenue by service', sub: 'Line values excl. VAT', config: doughnut(bySvc.slice(0, 7).map(r => r.name), bySvc.slice(0, 7).map(r => r.net)) },
            { title: 'Revenue by customer', sub: 'Top 8, excl. VAT after credit notes', span: 3, config: barChart(byCust.slice(0, 8).map(r => cname(r.id)), [{ label: 'Revenue', data: byCust.slice(0, 8).map(r => r.revenue), color: ui.PALETTE.blue }], { horizontal: true }), height: 'sm' }
          ],
          tables: [
            { title: 'Period comparison', columns: [col('Metric'), col('This period', 'money'), col('Previous period', 'money'), col('Change %', 'pct')], rows: [
              ['Net sales (excl. VAT)', s.net, p.net, change(s.net, p.net)], ['Credit notes (excl. VAT)', s.creditNet, p.creditNet, change(s.creditNet, p.creditNet)],
              ['Net revenue (excl. VAT)', s.revenue, p.revenue, change(s.revenue, p.revenue)], ['VAT charged', s.vat, p.vat, change(s.vat, p.vat)],
              ['Invoiced (incl. VAT)', s.gross, p.gross, change(s.gross, p.gross)], ['Discounts given', s.discount, p.discount, change(s.discount, p.discount)]], note: `Previous period: ${U.fmtDate(U.previousRange(f.range).from)} – ${U.fmtDate(U.previousRange(f.range).to)}` },
            { title: 'Sales by month', columns: [col('Month', 'month'), col('Net sales', 'money'), col('VAT', 'money'), col('Invoiced (incl. VAT)', 'money'), col('Net revenue', 'money')], rows: months.map(m => [m.month, m.net, m.vat, m.invoiced, m.revenue]),
              totals: ['Total', U.sum(months, m => m.net), U.sum(months, m => m.vat), U.sum(months, m => m.invoiced), U.sum(months, m => m.revenue)] },
            { title: 'Revenue by customer', columns: [col('Customer'), col('Invoices', 'int'), col('Net sales', 'money'), col('Credit notes', 'money'), col('Net revenue', 'money'), col('VAT', 'money'), col('Share %', 'pct')], rows: byCust.map(r => [cname(r.id), r.count, r.net, r.credit, r.revenue, r.vat, r.revenue / totalRev * 100]) },
            { title: 'Revenue by service / product', columns: [col('Service'), col('Lines', 'int'), col('Quantity', 'num'), col('Net value', 'money'), col('Share %', 'pct')], rows: bySvc.map(r => [r.name, r.lines, r.qty, r.net, r.net / totalNet * 100]), note: 'Credit notes are not allocated to services.' }
          ]
        };
      }
    },

    invoices: {
      title: 'Invoice Reports', icon: 'file-check-2', desc: 'Issued, paid, partially paid, unpaid and overdue invoices with ageing.', filters: ['range', 'customer', 'status'],
      build(f) {
        const T = U.today();
        let rows = D().invoices.filter(i => U.inRange(i.date, f.range) && (!f.customer || i.customerId === f.customer)).map(i => ({ i, info: C.invoiceInfo(i) }));
        if (f.status) rows = rows.filter(r => f.status === 'Unpaid' ? ['Sent', 'Overdue'].includes(r.info.status) && !r.info.partiallyPaid : r.info.status === f.status);
        const issued = rows.filter(r => C.isIssued(r.i));
        const by = s => issued.filter(r => r.info.status === s);
        const paid = by('Paid'), part = issued.filter(r => r.info.partiallyPaid), od = by('Overdue');
        const unpaid = issued.filter(r => r.info.balance > 0 && !r.info.partiallyPaid);
        const statuses = ['Paid', 'Partially Paid', 'Sent', 'Overdue', 'Draft', 'Cancelled'];
        const colors = [ui.PALETTE.green, ui.PALETTE.orange, ui.PALETTE.blue, ui.PALETTE.red, '#b8c1d3', '#5d6985'];
        const counts = statuses.map(s => rows.filter(r => r.info.status === s).length);
        const buckets = Object.fromEntries(C.AGING_BUCKETS.map(b => [b.key, 0]));
        issued.forEach(r => { if (r.info.balance > 0) buckets[C.agingBucket(r.info.daysOverdue)] += r.info.balance; });
        return {
          kpis: [
            { label: 'Invoices issued', value: `${issued.length}`, sub: U.money(U.sum(issued, r => r.info.total)) },
            { label: 'Paid in full', value: `${paid.length}`, sub: U.money(U.sum(paid, r => r.info.total)) },
            { label: 'Partially paid', value: `${part.length}`, sub: `${U.money(U.sum(part, r => r.info.balance))} still due` },
            { label: 'Overdue', value: `${od.length}`, sub: `${U.money(U.sum(od, r => r.info.balance))} past due` }
          ],
          charts: [
            { title: 'Invoice status distribution', sub: 'Count of invoices dated in the period', config: doughnut(statuses.filter((s, i) => counts[i]), counts.filter(c => c), colors.filter((c, i) => counts[i]), false) },
            { title: 'Outstanding by age', sub: `Balances of these invoices as at ${U.fmtDate(T)}`, span: 2, config: barChart(C.AGING_BUCKETS.map(b => b.label), [{ label: 'Outstanding', data: C.AGING_BUCKETS.map(b => U.round2(buckets[b.key])), backgroundColor: [ui.PALETTE.blue, '#f0b84a', ui.PALETTE.orange, '#d9534f', '#8f1d1d'] }]) }
          ],
          tables: [
            { title: 'Summary by status', columns: [col('Category'), col('Invoices', 'int'), col('Invoice total', 'money'), col('Paid / credited', 'money'), col('Balance', 'money')], rows: [
              ['Issued (all)', issued.length, U.sum(issued, r => r.info.total), U.sum(issued, r => r.info.paid + r.info.credited), U.sum(issued, r => r.info.balance)],
              ['Paid in full', paid.length, U.sum(paid, r => r.info.total), U.sum(paid, r => r.info.paid + r.info.credited), 0],
              ['Partially paid', part.length, U.sum(part, r => r.info.total), U.sum(part, r => r.info.paid + r.info.credited), U.sum(part, r => r.info.balance)],
              ['Unpaid (nothing received)', unpaid.length, U.sum(unpaid, r => r.info.total), 0, U.sum(unpaid, r => r.info.balance)],
              ['Overdue (subset of above)', od.length, U.sum(od, r => r.info.total), U.sum(od, r => r.info.paid + r.info.credited), U.sum(od, r => r.info.balance)],
              ['Drafts (not issued)', rows.filter(r => r.i.status === 'Draft').length, U.sum(rows.filter(r => r.i.status === 'Draft'), r => r.info.total), 0, 0],
              ['Cancelled', rows.filter(r => r.i.status === 'Cancelled').length, U.sum(rows.filter(r => r.i.status === 'Cancelled'), r => r.info.total), 0, 0]] },
            { title: 'Invoice ageing detail', link: r => `#/invoices/view/${r._id}`, columns: [col('Invoice'), col('Customer'), col('Date', 'date'), col('Due date', 'date'), col('Total', 'money'), col('Paid', 'money'), col('Balance', 'money'), col('Days overdue', 'int'), col('Age bucket'), col('Status')],
              rows: U.sortBy(rows, r => r.i.date, 'desc').map(r => Object.assign([r.i.number, cname(r.i.customerId), r.i.date, r.i.dueDate, r.info.total, r.info.paid, r.info.balance, r.info.daysOverdue, C.isIssued(r.i) && r.info.balance > 0 ? C.AGING_BUCKETS.find(b => b.key === C.agingBucket(r.info.daysOverdue)).label : '—', r.info.status], { _id: r.i.id })) }
          ]
        };
      }
    },

    receivables: {
      title: 'Outstanding Receivables', icon: 'clock', desc: 'Ageing of unpaid balances as at a date, in mutually exclusive buckets.', filters: ['asof', 'customer'],
      build(f) {
        const asOf = f.asOf;
        const ag = C.aging(asOf, f.customer);
        const byCust = {};
        ag.invoices.forEach(x => { const r = byCust[x.inv.customerId] = byCust[x.inv.customerId] || { id: x.inv.customerId, total: 0, count: 0, ...Object.fromEntries(C.AGING_BUCKETS.map(b => [b.key, 0])) }; r[x.bucket] = U.round2(r[x.bucket] + x.info.balance); r.total = U.round2(r.total + x.info.balance); r.count++; });
        const custRows = Object.values(byCust).sort((a, b) => b.total - a.total);
        const overdue = U.round2(ag.total - ag.buckets.current);
        return {
          kpis: [
            { label: 'Total outstanding', value: U.money(ag.total), sub: `${ag.count} open invoices` },
            { label: 'Current (not yet due)', value: U.money(ag.buckets.current) },
            { label: 'Overdue (1+ days)', value: U.money(overdue), sub: ag.total ? `${U.pct(overdue / ag.total * 100, 0)} of receivables` : '' },
            { label: 'More than 90 days', value: U.money(ag.buckets.d90p) }
          ],
          charts: [
            { title: 'Receivables ageing', sub: `As at ${U.fmtDate(asOf)}`, span: 2, config: barChart(C.AGING_BUCKETS.map(b => b.label), [{ label: 'Outstanding', data: C.AGING_BUCKETS.map(b => ag.buckets[b.key]), backgroundColor: [ui.PALETTE.blue, '#f0b84a', ui.PALETTE.orange, '#d9534f', '#8f1d1d'] }]) },
            { title: 'Outstanding by customer', sub: 'Top 6', config: doughnut(custRows.slice(0, 6).map(r => cname(r.id)), custRows.slice(0, 6).map(r => r.total)) }
          ],
          tables: [
            { title: 'Ageing by customer', columns: [col('Customer'), col('Open invoices', 'int'), ...C.AGING_BUCKETS.map(b => col(b.label, 'money')), col('Total', 'money')], rows: custRows.map(r => [cname(r.id), r.count, ...C.AGING_BUCKETS.map(b => r[b.key]), r.total]),
              totals: ['Total', ag.count, ...C.AGING_BUCKETS.map(b => ag.buckets[b.key]), ag.total] },
            { title: 'Open invoices', link: r => `#/invoices/view/${r._id}`, columns: [col('Invoice'), col('Customer'), col('Due date', 'date'), col('Balance', 'money'), col('Days overdue', 'int'), col('Bucket')],
              rows: U.sortBy(ag.invoices, x => x.info.daysOverdue, 'desc').map(x => Object.assign([x.inv.number, cname(x.inv.customerId), x.inv.dueDate, x.info.balance, x.info.daysOverdue, C.AGING_BUCKETS.find(b => b.key === x.bucket).label], { _id: x.inv.id })) }
          ]
        };
      }
    },

    payments: {
      title: 'Payment Reports', icon: 'hand-coins', desc: 'Collections by period, method and customer.', filters: ['range', 'customer', 'method', 'granularity'],
      build(f) {
        const pays = C.paymentsIn(f.range, f.customer).filter(p => !f.method || p.method === f.method);
        const prev = C.paymentsIn(U.previousRange(f.range), f.customer).filter(p => !f.method || p.method === f.method);
        const total = U.sum(pays, p => p.amount), prevTotal = U.sum(prev, p => p.amount);
        const keyFn = f.granularity === 'daily' ? (p => p.date) : f.granularity === 'weekly' ? (p => weekKey(p.date)) : (p => U.monthKey(p.date));
        const labelFn = f.granularity === 'monthly' ? (k => U.monthLabel(k)) : f.granularity === 'weekly' ? (k => 'Wk of ' + U.fmtDate(k)) : (k => U.fmtDate(k));
        let periods;
        if (f.granularity === 'monthly') periods = U.monthsBetween(f.range.from, f.range.to > U.today() ? U.today() : f.range.to);
        else periods = Object.keys(U.groupBy(pays, keyFn)).sort();
        const byP = U.groupBy(pays, keyFn);
        const byMethod = Object.entries(U.groupBy(pays, p => p.method)).map(([k, a]) => [k, a.length, U.sum(a, x => x.amount)]).sort((a, b) => b[2] - a[2]);
        const byCust = Object.entries(U.groupBy(pays, p => p.customerId)).map(([k, a]) => [k, a.length, U.sum(a, x => x.amount), a.map(x => x.date).sort().pop()]).sort((a, b) => b[2] - a[2]);
        const issued = C.salesSummary(f.range, f.customer).gross;
        return {
          kpis: [
            { label: 'Total collected', value: U.money(total), trend: change(total, prevTotal) },
            { label: 'Payments received', value: `${pays.length}`, sub: `avg ${U.money(pays.length ? total / pays.length : 0)}` },
            { label: 'Invoiced in same period', value: U.money(issued), sub: 'incl. VAT, for comparison' },
            { label: 'Top method', value: byMethod[0] ? esc(byMethod[0][0]) : '—', sub: byMethod[0] ? `${U.pct(byMethod[0][2] / (total || 1) * 100, 0)} of collections` : '' }
          ],
          charts: [
            { title: `Collections – ${f.granularity}`, sub: 'Cash received by payment date', span: 2, config: barChart(periods.map(labelFn), [{ label: 'Collected', data: periods.map(k => U.sum(byP[k] || [], p => p.amount)), color: ui.PALETTE.green }]) },
            { title: 'Payments by method', config: doughnut(byMethod.map(m => m[0]), byMethod.map(m => m[2])) },
            { title: 'Payments by customer', sub: 'Top 8', span: 3, height: 'sm', config: barChart(byCust.slice(0, 8).map(c => cname(c[0])), [{ label: 'Collected', data: byCust.slice(0, 8).map(c => c[2]), color: ui.PALETTE.teal }], { horizontal: true }) }
          ],
          tables: [
            { title: `Collections by ${f.granularity === 'daily' ? 'day' : f.granularity === 'weekly' ? 'week' : 'month'}`, columns: [col('Period'), col('Payments', 'int'), col('Amount', 'money')], rows: periods.map(k => [labelFn(k), (byP[k] || []).length, U.sum(byP[k] || [], p => p.amount)]), totals: ['Total', pays.length, total] },
            { title: 'By payment method', columns: [col('Method'), col('Payments', 'int'), col('Amount', 'money'), col('Share %', 'pct')], rows: byMethod.map(m => [m[0], m[1], m[2], m[2] / (total || 1) * 100]) },
            { title: 'By customer', columns: [col('Customer'), col('Payments', 'int'), col('Amount', 'money'), col('Last payment', 'date')], rows: byCust.map(c => [cname(c[0]), c[1], c[2], c[3]]) },
            { title: 'Payment register', link: r => `#/receipts/view/${r._id}`, columns: [col('Receipt'), col('Date', 'date'), col('Customer'), col('Invoice'), col('Method'), col('Reference'), col('Amount', 'money')],
              rows: U.sortBy(pays, p => p.date, 'desc').map(p => Object.assign([p.receiptNumber, p.date, cname(p.customerId), (NB.data.get('invoices', p.invoiceId) || {}).number || '', p.method, p.reference, p.amount], { _id: p.id })) }
          ]
        };
      }
    },

    customers: {
      title: 'Customer Reports', icon: 'user', desc: 'Top customers, balances, new customers and payment history.', filters: ['range', 'customer'],
      build(f) {
        const T = U.today();
        const custs = D().customers.filter(c => !f.customer || c.id === f.customer);
        const rows = custs.map(c => {
          const inv = C.issuedInvoices(f.range, c.id); const pays = C.paymentsIn(f.range, c.id); const s = C.customerSummary(c.id, T);
          const allPays = D().payments.filter(p => p.customerId === c.id).map(p => p.date).sort();
          return { c, invoiced: U.sum(inv, i => C.totals(i.items).total), revenue: U.sum(inv, i => C.totals(i.items).taxable), paid: U.sum(pays, p => p.amount), outstanding: s.outstanding, overdue: s.overdue, last: allPays.pop() || '' };
        }).sort((a, b) => b.revenue - a.revenue);
        const months = U.monthsBetween(f.range.from, f.range.to > T ? T : f.range.to);
        const newBy = U.groupBy(D().customers.filter(c => U.inRange(c.createdAt.slice(0, 10), f.range)), c => U.monthKey(c.createdAt.slice(0, 10)));
        const billed = rows.filter(r => r.invoiced > 0);
        const histCust = f.customer || (rows[0] && rows[0].c.id);
        const hist = histCust ? U.sortBy(D().payments.filter(p => p.customerId === histCust && U.inRange(p.date, f.range)), p => p.date, 'desc') : [];
        return {
          kpis: [
            { label: 'Active customers', value: `${D().customers.filter(c => c.status === 'Active').length}`, sub: `${D().customers.length} in total` },
            { label: 'New customers in period', value: `${D().customers.filter(c => U.inRange(c.createdAt.slice(0, 10), f.range)).length}` },
            { label: 'Customers billed', value: `${billed.length}`, sub: `avg revenue ${U.money(billed.length ? U.sum(billed, r => r.revenue) / billed.length : 0)}` },
            { label: 'With outstanding balance', value: `${rows.filter(r => r.outstanding > 0).length}`, sub: U.money(U.sum(rows, r => r.outstanding)) }
          ],
          charts: [
            { title: 'Top customers', sub: 'Revenue excl. VAT vs paid in period', span: 2, config: barChart(rows.slice(0, 8).map(r => NB.data.customerName(r.c)), [{ label: 'Revenue (excl. VAT)', data: rows.slice(0, 8).map(r => r.revenue), color: ui.PALETTE.navy }, { label: 'Paid', data: rows.slice(0, 8).map(r => r.paid), color: ui.PALETTE.green }]) },
            { title: 'New customers over time', sub: 'By month added', config: { type: 'bar', data: { labels: months.map(m => U.monthLabel(m)), datasets: [{ label: 'New customers', data: months.map(m => (newBy[m] || []).length), backgroundColor: ui.PALETTE.teal, borderRadius: 5, maxBarThickness: 26 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: ui.gridColor } }, x: { grid: { display: false } } } } } }
          ],
          tables: [
            { title: 'Customer summary', link: r => `#/customers/view/${r._id}`, columns: [col('Customer'), col('Type'), col('Invoiced in period', 'money'), col('Revenue excl. VAT', 'money'), col('Paid in period', 'money'), col('Outstanding now', 'money'), col('Overdue now', 'money'), col('Last payment', 'date')],
              rows: rows.map(r => Object.assign([NB.data.customerName(r.c), r.c.type, r.invoiced, r.revenue, r.paid, r.outstanding, r.overdue, r.last], { _id: r.c.id })) },
            { title: `Customer payment history${histCust ? ' – ' + cname(histCust) : ''}`, link: r => `#/receipts/view/${r._id}`, note: f.customer ? '' : 'Showing the top customer. Choose a customer in the filter to see their history.', columns: [col('Receipt'), col('Date', 'date'), col('Invoice'), col('Method'), col('Amount', 'money')],
              rows: hist.map(p => Object.assign([p.receiptNumber, p.date, (NB.data.get('invoices', p.invoiceId) || {}).number || '', p.method, p.amount], { _id: p.id })) }
          ]
        };
      }
    },

    revenue: {
      title: 'Monthly Revenue', icon: 'chart-line', desc: 'Revenue, collections and expenses month by month.', filters: ['range'],
      build(f) {
        const m = C.monthlySeries(f.range);
        const rev = U.sum(m, x => x.revenue), col_ = U.sum(m, x => x.collected), exp = U.sum(m, x => x.expenses);
        return {
          kpis: [
            { label: 'Revenue (excl. VAT)', value: U.money(rev) }, { label: 'Cash collected', value: U.money(col_) },
            { label: 'Expenses (excl. VAT)', value: U.money(exp) }, { label: 'Revenue less expenses', value: U.money(rev - exp), sub: 'indicative, not a P&L' }
          ],
          charts: [{ title: 'Revenue, collections and expenses', sub: 'Per month', span: 3, height: 'lg', config: lineChart(m.map(x => U.monthLabel(x.month)), [
            { label: 'Revenue (excl. VAT)', data: m.map(x => x.revenue), color: ui.PALETTE.blue },
            { label: 'Collected', data: m.map(x => x.collected), color: ui.PALETTE.green, borderDash: [5, 4] },
            { label: 'Expenses', data: m.map(x => x.expenses), color: ui.PALETTE.red }]) }],
          tables: [{ title: 'Monthly breakdown', columns: [col('Month', 'month'), col('Invoiced (incl. VAT)', 'money'), col('VAT', 'money'), col('Revenue (excl. VAT)', 'money'), col('Collected', 'money'), col('Expenses', 'money'), col('Revenue − expenses', 'money')],
            rows: m.map(x => [x.month, x.invoiced, x.vat, x.revenue, x.collected, x.expenses, U.round2(x.revenue - x.expenses)]),
            totals: ['Total', U.sum(m, x => x.invoiced), U.sum(m, x => x.vat), rev, col_, exp, U.round2(rev - exp)] }]
        };
      }
    },

    expenses: {
      title: 'Expense Reports', icon: 'piggy-bank', desc: 'Expenses by category and month, compared with revenue.', filters: ['range', 'category'],
      build(f) {
        const ex = C.expensesIn(f.range).filter(e => !f.category || e.category === f.category);
        const byCat = Object.entries(U.groupBy(ex, e => e.category)).map(([k, a]) => [k, a.length, U.sum(a, x => x.amount), U.sum(a, x => x.vat)]).sort((a, b) => b[2] - a[2]);
        const m = C.monthlySeries(f.range);
        const byMonth = U.groupBy(ex, e => U.monthKey(e.date));
        const total = U.sum(ex, e => e.amount);
        const rev = U.sum(m, x => x.revenue);
        return {
          kpis: [
            { label: 'Total expenses (excl. VAT)', value: U.money(total), sub: `${ex.length} records` }, { label: 'Input VAT recorded', value: U.money(U.sum(ex, e => e.vat)) },
            { label: 'Revenue in period', value: U.money(rev), sub: 'excl. VAT' }, { label: 'Expenses as % of revenue', value: rev ? U.pct(total / rev * 100) : '—' }
          ],
          charts: [
            { title: 'Expenses by category', config: doughnut(byCat.map(c => c[0]), byCat.map(c => c[2])) },
            { title: 'Revenue vs expenses', sub: 'Per month, excl. VAT', span: 2, config: barChart(m.map(x => U.monthLabel(x.month)), [{ label: 'Revenue', data: m.map(x => x.revenue), color: ui.PALETTE.blue }, { label: 'Expenses', data: m.map(x => U.sum(byMonth[x.month] || [], e => e.amount)), color: ui.PALETTE.red }]) }
          ],
          tables: [
            { title: 'By category', columns: [col('Category'), col('Records', 'int'), col('Net amount', 'money'), col('VAT', 'money'), col('Share %', 'pct')], rows: byCat.map(c => [c[0], c[1], c[2], c[3], c[2] / (total || 1) * 100]), totals: ['Total', ex.length, total, U.sum(ex, e => e.vat), 100] },
            { title: 'Monthly expenses', columns: [col('Month', 'month'), col('Records', 'int'), col('Net amount', 'money'), col('VAT', 'money')], rows: m.map(x => [x.month, (byMonth[x.month] || []).length, U.sum(byMonth[x.month] || [], e => e.amount), U.sum(byMonth[x.month] || [], e => e.vat)]) },
            { title: 'Expense register', columns: [col('Date', 'date'), col('Category'), col('Description'), col('Supplier'), col('Net', 'money'), col('VAT', 'money'), col('Method')], rows: U.sortBy(ex, e => e.date, 'desc').map(e => [e.date, e.category, e.description, e.supplier, e.amount, e.vat, e.method]) }
          ]
        };
      }
    }
  };

  /* ================================================================ */
  /*  RENDERER                                                        */
  /* ================================================================ */
  const state = {}; // remembers filters per report during the session
  function render(key) {
    const R = REPORTS[key];
    const T = U.today();
    const st = state[key] = state[key] || { preset: 'last-6', range: clampToday(U.rangePreset('last-6')), customer: '', status: '', method: '', granularity: 'monthly', category: '', asOf: T };
    function clampToday(r) { return { from: r.from, to: r.to > T ? T : r.to }; }

    const filterHtml = R.filters.map(fl => {
      if (fl === 'range') return `<div id="rp-range"></div>`;
      if (fl === 'asof') return `<div class="flex items-center gap-2"><label class="text-sm text-slate-500" for="rp-asof">As at</label><input type="date" id="rp-asof" class="form-input w-[160px]" value="${st.asOf}"></div>`;
      if (fl === 'customer') return `<select id="rp-cust" class="form-select w-auto max-w-[240px]" aria-label="Customer">${ui.customerOptions(st.customer, { includeInactive: true, placeholder: 'All customers' })}</select>`;
      if (fl === 'status') return ui.selectInput('rp-status', [{ value: '', label: 'All statuses' }, 'Paid', 'Partially Paid', 'Unpaid', 'Sent', 'Overdue', 'Draft', 'Cancelled'], st.status, 'Status');
      if (fl === 'method') return ui.selectInput('rp-method', [{ value: '', label: 'All methods' }, ...NB.payments.METHODS], st.method, 'Method');
      if (fl === 'granularity') return ui.selectInput('rp-gran', [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }], st.granularity, 'Granularity');
      if (fl === 'category') return ui.selectInput('rp-cat', [{ value: '', label: 'All categories' }, ...D().settings.expenseCategories], st.category, 'Category');
      return '';
    }).join('');

    const v = NB.view.render(`
      ${ui.pageHeader({ title: R.title, crumbs: [{ label: 'Reports' }, { label: R.title }], subtitle: R.desc,
        actions: `<button class="btn btn-secondary" id="rp-refresh">${ui.icon('refresh-cw')}Refresh</button><button class="btn btn-secondary" id="rp-csv">${ui.icon('file-spreadsheet')}CSV</button><button class="btn btn-secondary" id="rp-pdf">${ui.icon('download')}PDF</button><button class="btn btn-primary" id="rp-print">${ui.icon('printer')}Print</button>` })}
      <div class="flex gap-1.5 overflow-x-auto pb-3 mb-3 no-print">${Object.entries(REPORTS).map(([k, r]) => `<a href="#/reports/${k}" class="btn btn-sm ${k === key ? 'btn-dark' : 'btn-secondary'}">${ui.icon(r.icon)}${r.title.replace(' Reports', '')}</a>`).join('')}</div>
      <div class="card mb-5 no-print"><div class="flex flex-wrap items-center gap-2 p-4">${filterHtml}</div></div>
      <div id="rp-body"></div>`);

    let current = null; const charts = [];
    function draw() {
      ui.destroyCharts(); charts.length = 0;
      const f = { range: st.range, customer: st.customer, status: st.status, method: st.method, granularity: st.granularity, category: st.category, asOf: st.asOf };
      current = R.build(f);
      const period = R.filters.includes('asof') ? `As at ${U.fmtDate(st.asOf)}` : `${U.fmtDate(st.range.from)} – ${U.fmtDate(st.range.to)}`;
      current.period = period;
      const body = v.querySelector('#rp-body');
      body.innerHTML = `
        <div class="flex items-center gap-2 text-sm text-slate-500 mb-3">${ui.icon('calendar', '!w-4 !h-4')}<span>${period}${st.customer ? ` · ${esc(cname(st.customer))}` : ''}</span><span class="ml-auto text-xs">Generated ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">${current.kpis.map(k => `<div class="card stat-card"><span class="stat-label">${esc(k.label)}</span><div class="stat-value">${k.value}</div><div class="flex items-center gap-2 min-h-[22px] flex-wrap">${k.trend !== undefined && k.trend !== null ? `<span class="trend ${k.trend > 0.05 ? 'up' : k.trend < -0.05 ? 'down' : 'flat'}">${ui.icon(k.trend > 0.05 ? 'trending-up' : k.trend < -0.05 ? 'trending-down' : 'minus')}${Math.abs(k.trend).toFixed(1)}%</span><span class="text-[11.5px] text-slate-500">vs previous period</span>` : ''}${k.sub ? `<span class="text-[11.5px] text-slate-500">${k.sub}</span>` : ''}</div></div>`).join('')}</div>
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">${current.charts.map((c, i) => `<div class="card ${c.span === 2 ? 'xl:col-span-2' : c.span === 3 ? 'xl:col-span-3' : ''}"><div class="card-head"><div><div class="card-title">${esc(c.title)}</div>${c.sub ? `<div class="card-sub">${esc(c.sub)}</div>` : ''}</div></div><div class="card-body"><div class="chart-box ${c.height || ''}"><canvas id="rp-ch-${i}" role="img" aria-label="${esc(c.title)}"></canvas></div></div></div>`).join('')}</div>
        <div class="space-y-5">${current.tables.map((t, i) => `<div class="card"><div class="card-head"><div><div class="card-title">${esc(t.title)}</div>${t.note ? `<div class="card-sub">${esc(t.note)}</div>` : ''}</div><span class="card-sub">${t.rows.length} rows</span></div><div id="rp-t-${i}"></div></div>`).join('')}</div>`;
      current.charts.forEach((c, i) => { const ch = ui.chart(body.querySelector(`#rp-ch-${i}`), c.config); charts.push({ title: c.title, ch }); });
      current.tables.forEach((t, i) => {
        const columns = t.columns.map((c, ci) => ({ key: 'c' + ci, label: c.label, num: c.num, value: r => r[ci], render: r => (ci === 0 && t.link && r._id ? `<a class="link" href="${t.link(r)}">${FMT[c.fmt](r[ci])}</a>` : FMT[c.fmt](r[ci])) }));
        ui.dataTable(body.querySelector(`#rp-t-${i}`), columns, { rows: t.rows, pageSize: 12, emptyTitle: 'No data for these filters', emptyText: 'Try a wider date range.',
          footer: t.totals ? () => `<tr>${t.totals.map((v2, ci) => `<td class="${t.columns[ci].num ? 'num' : ''}">${ci === 0 ? esc(v2) : FMT[t.columns[ci].fmt](v2)}</td>`).join('')}</tr>` : null });
      });
      ui.icons(body);
    }

    /* filters */
    if (R.filters.includes('range')) ui.dateRange(v.querySelector('#rp-range'), { preset: st.preset, from: st.preset === 'custom' ? st.range.from : null, to: st.preset === 'custom' ? st.range.to : null, idPrefix: 'rp-dr', onChange: r => { st.preset = r.preset; st.range = r.preset === 'all' ? { from: '2000-01-01', to: T } : { from: r.from, to: r.to }; draw(); } });
    const bind = (id, k) => { const el = v.querySelector(id); if (el) el.onchange = e => { st[k] = e.target.value; draw(); }; };
    bind('#rp-cust', 'customer'); bind('#rp-status', 'status'); bind('#rp-method', 'method'); bind('#rp-gran', 'granularity'); bind('#rp-cat', 'category'); bind('#rp-asof', 'asOf');
    v.querySelector('#rp-refresh').onclick = () => { draw(); ui.toast('Report refreshed from current data.', 'info'); };

    /* exports */
    const tablesForExport = () => current.tables.map(t => ({ title: t.title, columns: t.columns, rows: [...t.rows, ...(t.totals ? [t.totals] : [])] }));
    v.querySelector('#rp-csv').onclick = () => {
      const out = [[R.title], [current.period], []];
      tablesForExport().forEach(t => { out.push([t.title]); out.push(t.columns.map(c => c.label)); t.rows.forEach(r => out.push(r.map((x, i) => csvVal(x, t.columns[i].fmt)))); out.push([]); });
      U.download(`${U.slug(R.title)}-${U.today()}.csv`, U.toCSV(out), 'text/csv');
      ui.toast('CSV exported.');
    };
    const textCell = (x, c) => c.fmt === 'money' ? U.num(x) : c.fmt === 'text' ? String(x ?? '') : FMT[c.fmt](x).replace(/<[^>]+>/g, '');
    v.querySelector('#rp-print').onclick = () => {
      const html = NB.docs.report({ title: R.title, period: current.period, kpis: current.kpis.map(k => ({ label: k.label, value: k.value.replace(/<[^>]+>/g, '') })),
        images: charts.filter(c => c.ch).map(c => ({ title: c.title, src: c.ch.toBase64Image('image/png', 1) })),
        tables: tablesForExport().map(t => ({ title: t.title, columns: t.columns, rows: t.rows.map(r => r.map((x, i) => textCell(x, t.columns[i]))) })) });
      NB.docs.print(html, `${R.title} ${current.period}`);
    };
    v.querySelector('#rp-pdf').onclick = e => {
      if (!window.jspdf) return ui.notAvailable('PDF export unavailable', 'The PDF library could not be loaded. Use Print → Save as PDF instead.');
      const btn = e.currentTarget; btn.classList.add('is-loading');
      setTimeout(() => {
        try {
          const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'mm', format: 'a4' });
          const co = D().company; const W = 210;
          doc.setFillColor(15, 29, 58); doc.rect(0, 0, W, 24, 'F');
          doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(R.title, 14, 11);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(`${co.legalName} · ${current.period} · ${U.currency()}`, 14, 18);
          doc.setTextColor(30); let y = 32;
          const kw = (W - 28) / current.kpis.length;
          current.kpis.forEach((k, i) => { doc.setFontSize(7); doc.setTextColor(100); doc.text(k.label.toUpperCase(), 14 + i * kw, y); doc.setFontSize(11); doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.text(k.value.replace(/<[^>]+>/g, ''), 14 + i * kw, y + 6); doc.setFont('helvetica', 'normal'); });
          y += 14;
          charts.filter(c => c.ch).slice(0, 2).forEach(c => {
            const img = c.ch.toBase64Image('image/png', 1); const ratio = c.ch.height / c.ch.width; const h = Math.min(70, (W - 28) * ratio);
            if (y + h + 10 > 280) { doc.addPage(); y = 18; }
            doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text(c.title, 14, y); doc.setFont('helvetica', 'normal');
            doc.addImage(img, 'PNG', 14, y + 2, h / ratio > W - 28 ? W - 28 : h / ratio, h); y += h + 8;
          });
          tablesForExport().forEach(t => {
            if (y > 250) { doc.addPage(); y = 18; }
            doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text(t.title, 14, y); doc.setFont('helvetica', 'normal');
            doc.autoTable({ startY: y + 2, head: [t.columns.map(c => c.label)], body: t.rows.map(r => r.map((x, i) => textCell(x, t.columns[i]))), margin: { left: 14, right: 14 },
              styles: { fontSize: 7.5, cellPadding: 1.6 }, headStyles: { fillColor: [22, 40, 77], textColor: 255 }, alternateRowStyles: { fillColor: [246, 248, 252] },
              columnStyles: Object.fromEntries(t.columns.map((c, i) => [i, { halign: c.num ? 'right' : 'left' }])) });
            y = doc.lastAutoTable.finalY + 9;
          });
          const n = doc.getNumberOfPages();
          for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(120); doc.text(`Generated ${U.fmtDate(T)} from recorded transactions · Page ${i} of ${n}`, W - 14, 290, { align: 'right' }); }
          doc.save(`${U.slug(R.title)}-${U.today()}.pdf`);
          ui.toast('PDF exported.');
        } catch (err) { console.error(err); ui.toast('PDF export failed. Use Print → Save as PDF instead.', 'err'); }
        finally { btn.classList.remove('is-loading'); }
      }, 30);
    };
    draw();
  }

  Object.keys(REPORTS).forEach(k => NB.route(`reports/${k}`, () => render(k)));
  NB.route('reports', () => NB.go('reports/sales'));
})();
