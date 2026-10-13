/* ================================================================
   dashboard.js — Dashboard: metrics, charts, quick actions
   ================================================================ */

let _dashCharts = {};

async function renderDashboard(view) {
  // Destroy existing chart instances before re-rendering to avoid canvas errors
  Object.values(_dashCharts).forEach(c => { try { c.destroy(); } catch(_) {} });
  _dashCharts = {};

  view.innerHTML = `
    <!-- Quick Actions -->
    <div class="quick-actions">
      <button class="qa-btn" data-qa="products">
        ${icon('box')} Add Product
      </button>
      <button class="qa-btn" data-qa="customers">
        ${icon('user-plus')} Add Customer
      </button>
      <button class="qa-btn" data-qa="purchases">
        ${icon('truck')} Record Purchase
      </button>
      <button class="qa-btn" data-qa="sales">
        ${icon('dollar')} Create Sale
      </button>
      <button class="qa-btn" data-qa="reports">
        ${icon('chart')} View Reports
      </button>
    </div>

    <!-- Metrics -->
    <div class="metrics-grid" id="dash-metrics">
      ${Array(8).fill(0).map(() => `
        <div class="metric-card">
          <div class="metric-icon"><span class="spinner"></span></div>
          <div class="metric-body"><div class="metric-label">Loading</div><div class="metric-value">—</div></div>
        </div>`).join('')}
    </div>

    <!-- Charts row 1 -->
    <div class="charts-grid">
      <div class="chart-card span-2">
        <h3>Sales Trend — Last 30 Days</h3>
        <div class="chart-wrap" style="height:190px"><canvas id="chart-trend"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>Monthly Revenue</h3>
        <div class="chart-wrap"><canvas id="chart-monthly"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>Top-Selling Products</h3>
        <div class="chart-wrap"><canvas id="chart-top"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>Inventory Value by Category</h3>
        <div class="chart-wrap"><canvas id="chart-inv"></canvas></div>
      </div>
    </div>

    <!-- Bottom grid -->
    <div class="dash-bottom">
      <div class="card">
        <div class="card-header">
          <h3>Recent Sales</h3>
          <button class="btn btn-sm btn-outline" onclick="navigate('sales')">View All</button>
        </div>
        <div style="overflow-x:auto">
          <table>
            <thead><tr><th>ID</th><th>Date</th><th>Customer</th><th>Amount</th></tr></thead>
            <tbody id="dash-recent"><tr class="loading-row"><td colspan="4"><span class="spinner"></span></td></tr></tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3>Low Stock Alert</h3>
          <button class="btn btn-sm btn-outline" onclick="navigate('products')">View All</button>
        </div>
        <div style="overflow-x:auto">
          <table>
            <thead><tr><th>Product</th><th>Category</th><th>Stock</th></tr></thead>
            <tbody id="dash-lowstock"><tr class="loading-row"><td colspan="3"><span class="spinner"></span></td></tr></tbody>
          </table>
        </div>
      </div>
    </div>`;

  // Quick-action routing
  view.querySelectorAll('[data-qa]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.qa));
  });

  const PEACH = ['#EFAF91','#E49A78','#D8895F','#C8784E','#B8673D','#C68A43','#A8562C','#986520'];
  const chartOpts = (yFmt) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { callback: yFmt } } }
  });
  const inrFmt = v => '₹' + Number(v).toLocaleString('en-IN');

  // Load all data in parallel
  const [metrics, trend, monthly, topProds, invCat, recentSales, lowStockData] =
    await Promise.allSettled([
      GET('/api/dashboard/metrics'),
      GET('/api/dashboard/sales-trend'),
      GET('/api/dashboard/monthly-sales'),
      GET('/api/dashboard/top-products'),
      GET('/api/dashboard/inventory-by-category'),
      GET('/api/dashboard/recent-sales'),
      GET('/api/dashboard/low-stock'),
    ]);

  // ── Metrics cards ────────────────────────────────────────────
  if (metrics.status === 'fulfilled') {
    const m = metrics.value;
    const cards = [
      { label: 'Total Products',      value: m.total_products,                 icon: 'box' },
      { label: 'Categories',          value: m.total_categories,               icon: 'grid' },
      { label: 'Brands',              value: m.total_brands,                   icon: 'tag' },
      { label: 'Suppliers',           value: m.total_suppliers,                icon: 'truck' },
      { label: 'Customers',           value: m.total_customers,                icon: 'users' },
      { label: "Today's Revenue",     value: fmtINR(m.today_sales_amount),     icon: 'dollar', sub: `${m.today_sales_count} sale${m.today_sales_count!==1?'s':''}` },
      { label: 'Total Revenue',       value: fmtINR(m.total_sales_revenue),    icon: 'trending', sub: 'All time' },
      { label: 'Low Stock Products',  value: m.low_stock_count,               icon: 'alert', sub: 'Below threshold' },
    ];
    document.getElementById('dash-metrics').innerHTML = cards.map(c => `
      <div class="metric-card">
        <div class="metric-icon">${icon(c.icon)}</div>
        <div class="metric-body">
          <div class="metric-label">${escHtml(c.label)}</div>
          <div class="metric-value">${escHtml(String(c.value))}</div>
          ${c.sub ? `<div class="metric-sub">${escHtml(c.sub)}</div>` : ''}
        </div>
      </div>`).join('');
  } else {
    document.getElementById('dash-metrics').innerHTML =
      `<p class="text-danger" style="grid-column:1/-1">Could not load metrics: ${escHtml(metrics.reason?.message || 'DB unavailable')}</p>`;
  }

  if (trend.status === 'fulfilled') {
    const d = trend.value;
    if (document.getElementById('chart-trend')) {
      _dashCharts.trend = new Chart(document.getElementById('chart-trend'), {
        type: 'line',
        data: {
          labels: d.map(r => r.day),
          datasets: [{
            label: 'Revenue (₹)',
            data: d.map(r => r.revenue),
            borderColor: PEACH[0], backgroundColor: 'rgba(239,175,145,.2)',
            tension: 0.4, fill: true, pointRadius: 3,
          }]
        },
        options: { ...chartOpts(inrFmt), plugins: { legend: { display: false } } }
      });
    }
  }

  // ── Monthly sales (bar) ────────────────────────────────────────
  if (monthly.status === 'fulfilled') {
    const d = monthly.value;
    if (document.getElementById('chart-monthly')) {
      _dashCharts.monthly = new Chart(document.getElementById('chart-monthly'), {
        type: 'bar',
        data: {
          labels: d.map(r => r.label),
          datasets: [{ label: 'Revenue (₹)', data: d.map(r => r.revenue), backgroundColor: PEACH[0], borderRadius: 4 }]
        },
        options: chartOpts(inrFmt)
      });
    }
  }

  // ── Top products (horizontal bar) ─────────────────────────────
  if (topProds.status === 'fulfilled') {
    const d = topProds.value;
    if (document.getElementById('chart-top')) {
      _dashCharts.top = new Chart(document.getElementById('chart-top'), {
        type: 'bar',
        data: {
          labels: d.map(r => r.name),
          datasets: [{ label: 'Units Sold', data: d.map(r => r.sold), backgroundColor: PEACH, borderRadius: 4 }]
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true } }
        }
      });
    }
  }

  // ── Inventory by category (doughnut) ──────────────────────────
  if (invCat.status === 'fulfilled') {
    const d = invCat.value;
    if (document.getElementById('chart-inv')) {
      _dashCharts.inv = new Chart(document.getElementById('chart-inv'), {
        type: 'doughnut',
        data: {
          labels: d.map(r => r.category),
          datasets: [{ data: d.map(r => r.value), backgroundColor: PEACH }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${inrFmt(ctx.raw)}` } }
          }
        }
      });
    }
  }

  // ── Recent sales table ─────────────────────────────────────────
  const rsBody = document.getElementById('dash-recent');
  if (recentSales.status === 'fulfilled') {
    const rows = recentSales.value;
    rsBody.innerHTML = rows.length
      ? rows.map(r => `<tr>
          <td class="text-muted">#${r.sale_id}</td>
          <td>${fmtDate(r.sale_date)}</td>
          <td>${escHtml(r.customer_name)}</td>
          <td>${fmtINR(r.total_amount)}</td>
        </tr>`).join('')
      : `<tr><td colspan="4"><div class="empty-state"><p>No sales yet.</p></div></td></tr>`;
  } else {
    rsBody.innerHTML = `<tr><td colspan="4" class="text-danger">Could not load.</td></tr>`;
  }

  // ── Low stock table ────────────────────────────────────────────
  const lsBody = document.getElementById('dash-lowstock');
  if (lowStockData.status === 'fulfilled') {
    const rows = lowStockData.value;
    lsBody.innerHTML = rows.length
      ? rows.map(r => `<tr>
          <td>${escHtml(r.product_name)}</td>
          <td>${escHtml(r.category_name)}</td>
          <td><span class="badge ${r.stock_qty === 0 ? 'badge-danger' : 'badge-warning'}">${r.stock_qty}</span></td>
        </tr>`).join('')
      : `<tr><td colspan="3"><div class="empty-state"><p>All products have adequate stock.</p></div></td></tr>`;
  } else {
    lsBody.innerHTML = `<tr><td colspan="3" class="text-danger">Could not load.</td></tr>`;
  }
}

// ── Inline icon helper ──────────────────────────────────────────
function icon(name) {
  const ICONS = {
    box:      `<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>`,
    grid:     `<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>`,
    tag:      `<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>`,
    truck:    `<rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>`,
    users:    `<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>`,
    'user-plus': `<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>`,
    dollar:   `<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>`,
    trending: `<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>`,
    alert:    `<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
    chart:    `<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>`,
  };
  const inner = ICONS[name] || ICONS.box;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
