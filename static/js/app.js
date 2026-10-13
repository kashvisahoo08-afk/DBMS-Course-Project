/* ================================================================
   app.js  — Router · API · Modal · Toast · Shared page renderers
   ================================================================ */
'use strict';

// ── API helpers ───────────────────────────────────────────────────
async function api(method, url, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(url, opts);
  const ct   = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : {};
  if (!res.ok) throw { status: res.status, message: data.error || `HTTP ${res.status}` };
  return data;
}
const GET    = url       => api('GET',    url);
const POST   = (url, b)  => api('POST',   url, b);
const PUT    = (url, b)  => api('PUT',    url, b);
const DELETE = url       => api('DELETE', url);

// ── Toast ─────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const tc = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span style="flex:1">${escHtml(msg)}</span>`;
  tc.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

// ── Confirm dialog ────────────────────────────────────────────────
function confirm(title, msg, okLabel = 'Delete') {
  return new Promise(resolve => {
    document.getElementById('confirm-title').textContent   = title;
    document.getElementById('confirm-message').textContent = msg;
    document.getElementById('confirm-ok').textContent      = okLabel;
    const ov = document.getElementById('confirm-overlay');
    ov.classList.add('open');
    const done = val => { ov.classList.remove('open'); resolve(val); };
    document.getElementById('confirm-cancel').onclick = () => done(false);
    document.getElementById('confirm-close').onclick  = () => done(false);
    document.getElementById('confirm-ok').onclick     = () => done(true);
  });
}

// ── Modal ─────────────────────────────────────────────────────────
function openModal(title, bodyHtml, footerHtml = '', wide = false) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML    = bodyHtml;
  document.getElementById('modal-footer').innerHTML  = footerHtml;
  document.getElementById('modal-box').className     = wide ? 'modal modal-wide' : 'modal';
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.getElementById('modal-body').innerHTML   = '';
  document.getElementById('modal-footer').innerHTML = '';
}
document.getElementById('modal-close').onclick = closeModal;
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// ── Helpers ───────────────────────────────────────────────────────
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function fmtINR(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); }
  catch { return d; }
}
function stockBadge(s) {
  const m = { 'In Stock':'success','Low Stock':'warning','Out of Stock':'danger' };
  return `<span class="badge badge-${m[s]||'neutral'}">${escHtml(s)}</span>`;
}
function payBadge(s) {
  const m = { Paid:'success', Partial:'warning', Unpaid:'danger' };
  return `<span class="badge badge-${m[s]||'neutral'}">${escHtml(s)}</span>`;
}
function movBadge(t) {
  const m = { PURCHASE:'success', IN:'success', SALE:'danger', OUT:'danger', RETURN:'info' };
  return `<span class="badge badge-${m[t]||'neutral'}">${escHtml(t)}</span>`;
}

// ── Pagination ────────────────────────────────────────────────────
function buildPagination(container, current, total, perPage, onPage) {
  const pages = Math.ceil(total / perPage) || 1;
  let html = `<button ${current<=1?'disabled':''} data-p="${current-1}">&#8249;</button>`;
  for (let i = 1; i <= pages; i++) {
    if (pages > 7 && i > 2 && i < pages-1 && Math.abs(i - current) > 1) {
      if (i === 3 || i === pages-2) html += '<button disabled>…</button>';
      continue;
    }
    html += `<button class="${i===current?'active':''}" data-p="${i}">${i}</button>`;
  }
  html += `<button ${current>=pages?'disabled':''} data-p="${current+1}">&#8250;</button>`;
  container.innerHTML = html;
  container.querySelectorAll('button[data-p]').forEach(b =>
    b.addEventListener('click', () => onPage(+b.dataset.p))
  );
}

// ── Search box HTML helper ────────────────────────────────────────
function searchBox(id, placeholder) {
  return `<div class="search-wrap">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input class="form-control" id="${id}" placeholder="${escHtml(placeholder)}">
  </div>`;
}

// ── Page meta ─────────────────────────────────────────────────────
const PAGE_META = {
  dashboard:         ['Dashboard',          'Overview & key metrics'],
  products:          ['Products',           'Manage your product catalogue'],
  categories:        ['Categories',         'Product category management'],
  brands:            ['Brands',             'Product brand management'],
  suppliers:         ['Suppliers',          'Supplier contact & purchase history'],
  customers:         ['Customers',          'Customer records & sales history'],
  purchases:         ['Purchases',          'Stock purchases from suppliers'],
  sales:             ['Sales & Billing',    'Create sales & generate invoices'],
  invoices:          ['Invoices',           'View, search & print invoices'],
  payments:          ['Payments',           'Record & track invoice payments'],
  returns:           ['Returns',            'Process product returns'],
  'stock-movements': ['Stock Movements',    'Complete inventory movement history'],
  reports:           ['Reports',            'SQL analytics & CSV exports'],
  settings:          ['Settings',           'Database connection & configuration'],
};

