/* =====================================================================
   expenses.js – simple expense register (basic prototype module).
   Expenses are kept separate from customer payments and sales revenue.
   Laravel: Expense model + ExpenseController; receipts upload via secure
   storage (S3 / local disk) in a later phase.
   ===================================================================== */
window.NB = window.NB || {};

NB.expenses = (() => {
  const U = NB.utils; const ui = NB.ui; const { esc } = U;
  const D = () => NB.data.db;
  const cats = () => D().settings.expenseCategories;

  function list() {
    const f = { q: '', cat: '', from: '', to: '' };
    const v = NB.view.render(`
      ${ui.pageHeader({ title: 'Expenses', crumbs: [{ label: 'Finance' }, { label: 'Expenses' }], subtitle: 'Business costs paid to suppliers. Not part of sales revenue or customer payments.',
        actions: `<button class="btn btn-secondary" id="e-export">${ui.icon('file-spreadsheet')}Export CSV</button><button class="btn btn-primary" id="e-add">${ui.icon('plus')}Add expense</button>` })}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="e-stats"></div>
      <div class="card"><div class="flex flex-wrap gap-2 p-4 border-b border-slate-100">
        ${ui.searchInput('e-q', 'Search description, supplier or reference…')}
        ${ui.selectInput('e-cat', [{ value: '', label: 'All categories' }, ...cats()], '', 'Category')}
        <div id="e-range"></div></div><div id="e-table"></div></div>`);
    const filter = () => {
      const q = f.q.toLowerCase();
      return D().expenses.filter(e => (!q || [e.description, e.supplier, e.reference, e.id].some(x => String(x || '').toLowerCase().includes(q))) && (!f.cat || e.category === f.cat) && (!f.from || (e.date >= f.from && e.date <= f.to)));
    };
    const stats = rows => {
      const byCat = Object.entries(U.groupBy(rows, r => r.category)).map(([k, a]) => [k, U.sum(a, x => x.amount)]).sort((a, b) => b[1] - a[1]);
      v.querySelector('#e-stats').innerHTML = [
        ui.statCard({ label: 'Total expenses (net)', value: U.money(U.sum(rows, r => r.amount)), icon: 'wallet', tone: 'bad', sub: `${rows.length} records` }),
        ui.statCard({ label: 'Input VAT recorded', value: U.money(U.sum(rows, r => r.vat)), icon: 'percent', tone: 'navy', sub: 'for reference only' }),
        ui.statCard({ label: 'Total paid (incl. VAT)', value: U.money(U.sum(rows, r => Number(r.amount) + Number(r.vat || 0))), icon: 'banknote', tone: 'warn' }),
        ui.statCard({ label: 'Largest category', value: byCat[0] ? esc(byCat[0][0]) : '—', icon: 'layers', tone: 'teal', sub: byCat[0] ? U.money(byCat[0][1]) : '' })
      ].join(''); ui.icons(v.querySelector('#e-stats'));
    };
    const table = ui.dataTable(v.querySelector('#e-table'), [
      { key: 'date', label: 'Date', render: r => U.fmtDate(r.date) },
      { key: 'category', label: 'Category', render: r => `<span class="chip">${esc(r.category)}</span>` },
      { key: 'description', label: 'Description', render: r => `<span class="font-medium text-slate-800">${esc(r.description)}</span><div class="text-[11px] text-slate-500">${r.id}</div>` },
      { key: 'supplier', label: 'Supplier' },
      { key: 'amount', label: 'Amount (net)', num: true, render: r => U.money(r.amount) },
      { key: 'vat', label: 'VAT', num: true, render: r => r.vat ? U.num(r.vat) : '<span class="text-slate-400">—</span>' },
      { key: 'method', label: 'Method', render: r => `<span class="chip">${esc(r.method)}</span>` },
      { key: 'reference', label: 'Reference', render: r => esc(r.reference || '—') },
      { key: 'a', label: '', sortable: false, render: r => `<div class="flex justify-end gap-0.5"><button class="row-action" data-edit="${r.id}" title="Edit" aria-label="Edit ${r.id}">${ui.icon('pencil')}</button><button class="row-action danger" data-del="${r.id}" title="Delete" aria-label="Delete ${r.id}">${ui.icon('trash-2')}</button></div>` }
    ], {
      rows: filter(), sort: { key: 'date', dir: 'desc' }, pageSize: 12,
      footer: rows => `<tr><td colspan="4">Total (${rows.length})</td><td class="num">${U.money(U.sum(rows, r => r.amount))}</td><td class="num">${U.num(U.sum(rows, r => r.vat))}</td><td colspan="3"></td></tr>`,
      emptyTitle: 'No expenses found', emptyAction: '<button class="btn btn-primary btn-sm" onclick="NB.expenses.openForm()">Add expense</button>',
      afterRender: el => {
        U.$$('[data-edit]', el).forEach(b => b.onclick = () => openForm(b.dataset.edit));
        U.$$('[data-del]', el).forEach(b => b.onclick = async () => {
          const e = NB.data.get('expenses', b.dataset.del);
          const ok = await ui.confirm({ title: 'Delete expense?', message: `<b>${esc(e.description)}</b> (${U.money(e.amount)}) will be permanently deleted.`, confirmLabel: 'Delete', danger: true });
          if (!ok) return; NB.data.remove('expenses', e.id); ui.toast('Expense deleted.'); upd();
        });
      }
    });
    const upd = () => { const r = filter(); table.setRows(r); stats(r); };
    stats(filter());
    ui.dateRange(v.querySelector('#e-range'), { preset: 'all', idPrefix: 'e-dr', onChange: r => { f.from = r.preset === 'all' ? '' : r.from; f.to = r.to; upd(); } });
    v.querySelector('#e-q').addEventListener('input', U.debounce(e => { f.q = e.target.value; upd(); }, 150));
    v.querySelector('#e-cat').onchange = e => { f.cat = e.target.value; upd(); };
    v.querySelector('#e-add').onclick = () => openForm();
    v.querySelector('#e-export').onclick = () => {
      const r = table.rows;
      U.download(`expenses-${U.today()}.csv`, U.toCSV([['Expense ID', 'Date', 'Category', 'Description', 'Supplier', 'Amount (net)', 'VAT', 'Payment method', 'Reference'], ...r.map(e => [e.id, e.date, e.category, e.description, e.supplier, Number(e.amount).toFixed(2), Number(e.vat || 0).toFixed(2), e.method, e.reference])]), 'text/csv');
      ui.toast(`Exported ${r.length} expenses.`);
    };
  }

  function openForm(id) {
    const e = id ? NB.data.get('expenses', id) : null;
    const x = e || { date: U.today(), category: cats()[0], method: 'Bank Transfer', amount: '', vat: '' };
    const m = ui.modal({
      title: e ? `Edit expense · ${e.id}` : 'Add expense',
      body: `<form id="ef" novalidate class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        ${ui.field({ id: 'ef-date', label: 'Expense date', type: 'date', value: x.date, required: true })}
        ${ui.field({ id: 'ef-cat', label: 'Category', type: 'select', options: cats(), value: x.category, required: true })}
        ${ui.field({ id: 'ef-desc', label: 'Description', value: x.description, required: true, cls: 'sm:col-span-2' })}
        ${ui.field({ id: 'ef-supplier', label: 'Supplier', value: x.supplier, required: true })}
        ${ui.field({ id: 'ef-ref', label: 'Reference', value: x.reference, placeholder: 'Supplier invoice / receipt no.' })}
        ${ui.field({ id: 'ef-amount', label: `Amount excl. VAT (${U.currency()})`, type: 'number', value: x.amount, required: true, attrs: 'min="0" step="0.01"' })}
        <div>${ui.field({ id: 'ef-vat', label: 'VAT amount', type: 'number', value: x.vat, attrs: 'min="0" step="0.01"' })}<button type="button" class="text-xs link mt-1" id="ef-5">Calculate 5%</button></div>
        ${ui.field({ id: 'ef-method', label: 'Payment method', type: 'select', options: NB.payments.METHODS, value: x.method })}
      </form>`,
      actions: [{ label: 'Cancel', onClick: mm => mm.close() }, { label: e ? 'Save changes' : 'Add expense', variant: 'primary', icon: 'check', onClick: mm => save(mm) }]
    });
    const el = m.el;
    el.querySelector('#ef-5').onclick = () => { const a = parseFloat(el.querySelector('#ef-amount').value) || 0; el.querySelector('#ef-vat').value = U.round2(a * 0.05).toFixed(2); };
    el.querySelector('#ef').onsubmit = ev => { ev.preventDefault(); save(m); };
    function save(mm) {
      const g = k => ui.val(k, el);
      const data = { date: g('ef-date'), category: g('ef-cat'), description: g('ef-desc'), supplier: g('ef-supplier'), reference: g('ef-ref'), amount: U.round2(parseFloat(g('ef-amount'))), vat: U.round2(parseFloat(g('ef-vat')) || 0), method: g('ef-method') };
      const err = {};
      if (!data.date) err['ef-date'] = 'Enter the expense date.';
      if (!data.description) err['ef-desc'] = 'Describe the expense.';
      if (!data.supplier) err['ef-supplier'] = 'Enter the supplier name.';
      if (!(data.amount > 0)) err['ef-amount'] = 'Amount must be greater than zero.';
      if (data.vat < 0) err['ef-vat'] = 'VAT cannot be negative.';
      else if (data.vat > data.amount) err['ef-vat'] = 'VAT looks higher than the net amount – please check.';
      if (!ui.showErrors(el, err)) return;
      if (e) { NB.data.update('expenses', e.id, data); ui.toast('Expense updated.'); }
      else { NB.data.insert('expenses', { id: NB.data.nextId('expense', 'EXP'), ...data, createdAt: new Date().toISOString() }); NB.data.save(); ui.toast('Expense added.'); }
      mm.close();
      if (NB.current && NB.current.path === 'expenses') NB.view.refresh(); else NB.go('expenses');
    }
  }

  NB.route('expenses', list);
  return { openForm };
})();
