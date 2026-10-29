/* =====================================================================
   settings.js – company profile, document templates, tax settings,
   numbering and demo-data management.
   Laravel: settings table (key/value, cached) or a companies table for
   multi-tenancy; logo upload via validated Storage disk; TaxRate model.
   ===================================================================== */
window.NB = window.NB || {};

(() => {
  const U = NB.utils; const ui = NB.ui; const { esc } = U;
  const D = () => NB.data.db;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const TABS = [['company', 'Company Profile', 'building-2'], ['templates', 'Document Templates', 'palette'], ['tax', 'Tax Settings', 'percent'], ['numbering', 'Numbering', 'hash']];

  const shell = (key, title, subtitle, body) => NB.view.render(`
    ${ui.pageHeader({ title, crumbs: [{ label: 'Settings' }, { label: title }], subtitle })}
    <div class="flex gap-1.5 overflow-x-auto pb-3 mb-3">${TABS.map(([k, l, ic]) => `<a href="#/settings/${k}" class="btn btn-sm ${k === key ? 'btn-dark' : 'btn-secondary'}">${ui.icon(ic)}${l}</a>`).join('')}</div>
    ${body}`);

  /* ---------------- Company profile ---------------- */
  function company() {
    const c = D().company;
    const v = shell('company', 'Company Profile', 'Details printed on quotations, invoices, receipts and statements.', `
      <form id="co" novalidate class="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div class="xl:col-span-2 space-y-4">
          <div class="card"><div class="card-head"><div class="card-title">Business details</div></div><div class="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
            ${ui.field({ id: 'co-legal', label: 'Company legal name', value: c.legalName, required: true, help: 'As shown on your trade licence.' })}
            ${ui.field({ id: 'co-trading', label: 'Trading name', value: c.tradingName })}
            ${ui.field({ id: 'co-address', label: 'Address', value: c.address, required: true, cls: 'md:col-span-2' })}
            ${ui.field({ id: 'co-pobox', label: 'P.O. Box', value: c.poBox })}
            ${ui.field({ id: 'co-city', label: 'City', value: c.city, required: true })}
            ${ui.field({ id: 'co-emirate', label: 'Emirate', type: 'select', options: NB.customers.EMIRATES, value: c.emirate, required: true })}
            ${ui.field({ id: 'co-country', label: 'Country', value: c.country, required: true })}
            ${ui.field({ id: 'co-phone', label: 'Phone', value: c.phone, required: true })}
            ${ui.field({ id: 'co-email', label: 'Email', type: 'email', value: c.email, required: true })}
            ${ui.field({ id: 'co-web', label: 'Website', value: c.website })}
            ${ui.field({ id: 'co-trn', label: 'TRN', value: c.trn, help: 'Required when the company is VAT registered (Tax Settings).' })}
            ${ui.field({ id: 'co-currency', label: 'Display currency', type: 'select', options: ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'OMR'], value: c.currency, help: 'Changes the currency label only – amounts are not converted.' })}
            ${ui.field({ id: 'co-fy', label: 'Financial year starts', type: 'select', options: MONTHS.map((m, i) => ({ value: i + 1, label: m })), value: c.fyStartMonth })}
          </div></div>
          <div class="card"><div class="card-head"><div class="card-title">Bank &amp; payment details</div><span class="card-sub">Printed on invoices and statements</span></div><div class="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
            ${ui.field({ id: 'co-bank', label: 'Bank name', value: c.bankName, required: true })}
            ${ui.field({ id: 'co-holder', label: 'Account holder', value: c.accountHolder, required: true })}
            ${ui.field({ id: 'co-iban', label: 'IBAN', value: c.iban, required: true, help: 'UAE IBANs start with AE and have 23 characters.' })}
            ${ui.field({ id: 'co-swift', label: 'SWIFT / BIC', value: c.swift, required: true })}
            ${ui.field({ id: 'co-instr', label: 'Payment instructions', type: 'textarea', rows: 3, value: c.paymentInstructions, cls: 'md:col-span-2' })}
          </div></div>
        </div>
        <div class="space-y-4 xl:sticky xl:top-20">
          <div class="card"><div class="card-head"><div class="card-title">Logo</div></div><div class="card-body">
            <div class="flex items-center gap-4"><div id="co-logo-prev" class="w-20 h-20 rounded-xl border border-slate-200 grid place-items-center overflow-hidden bg-slate-50 shrink-0"></div>
              <div class="space-y-2"><label class="btn btn-secondary btn-sm cursor-pointer">${ui.icon('upload')}Upload logo<input type="file" id="co-logo" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="sr-only"></label>
              <button type="button" class="btn btn-ghost btn-sm" id="co-logo-rm">Remove</button><div class="text-[11px] text-slate-500">PNG, JPG, SVG or WebP · max 400 KB</div></div></div>
          </div></div>
          <div class="card"><div class="card-body"><button class="btn btn-primary w-full" type="submit">${ui.icon('check')}Save company profile</button></div></div>
          <div class="card"><div class="card-head"><div class="card-title">Demo data</div></div><div class="card-body space-y-3 text-sm text-slate-600">
            <p>Storage: <b class="${NB.data.storageOk ? 'text-emerald-700' : 'text-red-600'}">${NB.data.storageOk ? 'saved in this browser (LocalStorage)' : 'unavailable – changes are lost on refresh'}</b></p>
            <p>${D().customers.length} customers · ${D().invoices.length} invoices · ${D().quotations.length} quotations · ${D().payments.length} payments</p>
            <div class="flex flex-wrap gap-2"><button type="button" class="btn btn-secondary btn-sm" id="co-backup">${ui.icon('download')}Download JSON backup</button><button type="button" class="btn btn-danger btn-sm" id="co-reset">${ui.icon('rotate-ccw')}Reset demo data</button></div>
          </div></div>
        </div>
      </form>`);
    let logo = c.logo;
    const drawLogo = () => { v.querySelector('#co-logo-prev').innerHTML = logo ? `<img src="${logo}" alt="Company logo" class="w-full h-full object-contain">` : `<span class="font-display font-extrabold text-2xl text-slate-400">${esc(U.initials(c.tradingName || c.legalName))}</span>`; };
    drawLogo();
    v.querySelector('#co-logo').onchange = e => {
      const file = e.target.files[0]; if (!file) return;
      if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) return ui.toast('Upload a PNG, JPG, SVG or WebP image.', 'err');
      if (file.size > 400 * 1024) return ui.toast('Logo must be 400 KB or smaller.', 'err');
      const r = new FileReader(); r.onload = () => { logo = r.result; drawLogo(); ui.toast('Logo ready – save to apply it to documents.', 'info'); }; r.readAsDataURL(file);
    };
    v.querySelector('#co-logo-rm').onclick = () => { logo = null; drawLogo(); };
    v.querySelector('#co-backup').onclick = () => { U.download(`nexabooks-backup-${U.today()}.json`, JSON.stringify(D(), null, 2), 'application/json'); ui.toast('Backup downloaded.'); };
    v.querySelector('#co-reset').onclick = () => NB.app.resetDemo();
    v.querySelector('#co').onsubmit = e => {
      e.preventDefault();
      const g = k => ui.val(k, v);
      const data = { legalName: g('co-legal'), tradingName: g('co-trading'), address: g('co-address'), poBox: g('co-pobox'), city: g('co-city'), emirate: g('co-emirate'), country: g('co-country'), phone: g('co-phone'), email: g('co-email'), website: g('co-web'), trn: g('co-trn').replace(/\s/g, ''), currency: g('co-currency'), fyStartMonth: +g('co-fy'), bankName: g('co-bank'), accountHolder: g('co-holder'), iban: g('co-iban').toUpperCase(), swift: g('co-swift').toUpperCase(), paymentInstructions: v.querySelector('#co-instr').value.trim(), logo };
      const err = {};
      ['co-legal', 'co-address', 'co-city', 'co-country', 'co-phone', 'co-bank', 'co-holder'].forEach(k => { if (!g(k)) err[k] = 'This field is required.'; });
      if (!ui.isEmail(data.email)) err['co-email'] = 'Enter a valid email address.';
      if (data.trn && !ui.isTRN(data.trn)) err['co-trn'] = 'A UAE TRN has 15 digits.';
      if (D().company.vatRegistered && !data.trn) err['co-trn'] = 'TRN is required while the company is marked as VAT registered.';
      const iban = data.iban.replace(/\s/g, '');
      if (!iban) err['co-iban'] = 'IBAN is required.'; else if (iban.startsWith('AE') && !/^AE\d{21}$/.test(iban)) err['co-iban'] = 'A UAE IBAN is AE followed by 21 digits.';
      if (!/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(data.swift)) err['co-swift'] = 'SWIFT/BIC codes have 8 or 11 letters/digits.';
      if (!ui.showErrors(v, err)) return;
      Object.assign(D().company, data); NB.data.save();
      NB.app.refreshChrome();
      ui.toast('Company profile saved. Documents now use the updated details.');
    };
  }

  /* ---------------- Document templates ---------------- */
  function templates() {
    const s = D().settings;
    const sample = U.sortBy(D().invoices.filter(i => NB.calc.isIssued(i)), i => i.date, 'desc')[0];
    const sampleQ = U.sortBy(D().quotations, q => q.date, 'desc')[0];
    const v = shell('templates', 'Document Templates', 'Choose the visual style used for quotations, invoices, receipts, credit notes and statements.', `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        ${[['classic', 'Classic', 'Navy header band, shaded table header. Formal and familiar.'], ['modern', 'Modern', 'Minimal layout with blue accent rule and light panels.']].map(([k, l, d]) => `
          <div class="card p-4"><div class="flex items-start justify-between gap-3 mb-3"><div><div class="card-title">${l}</div><div class="card-sub">${d}</div></div>
            ${s.template === k ? '<span class="badge badge-ok">Default</span>' : `<button class="btn btn-primary btn-sm" data-use="${k}">Use as default</button>`}</div>
            <div class="tpl-thumb ${s.template === k ? 'selected' : ''}" data-use="${k}" role="button" tabindex="0" aria-label="Select ${l} template"><div data-thumb="${k}" style="max-height:520px;overflow:hidden"></div></div>
            <div class="flex flex-wrap gap-2 mt-3"><button class="btn btn-secondary btn-sm" data-pv="${k}" data-type="invoice">${ui.icon('eye')}Invoice</button><button class="btn btn-secondary btn-sm" data-pv="${k}" data-type="quotation">${ui.icon('eye')}Quotation</button><button class="btn btn-secondary btn-sm" data-pv="${k}" data-type="receipt">${ui.icon('eye')}Receipt</button></div></div>`).join('')}
      </div>
      <div class="card"><div class="card-head"><div class="card-title">Default document text</div></div><div class="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
        ${ui.field({ id: 'tp-qvalid', label: 'Quotation validity (days)', type: 'number', value: s.quotationValidityDays, attrs: 'min="1" max="365"' })}
        ${ui.field({ id: 'tp-due', label: 'Default invoice payment terms (days)', type: 'number', value: s.defaultDueDays, attrs: 'min="0" max="365"' })}
        ${ui.field({ id: 'tp-qterms', label: 'Default quotation terms & conditions', type: 'textarea', rows: 5, value: s.quotationTerms })}
        ${ui.field({ id: 'tp-iterms', label: 'Default invoice terms', type: 'textarea', rows: 5, value: s.invoiceTerms })}
        <div class="md:col-span-2 flex justify-end"><button class="btn btn-primary" id="tp-save">${ui.icon('check')}Save defaults</button></div>
      </div></div>`);
    U.$$('[data-thumb]', v).forEach(el => { if (sample) NB.docs.mountPreview(el, NB.docs.invoice(sample, el.dataset.thumb)); });
    U.$$('[data-use]', v).forEach(el => { const go = () => { s.template = el.dataset.use; NB.data.save(); ui.toast(`${el.dataset.use === 'modern' ? 'Modern' : 'Classic'} is now the default template.`); templates(); }; el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
    U.$$('[data-pv]', v).forEach(b => b.onclick = () => {
      const t = b.dataset.pv; const type = b.dataset.type;
      const rec = type === 'invoice' ? sample : type === 'quotation' ? sampleQ : D().payments[D().payments.length - 1];
      if (!rec) return ui.toast('No sample document available.', 'warn');
      const html = type === 'invoice' ? NB.docs.invoice(rec, t) : type === 'quotation' ? NB.docs.quotation(rec, t) : NB.docs.receipt(rec, t);
      ui.modal({ title: `${t === 'modern' ? 'Modern' : 'Classic'} · sample ${type}`, size: 'xl', body: '<div id="pv"></div>', onOpen: m => NB.docs.mountPreview(m.el.querySelector('#pv'), html),
        actions: [{ label: 'Print sample', icon: 'printer', onClick: () => NB.docs.print(html, `Sample ${type}`) }, { label: 'Close', variant: 'primary', onClick: m => m.close() }] });
    });
    v.querySelector('#tp-save').onclick = () => {
      const qv = parseInt(ui.val('tp-qvalid', v), 10), dd = parseInt(ui.val('tp-due', v), 10);
      const err = {};
      if (!(qv >= 1 && qv <= 365)) err['tp-qvalid'] = 'Enter between 1 and 365 days.';
      if (!(dd >= 0 && dd <= 365)) err['tp-due'] = 'Enter between 0 and 365 days.';
      if (!ui.showErrors(v, err)) return;
      Object.assign(s, { quotationValidityDays: qv, defaultDueDays: dd, quotationTerms: v.querySelector('#tp-qterms').value.trim(), invoiceTerms: v.querySelector('#tp-iterms').value.trim() });
      NB.data.save(); ui.toast('Document defaults saved. They apply to new documents.');
    };
  }

  /* ---------------- Tax settings ---------------- */
  function tax() {
    const s = D().settings; const c = D().company;
    const used = id => [...D().invoices, ...D().quotations, ...D().creditNotes, ...D().recurring].some(d => d.items.some(it => it.taxId === id));
    const CATS = [{ value: 'standard', label: 'Standard rated' }, { value: 'zero', label: 'Zero rated' }, { value: 'exempt', label: 'Exempt' }, { value: 'out_of_scope', label: 'Out of scope' }];
    let rates = JSON.parse(JSON.stringify(s.taxRates));
    const v = shell('tax', 'Tax Settings', 'VAT registration and the VAT codes available on line items.', `
      <div class="callout callout-warn mb-4">${ui.icon('shield-alert')}<div><b>Compliance notice.</b> This prototype is not FTA-approved or certified and does not claim UAE VAT compliance. Tax invoice eligibility, mandatory fields, credit note requirements, rounding and VAT return reporting must be validated against current Federal Tax Authority requirements before production use.</div></div>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div class="card"><div class="card-head"><div class="card-title">VAT registration</div></div><div class="card-body space-y-4">
          <label class="flex items-center justify-between gap-3"><span><span class="block text-sm font-semibold text-slate-800">Company is VAT registered</span><span class="block text-xs text-slate-500">Requires a TRN in the company profile</span></span><input type="checkbox" id="tx-reg" class="sr-only" ${c.vatRegistered ? 'checked' : ''}><span class="toggle" aria-hidden="true"></span></label>
          <label class="flex items-center justify-between gap-3"><span><span class="block text-sm font-semibold text-slate-800">Title documents “Tax Invoice”</span><span class="block text-xs text-slate-500">Only applied when registered with a TRN (illustrative)</span></span><input type="checkbox" id="tx-label" class="sr-only" ${s.showTaxInvoiceLabel ? 'checked' : ''}><span class="toggle" aria-hidden="true"></span></label>
          <div class="text-sm"><span class="text-slate-500">Company TRN:</span> ${c.trn ? `<span class="font-mono">${esc(c.trn)}</span>` : '<span class="text-red-600">not set</span>'} · <a class="link" href="#/settings/company">edit</a></div>
          <div class="text-sm"><span class="text-slate-500">Document title now:</span> <b id="tx-now">${NB.docs.taxLabelEnabled() ? 'Tax Invoice' : 'Invoice'}</b></div>
          ${ui.field({ id: 'tx-default', label: 'Default VAT code for new lines', type: 'select', options: rates.filter(r => r.active !== false).map(r => ({ value: r.id, label: `${r.short} – ${r.name}` })), value: s.defaultTaxId })}
          <div class="text-xs text-slate-500 leading-relaxed">Prices are entered <b>excluding VAT</b>. VAT is calculated per line and rounded to 2 decimal places (fils).</div>
        </div></div>
        <div class="card xl:col-span-2 min-w-0"><div class="card-head"><div><div class="card-title">VAT codes</div><div class="card-sub">Zero-rated and exempt are separate categories and are reported separately.</div></div><button class="btn btn-secondary btn-sm" id="tx-add">${ui.icon('plus')}Add code</button></div>
          <div class="table-wrap"><table class="data-table"><thead><tr><th>Code</th><th>Name</th><th>Label on documents</th><th>Category</th><th class="num">Rate %</th><th>Active</th><th></th></tr></thead><tbody id="tx-rows"></tbody></table></div>
          <div class="p-4 flex justify-end border-t border-slate-100"><button class="btn btn-primary" id="tx-save">${ui.icon('check')}Save tax settings</button></div></div>
      </div>`);
    const drawRows = () => {
      v.querySelector('#tx-rows').innerHTML = rates.map((r, i) => `<tr>
        <td class="font-mono text-xs">${esc(r.id)}</td>
        <td><input class="form-input input-sm min-w-[140px]" data-i="${i}" data-k="name" value="${esc(r.name)}" aria-label="Name for ${esc(r.id)}"></td>
        <td><input class="form-input input-sm w-[120px]" data-i="${i}" data-k="short" value="${esc(r.short)}" aria-label="Label for ${esc(r.id)}"></td>
        <td><select class="form-select input-sm w-[150px]" data-i="${i}" data-k="category" aria-label="Category for ${esc(r.id)}">${CATS.map(cc => `<option value="${cc.value}" ${cc.value === r.category ? 'selected' : ''}>${cc.label}</option>`).join('')}</select></td>
        <td class="num"><input class="form-input input-sm w-[80px] text-right" type="number" step="0.01" min="0" max="100" data-i="${i}" data-k="rate" value="${r.rate}" aria-label="Rate for ${esc(r.id)}"></td>
        <td><input type="checkbox" class="check" data-i="${i}" data-k="active" ${r.active !== false ? 'checked' : ''} aria-label="Active ${esc(r.id)}"></td>
        <td class="text-xs text-slate-500 whitespace-nowrap">${used(r.id) ? 'In use' : r._new ? '<button class="link" data-rm="' + i + '">Remove</button>' : 'Unused'}</td></tr>`).join('');
      U.$$('[data-k]', v).forEach(el => el.onchange = () => { const r = rates[+el.dataset.i]; const k = el.dataset.k; r[k] = k === 'active' ? el.checked : k === 'rate' ? parseFloat(el.value) || 0 : el.value.trim(); });
      U.$$('[data-rm]', v).forEach(b => b.onclick = () => { rates.splice(+b.dataset.rm, 1); drawRows(); });
    };
    drawRows();
    v.querySelector('#tx-add').onclick = () => { let n = 1; while (rates.some(r => r.id === 'T' + n)) n++; rates.push({ id: 'T' + n, name: 'Custom rate', short: 'Custom', rate: 0, category: 'standard', active: true, _new: true }); drawRows(); };
    v.querySelector('#tx-save').onclick = () => {
      const reg = v.querySelector('#tx-reg').checked;
      for (const r of rates) {
        if (!r.name || !r.short) return ui.toast(`Code ${r.id}: name and label are required.`, 'err');
        if (r.rate < 0 || r.rate > 100) return ui.toast(`Code ${r.id}: rate must be between 0 and 100.`, 'err');
        if (r.category === 'standard' && !(r.rate > 0)) return ui.toast(`Code ${r.id}: a standard-rated code needs a rate above 0%.`, 'err');
        if (r.category !== 'standard' && r.rate !== 0) return ui.toast(`Code ${r.id}: zero-rated, exempt and out-of-scope codes must use 0%.`, 'err');
      }
      if (new Set(rates.map(r => r.short.toLowerCase())).size !== rates.length) return ui.toast('Each VAT code needs a unique label.', 'err');
      if (reg && !c.trn) return ui.toast('Add the company TRN in Company Profile before marking the company as VAT registered.', 'err');
      const def = ui.val('tx-default', v);
      if (!rates.find(r => r.id === def && r.active !== false)) return ui.toast('The default VAT code must be active.', 'err');
      s.taxRates = rates.map(({ _new, ...r }) => r); s.defaultTaxId = def; s.showTaxInvoiceLabel = v.querySelector('#tx-label').checked; c.vatRegistered = reg;
      NB.data.save(); ui.toast('Tax settings saved. Existing documents keep the VAT code they were created with.');
      tax();
    };
  }

  /* ---------------- Numbering ---------------- */
  function numbering() {
    const s = D().settings;
    const TYPES = [['quotation', 'Quotations', 'quotations', 'number'], ['invoice', 'Invoices', 'invoices', 'number'], ['receipt', 'Receipts', 'payments', 'receiptNumber'], ['creditNote', 'Credit notes', 'creditNotes', 'number']];
    const v = shell('numbering', 'Numbering Settings', 'Prefixes and sequences for document numbers. Numbers are never reused within this dataset.', `
      <div class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Document</th><th>Prefix</th><th>Next number</th><th>Digits</th><th>Include year</th><th>Next number preview</th><th class="num">Issued</th></tr></thead><tbody>
        ${TYPES.map(([k, l, col]) => { const n = s.numbering[k]; return `<tr>
          <td class="font-semibold">${l}</td>
          <td><input class="form-input input-sm w-[110px] uppercase" id="nb-${k}-prefix" value="${esc(n.prefix)}" aria-label="${l} prefix"><div class="form-error hidden" id="nb-${k}-prefix-error"></div></td>
          <td><input class="form-input input-sm w-[100px] text-right" type="number" min="1" id="nb-${k}-next" value="${n.next}" aria-label="${l} next number"><div class="form-error hidden" id="nb-${k}-next-error"></div></td>
          <td><select class="form-select input-sm w-[80px]" id="nb-${k}-pad" aria-label="${l} digits">${[3, 4, 5, 6].map(p => `<option ${p === +n.padding ? 'selected' : ''}>${p}</option>`).join('')}</select></td>
          <td><input type="checkbox" class="check" id="nb-${k}-year" ${n.includeYear ? 'checked' : ''} aria-label="${l} include year"></td>
          <td><span class="font-mono text-sm font-semibold text-brand-700" id="nb-${k}-preview"></span></td>
          <td class="num">${D()[col].length}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="p-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3"><div class="text-xs text-slate-500 max-w-xl">Example formats: QUO-2026-0001, INV-2026-0001, REC-2026-0001, CN-2026-0001. If a number already exists, the next free number is used automatically. In production, numbers are allocated inside a database transaction to guarantee uniqueness.</div><button class="btn btn-primary" id="nb-save">${ui.icon('check')}Save numbering</button></div></div>
      <div class="card mt-4"><div class="card-head"><div class="card-title">Record IDs</div><span class="card-sub">Internal sequences (read-only)</span></div><div class="card-body grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        ${[['Customers', 'CUS', 'customer'], ['Payments', 'PAY', 'payment'], ['Recurring profiles', 'RP', 'recurring'], ['Expenses', 'EXP', 'expense']].map(([l, p, k]) => `<div><div class="text-slate-500 text-xs">${l}</div><div class="font-mono font-semibold">${p}-${U.pad(s.counters[k], 4)}</div><div class="text-[11px] text-slate-400">next ID</div></div>`).join('')}</div></div>`);
    const read = k => ({ prefix: ui.val(`nb-${k}-prefix`, v).toUpperCase(), next: parseInt(ui.val(`nb-${k}-next`, v), 10), padding: +ui.val(`nb-${k}-pad`, v), includeYear: v.querySelector(`#nb-${k}-year`).checked });
    const preview = () => TYPES.forEach(([k]) => { const cfg = read(k); v.querySelector(`#nb-${k}-preview`).textContent = cfg.prefix && cfg.next > 0 ? NB.data.formatNumber(cfg, U.today(), cfg.next) : '—'; });
    U.$$('input, select', v).forEach(el => el.addEventListener('input', preview));
    U.$$('select', v).forEach(el => el.addEventListener('change', preview));
    preview();
    v.querySelector('#nb-save').onclick = () => {
      const err = {}; const cfgs = {};
      TYPES.forEach(([k, l, col, field]) => {
        const cfg = cfgs[k] = read(k);
        if (!/^[A-Z0-9]{1,8}$/.test(cfg.prefix)) err[`nb-${k}-prefix`] = '1–8 letters or digits.';
        if (!(cfg.next >= 1)) err[`nb-${k}-next`] = 'Must be 1 or more.';
        else if (D()[col].some(x => x[field] === NB.data.formatNumber(cfg, U.today(), cfg.next))) err[`nb-${k}-next`] = 'Already used – choose a higher number.';
      });
      const prefixes = Object.values(cfgs).map(c => c.prefix);
      if (new Set(prefixes).size !== prefixes.length) return ui.toast('Each document type needs a different prefix.', 'err');
      if (!ui.showErrors(v, err)) return;
      Object.entries(cfgs).forEach(([k, cfg]) => Object.assign(s.numbering[k], cfg));
      NB.data.save(); ui.toast('Numbering saved. New documents will use these sequences.');
    };
  }

  NB.route('settings', () => NB.go('settings/company'));
  NB.route('settings/company', company);
  NB.route('settings/templates', templates);
  NB.route('settings/tax', tax);
  NB.route('settings/numbering', numbering);
})();