// ── Router ────────────────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page)
  );
  const [title, desc] = PAGE_META[page] || [page, ''];
  document.getElementById('topbar-title').textContent = title;
  document.getElementById('topbar-desc').textContent  = desc;
  document.getElementById('sidebar').classList.remove('open');

  const view = document.getElementById('app-view');
  view.innerHTML = '';      // clear before render

  switch (page) {
    case 'dashboard':        renderDashboard(view);                   break;
    case 'products':         renderProducts(view);                    break;
    case 'categories':       renderSimpleList(view, 'categories');    break;
    case 'brands':           renderSimpleList(view, 'brands');        break;
    case 'suppliers':        renderContacts(view, 'suppliers');       break;
    case 'customers':        renderContacts(view, 'customers');       break;
    case 'purchases':        renderPurchases(view);                   break;
    case 'sales':            renderSales(view);                       break;
    case 'invoices':         renderInvoices(view);                    break;
    case 'payments':         renderPayments(view);                    break;
    case 'returns':          renderReturns(view);                     break;
    case 'stock-movements':  renderStockMovements(view);              break;
    case 'reports':          renderReports(view);                     break;
    case 'settings':         renderSettings(view);                    break;
    default: view.innerHTML = '<p class="text-muted" style="padding:20px">Page not found.</p>';
  }
}

// ── Sidebar / hamburger ───────────────────────────────────────────
document.getElementById('sidebar-nav').addEventListener('click', e => {
  const item = e.target.closest('.nav-item');
  if (item?.dataset.page) navigate(item.dataset.page);
});
document.getElementById('hamburger').addEventListener('click', () =>
  document.getElementById('sidebar').classList.toggle('open')
);
document.getElementById('sidebar-overlay').addEventListener('click', () =>
  document.getElementById('sidebar').classList.remove('open')
);

// ── Topbar date ───────────────────────────────────────────────────
document.getElementById('topbar-date').textContent =
  new Date().toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' });

