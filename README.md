# NexaBooks UAE – Accounting, Quotation & Invoicing Prototype

A clickable, fully interactive **frontend prototype** for a UAE SME: quotations, invoices, monthly/recurring invoices, payment receipts, statements of account, credit notes, expenses and reports. It is built for client review and approval before the production Laravel build.

> **Not for production use.** No authentication, no server, data lives only in the browser. The prototype is **not** FTA-approved, tax-certified or claimed to be UAE VAT compliant.

---

## 1. How to run

No build step and no install.

1. Unzip / copy the `nexabooks-uae` folder.
2. Double-click **`index.html`** (Chrome, Edge, Safari or Firefox), **or** serve the folder:
   ```bash
   cd nexabooks-uae && python3 -m http.server 8080
   ```
   then open <http://localhost:8080>.
3. An internet connection is needed the first time for the CDN libraries and fonts.

Tip: press <kbd>/</kbd> anywhere to jump to global search.

## 2. CDN libraries (pinned versions)

| Library | Version | Purpose |
|---|---|---|
| Tailwind CSS (play CDN) | 3.4.17 | Utility styling (prototype only; Laravel will use Vite) |
| Chart.js | 4.4.1 | Dashboard and report charts |
| Lucide | 0.460.0 | Icons |
| jsPDF | 2.5.1 | PDF export |
| jsPDF-AutoTable | 3.8.2 | Tabular report PDFs |
| html2canvas | 1.4.1 | Renders A4 documents to PDF |
| Google Fonts | – | Manrope (headings) + Inter (body) |

No date library is needed; date helpers are in `assets/js/utils.js`.

## 3. File structure

```
index.html                 App shell (sidebar, top bar, view container, script order)
assets/css/styles.css      Design tokens, components, A4 document templates (classic / modern)
assets/css/print.css       A4 print rules (@page, hides chrome, page numbers, break control)
assets/js/utils.js         Dates, money/number formatting, amount-in-words, CSV, download helpers
assets/js/calculations.js  ALL financial maths: line/VAT totals, invoice status & balance, ageing, ledger
assets/js/data.js          Seed dataset, LocalStorage persistence, repositories, document numbering
assets/js/ui.js            Reusable components: badges, stat cards, modal, confirm, toast, data table,
                           form fields + validation, date-range picker, dropdown menu, chart registry
assets/js/line-items.js    Shared line-item editor + customer picker + totals panel
assets/js/documents.js     Quotation / invoice / receipt / credit note / statement / report templates,
                           on-screen preview, print and PDF export
assets/js/app.js           Hash router, sidebar, global search, notifications, quick-create, boot
assets/js/dashboard.js     Overview KPIs, charts, activity, ageing
assets/js/customers.js     Directory, add/edit/delete, customer detail page
assets/js/quotations.js    List, editor, detail, status workflow, convert to invoice
assets/js/invoices.js      List, editor, detail, issue / duplicate / cancel / delete draft
assets/js/credit-notes.js  Credit notes against invoices
assets/js/recurring.js     Recurring profiles, manual “Generate now”, pause / resume
assets/js/payments.js      Record payment, payments register, receipts list, receipt document
assets/js/statements.js    Statement of account generator
assets/js/expenses.js      Expense register
assets/js/reports.js       Sales, invoice, receivables, payment, customer, monthly revenue, expense reports
assets/js/settings.js      Company profile, document templates, tax settings, numbering
```

Code is split into data → calculations → UI components → feature modules. Modules register routes with `NB.route()` and read figures only through `NB.calc`, so every screen, document and report uses the same numbers.

## 4. Demo data and storage

- On first load, a fictional dataset is generated: **Meridian Digital Solutions LLC** (Business Bay, Dubai) with 14 customers across all seven emirates plus one overseas (Oman) customer, 39 invoices, 12 quotations, 29 payments, 6 recurring profiles, 1 credit note and 16 expenses.
- Seed dates are **relative to today**, so overdue invoices, ageing buckets and monthly charts stay realistic whenever the demo is opened.
- All names, TRNs, IBANs, phone numbers and `.example` e-mails are fictional.
- Data is saved to **LocalStorage** (key `nexabooks_uae_demo_v1`) after every change and survives page refreshes. It is per browser and per device.
- **Reset:** profile menu (top right) → *Reset demo data*, or *Settings → Company Profile → Reset demo data*. You are asked to confirm first.
- *Settings → Company Profile → Download JSON backup* exports the current dataset.

