/* ================================================================
   products.js — Full product management: CRUD, search, filters
   ================================================================ */

async function renderProducts(view) {
  let state = {
    page: 1, q: '', category_id: '', brand_id: '',
    sort: 'product_name', order: 'asc', low_stock: ''
  };
  let categories = [], brands = [], cached = [];

  // Load dropdowns in parallel
  [categories, brands] = await Promise.all([
    GET('/api/categories').catch(() => []),
    GET('/api/brands').catch(() => []),
  ]);

  const catOpts   = categories.map(c => `<option value="${c.category_id}">${escHtml(c.category_name)}</option>`).join('');
  const brandOpts = brands.map(b => `<option value="${b.brand_id}">${escHtml(b.brand_name)}</option>`).join('');

  view.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Products</h2>
        <p>Manage your product catalogue with real-time stock status</p>
      </div>
      <button class="btn btn-primary" id="btn-add-prod">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Product
      </button>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="table-toolbar" style="flex-wrap:wrap;gap:8px">
          <div class="search-wrap" style="min-width:200px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input class="form-control" id="prod-search" placeholder="Search by name or ID…">
          </div>
          <select class="form-control" id="prod-cat" style="width:175px">
            <option value="">All Categories</option>${catOpts}
          </select>
          <select class="form-control" id="prod-brand" style="width:155px">
            <option value="">All Brands</option>${brandOpts}
          </select>
          <select class="form-control" id="prod-sort" style="width:165px">
            <option value="product_name:asc">Name A → Z</option>
            <option value="product_name:desc">Name Z → A</option>
            <option value="unit_price:asc">Price ↑</option>
            <option value="unit_price:desc">Price ↓</option>
            <option value="stock_qty:asc">Stock ↑</option>
            <option value="stock_qty:desc">Stock ↓</option>
            <option value="inventory_value:desc">Inv. Value ↓</option>
          </select>
          <label class="flex-center gap-8" style="font-size:.84rem;cursor:pointer;white-space:nowrap">
            <input type="checkbox" id="prod-low-only"> Low stock only
          </label>
          <button class="btn btn-outline btn-sm" id="prod-clear">Clear</button>
          <span class="table-count" id="prod-count" style="margin-left:auto"></span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Brand</th>
                <th>Unit Price</th>
                <th>Stock Qty</th>
                <th>Status</th>
                <th>Inventory Value</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="prod-body">
              <tr class="loading-row"><td colspan="9"><span class="spinner"></span> Loading…</td></tr>
            </tbody>
          </table>
        </div>
        <div class="pagination" id="prod-pag"></div>
      </div>
    </div>`;

  // ── Load table ────────────────────────────────────────────────
  async function load() {
    const p = new URLSearchParams({ page: state.page, sort: state.sort, order: state.order });
    if (state.q)           p.set('q',           state.q);
    if (state.category_id) p.set('category_id', state.category_id);
    if (state.brand_id)    p.set('brand_id',    state.brand_id);
    if (state.low_stock)   p.set('low_stock',   '1');

    const body = document.getElementById('prod-body');
    body.innerHTML = `<tr class="loading-row"><td colspan="9"><span class="spinner"></span></td></tr>`;
    try {
      const data = await GET(`/api/products?${p}`);
      cached = data.items;
      document.getElementById('prod-count').textContent =
        `${data.total} product${data.total !== 1 ? 's' : ''}`;

      if (!cached.length) {
        body.innerHTML = `<tr><td colspan="9">
          <div class="empty-state">
            <p>No products match your filters.</p>
            <button class="btn btn-outline btn-sm mt-8" id="clear-filters-empty">Clear filters</button>
          </div></td></tr>`;
        document.getElementById('clear-filters-empty')?.addEventListener('click', clearFilters);
        document.getElementById('prod-pag').innerHTML = '';
        return;
      }

      body.innerHTML = cached.map(r => `
        <tr>
          <td class="text-muted">#${r.product_id}</td>
          <td><strong>${escHtml(r.product_name)}</strong></td>
          <td>${escHtml(r.category_name)}</td>
          <td>${escHtml(r.brand_name)}</td>
          <td>${fmtINR(r.unit_price)}</td>
          <td>${r.stock_qty}</td>
          <td>${stockBadge(r.stock_status)}</td>
          <td>${fmtINR(r.inventory_value)}</td>
          <td class="flex-center gap-8">
            <button class="btn btn-sm btn-outline" data-edit="${r.product_id}">Edit</button>
            <button class="btn btn-sm btn-danger"  data-del="${r.product_id}">Delete</button>
          </td>
        </tr>`).join('');

      buildPagination(
        document.getElementById('prod-pag'),
        state.page, data.total, data.per_page,
        p => { state.page = p; load(); }
      );
    } catch(e) {
      body.innerHTML = `<tr><td colspan="9" class="text-danger" style="padding:20px">${escHtml(e.message)}</td></tr>`;
    }
  }

  function clearFilters() {
    document.getElementById('prod-search').value  = '';
    document.getElementById('prod-cat').value     = '';
    document.getElementById('prod-brand').value   = '';
    document.getElementById('prod-low-only').checked = false;
    document.getElementById('prod-sort').value    = 'product_name:asc';
    Object.assign(state, { q:'', category_id:'', brand_id:'', low_stock:'', sort:'product_name', order:'asc', page:1 });
    load();
  }

  await load();

  // ── Event wiring ──────────────────────────────────────────────
  let deb;
  document.getElementById('prod-search').addEventListener('input', e => {
    clearTimeout(deb); state.q = e.target.value; state.page = 1;
    deb = setTimeout(load, 320);
  });
  document.getElementById('prod-cat').addEventListener('change', e => {
    state.category_id = e.target.value; state.page = 1; load();
  });
  document.getElementById('prod-brand').addEventListener('change', e => {
    state.brand_id = e.target.value; state.page = 1; load();
  });
  document.getElementById('prod-low-only').addEventListener('change', e => {
    state.low_stock = e.target.checked ? '1' : ''; state.page = 1; load();
  });
  document.getElementById('prod-sort').addEventListener('change', e => {
    const [s, o] = e.target.value.split(':');
    state.sort = s; state.order = o || 'asc'; state.page = 1; load();
  });
  document.getElementById('prod-clear').addEventListener('click', clearFilters);

  // ── Form ──────────────────────────────────────────────────────
  function showForm(pid = null) {
    const rec    = pid ? cached.find(r => r.product_id === pid) : null;
    const catSel = categories.map(c =>
      `<option value="${c.category_id}" ${rec?.category_id === c.category_id ? 'selected' : ''}>${escHtml(c.category_name)}</option>`
    ).join('');
    const brandSel = brands.map(b =>
      `<option value="${b.brand_id}" ${rec?.brand_id === b.brand_id ? 'selected' : ''}>${escHtml(b.brand_name)}</option>`
    ).join('');

    openModal(pid ? `Edit Product — ${escHtml(rec?.product_name || '')}` : 'Add New Product',
      `<div class="form-group">
        <label class="form-label required">Product Name</label>
        <input class="form-control" id="fp-name" value="${escHtml(rec?.product_name || '')}" placeholder="Enter product name">
      </div>
      <div class="form-row form-row-2">
        <div class="form-group">
          <label class="form-label required">Category</label>
          <select class="form-control" id="fp-cat">
            <option value="">Select category…</option>${catSel}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label required">Brand</label>
          <select class="form-control" id="fp-brand">
            <option value="">Select brand…</option>${brandSel}
          </select>
        </div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group">
          <label class="form-label required">Unit Price (₹)</label>
          <input class="form-control" id="fp-price" type="number" step="0.01" min="0.01"
                 value="${rec?.unit_price ?? ''}">
        </div>
        <div class="form-group">
          <label class="form-label required">Stock Quantity</label>
          <input class="form-control" id="fp-qty" type="number" min="0"
                 value="${rec?.stock_qty ?? ''}">
        </div>
      </div>
      <div class="form-error" id="fp-err"></div>`,
      `<button class="btn btn-outline" id="fp-cancel">Cancel</button>
       <button class="btn btn-primary" id="fp-save">${rec ? 'Save Changes' : 'Add Product'}</button>`
    );

    document.getElementById('fp-cancel').onclick = closeModal;
    document.getElementById('fp-save').onclick = async () => {
      const body = {
        product_name: document.getElementById('fp-name').value.trim(),
        category_id:  document.getElementById('fp-cat').value,
        brand_id:     document.getElementById('fp-brand').value,
        unit_price:   document.getElementById('fp-price').value,
        stock_qty:    document.getElementById('fp-qty').value,
      };
      document.getElementById('fp-err').textContent = '';
      try {
        if (rec) {
          await PUT(`/api/products/${pid}`, body);
          toast('Product updated successfully.');
        } else {
          await POST('/api/products', body);
          toast('Product added successfully.');
        }
        closeModal(); load();
      } catch(e) {
        document.getElementById('fp-err').textContent = e.message;
      }
    };
  }

  // ── Table actions ─────────────────────────────────────────────
  document.getElementById('btn-add-prod').onclick = () => showForm();

  document.getElementById('prod-body').addEventListener('click', async e => {
    const editId = e.target.dataset.edit ? parseInt(e.target.dataset.edit) : null;
    const delId  = e.target.dataset.del  ? parseInt(e.target.dataset.del)  : null;
    if (editId) {
      showForm(editId);
    }
    if (delId) {
      const rec = cached.find(r => r.product_id === delId);
      const ok  = await confirm(
        'Delete Product',
        `Delete "${rec?.product_name}"? This cannot be undone.`
      );
      if (!ok) return;
      try {
        await DELETE(`/api/products/${delId}`);
        toast('Product deleted.');
        load();
      } catch(e) {
        toast(e.message, 'error');
      }
    }
  });
}