// ================================================================
//  CATEGORIES & BRANDS (shared simple-list renderer)
// ================================================================
async function renderSimpleList(view, entity) {
  const isCat   = entity === 'categories';
  const label   = isCat ? 'Category' : 'Brand';
  const apiUrl  = `/api/${entity}`;
  const idKey   = isCat ? 'category_id'   : 'brand_id';
  const nameKey = isCat ? 'category_name' : 'brand_name';

  view.innerHTML = `
    <div class="page-header">
      <div><h2>${isCat?'Categories':'Brands'}</h2>
           <p>${isCat?'Organise products into logical groups':'Track product manufacturers and labels'}</p></div>
      <button class="btn btn-primary" id="btn-add">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add ${label}
      </button>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="table-toolbar">
          ${searchBox('sl-search', `Search ${label.toLowerCase()} name…`)}
          <span class="table-count" id="sl-count"></span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th style="width:80px">ID</th>
              <th>${label} Name</th>
              <th style="width:140px">Actions</th>
            </tr></thead>
            <tbody id="sl-body">
              <tr class="loading-row"><td colspan="3"><span class="spinner"></span></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  let rows = [];

  async function load(q = '') {
    const body = document.getElementById('sl-body');
    try {
      rows = await GET(`${apiUrl}?q=${encodeURIComponent(q)}`);
      document.getElementById('sl-count').textContent =
        `${rows.length} ${label.toLowerCase()}${rows.length !== 1 ? 's' : ''}`;
      if (!rows.length) {
        body.innerHTML = `<tr><td colspan="3"><div class="empty-state">
          <p>No ${label.toLowerCase()}s found.</p></div></td></tr>`;
        return;
      }
      body.innerHTML = rows.map(r => `
        <tr>
          <td class="text-muted fs-sm">#${r[idKey]}</td>
          <td><strong>${escHtml(r[nameKey])}</strong></td>
          <td>
            <button class="btn btn-sm btn-outline mr-6" data-edit="${r[idKey]}">Edit</button>
            <button class="btn btn-sm btn-danger"        data-del="${r[idKey]}">Delete</button>
          </td>
        </tr>`).join('');
    } catch(e) { toast(e.message, 'error'); }
  }
  await load();

  let deb;
  document.getElementById('sl-search').addEventListener('input', e => {
    clearTimeout(deb); deb = setTimeout(() => load(e.target.value), 300);
  });

  function showForm(id = null) {
    const rec = id ? rows.find(r => r[idKey] === id) : null;
    openModal(rec ? `Edit ${label}` : `Add ${label}`,
      `<div class="form-group">
        <label class="form-label required">${label} Name</label>
        <input class="form-control" id="f-name" value="${escHtml(rec?.[nameKey]||'')}"
               placeholder="Enter ${label.toLowerCase()} name" autofocus>
        <div class="form-error" id="f-err"></div>
      </div>`,
      `<button class="btn btn-outline" id="f-cancel">Cancel</button>
       <button class="btn btn-primary" id="f-save">${rec?'Save Changes':'Add '+label}</button>`
    );
    document.getElementById('f-name').focus();
    document.getElementById('f-cancel').onclick = closeModal;
    document.getElementById('f-save').onclick = async () => {
      const name = document.getElementById('f-name').value.trim();
      if (!name) { document.getElementById('f-err').textContent = `${label} name is required.`; return; }
      document.getElementById('f-err').textContent = '';
      try {
        if (rec) { await PUT(`${apiUrl}/${id}`, { [nameKey]: name }); toast(`${label} updated.`); }
        else     { await POST(apiUrl, { [nameKey]: name });            toast(`${label} added.`); }
        closeModal(); load();
      } catch(e) { document.getElementById('f-err').textContent = e.message; }
    };
    document.getElementById('f-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('f-save').click();
    });
  }

  document.getElementById('btn-add').onclick = () => showForm();
  document.getElementById('sl-body').addEventListener('click', async e => {
    const editId = e.target.dataset.edit ? +e.target.dataset.edit : null;
    const delId  = e.target.dataset.del  ? +e.target.dataset.del  : null;
    if (editId) return showForm(editId);
    if (delId) {
      const rec = rows.find(r => r[idKey] === delId);
      const ok  = await confirm(`Delete ${label}`,
        `Are you sure you want to delete "${rec?.[nameKey]}"? This cannot be undone.`);
      if (!ok) return;
      try { await DELETE(`${apiUrl}/${delId}`); toast(`${label} deleted.`); load(); }
      catch(e) { toast(e.message, 'error'); }
    }
  });
}

// ================================================================
//  SUPPLIERS & CUSTOMERS (shared contacts renderer)
// ================================================================
async function renderContacts(view, entity) {
  const isSup   = entity === 'suppliers';
  const label   = isSup ? 'Supplier' : 'Customer';
  const apiUrl  = `/api/${entity}`;
  const idKey   = isSup ? 'supplier_id'   : 'customer_id';
  const nameKey = isSup ? 'supplier_name' : 'customer_name';
  const cntKey  = isSup ? 'purchase_count' : 'sale_count';
  const valKey  = isSup ? 'total_expenditure' : 'total_value';
  const valLbl  = isSup ? 'Total Purchased' : 'Total Sales';

  let state = { page: 1, q: '' }, cached = [];

  view.innerHTML = `
    <div class="page-header">
      <div><h2>${label}s</h2><p>Manage ${label.toLowerCase()} records</p></div>
      <button class="btn btn-primary" id="btn-add">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add ${label}
      </button>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="table-toolbar">
          ${searchBox('ct-search', `Search name, phone, email…`)}
          <span class="table-count" id="ct-count"></span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th style="width:60px">ID</th>
              <th>Name</th><th>Phone</th><th>Email</th>
              <th>${isSup?'Purchases':'Sales'}</th>
              <th>${valLbl}</th>
              <th style="width:140px">Actions</th>
            </tr></thead>
            <tbody id="ct-body">
              <tr class="loading-row"><td colspan="7"><span class="spinner"></span></td></tr>
            </tbody>
          </table>
        </div>
        <div class="pagination" id="ct-pag"></div>
      </div>
    </div>`;

  async function load() {
    const body = document.getElementById('ct-body');
    try {
      const data = await GET(`${apiUrl}?q=${encodeURIComponent(state.q)}&page=${state.page}`);
      cached = data.items;
      document.getElementById('ct-count').textContent =
        `${data.total} ${label.toLowerCase()}${data.total!==1?'s':''}`;
      if (!cached.length) {
        body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><p>No ${label.toLowerCase()}s found.</p></div></td></tr>`;
      } else {
        body.innerHTML = cached.map(r => `<tr>
          <td class="text-muted fs-sm">#${r[idKey]}</td>
          <td><strong>${escHtml(r[nameKey])}</strong></td>
          <td class="text-muted">${escHtml(r.phone||'—')}</td>
          <td class="text-muted">${escHtml(r.email||'—')}</td>
          <td>${r[cntKey]}</td>
          <td>${fmtINR(r[valKey])}</td>
          <td>
            <button class="btn btn-sm btn-outline mr-6" data-edit="${r[idKey]}">Edit</button>
            <button class="btn btn-sm btn-danger"        data-del="${r[idKey]}">Delete</button>
          </td></tr>`).join('');
      }
      buildPagination(document.getElementById('ct-pag'), state.page, data.total, data.per_page,
        p => { state.page=p; load(); });
    } catch(e) { toast(e.message,'error'); }
  }
  await load();

  let deb;
  document.getElementById('ct-search').addEventListener('input', e => {
    clearTimeout(deb); state.q=e.target.value; state.page=1; deb=setTimeout(load,300);
  });

  function showForm(id = null) {
    const rec = id ? cached.find(r => r[idKey]===id) : null;
    openModal(rec?`Edit ${label}`:`Add ${label}`,
      `<div class="form-group">
        <label class="form-label required">Name</label>
        <input class="form-control" id="cf-name" value="${escHtml(rec?.[nameKey]||'')}">
      </div>
      <div class="form-row cols-2">
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input class="form-control" id="cf-phone" type="tel" value="${escHtml(rec?.phone||'')}">
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-control" id="cf-email" type="email" value="${escHtml(rec?.email||'')}">
        </div>
      </div>
      <div class="form-error" id="cf-err"></div>`,
      `<button class="btn btn-outline" id="cf-cancel">Cancel</button>
       <button class="btn btn-primary" id="cf-save">${rec?'Save':'Add'} ${label}</button>`
    );
    document.getElementById('cf-cancel').onclick = closeModal;
    document.getElementById('cf-save').onclick = async () => {
      const body = {
        [nameKey]: document.getElementById('cf-name').value.trim(),
        phone: document.getElementById('cf-phone').value.trim(),
        email: document.getElementById('cf-email').value.trim(),
      };
      document.getElementById('cf-err').textContent = '';
      try {
        if (rec) { await PUT(`${apiUrl}/${id}`, body); toast(`${label} updated.`); }
        else     { await POST(apiUrl, body);            toast(`${label} added.`); }
        closeModal(); load();
      } catch(e) { document.getElementById('cf-err').textContent = e.message; }
    };
  }

  document.getElementById('btn-add').onclick = () => showForm();
  document.getElementById('ct-body').addEventListener('click', async e => {
    const editId = e.target.dataset.edit ? +e.target.dataset.edit : null;
    const delId  = e.target.dataset.del  ? +e.target.dataset.del  : null;
    if (editId) return showForm(editId);
    if (delId) {
      const rec = cached.find(r => r[idKey]===delId);
      const ok  = await confirm(`Delete ${label}`, `Delete "${rec?.[nameKey]}"?`);
      if (!ok) return;
      try { await DELETE(`${apiUrl}/${delId}`); toast(`${label} deleted.`); load(); }
      catch(e) { toast(e.message,'error'); }
    }
  });
}