Integrity checks verified against the seed: no invoice has a negative balance; every customer's ledger closing balance equals their open invoice balances and their outstanding total; and statement balances are identical whatever date window is used.

## 5. Implemented features

- **Navigation:** collapsible sidebar (icon rail on desktop, off-canvas on mobile), breadcrumbs, live badge counts, global search across customers, invoices, quotations, receipts and credit notes, computed notifications, and quick-create menu.
- **Dashboard:** revenue, invoiced, collected, outstanding, overdue and customers, each with a trend against the previous period. Charts: monthly revenue, invoiced vs collected, status distribution and top customers. Also recent activity, ageing and the most overdue invoices.
- **Customers:** search, filters, sortable and paginated table, add/edit with validation (email, phone, 15-digit TRN, emirate), delete with confirmation. Deletion is blocked when a customer has documents; you are offered "mark inactive" instead. A detail page shows totals, tabs and a statement summary.
- **Quotations:** automatic numbering, dynamic line items with per-line discount % and VAT code, live totals and a VAT breakdown. Statuses run Draft → Sent → Accepted/Rejected; Expired is derived from the valid-until date. Conversion to invoice keeps items, prices, discounts, VAT and notes, and duplicate conversion is blocked. Also duplicate, delete draft, print and PDF.
- **Invoices:** Draft / Sent / Partially Paid / Paid / Overdue / Cancelled. Only Draft, Sent and Cancelled are stored; the rest are derived from payments, credit notes and the due date, so an invoice with a balance can never show as Paid. Issue, edit (the total can't drop below amounts already paid), duplicate, cancel (blocked once payments exist), record payment, payment history, credit note and customer statement.
- **Recurring invoices:** monthly, quarterly, half-yearly and yearly. Start, end and next dates, payment terms, active/paused/completed. **Generate now** creates the invoice and advances the next date. Each billing period can only be invoiced once.
- **Payments and receipts:** partial and multiple payments, with validation (positive, not above the balance, not before the invoice date, not in the future). Each payment gets a unique receipt number. The receipt document shows the amount in words, the previous balance and the remaining balance.
- **Statements of account:** customer, date range and statement date. Shows opening balance, a chronological ledger with running balance, closing balance, ageing, outstanding invoices and bank details. Includes a reconciliation check, print and PDF.
- **Credit notes:** linked to an invoice, with reason, adjustment lines and VAT adjustment. The total is capped at the invoice balance.
- **Expenses:** add, edit, delete, search, category and date filters. Kept separate from revenue and collections.
- **Reports (7):** sales, invoices, outstanding receivables, payments, customers, monthly revenue and expenses. Each has date, customer, status, method, granularity or category filters; KPIs; charts; sortable tables; and refresh, print, CSV and PDF.
- **Settings:** company profile with logo upload (max 400 KB, validated), bank/IBAN/SWIFT validation, display currency and financial year start. Two document templates (Classic, Modern) with live previews. VAT codes (standard, zero-rated, exempt, out of scope, plus custom codes). Configurable numbering with duplicate prevention.
- **Print and PDF:** dedicated A4 print CSS (hides the app chrome, keeps totals and signature blocks together, repeats table headers, adds page numbers). PDF export picks page breaks between table rows.

## 6. UAE-specific behaviour

- AED by default, shown as `AED 12,345.00`. Dates are shown as `29 Oct 2026` (day–month–year, unambiguous).
- All seven emirates are available; the default country is the United Arab Emirates. Company and customer TRN fields are validated as 15 digits.
- VAT is set per line: Standard 5%, Zero-rated 0%, Exempt and Out of scope are separate categories with separate document summaries. The default code is configurable, and VAT is never hard-coded to 5%.
- “Tax Invoice” / “Tax Credit Note” titles appear only when the company is marked VAT registered **and** has a TRN; otherwise the title is “Invoice”. This label is illustrative.

## 7. Simulated or not implemented (clearly labelled in the UI)

| Area | Prototype behaviour | Production plan |
|---|---|---|
| Authentication / roles | None (“Sign out” explains this) | Laravel auth + roles/policies |
| Email sending | “Mark as sent” / “Issue” only change status | Mailables + queued jobs |
| Recurring automation | Manual **Generate now** | Scheduler + queued job per due profile |
| PDF | Browser-rendered (html2canvas + jsPDF) | Server-side PDF from Blade (e.g. Browsershot) |
| Currency | Display label only, no FX conversion | Multi-currency with rates if required |
| Refunds / customer credit / advances | Not supported (credit notes capped at balance) | Design with accountant |
| Journals / double entry, VAT return | Not implemented | Separate accounting phase |

## 8. Known limitations

- Data is per browser (LocalStorage, ~5 MB) and can be lost if site data is cleared. Private windows may not persist.
- Browser PDF export embeds documents as images, so text is not selectable; use **Print → Save as PDF** for text PDFs.
- Page numbers in printed output depend on browser support for CSS page margin boxes (current Chrome and Edge support them).
- The Tailwind play CDN is intended for prototypes; it logs a console note in some browsers.
- Tax rounding is per line to 2 dp. Tax invoice eligibility, mandatory fields, credit note rules, rounding and VAT reporting **must be validated against current UAE FTA requirements** before go-live.

## 9. Laravel migration map

| Prototype | Laravel |
|---|---|
| `app.js` routes (`NB.route`) | `routes/web.php` named routes + resource controllers |
| `index.html` shell, sidebar, top bar | `layouts/app.blade.php`, `partials/sidebar`, `partials/topbar` |
| `ui.js` components | Blade components: `<x-badge>`, `<x-stat-card>`, `<x-modal>`, `<x-data-table>`, `<x-form.*>` |
| `dashboard.js` | `DashboardController` + `DashboardMetrics` service |
| `customers.js` | `Customer` model, migration, `CustomerController`, `StoreCustomerRequest`, `CustomerPolicy` |
| `quotations.js` | `Quotation`, `QuotationItem`, `ConvertQuotationToInvoice` action (DB transaction, unique `invoices.quotation_id`) |
| `invoices.js` | `Invoice`, `InvoiceItem`, status accessor/service, `IssueInvoice`, `CancelInvoice` |
| `payments.js` | `Payment` (belongsTo Invoice/Customer), `RecordPayment` action with row lock |
| Receipts | Document view of `Payment` (`receipt_number` unique) |
| `recurring.js` | `RecurringInvoice` + items, `invoices:generate-recurring` scheduled command, queued job, unique `(recurring_invoice_id, period_key)` |
| `statements.js` + `calc.ledger` | `CustomerLedgerService` (UNION of invoices/payments/credit notes) + statement Blade/PDF |
| `credit-notes.js` | `CreditNote`, `CreditNoteItem` |
| `expenses.js` | `Expense` model + controller, receipt uploads to a Storage disk |
| `reports.js` | `App\Services\Reports\*` query classes, exports via Laravel Excel / server PDF |
| `settings.js` | Settings table (cached) or `companies` table for multi-tenancy; `TaxRate` model |
| `documents.js` templates | `resources/views/documents/{classic,modern}/*.blade.php` sharing partials |
| `calculations.js` | `DocumentTotalsCalculator`; persist totals on save; recompute in server validation |
| `data.js` numbering | `DocumentNumberService` with DB transaction and unique indexes |

**Production checklist:** authentication, role-based authorisation, CSRF, server-side validation, DB transactions for every financial change, reliable numbering, audit log, secure file uploads, payment reconciliation, scheduled recurring invoices, backups and recovery, server-side PDF, e-mail delivery, and per-business data isolation if multi-tenant.
