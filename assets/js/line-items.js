/* =====================================================================
   line-items.js – shared line item editor used by quotations, invoices,
   recurring profiles and credit notes. Totals recalculate on every input.
   Laravel: a Livewire/Alpine component posting items[] arrays; server-side
   validation re-computes totals with the same rules as calculations.js.
   ===================================================================== */
window.NB = window.NB || {};

NB.lineItems = (() => {
  const U = NB.utils; const { esc } = U; const ui = NB.ui;

  const settings = () => NB.data.db.settings;
  const activeRates = () => settings().taxRates.filter(t => t.active !== false);

  function blankItem() {
    const t = NB.data.taxRate(settings().defaultTaxId) || activeRates()[0];
    return { serviceId: null, description: '', details: '', qty: 1, unitPrice: 0, discount: 0, taxId: t.id, taxRate: t.rate, taxLabel: t.short, taxCategory: t.category };
  }

  /**
   * mount(container, items, { onChange(totals) , allowEmpty })
   * Returns { getItems(), validate() → error string | null, totals() }
   */
  function mount(container, initialItems, opts = {}) {
    let items = (initialItems && initialItems.length ? initialItems : [blankItem()]).map(i => ({ ...i }));
    const listId = U.uid('svc');

    function rowHtml(it, i) {
      const l = NB.calc.line(it);
      const rates = activeRates();
      if (!rates.find(r => r.id === it.taxId)) rates.push({ id: it.taxId, short: it.taxLabel, rate: it.taxRate, category: it.taxCategory });
      return `<div class="li-row" data-i="${i}">
        <div class="li-desc">
          <label class="li-mobile-label" for="li-d-${i}">Item / description</label>
          <input id="li-d-${i}" class="form-input input-sm" data-f="description" list="${listId}" value="${esc(it.description)}" placeholder="Choose a service or type a description" aria-label="Item description ${i + 1}">
          <input class="form-input input-sm mt-1.5 text-[12.5px]" data-f="details" value="${esc(it.details || '')}" placeholder="Additional details (optional)" aria-label="Item details ${i + 1}">
        </div>
        <div><label class="li-mobile-label" for="li-q-${i}">Qty</label><input id="li-q-${i}" class="form-input input-sm text-right" data-f="qty" type="number" min="0" step="any" value="${it.qty}" aria-label="Quantity ${i + 1}"></div>
        <div><label class="li-mobile-label" for="li-p-${i}">Unit price</label><input id="li-p-${i}" class="form-input input-sm text-right" data-f="unitPrice" type="number" min="0" step="0.01" value="${it.unitPrice}" aria-label="Unit price ${i + 1}"></div>
        <div><label class="li-mobile-label" for="li-x-${i}">Disc %</label><input id="li-x-${i}" class="form-input input-sm text-right" data-f="discount" type="number" min="0" max="100" step="0.01" value="${it.discount || 0}" aria-label="Discount percent ${i + 1}"></div>
        <div><label class="li-mobile-label" for="li-t-${i}">VAT</label><select id="li-t-${i}" class="form-select input-sm" data-f="taxId" aria-label="VAT rate ${i + 1}">${rates.map(r => `<option value="${r.id}" ${r.id === it.taxId ? 'selected' : ''}>${esc(r.short)}</option>`).join('')}</select></div>
        <div class="li-total"><span class="li-mobile-label">Line total</span><div><div class="font-semibold text-slate-800 tabular" data-out="total">${U.num(l.total)}</div><div class="text-[11px] text-slate-500 tabular" data-out="sub">Net ${U.num(l.net)} · VAT ${U.num(l.vat)}</div></div></div>
        <div class="flex justify-end md:pt-1"><button type="button" class="row-action danger" data-remove="${i}" aria-label="Remove line ${i + 1}" ${items.length === 1 ? 'disabled style="opacity:.35"' : ''}>${ui.icon('trash-2')}</button></div>
      </div>`;
    }

    function render() {
      container.innerHTML = `
        <datalist id="${listId}">${settings().services.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>
        <div class="li-head"><div>Item / description</div><div class="text-right">Qty</div><div class="text-right">Unit price</div><div class="text-right">Disc %</div><div>VAT</div><div class="text-right">Line total</div><div></div></div>
        <div class="space-y-2 md:space-y-0" data-rows>${items.map(rowHtml).join('')}</div>
        <div class="flex flex-wrap items-center gap-2 mt-3">
          <button type="button" class="btn btn-secondary btn-sm" data-add>${ui.icon('plus')}Add line item</button>
          <span class="text-xs text-slate-500">Prices are entered excluding VAT. Choose a catalogue service to pre-fill price and VAT code.</span>
        </div>`;
      bind(); ui.icons(container); emit();
    }

    function bind() {
      U.$$('.li-row', container).forEach(row => {
        const i = +row.dataset.i;
        U.$$('[data-f]', row).forEach(inp => {
          inp.addEventListener('input', () => onField(i, inp.dataset.f, inp, row));
          inp.addEventListener('change', () => onField(i, inp.dataset.f, inp, row, true));
        });
      });
      U.$$('[data-remove]', container).forEach(b => b.onclick = () => { if (items.length > 1) { items.splice(+b.dataset.remove, 1); render(); } });
      container.querySelector('[data-add]').onclick = () => {
        items.push(blankItem()); render();
        const last = container.querySelector(`.li-row[data-i="${items.length - 1}"] [data-f="description"]`); if (last) last.focus();
      };
    }

    function onField(i, f, inp, row, committed) {
      const it = items[i];
      if (f === 'taxId') {
        const t = NB.data.taxRate(inp.value) || { id: inp.value, rate: it.taxRate, short: it.taxLabel, category: it.taxCategory };
        Object.assign(it, { taxId: t.id, taxRate: t.rate, taxLabel: t.short, taxCategory: t.category });
      } else if (f === 'description') {
        it.description = inp.value;
        const svc = settings().services.find(s => s.name === inp.value);
        if (svc && it.serviceId !== svc.id) {
          const t = NB.data.taxRate(svc.taxId);
          Object.assign(it, { serviceId: svc.id, unitPrice: svc.price, taxId: t.id, taxRate: t.rate, taxLabel: t.short, taxCategory: t.category });
          row.querySelector('[data-f="unitPrice"]').value = svc.price;
          row.querySelector('[data-f="taxId"]').value = t.id;
        } else if (!svc) it.serviceId = null;
      } else if (f === 'details') it.details = inp.value;
      else {
        let v = parseFloat(inp.value); if (!isFinite(v)) v = 0;
        if (f === 'discount') v = Math.min(Math.max(v, 0), 100);
        it[f] = v;
      }
      const l = NB.calc.line(it);
      row.querySelector('[data-out="total"]').textContent = U.num(l.total);
      row.querySelector('[data-out="sub"]').textContent = `Net ${U.num(l.net)} · VAT ${U.num(l.vat)}`;
      emit();
    }

    function emit() { if (opts.onChange) opts.onChange(NB.calc.totals(items), items); }

    function validate() {
      const filled = items.filter(it => it.description.trim() || it.unitPrice);
      if (!filled.length) return 'Add at least one line item with a description and price.';
      for (const [n, it] of items.entries()) {
        if (!it.description.trim()) return `Line ${n + 1}: enter a description or remove the empty line.`;
        if (!(it.qty > 0)) return `Line ${n + 1}: quantity must be greater than zero.`;
        if (it.unitPrice < 0) return `Line ${n + 1}: unit price cannot be negative.`;
      }
      return null;
    }

    render();
    return {
      getItems: () => items.map(it => ({ ...it, description: it.description.trim(), details: (it.details || '').trim() })),
      validate,
      totals: () => NB.calc.totals(items)
    };
  }

  /** Read-only totals panel used beside the editor. */
  function totalsPanel(t, extra = '') {
    const vatRows = t.vatBreakdown.filter(v => v.net || v.vat).map(v => `<div class="flex justify-between text-xs text-slate-500"><span>${esc(v.label)} on ${U.num(v.net)}</span><span class="tabular">${U.num(v.vat)}</span></div>`).join('');
    return `<div class="space-y-2 text-sm">
      <div class="flex justify-between"><span class="text-slate-500">Subtotal</span><span class="tabular font-medium">${U.money(t.subtotal)}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">Discount</span><span class="tabular font-medium">${t.discount ? '-' : ''}${U.money(t.discount)}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">Taxable amount</span><span class="tabular font-medium">${U.money(t.taxable)}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">VAT</span><span class="tabular font-medium">${U.money(t.vat)}</span></div>
      ${vatRows ? `<div class="pl-3 border-l-2 border-slate-100 space-y-1">${vatRows}</div>` : ''}
      <div class="flex justify-between pt-3 mt-1 border-t border-slate-200"><span class="font-display font-extrabold text-slate-900">Grand total</span><span class="tabular font-display font-extrabold text-lg text-slate-900">${U.money(t.total)}</span></div>
      ${extra}
    </div>`;
  }

  /** Customer selector with inline "new customer" + details preview. Returns { get() }. */
  function customerPicker(container, selected, onChange, { label = 'Customer', required = true, id = 'doc-customer' } = {}) {
    let value = selected || '';
    function draw() {
      const c = value ? NB.data.customer(value) : null;
      container.innerHTML = `<label class="form-label" for="${id}">${label}${required ? '<span class="req">*</span>' : ''}</label>
        <div class="flex gap-2"><select id="${id}" class="form-select flex-1 min-w-0">${ui.customerOptions(value)}</select>
        <button type="button" class="btn btn-secondary shrink-0" data-new title="Add a new customer">${ui.icon('user-plus')}<span class="hidden sm:inline">New</span></button></div>
        <div class="form-error hidden" id="${id}-error"></div>
        ${c ? `<div class="mt-3 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 text-[12.5px] text-slate-600 leading-relaxed">
          <div class="font-semibold text-slate-800">${esc(NB.data.customerName(c))}${c.companyName ? ` <span class="font-normal text-slate-500">· Attn: ${esc(c.contactPerson)}</span>` : ''}</div>
          ${esc(c.billingAddress)}, ${esc(c.city)}${c.country !== 'United Arab Emirates' ? ', ' + esc(c.country) : ''}<br>${esc(c.email)} · ${esc(c.phone)}${c.trn ? `<br>TRN <span class="font-mono">${esc(c.trn)}</span>` : '<br><span class="text-slate-400">No TRN on file</span>'}</div>` : ''}`;
      container.querySelector('select').onchange = e => { value = e.target.value; draw(); if (onChange) onChange(value); };
      container.querySelector('[data-new]').onclick = () => NB.customers.openForm(null, { onSaved: rec => { value = rec.id; draw(); if (onChange) onChange(value); } });
      ui.icons(container);
    }
    draw();
    return { get: () => value };
  }

  return { mount, blankItem, totalsPanel, customerPicker };
})();
