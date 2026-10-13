/* ================================================================
   sales.js — Sales & Billing with cart, invoice generation, payments
   ================================================================ */

async function renderSales(view) {
  let state = { page: 1, date_from: '', date_to: '' };

  view.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Sales &amp; Billing</h2>
        <p>Create sales orders, generate invoices, record payments</p>
      </div>
      <button class="btn btn-primary" id="btn-new-sale">New Sale</button>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="table-toolbar" style="flex-wrap:wrap;gap:8px">
          <input class="form-control" id="sale-from" type="date" style="width:150px" title="From date">
          <input class="form-control" id="sale-to"   type="date" style="width:150px" title="To date">
          <button class="btn btn-outline btn-sm" id="sale-clear">Clear</button>
          <span class="table-count" id="sale-count" style="margin-left:auto"></span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sale ID</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Invoice</th>
                <th>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="sale-body">
              <tr class="loading-row"><td colspan="6"><span class="spinner"></span></td></tr>
            </tbody>
          </table>
        </div>
        <div class="pagination" id="sale-pag"></div>
      </div>
    </div>`;

  async function load() {
    const p = new URLSearchParams({ page: state.page });
    if (state.date_from) p.set('date_from', state.date_from);
    if (state.date_to)   p.set('date_to',   state.date_to);

    const body = document.getElementById('sale-body');
    body.innerHTML = `<tr class="loading-row"><td colspan="6"><span class="spinner"></span></td></tr>`;
    try {
      const data = await GET(`/api/sales?${p}`);
      document.getElementById('sale-count').textContent =
        `${data.total} sale${data.total !== 1 ? 's' : ''}`;

      if (!data.items.length) {
        body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>No sales found.</p></div></td></tr>`;
        document.getElementById('sale-pag').innerHTML = '';
        return;
      }
      body.innerHTML = data.items.map(r => `
        <tr>
          <td class="text-muted">#${r.sale_id}</td>
          <td>${fmtDate(r.sale_date)}</td>
          <td>${escHtml(r.customer_name)}</td>
          <td>${r.invoice_code ? `<span class="badge badge-info">${escHtml(r.invoice_code)}</span>` : '<span class="text-muted">—</span>'}</td>
          <td>${fmtINR(r.total_amount)}</td>
          <td><button class="btn btn-sm btn-outline" data-view="${r.sale_id}">View</button></td>
        </tr>`).join('');

      buildPagination(
        document.getElementById('sale-pag'),
        state.page, data.total, data.per_page,
        pg => { state.page = pg; load(); }
      );
    } catch(e) {
      body.innerHTML = `<tr><td colspan="6" class="text-danger" style="padding:20px">${escHtml(e.message)}</td></tr>`;
    }
  }
  await load();

  document.getElementById('sale-from').addEventListener('change', e => { state.date_from=e.target.value; state.page=1; load(); });
  document.getElementById('sale-to').addEventListener('change',   e => { state.date_to=e.target.value;   state.page=1; load(); });
  document.getElementById('sale-clear').addEventListener('click', () => {
    document.getElementById('sale-from').value = '';
    document.getElementById('sale-to').value   = '';
    Object.assign(state, { date_from:'', date_to:'', page:1 });
    load();
  });

  document.getElementById('sale-body').addEventListener('click', async e => {
    const id = e.target.dataset.view;
    if (!id) return;
    try {
      const sale = await GET(`/api/sales/${id}`);
      showSaleDetail(sale);
    } catch(e) { toast(e.message, 'error'); }
  });

  document.getElementById('btn-new-sale').onclick = () => showNewSaleForm(load);
}