// ================================================================
//  INVOICES
// ================================================================
async function renderInvoices(view) {
  let state = { page:1, q:'', date_from:'', date_to:'' };
  view.innerHTML = `
    <div class="page-header">
      <div><h2>Invoices</h2><p>View, search and print sales invoices</p></div>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="table-toolbar">
          ${searchBox('inv-q', 'Search invoice code…')}
          <input class="form-control" id="inv-from" type="date" style="width:148px" title="From">
          <input class="form-control" id="inv-to"   type="date" style="width:148px" title="To">
          <button class="btn btn-outline btn-sm" id="inv-clear">Clear</button>
          <span class="table-count" id="inv-count"></span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Invoice Code</th><th>Date</th><th>Sale</th>
              <th>Customer</th><th>Total</th><th>Paid</th><th>Status</th><th style="width:80px">Action</th>
            </tr></thead>
            <tbody id="inv-body">
              <tr class="loading-row"><td colspan="8"><span class="spinner"></span></td></tr>
            </tbody>
          </table>
        </div>
        <div class="pagination" id="inv-pag"></div>
      </div>
    </div>`;

  async function load() {
    const p = new URLSearchParams({ page: state.page });
    if (state.q)         p.set('q',         state.q);
    if (state.date_from) p.set('date_from', state.date_from);
    if (state.date_to)   p.set('date_to',   state.date_to);
    const body = document.getElementById('inv-body');
    try {
      const data = await GET(`/api/invoices?${p}`);
      document.getElementById('inv-count').textContent = `${data.total} invoice${data.total!==1?'s':''}`;
      if (!data.items.length) {
        body.innerHTML = `<tr><td colspan="8"><div class="empty-state"><p>No invoices found.</p></div></td></tr>`;
        return;
      }
      body.innerHTML = data.items.map(r => `<tr>
        <td><strong>${escHtml(r.invoice_code)}</strong></td>
        <td class="nowrap">${fmtDate(r.invoice_date)}</td>
        <td class="text-muted">#${r.sale_id}</td>
        <td>${escHtml(r.customer_name)}</td>
        <td>${fmtINR(r.total_amount)}</td>
        <td>${fmtINR(r.paid_amount)}</td>
        <td>${payBadge(r.payment_status)}</td>
        <td><button class="btn btn-xs btn-outline" data-view="${r.invoice_id}">View</button></td>
      </tr>`).join('');
      buildPagination(document.getElementById('inv-pag'), state.page, data.total, data.per_page,
        pg => { state.page=pg; load(); });
    } catch(e) { toast(e.message,'error'); }
  }
  await load();

  let deb;
  document.getElementById('inv-q').addEventListener('input', e => {
    clearTimeout(deb); state.q=e.target.value; state.page=1; deb=setTimeout(load,300);
  });
  document.getElementById('inv-from').addEventListener('change', e => { state.date_from=e.target.value; state.page=1; load(); });
  document.getElementById('inv-to').addEventListener('change',   e => { state.date_to=e.target.value;   state.page=1; load(); });
  document.getElementById('inv-clear').addEventListener('click', () => {
    ['inv-q','inv-from','inv-to'].forEach(id => { document.getElementById(id).value=''; });
    Object.assign(state, { q:'', date_from:'', date_to:'', page:1 }); load();
  });
  document.getElementById('inv-body').addEventListener('click', async e => {
    const id = e.target.dataset.view;
    if (!id) return;
    try { showInvoiceDetail(await GET(`/api/invoices/${id}`)); }
    catch(e) { toast(e.message,'error'); }
  });
}

