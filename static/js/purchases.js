/* ================================================================
   purchases.js — Purchase management with multi-item cart form
   ================================================================ */

async function renderPurchases(view) {
  let state = { page: 1, supplier_id: '', date_from: '', date_to: '' };
  let suppliers = [];

  try {
    suppliers = await GET('/api/suppliers?per_page=all');
    if (!Array.isArray(suppliers)) suppliers = suppliers.items || [];
  } catch(_) { suppliers = []; }

  const supOpts = suppliers.map(s =>
    `<option value="${s.supplier_id}">${escHtml(s.supplier_name)}</option>`
  ).join('');

  view.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Purchases</h2>
        <p>Record stock purchases from suppliers — stock is updated automatically</p>
      </div>
      <button class="btn btn-primary" id="btn-new-pur">New Purchase</button>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="table-toolbar" style="flex-wrap:wrap;gap:8px">
          <select class="form-control" id="pur-sup" style="width:210px">
            <option value="">All Suppliers</option>${supOpts}
          </select>
          <input class="form-control" id="pur-from" type="date" style="width:150px" title="From date">
          <input class="form-control" id="pur-to"   type="date" style="width:150px" title="To date">
          <button class="btn btn-outline btn-sm" id="pur-clear">Clear</button>
          <span class="table-count" id="pur-count" style="margin-left:auto"></span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Purchase ID</th>
                <th>Supplier</th>
                <th>Date</th>
                <th>Total Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="pur-body">
              <tr class="loading-row"><td colspan="5"><span class="spinner"></span></td></tr>
            </tbody>
          </table>
        </div>
        <div class="pagination" id="pur-pag"></div>
      </div>
    </div>`;

  async function load() {
    const p = new URLSearchParams({ page: state.page });
    if (state.supplier_id) p.set('supplier_id', state.supplier_id);
    if (state.date_from)   p.set('date_from',   state.date_from);
    if (state.date_to)     p.set('date_to',     state.date_to);

    const body = document.getElementById('pur-body');
    body.innerHTML = `<tr class="loading-row"><td colspan="5"><span class="spinner"></span></td></tr>`;
    try {
      const data = await GET(`/api/purchases?${p}`);
      document.getElementById('pur-count').textContent =
        `${data.total} purchase${data.total !== 1 ? 's' : ''}`;

      if (!data.items.length) {
        body.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>No purchases found.</p></div></td></tr>`;
        document.getElementById('pur-pag').innerHTML = '';
        return;
      }
      body.innerHTML = data.items.map(r => `
        <tr>
          <td class="text-muted">#${r.purchase_id}</td>
          <td>${escHtml(r.supplier_name)}</td>
          <td>${fmtDate(r.purchase_date)}</td>
          <td>${fmtINR(r.total_amount)}</td>
          <td><button class="btn btn-sm btn-outline" data-view="${r.purchase_id}">View Details</button></td>
        </tr>`).join('');

      buildPagination(
        document.getElementById('pur-pag'),
        state.page, data.total, data.per_page,
        pg => { state.page = pg; load(); }
      );
    } catch(e) {
      body.innerHTML = `<tr><td colspan="5" class="text-danger" style="padding:20px">${escHtml(e.message)}</td></tr>`;
    }
  }
  await load();

  document.getElementById('pur-sup').addEventListener('change',  e => { state.supplier_id=e.target.value; state.page=1; load(); });
  document.getElementById('pur-from').addEventListener('change', e => { state.date_from=e.target.value;  state.page=1; load(); });
  document.getElementById('pur-to').addEventListener('change',   e => { state.date_to=e.target.value;    state.page=1; load(); });
  document.getElementById('pur-clear').addEventListener('click', () => {
    ['pur-sup','pur-from','pur-to'].forEach(id => document.getElementById(id).value = '');
    Object.assign(state, { supplier_id:'', date_from:'', date_to:'', page:1 });
    load();
  });

  // View detail
  document.getElementById('pur-body').addEventListener('click', async e => {
    const id = e.target.dataset.view;
    if (!id) return;
    try {
      const pur = await GET(`/api/purchases/${id}`);
      showPurchaseDetail(pur);
    } catch(e) { toast(e.message, 'error'); }
  });

  // New purchase
  document.getElementById('btn-new-pur').onclick = () => showNewPurchaseForm(supOpts, load);
}

// ── Purchase detail modal ─────────────────────────────────────────
function showPurchaseDetail(pur) {
  const rows = (pur.items || []).map(i => `
    <tr>
      <td>${escHtml(i.product_name)}</td>
      <td>${i.quantity}</td>
      <td>${fmtINR(i.unit_cost)}</td>
      <td>${fmtINR(i.subtotal)}</td>
    </tr>`).join('');

  openModal(`Purchase #${pur.purchase_id} — Details`,
    `<div style="display:flex;gap:24px;font-size:.85rem;margin-bottom:14px;flex-wrap:wrap">
      <span>Supplier: <strong>${escHtml(pur.supplier_name)}</strong></span>
      <span>Date: <strong>${fmtDate(pur.purchase_date)}</strong></span>
      <span>Total: <strong>${fmtINR(pur.total_amount)}</strong></span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Product</th><th>Qty</th><th>Unit Cost</th><th>Subtotal</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="text-muted">No items.</td></tr>'}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="font-weight:700;text-align:right;padding:10px 14px">Total</td>
            <td style="font-weight:700;padding:10px 14px">${fmtINR(pur.total_amount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`,
    `<button class="btn btn-primary" id="pur-det-close">Close</button>`,
    true
  );
  document.getElementById('pur-det-close').onclick = closeModal;
}