// ── Sale detail modal ──────────────────────────────────────────────
function showSaleDetail(sale) {
  const itemRows = (sale.items || []).map(i => `
    <tr>
      <td>${escHtml(i.product_name)}</td>
      <td>${i.quantity}</td>
      <td>${fmtINR(i.unit_price)}</td>
      <td>${fmtINR(i.line_total)}</td>
    </tr>`).join('');

  const invInfo = sale.invoice
    ? `<span style="font-size:.83rem">Invoice: <strong>${escHtml(sale.invoice.invoice_code)}</strong>
       (${fmtDate(sale.invoice.invoice_date)})</span>`
    : `<span class="text-muted" style="font-size:.83rem">No invoice</span>`;

  openModal(`Sale #${sale.sale_id}`,
    `<div style="display:flex;gap:20px;flex-wrap:wrap;font-size:.85rem;margin-bottom:14px">
      <span>Date: <strong>${fmtDate(sale.sale_date)}</strong></span>
      <span>Customer: <strong>${escHtml(sale.customer_name)}</strong></span>
      ${invInfo}
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr></thead>
        <tbody>${itemRows || '<tr><td colspan="4" class="text-muted">No items.</td></tr>'}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="font-weight:700;text-align:right;padding:10px 14px">Grand Total</td>
            <td style="font-weight:700;padding:10px 14px">${fmtINR(sale.total_amount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`,
    `<button class="btn btn-outline" onclick="closeModal();navigate('invoices')">Go to Invoice</button>
     <button class="btn btn-primary" id="sale-det-close">Close</button>`,
    true
  );
  document.getElementById('sale-det-close').onclick = closeModal;
}