function showInvoiceDetail(inv) {
  const items = (inv.items||[]).map(i => `<tr>
    <td>${escHtml(i.product_name)}</td>
    <td style="text-align:center">${i.quantity}</td>
    <td style="text-align:right">${fmtINR(i.unit_price)}</td>
    <td style="text-align:right">${fmtINR(i.line_total)}</td>
  </tr>`).join('');

  const pays = inv.payments?.length
    ? inv.payments.map(p => `<tr>
        <td>${fmtDate(p.payment_date)}</td>
        <td><span class="badge badge-info">${escHtml(p.payment_method)}</span></td>
        <td style="text-align:right">${fmtINR(p.amount)}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" class="text-muted" style="padding:10px 13px">No payments recorded yet.</td></tr>`;

  openModal(`Invoice — ${escHtml(inv.invoice_code)}`,
    `<div class="invoice-print" id="inv-print-area">
      <div class="invoice-header">
        <div>
          <div class="invoice-code-big">${escHtml(inv.invoice_code)}</div>
          <div class="invoice-meta">Date: <strong>${fmtDate(inv.invoice_date)}</strong></div>
          <div class="invoice-meta">Sale: <strong>#${inv.sale_id}</strong></div>
        </div>
        <div style="text-align:right">
          <div class="invoice-meta">Customer: <strong>${escHtml(inv.customer_name)}</strong></div>
          ${inv.customer_phone ? `<div class="invoice-meta">Phone: <strong>${escHtml(inv.customer_phone)}</strong></div>` : ''}
          ${inv.customer_email ? `<div class="invoice-meta">Email: <strong>${escHtml(inv.customer_email)}</strong></div>` : ''}
        </div>
      </div>
      <table style="width:100%;margin-bottom:14px">
        <thead><tr><th style="text-align:left">Product</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${items}</tbody>
        <tfoot><tr>
          <td colspan="3" style="text-align:right;font-weight:700;padding:10px 13px;border-top:2px solid var(--border)">Grand Total</td>
          <td style="text-align:right;font-weight:700;padding:10px 13px;border-top:2px solid var(--border)">${fmtINR(inv.total_amount)}</td>
        </tr></tfoot>
      </table>
      <p style="font-size:.8rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px">Payments</p>
      <table style="width:100%">
        <thead><tr><th style="text-align:left">Date</th><th>Method</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${pays}</tbody>
        <tfoot><tr>
          <td colspan="2" style="font-weight:700;padding:8px 13px;border-top:2px solid var(--border)">Balance Due</td>
          <td style="font-weight:700;padding:8px 13px;text-align:right;border-top:2px solid var(--border);color:${inv.balance>0.005?'var(--danger)':'var(--success)'}">
            ${fmtINR(inv.balance)}</td>
        </tr></tfoot>
      </table>
    </div>`,
    `<button class="btn btn-outline no-print" onclick="window.print()">
       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
       Print
     </button>
     <button class="btn btn-primary" id="inv-det-close">Close</button>`,
    true
  );
  document.getElementById('inv-det-close').onclick = closeModal;
}

// ================================================================
//  PAYMENTS
// ================================================================
async function renderPayments(view) {
  let state = { page:1, q:'' };
  view.innerHTML = `
    <div class="page-header">
      <div><h2>Payments</h2><p>Record and track invoice payments</p></div>
      <button class="btn btn-primary" id="btn-add-pay">Record Payment</button>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="table-toolbar">
          ${searchBox('pay-q','Search invoice code…')}
          <span class="table-count" id="pay-count"></span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Invoice</th><th>Sale</th><th>Customer</th>
              <th>Date</th><th>Amount</th><th>Method</th><th style="width:80px">Action</th>
            </tr></thead>
            <tbody id="pay-body">
              <tr class="loading-row"><td colspan="7"><span class="spinner"></span></td></tr>
            </tbody>
          </table>
        </div>
        <div class="pagination" id="pay-pag"></div>
      </div>
    </div>`;

  async function load() {
    const body = document.getElementById('pay-body');
    try {
      const data = await GET(`/api/payments?q=${encodeURIComponent(state.q)}&page=${state.page}`);
      document.getElementById('pay-count').textContent = `${data.total} payment${data.total!==1?'s':''}`;
      if (!data.items.length) {
        body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><p>No payments found.</p></div></td></tr>`;
        return;
      }
      body.innerHTML = data.items.map(r => `<tr>
        <td><strong>${escHtml(r.invoice_code)}</strong></td>
        <td class="text-muted">#${r.sale_id}</td>
        <td>${escHtml(r.customer_name)}</td>
        <td class="nowrap">${fmtDate(r.payment_date)}</td>
        <td>${fmtINR(r.amount)}</td>
        <td><span class="badge badge-info">${escHtml(r.payment_method)}</span></td>
        <td><button class="btn btn-xs btn-danger" data-del="${r.payment_id}">Delete</button></td>
      </tr>`).join('');
      buildPagination(document.getElementById('pay-pag'), state.page, data.total, data.per_page,
        pg => { state.page=pg; load(); });
    } catch(e) { toast(e.message,'error'); }
  }
  await load();

  let deb;
  document.getElementById('pay-q').addEventListener('input', e => {
    clearTimeout(deb); state.q=e.target.value; state.page=1; deb=setTimeout(load,300);
  });
  document.getElementById('pay-body').addEventListener('click', async e => {
    const id = e.target.dataset.del;
    if (!id) return;
    const ok = await confirm('Delete Payment', 'Remove this payment record permanently?');
    if (!ok) return;
    try { await DELETE(`/api/payments/${id}`); toast('Payment deleted.'); load(); }
    catch(e) { toast(e.message,'error'); }
  });

  document.getElementById('btn-add-pay').onclick = async () => {
    let invs=[], methods=[];
    try { invs    = await GET('/api/invoices?per_page=all'); if (!Array.isArray(invs)) invs = invs.items||[]; } catch(_) {}
    try { methods = await GET('/api/payments/methods'); } catch(_) { methods=['Cash','Card','UPI','Net Banking','Cheque','Other']; }

    const unpaid = invs.filter(i => i.balance > 0.005);
    const invOpts = unpaid.map(i =>
      `<option value="${i.invoice_id}">${escHtml(i.invoice_code)} — ${escHtml(i.customer_name)} (Balance: ${fmtINR(i.balance)})</option>`
    ).join('');
    const methOpts = methods.map(m => `<option value="${escHtml(m)}">${escHtml(m)}</option>`).join('');

    if (!unpaid.length) { toast('All invoices are fully paid.', 'info'); return; }

    openModal('Record Payment',
      `<div class="form-group">
        <label class="form-label required">Invoice</label>
        <select class="form-control" id="fp-inv">${invOpts}</select>
      </div>
      <div class="form-row cols-2">
        <div class="form-group">
          <label class="form-label required">Payment Date</label>
          <input class="form-control" id="fp-date" type="date" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="form-group">
          <label class="form-label required">Amount (₹)</label>
          <input class="form-control" id="fp-amt" type="number" step="0.01" min="0.01" placeholder="0.00">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label required">Payment Method</label>
        <select class="form-control" id="fp-meth">${methOpts}</select>
      </div>
      <div class="form-error" id="fp-err"></div>`,
      `<button class="btn btn-outline" id="fp-cancel">Cancel</button>
       <button class="btn btn-primary" id="fp-save">Record Payment</button>`
    );
    document.getElementById('fp-cancel').onclick = closeModal;
    document.getElementById('fp-save').onclick = async () => {
      document.getElementById('fp-err').textContent = '';
      try {
        await POST('/api/payments', {
          invoice_id:     document.getElementById('fp-inv').value,
          payment_date:   document.getElementById('fp-date').value,
          amount:         document.getElementById('fp-amt').value,
          payment_method: document.getElementById('fp-meth').value,
        });
        toast('Payment recorded successfully.');
        closeModal(); load();
      } catch(e) { document.getElementById('fp-err').textContent = e.message; }
    };
  };
}

// ================================================================
//  RETURNS
// ================================================================
async function renderReturns(view) {
  let state = { page:1, date_from:'', date_to:'' };
  view.innerHTML = `
    <div class="page-header">
      <div><h2>Returns</h2><p>Process product returns against existing sales</p></div>
      <button class="btn btn-primary" id="btn-add-ret">New Return</button>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="table-toolbar">
          <input class="form-control" id="ret-from" type="date" style="width:148px" title="From">
          <input class="form-control" id="ret-to"   type="date" style="width:148px" title="To">
          <button class="btn btn-outline btn-sm" id="ret-clear">Clear</button>
          <span class="table-count" id="ret-count"></span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th style="width:80px">ID</th><th>Sale</th><th>Customer</th>
              <th>Product</th><th style="width:80px">Qty</th><th>Date</th>
            </tr></thead>
            <tbody id="ret-body">
              <tr class="loading-row"><td colspan="6"><span class="spinner"></span></td></tr>
            </tbody>
          </table>
        </div>
        <div class="pagination" id="ret-pag"></div>
      </div>
    </div>`;

  async function load() {
    const p = new URLSearchParams({ page: state.page });
    if (state.date_from) p.set('date_from', state.date_from);
    if (state.date_to)   p.set('date_to',   state.date_to);
    const body = document.getElementById('ret-body');
    try {
      const data = await GET(`/api/returns?${p}`);
      document.getElementById('ret-count').textContent = `${data.total} return${data.total!==1?'s':''}`;
      if (!data.items.length) {
        body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>No returns found.</p></div></td></tr>`;
        return;
      }
      body.innerHTML = data.items.map(r => `<tr>
        <td class="text-muted fs-sm">#${r.return_id}</td>
        <td class="text-muted">#${r.sale_id}</td>
        <td>${escHtml(r.customer_name)}</td>
        <td>${escHtml(r.product_name)}</td>
        <td>${r.quantity}</td>
        <td class="nowrap">${fmtDate(r.return_date)}</td>
      </tr>`).join('');
      buildPagination(document.getElementById('ret-pag'), state.page, data.total, data.per_page,
        pg => { state.page=pg; load(); });
    } catch(e) { toast(e.message,'error'); }
  }
  await load();

  document.getElementById('ret-from').addEventListener('change', e => { state.date_from=e.target.value; state.page=1; load(); });
  document.getElementById('ret-to').addEventListener('change',   e => { state.date_to=e.target.value;   state.page=1; load(); });
  document.getElementById('ret-clear').addEventListener('click', () => {
    document.getElementById('ret-from').value = '';
    document.getElementById('ret-to').value   = '';
    Object.assign(state, { date_from:'', date_to:'', page:1 }); load();
  });

  document.getElementById('btn-add-ret').onclick = () => {
    openModal('New Return',
      `<div class="form-group">
        <label class="form-label required">Sale ID</label>
        <div style="display:flex;gap:8px">
          <input class="form-control" id="ret-sale-id" type="number" placeholder="Enter sale ID…">
          <button class="btn btn-outline btn-sm" id="ret-load-btn" style="white-space:nowrap">Load Items</button>
        </div>
      </div>
      <div id="ret-items-area"></div>
      <div class="form-error mt-4" id="ret-err"></div>`,
      `<button class="btn btn-outline" id="ret-cancel">Cancel</button>
       <button class="btn btn-primary" id="ret-submit" style="display:none">Submit Return</button>`
    );
    document.getElementById('ret-cancel').onclick = closeModal;

    document.getElementById('ret-load-btn').onclick = async () => {
      const saleId = document.getElementById('ret-sale-id').value;
      if (!saleId) { document.getElementById('ret-err').textContent = 'Enter a Sale ID.'; return; }
      document.getElementById('ret-err').textContent = '';
      try {
        const items = await GET(`/api/returns/sale/${saleId}/eligible`);
        const eligible = items.filter(i => i.eligible_qty > 0);
        if (!eligible.length) {
          document.getElementById('ret-items-area').innerHTML =
            '<p class="text-muted mt-8 fs-sm">No items eligible for return in this sale.</p>';
          return;
        }
        document.getElementById('ret-items-area').innerHTML = `
          <div class="table-wrap mt-8">
            <table class="cart-table">
              <thead><tr><th>Product</th><th>Sold</th><th>Returned</th><th>Eligible</th><th>Return Qty</th></tr></thead>
              <tbody>${eligible.map(i => `<tr>
                <td>${escHtml(i.product_name)}</td>
                <td>${i.sold_qty}</td>
                <td>${i.returned_qty}</td>
                <td><strong>${i.eligible_qty}</strong></td>
                <td><input class="form-control" type="number" min="0" max="${i.eligible_qty}"
                           value="0" data-pid="${i.product_id}" style="width:72px"></td>
              </tr>`).join('')}</tbody>
            </table>
          </div>`;
        document.getElementById('ret-submit').style.display = '';
      } catch(e) { document.getElementById('ret-err').textContent = e.message; }
    };

    document.getElementById('ret-submit').onclick = async () => {
      const saleId = document.getElementById('ret-sale-id').value;
      const inputs = document.querySelectorAll('#ret-items-area input[data-pid]');
      let submitted = false;
      document.getElementById('ret-err').textContent = '';
      for (const inp of inputs) {
        const qty = +inp.value;
        if (!qty || qty <= 0) continue;
        try {
          await POST('/api/returns', { sale_id: saleId, product_id: inp.dataset.pid, quantity: qty });
          submitted = true;
        } catch(e) { document.getElementById('ret-err').textContent = e.message; return; }
      }
      if (!submitted) { document.getElementById('ret-err').textContent = 'Enter at least one return quantity.'; return; }
      toast('Return processed and stock updated.');
      closeModal(); load();
    };
  };
}

// ================================================================
//  STOCK MOVEMENTS
// ================================================================
async function renderStockMovements(view) {
  let state = { page:1, movement_type:'', date_from:'', date_to:'' };
  view.innerHTML = `
    <div class="page-header">
      <div><h2>Stock Movements</h2><p>Complete inventory movement history</p></div>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="table-toolbar">
          <select class="form-control" id="sm-type" style="width:145px">
            <option value="">All Types</option>
            <option value="PURCHASE">PURCHASE</option>
            <option value="SALE">SALE</option>
            <option value="RETURN">RETURN</option>
          </select>
          <input class="form-control" id="sm-from" type="date" style="width:148px" title="From">
          <input class="form-control" id="sm-to"   type="date" style="width:148px" title="To">
          <button class="btn btn-outline btn-sm" id="sm-clear">Clear</button>
          <span class="table-count" id="sm-count"></span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th style="width:70px">ID</th>
              <th>Product</th><th>Type</th>
              <th style="width:90px">Quantity</th><th>Date</th>
            </tr></thead>
            <tbody id="sm-body">
              <tr class="loading-row"><td colspan="5"><span class="spinner"></span></td></tr>
            </tbody>
          </table>
        </div>
        <div class="pagination" id="sm-pag"></div>
      </div>
    </div>`;

  async function load() {
    const p = new URLSearchParams({ page: state.page });
    if (state.movement_type) p.set('movement_type', state.movement_type);
    if (state.date_from)     p.set('date_from',     state.date_from);
    if (state.date_to)       p.set('date_to',       state.date_to);
    const body = document.getElementById('sm-body');
    try {
      const data = await GET(`/api/stock-movements?${p}`);
      document.getElementById('sm-count').textContent = `${data.total} record${data.total!==1?'s':''}`;
      if (!data.items.length) {
        body.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>No movements found.</p></div></td></tr>`;
        return;
      }
      body.innerHTML = data.items.map(r => `<tr>
        <td class="text-muted fs-sm">#${r.movement_id}</td>
        <td>${escHtml(r.product_name)}</td>
        <td>${movBadge(r.movement_type)}</td>
        <td>${r.quantity}</td>
        <td class="nowrap">${fmtDate(r.movement_date)}</td>
      </tr>`).join('');
      buildPagination(document.getElementById('sm-pag'), state.page, data.total, data.per_page,
        pg => { state.page=pg; load(); });
    } catch(e) { toast(e.message,'error'); }
  }
  await load();

  document.getElementById('sm-type').addEventListener('change', e => { state.movement_type=e.target.value; state.page=1; load(); });
  document.getElementById('sm-from').addEventListener('change', e => { state.date_from=e.target.value; state.page=1; load(); });
  document.getElementById('sm-to').addEventListener('change',   e => { state.date_to=e.target.value;   state.page=1; load(); });
  document.getElementById('sm-clear').addEventListener('click', () => {
    ['sm-type','sm-from','sm-to'].forEach(id => { document.getElementById(id).value=''; });
    Object.assign(state, { movement_type:'', date_from:'', date_to:'', page:1 }); load();
  });
}

// ================================================================
//  SETTINGS
// ================================================================
async function renderSettings(view) {
  view.innerHTML = `
    <div class="page-header">
      <div><h2>Settings</h2><p>Database connection status and configuration reference</p></div>
      <button class="btn btn-outline" id="btn-recheck">Re-check</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:860px">
      <div class="card">
        <div class="card-header"><h3>Database Status</h3></div>
        <div class="card-body" id="db-status-body" style="min-height:100px">
          <span class="spinner"></span>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Configuration</h3></div>
        <div class="card-body">
          <p style="font-size:.8rem;color:var(--text-secondary);line-height:1.8">
            Settings are loaded from <code>.env</code> at startup.<br>
            <strong>MYSQL_HOST</strong> · <strong>MYSQL_PORT</strong><br>
            <strong>MYSQL_USER</strong> · <strong>MYSQL_PASSWORD</strong><br>
            <strong>MYSQL_DB</strong> — database name<br>
            <strong>LOW_STOCK_THRESHOLD</strong> — default 10<br>
            <strong>SECRET_KEY</strong> — Flask session key
          </p>
        </div>
      </div>
    </div>`;

  async function check() {
    const el = document.getElementById('db-status-body');
    el.innerHTML = '<span class="spinner"></span> Checking…';
    try {
      const r = await GET('/api/settings/db-status');
      if (r.status === 'ok') {
        el.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:8px">
            <div><span class="badge badge-success" style="font-size:.78rem">● Connected</span></div>
            <div style="font-size:.82rem"><span class="text-muted">Database:</span> <strong>${escHtml(r.db)}</strong></div>
            <div style="font-size:.82rem"><span class="text-muted">MySQL version:</span> <strong>${escHtml(r.version)}</strong></div>
            <div style="font-size:.82rem"><span class="text-muted">Server time:</span> <strong>${escHtml(r.server_time)}</strong></div>
          </div>`;
      } else {
        el.innerHTML = `<span class="badge badge-danger">● Error</span>
          <p class="text-danger mt-8 fs-sm">${escHtml(r.message||'Unknown error')}</p>`;
      }
    } catch(e) {
      el.innerHTML = `<span class="badge badge-danger">● Unreachable</span>
        <p class="text-danger mt-8 fs-sm">${escHtml(e.message)}</p>`;
    }
  }
  check();
  document.getElementById('btn-recheck').onclick = check;
}

// ── Boot ──────────────────────────────────────────────────────────
navigate('dashboard');
