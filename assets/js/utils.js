/* =====================================================================
   utils.js – formatting, dates, DOM and file helpers (no business logic)
   Laravel: formatting moves to a Money/Date helper (or Carbon + NumberFormatter);
   CSV export becomes a response()->streamDownload() in a controller.
   ===================================================================== */
window.NB = window.NB || {};

NB.utils = (() => {
  const pad = (n, l = 2) => String(n).padStart(l, '0');

  /* ---------- Dates (ISO yyyy-mm-dd strings everywhere) ---------- */
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => toISO(new Date());
  const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
  const addMonths = (iso, n) => {
    const d = parseISO(iso); const day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return toISO(d);
  };
  /** Whole days from b to a (a - b). */
  const diffDays = (a, b) => Math.round((Date.UTC(...ymd(a)) - Date.UTC(...ymd(b))) / 86400000);
  const ymd = iso => { const [y, m, d] = iso.split('-').map(Number); return [y, m - 1, d]; };
  const fmtDate = iso => {
    if (!iso) return '—';
    return parseISO(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const fmtDateLong = iso => iso ? parseISO(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const monthKey = iso => iso.slice(0, 7);
  const monthLabel = (key, long) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit' });
  };
  const startOfMonth = iso => iso.slice(0, 7) + '-01';
  const endOfMonth = iso => { const d = parseISO(startOfMonth(iso)); return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
  /** List of month keys (yyyy-mm) between two ISO dates, inclusive. */
  const monthsBetween = (from, to) => {
    const out = []; let k = startOfMonth(from);
    while (k <= to && out.length < 240) { out.push(monthKey(k)); k = addMonths(k, 1); }
    return out;
  };
  const relTime = iso => {
    const d = diffDays(today(), iso);
    if (d === 0) return 'Today';
    if (d === 1) return 'Yesterday';
    if (d > 1 && d < 30) return `${d} days ago`;
    if (d < 0 && d > -30) return `in ${-d} days`;
    return fmtDate(iso);
  };

  /** Common date range presets used by dashboard & report filters. */
  function rangePreset(key, ref = today()) {
    const y = parseISO(ref).getFullYear();
    switch (key) {
      case 'this-month': return { from: startOfMonth(ref), to: endOfMonth(ref) };
      case 'last-month': { const p = addMonths(startOfMonth(ref), -1); return { from: p, to: endOfMonth(p) }; }
      case 'last-3': return { from: addMonths(startOfMonth(ref), -2), to: endOfMonth(ref) };
      case 'last-6': return { from: addMonths(startOfMonth(ref), -5), to: endOfMonth(ref) };
      case 'last-12': return { from: addMonths(startOfMonth(ref), -11), to: endOfMonth(ref) };
      case 'this-year': return { from: `${y}-01-01`, to: `${y}-12-31` };
      case 'last-year': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
      case 'all': return { from: '2000-01-01', to: '2099-12-31' };
      default: return { from: addMonths(startOfMonth(ref), -5), to: endOfMonth(ref) };
    }
  }
  /** Range of identical length immediately before the given range. */
  function previousRange({ from, to }) {
    const len = diffDays(to, from) + 1;
    return { from: addDays(from, -len), to: addDays(from, -1) };
  }
  const inRange = (iso, r) => iso >= r.from && iso <= r.to;

  /* ---------- Numbers & money ---------- */
  const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const num = (n, dp = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const currency = () => (NB.data && NB.data.db && NB.data.db.company.currency) || 'AED';
  /** "AED 12,345.00" – display only; no FX conversion is performed in the prototype. */
  const money = (n, opts = {}) => {
    const v = round2(n);
    const s = `${opts.code === false ? '' : currency() + ' '}${num(Math.abs(v))}`;
    return v < 0 ? `-${s}` : s;
  };
  const compactMoney = n => {
    const a = Math.abs(n);
    const s = a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'K' : a.toFixed(0);
    return `${currency()} ${n < 0 ? '-' : ''}${s}`;
  };
  const pct = (n, dp = 1) => `${Number(n).toFixed(dp)}%`;

  /** Amount in words, e.g. "UAE Dirhams Twelve Thousand Five Hundred and Fils Fifty Only". */
  function amountInWords(amount) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const chunk = n => {
      let s = '';
      if (n >= 100) { s += ones[Math.floor(n / 100)] + ' Hundred'; n %= 100; if (n) s += ' and '; }
      if (n >= 20) { s += tens[Math.floor(n / 10)]; if (n % 10) s += '-' + ones[n % 10]; }
      else if (n > 0) s += ones[n];
      return s;
    };
    const words = n => {
      if (n === 0) return 'Zero';
      const scales = [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']];
      let s = '';
      for (const [v, name] of scales) if (n >= v) { s += chunk(Math.floor(n / v)) + ' ' + name + ' '; n %= v; }
      return (s + chunk(n)).trim();
    };
    const v = round2(Math.abs(amount));
    const whole = Math.floor(v); const fils = Math.round((v - whole) * 100);
    const cur = currency() === 'AED' ? 'UAE Dirhams' : currency();
    return `${cur} ${words(whole)}${fils ? ` and Fils ${words(fils)}` : ''} Only`;
  }

  /* ---------- Strings & DOM ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl2br = s => esc(s).replace(/\n/g, '<br>');
  const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const initials = name => String(name || '?').split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const sum = (arr, fn = x => x) => round2(arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0));
  const groupBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); (m[k] = m[k] || []).push(x); return m; }, {});
  const sortBy = (arr, fn, dir = 'asc') => [...arr].sort((a, b) => {
    const x = fn(a), y = fn(b);
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
    return dir === 'asc' ? r : -r;
  });
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  /* ---------- Files ---------- */
  function download(filename, content, mime = 'text/plain') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  /** rows: array of arrays (first row = header). Adds a BOM so Excel opens UTF-8 correctly. */
  function toCSV(rows) {
    const cell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
  }

  return {
    pad, toISO, parseISO, today, addDays, addMonths, diffDays, fmtDate, fmtDateLong, monthKey, monthLabel,
    startOfMonth, endOfMonth, monthsBetween, relTime, rangePreset, previousRange, inRange,
    round2, num, money, compactMoney, pct, amountInWords, currency,
    esc, nl2br, uid, $, $$, debounce, initials, sum, groupBy, sortBy, slug, download, toCSV
  };
})();