// ── New Sale form with cart ─────────────────────────────────────────
async function showNewSaleForm(onSave) {
  let products = [], customers = [], methods = ['Cash','Card','UPI','Net Banking','Cheque','Other'];

  try {
    const [pd, cd, md] = await Promise.allSettled([
      GET('/api/products?per_page=all'),
      GET('/api/customers?per_page=all'),
      GET('/api/payments/methods'),
    ]);
    if (pd.status === 'fulfilled') {
      const r = pd.value;
      products = Array.isArray(r) ? r : (r.items || []);
    }
    if (cd.status === 'fulfilled') {
      const r = cd.value;
      customers = Array.isArray(r) ? r : (r.items || []);
    }
    if (md.status === 'fulfilled') methods = md.value;
  } catch(_) {}

  const custOpts   = customers.map(c =>
    `<option value="${c.customer_id}">${escHtml(c.customer_name)}${c.phone ? ' — ' + c.phone : ''}</option>`
  ).join('');
  const prodOpts   = products.map(p =>
    `<option value="${p.product_id}" data-price="${p.unit_price}" data-stock="${p.stock_qty}">` +
    `${escHtml(p.product_name)} (${p.stock_status}, ₹${p.unit_price})</option>`
  ).join('');
  const methodOpts = methods.map(m => `<option value="${escHtml(m)}">${escHtml(m)}</option>`).join('');

  let cart = [];

  function cartTotal() {
    return cart.reduce((s, i) => s + i.qty * i.price, 0);
  }

  function rebuildCart() {
    const area = document.getElementById('sale-cart-area');
    if (!area) return;
    if (!cart.length) {
      area.innerHTML = `<p class="text-muted" style="font-size:.84rem;padding:8px 0">Cart is empty. Add products above.</p>`;
      document.getElementById('sale-f-total').textContent = '₹0.00';
      return;
    }
    area.innerHTML = `
      <div class="table-wrap" style="margin-top:8px">
        <table class="cart-table">
          <thead>
            <tr><th>Product</th><th>Unit Price</th><th>Qty</th><th>Line Total</th><th></th></tr>
          </thead>
          <tbody>
            ${cart.map((item, i) => `
              <tr>
                <td>${escHtml(item.name)}</td>
                <td>${fmtINR(item.price)}</td>
                <td>
                  <input class="form-control" type="number" min="1" max="${item.stock}"
                         value="${item.qty}" data-ci="${i}" style="width:70px">
                </td>
                <td>${fmtINR(item.qty * item.price)}</td>
                <td><button class="btn btn-sm btn-danger" data-rm="${i}">✕</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    document.getElementById('sale-f-total').textContent = fmtINR(cartTotal());

    area.querySelectorAll('input[data-ci]').forEach(inp => {
      inp.addEventListener('change', e => {
        const ci = parseInt(e.target.dataset.ci);
        cart[ci].qty = Math.max(1, Math.min(cart[ci].stock, parseInt(e.target.value) || 1));
        rebuildCart();
      });
    });
    area.querySelectorAll('[data-rm]').forEach(btn => {
      btn.addEventListener('click', () => { cart.splice(parseInt(btn.dataset.rm), 1); rebuildCart(); });
    });
  }

  openModal('New Sale',
    `<div class="form-row form-row-2">
      <div class="form-group">
        <label class="form-label">Customer
          <span class="text-muted" style="font-size:.75rem;font-weight:400">(optional)</span>
        </label>
        <select class="form-control" id="sl-cust">
          <option value="">Walk-in (no customer)</option>${custOpts}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label required">Sale Date</label>
        <input class="form-control" id="sl-date" type="date"
               value="${new Date().toISOString().slice(0,10)}">
      </div>
    </div>
    <hr class="divider">
    <div style="display:flex;gap:8px;align-items:flex-end">
      <div class="form-group grow" style="margin-bottom:0">
        <label class="form-label">Add Product</label>
        <select class="form-control" id="sl-prod">
          <option value="">Search &amp; select product…</option>${prodOpts}
        </select>
      </div>
      <button class="btn btn-outline" id="sl-add-item" style="white-space:nowrap">+ Add to Cart</button>
    </div>
    <div id="sale-cart-area">
      <p class="text-muted" style="font-size:.84rem;padding:8px 0">Cart is empty. Add products above.</p>
    </div>
    <div style="text-align:right;font-weight:700;font-size:1rem;margin-top:4px">
      Sale Total: <span id="sale-f-total">₹0.00</span>
    </div>
    <hr class="divider">
    <p style="font-size:.82rem;font-weight:600;margin-bottom:8px;color:var(--text-secondary)">
      Payment at Point of Sale <span style="font-weight:400">(optional — can record later)</span>
    </p>
    <div class="form-row form-row-2">
      <div class="form-group">
        <label class="form-label">Payment Method</label>
        <select class="form-control" id="sl-method">
          <option value="">Skip — record later</option>${methodOpts}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Amount (₹)</label>
        <input class="form-control" id="sl-pay-amt" type="number" step="0.01" min="0.01"
               placeholder="Leave blank to skip">
      </div>
    </div>
    <div class="form-error mt-4" id="sl-err"></div>`,
    `<button class="btn btn-outline" id="sl-cancel">Cancel</button>
     <button class="btn btn-primary"  id="sl-confirm">Confirm Sale &amp; Generate Invoice</button>`,
    true
  );

  document.getElementById('sl-cancel').onclick = closeModal;

  document.getElementById('sl-add-item').onclick = () => {
    const sel  = document.getElementById('sl-prod');
    if (!sel.value) return;
    const opt   = sel.options[sel.selectedIndex];
    const pid   = sel.value;
    const stock = parseInt(opt.dataset.stock || 999);
    const price = parseFloat(opt.dataset.price || 0);
    if (stock === 0) { toast('This product is out of stock.', 'error'); return; }
    const pname = opt.text.split(' (')[0];
    const existing = cart.find(i => i.product_id === pid);
    if (existing) {
      if (existing.qty < existing.stock) {
        existing.qty++;
      } else {
        toast(`Maximum available stock is ${existing.stock}.`, 'warning');
      }
    } else {
      cart.push({ product_id: pid, name: pname, qty: 1, price, stock });
    }
    rebuildCart();
  };

  document.getElementById('sl-confirm').onclick = async () => {
    const errEl      = document.getElementById('sl-err');
    const customerId = document.getElementById('sl-cust').value;
    const saleDate   = document.getElementById('sl-date').value;
    const payMethod  = document.getElementById('sl-method').value;
    const payAmt     = document.getElementById('sl-pay-amt').value;
    errEl.textContent = '';

    if (!cart.length) { errEl.textContent = 'Add at least one product to the cart.'; return; }
    if (!saleDate)    { errEl.textContent = 'Sale date is required.'; return; }

    // Validate payment amount if method is selected
    if (payMethod && payAmt && parseFloat(payAmt) > cartTotal() + 0.005) {
      errEl.textContent = 'Payment amount cannot exceed the sale total.';
      return;
    }

    try {
      const result = await POST('/api/sales', {
        customer_id:    customerId || null,
        sale_date:      saleDate,
        items:          cart.map(i => ({ product_id: i.product_id, quantity: i.qty })),
        payment_method: payMethod || null,
        payment_amount: payAmt ? parseFloat(payAmt) : null,
      });
      toast(`Sale #${result.sale_id} created! Invoice: ${result.invoice_code}`);
      closeModal();
      onSave();
    } catch(e) {
      errEl.textContent = e.message;
    }
  };
}