// ── New purchase form with dynamic cart ───────────────────────────
async function showNewPurchaseForm(supOpts, onSave) {
  let products = [];
  try {
    const d = await GET('/api/products?per_page=all');
    products = Array.isArray(d) ? d : (d.items || []);
  } catch(_) {}

  const prodOpts = products.map(p =>
    `<option value="${p.product_id}" data-price="${p.unit_price}">` +
    `${escHtml(p.product_name)} (Stock: ${p.stock_qty})</option>`
  ).join('');

  let cart = [];

  function cartTotal() {
    return cart.reduce((s, i) => s + i.qty * i.cost, 0);
  }

  function rebuildCart() {
    const area = document.getElementById('pur-cart-area');
    if (!area) return;
    if (!cart.length) {
      area.innerHTML = `<p class="text-muted" style="font-size:.84rem;padding:8px 0">No items added yet.</p>`;
      document.getElementById('pur-f-total').textContent = '₹0.00';
      return;
    }
    area.innerHTML = `
      <div class="table-wrap" style="margin-top:8px">
        <table class="cart-table">
          <thead>
            <tr><th>Product</th><th>Qty</th><th>Unit Cost (₹)</th><th>Subtotal</th><th></th></tr>
          </thead>
          <tbody>
            ${cart.map((item, i) => `
              <tr>
                <td>${escHtml(item.name)}</td>
                <td><input class="form-control" type="number" min="1" value="${item.qty}"
                           data-ci="${i}" data-field="qty" style="width:70px"></td>
                <td><input class="form-control" type="number" step="0.01" min="0.01"
                           value="${item.cost.toFixed(2)}" data-ci="${i}" data-field="cost" style="width:100px"></td>
                <td>${fmtINR(item.qty * item.cost)}</td>
                <td><button class="btn btn-sm btn-danger" data-rm="${i}">✕</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    document.getElementById('pur-f-total').textContent = fmtINR(cartTotal());

    // Wire inline inputs
    area.querySelectorAll('input[data-ci]').forEach(inp => {
      inp.addEventListener('change', e => {
        const ci = parseInt(e.target.dataset.ci);
        if (e.target.dataset.field === 'qty')  cart[ci].qty  = Math.max(1, parseInt(e.target.value)||1);
        if (e.target.dataset.field === 'cost') cart[ci].cost = Math.max(0.01, parseFloat(e.target.value)||0.01);
        rebuildCart();
      });
    });
    area.querySelectorAll('[data-rm]').forEach(btn => {
      btn.addEventListener('click', () => { cart.splice(parseInt(btn.dataset.rm), 1); rebuildCart(); });
    });
  }

  openModal('New Purchase Order',
    `<div class="form-row form-row-2">
      <div class="form-group">
        <label class="form-label required">Supplier</label>
        <select class="form-control" id="pur-f-sup">
          <option value="">Select supplier…</option>${supOpts}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label required">Purchase Date</label>
        <input class="form-control" id="pur-f-date" type="date"
               value="${new Date().toISOString().slice(0,10)}">
      </div>
    </div>
    <hr class="divider">
    <div style="display:flex;gap:8px;align-items:flex-end">
      <div class="form-group grow" style="margin-bottom:0">
        <label class="form-label">Add Product to Order</label>
        <select class="form-control" id="pur-f-prod">
          <option value="">Select product…</option>${prodOpts}
        </select>
      </div>
      <button class="btn btn-outline" id="pur-add-item" style="white-space:nowrap">+ Add Item</button>
    </div>
    <div id="pur-cart-area" style="margin-top:4px">
      <p class="text-muted" style="font-size:.84rem;padding:8px 0">No items added yet.</p>
    </div>
    <div style="text-align:right;margin-top:10px;font-weight:700;font-size:1rem">
      Purchase Total: <span id="pur-f-total">₹0.00</span>
    </div>
    <div class="form-error mt-8" id="pur-f-err"></div>`,
    `<button class="btn btn-outline" id="pur-f-cancel">Cancel</button>
     <button class="btn btn-primary"  id="pur-f-save">Save Purchase &amp; Update Stock</button>`,
    true
  );

  document.getElementById('pur-f-cancel').onclick = closeModal;

  document.getElementById('pur-add-item').onclick = () => {
    const sel = document.getElementById('pur-f-prod');
    if (!sel.value) return;
    const opt  = sel.options[sel.selectedIndex];
    const pid  = sel.value;
    const pname = opt.text.split(' (Stock:')[0];
    const price = parseFloat(opt.dataset.price || 0);
    const existing = cart.find(i => i.product_id === pid);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({ product_id: pid, name: pname, qty: 1, cost: price || 1 });
    }
    rebuildCart();
  };

  document.getElementById('pur-f-save').onclick = async () => {
    const supplierId = document.getElementById('pur-f-sup').value;
    const dateVal    = document.getElementById('pur-f-date').value;
    const errEl      = document.getElementById('pur-f-err');
    errEl.textContent = '';

    if (!supplierId) { errEl.textContent = 'Please select a supplier.'; return; }
    if (!cart.length) { errEl.textContent = 'Please add at least one product.'; return; }
    if (!dateVal)     { errEl.textContent = 'Please select a purchase date.'; return; }

    try {
      const result = await POST('/api/purchases', {
        supplier_id:   supplierId,
        purchase_date: dateVal,
        items: cart.map(i => ({
          product_id: i.product_id,
          quantity:   i.qty,
          unit_cost:  i.cost,
        })),
      });
      toast(`Purchase #${result.purchase_id} saved. Stock updated.`);
      closeModal();
      onSave();
    } catch(e) {
      errEl.textContent = e.message;
    }
  };
}
