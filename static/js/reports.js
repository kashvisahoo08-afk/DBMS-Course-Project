/* ================================================================
   reports.js — 12 reports with filters, tables, CSV export, charts
   ================================================================ */

const REPORT_DEFS = [
  { id: 'low-stock',               label: 'Low-Stock Products',           desc: 'Products below the configurable stock threshold (set via LOW_STOCK_THRESHOLD in .env).' },
  { id: 'inventory-valuation',     label: 'Inventory Valuation',          desc: 'Current stock value = stock_qty × unit_price per product.' },
  { id: 'supplier-purchases',      label: 'Supplier Purchases',           desc: 'Purchase totals and order counts grouped by supplier.' },
  { id: 'daily-sales',             label: 'Daily Sales',                  desc: 'Revenue and sale count by calendar date.' },
  { id: 'monthly-sales',           label: 'Monthly Sales',                desc: 'Revenue and sale count grouped by year-month (not month alone).' },
  { id: 'returns',                 label: 'Returns Report',               desc: 'All returned items with associated sale, product, and customer.' },
  { id: 'fast-moving',             label: 'Fast-Moving Products',         desc: 'Products ranked by total units sold.' },
  { id: 'above-average-price',     label: 'Above-Average Price',          desc: 'Products priced above the catalogue average unit price.' },
  { id: 'product-catalog',         label: 'Product Catalogue',            desc: 'Full product listing with category, brand, price, and stock.' },
  { id: 'customer-history',        label: 'Customer Sales History',       desc: 'Sales totals per customer (includes walk-in sales).' },
  { id: 'invoice-payment-summary', label: 'Invoice & Payment Summary',    desc: 'Outstanding vs. paid breakdown per invoice.' },
  { id: 'stock-movement-history',  label: 'Stock Movement History',       desc: 'All stock movements (IN / OUT / RETURN) in a date range.' },
];

function renderReports(view) {
  view.innerHTML = `
    <div class="page-header">
      <div><h2>Reports</h2><p>SQL-driven analytics with CSV export</p></div>
    </div>
    <div style="display:grid;grid-template-columns:230px 1fr;gap:20px;align-items:start" id="rpt-layout">
      <div class="card">
        <div class="card-body" style="padding:6px 0">
          ${REPORT_DEFS.map(r => `
            <div class="nav-item" data-rep="${r.id}">
              ${escHtml(r.label)}
            </div>`).join('')}
        </div>
      </div>
      <div id="rpt-panel">
        <div class="empty-state" style="padding:80px 20px">
          <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
          <h4>Select a report</h4>
          <p>Choose a report from the list on the left to view its results.</p>
        </div>
      </div>
    </div>`;

  view.querySelectorAll('[data-rep]').forEach(btn => {
    btn.addEventListener('click', () => {
      view.querySelectorAll('[data-rep]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadReport(btn.dataset.rep);
    });
  });

  // Make layout stack on narrow screens
  const mq = window.matchMedia('(max-width:700px)');
  if (mq.matches) {
    document.getElementById('rpt-layout').style.gridTemplateColumns = '1fr';
  }
}

async function loadReport(reportId) {
  const def   = REPORT_DEFS.find(r => r.id === reportId);
  const panel = document.getElementById('rpt-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>${escHtml(def.label)}</h3>
        <a class="btn btn-sm btn-outline" id="rpt-csv-link" href="/api/reports/${reportId}?export=csv"
           target="_blank" download>
          ↓ Export CSV
        </a>
      </div>
      <div class="card-body">
        <p class="text-muted" style="font-size:.82rem;margin-bottom:14px">${escHtml(def.desc)}</p>
        ${buildFilters(reportId)}
        <div id="rpt-result"><div style="padding:20px"><span class="spinner"></span> Loading…</div></div>
      </div>
    </div>`;

  wireFilters(reportId);
  await fetchReport(reportId, {});
}

function buildFilters(id) {
  if (['daily-sales','returns','stock-movement-history'].includes(id)) {
    return `
      <div class="table-toolbar" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <label style="font-size:.82rem;font-weight:600;color:var(--text-secondary)">Date range:</label>
        <input class="form-control" id="rpt-from" type="date" style="width:150px">
        <span class="text-muted" style="font-size:.82rem">to</span>
        <input class="form-control" id="rpt-to"   type="date" style="width:150px">
        <button class="btn btn-outline btn-sm" id="rpt-apply">Apply</button>
        <button class="btn btn-outline btn-sm" id="rpt-reset">Reset</button>
      </div>`;
  }
  if (id === 'monthly-sales') {
    return `
      <div class="table-toolbar" style="margin-bottom:14px">
        <button class="btn btn-outline btn-sm" id="rpt-toggle-chart">Toggle Chart</button>
      </div>`;
  }
  return '';
}

let _rptChart = null;

function wireFilters(id) {
  const applyBtn  = document.getElementById('rpt-apply');
  const resetBtn  = document.getElementById('rpt-reset');
  const toggleBtn = document.getElementById('rpt-toggle-chart');

  if (applyBtn) {
    const getParams = () => {
      const params = {};
      const from = document.getElementById('rpt-from')?.value;
      const to   = document.getElementById('rpt-to')?.value;
      if (from) params.date_from = from;
      if (to)   params.date_to   = to;
      return params;
    };
    applyBtn.addEventListener('click', () => {
      const params = getParams();
      fetchReport(id, params);
      // Update CSV export link
      const link = document.getElementById('rpt-csv-link');
      if (link) {
        const p = new URLSearchParams({ export:'csv', ...params });
        link.href = `/api/reports/${id}?${p}`;
      }
    });
    resetBtn?.addEventListener('click', () => {
      document.getElementById('rpt-from').value = '';
      document.getElementById('rpt-to').value   = '';
      fetchReport(id, {});
      const link = document.getElementById('rpt-csv-link');
      if (link) link.href = `/api/reports/${id}?export=csv`;
    });
  }

  if (toggleBtn && id === 'monthly-sales') {
    let chartVisible = false;
    toggleBtn.addEventListener('click', async () => {
      chartVisible = !chartVisible;
      if (chartVisible) {
        await showMonthlySalesChart();
      } else {
        const chartDiv = document.getElementById('rpt-chart-area');
        if (chartDiv) chartDiv.remove();
        if (_rptChart) { try { _rptChart.destroy(); } catch(_) {} _rptChart = null; }
      }
    });
  }
}

async function showMonthlySalesChart() {
  try {
    const rows = await GET('/api/reports/monthly-sales');
    const result = document.getElementById('rpt-result');
    if (!result) return;
    let chartDiv = document.getElementById('rpt-chart-area');
    if (!chartDiv) {
      chartDiv = document.createElement('div');
      chartDiv.id = 'rpt-chart-area';
      chartDiv.style.cssText = 'margin-bottom:20px;height:250px;position:relative';
      chartDiv.innerHTML = '<canvas id="rpt-canvas"></canvas>';
      result.insertAdjacentElement('beforebegin', chartDiv);
    }
    if (_rptChart) { try { _rptChart.destroy(); } catch(_) {} }
    _rptChart = new Chart(document.getElementById('rpt-canvas'), {
      type: 'bar',
      data: {
        labels: rows.map(r => r.period),
        datasets: [{
          label: 'Revenue (₹)',
          data:  rows.map(r => r.revenue),
          backgroundColor: '#EFAF91',
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: v => '₹' + Number(v).toLocaleString('en-IN') }
          }
        }
      }
    });
  } catch(e) {
    toast('Could not render chart: ' + e.message, 'error');
  }
}

async function fetchReport(id, params) {
  const result = document.getElementById('rpt-result');
  if (!result) return;
  result.innerHTML = `<div style="padding:20px"><span class="spinner"></span> Loading…</div>`;

  const p = new URLSearchParams(params);
  try {
    const raw  = await GET(`/api/reports/${id}?${p}`);
    const rows = Array.isArray(raw) ? raw : (raw.items || []);

    let summary = '';
    if (id === 'inventory-valuation' && raw.total_value != null)
      summary = `<div style="font-size:.85rem;margin-bottom:10px;padding:8px 12px;background:var(--surface-soft);border-radius:6px">
        Total Inventory Value: <strong>${fmtINR(raw.total_value)}</strong></div>`;
    if (id === 'above-average-price' && raw.avg_price != null)
      summary = `<div style="font-size:.85rem;margin-bottom:10px;padding:8px 12px;background:var(--surface-soft);border-radius:6px">
        Catalogue Average Price: <strong>${fmtINR(raw.avg_price)}</strong></div>`;
    if (id === 'low-stock' && raw.threshold != null)
      summary = `<div style="font-size:.85rem;margin-bottom:10px;padding:8px 12px;background:var(--surface-soft);border-radius:6px">
        Low-stock threshold: <strong>${raw.threshold} units</strong></div>`;

    if (!rows.length) {
      result.innerHTML = `${summary}<div class="empty-state"><p>No data available for this report.</p></div>`;
      return;
    }

    result.innerHTML = summary + buildReportTable(rows);
  } catch(e) {
    result.innerHTML = `<p class="text-danger" style="padding:12px">${escHtml(e.message)}</p>`;
  }
}

function buildReportTable(rows) {
  const cols = Object.keys(rows[0]);

  const fmtCell = (col, val) => {
    if (val === null || val === undefined) return '—';
    const c = col.toLowerCase();
    if (c.includes('amount') || c.includes('revenue') || c.includes('value') ||
        c.includes('expenditure') || c.includes('total') || c.includes('price') ||
        c.includes('balance') || c.includes('paid'))
      return fmtINR(val);
    if (c.includes('date') && val)
      return fmtDate(val);
    if (c === 'movement_type') return movBadge(String(val));
    if (c === 'status' || c === 'payment_status') return payBadge(String(val));
    return escHtml(String(val));
  };

  const heads = cols.map(c =>
    `<th>${escHtml(c.replace(/_/g,' ').replace(/\b\w/g, l => l.toUpperCase()))}</th>`
  ).join('');

  const bodyRows = rows.map(r =>
    `<tr>${cols.map(c => `<td>${fmtCell(c, r[c])}</td>`).join('')}</tr>`
  ).join('');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${heads}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <p class="text-muted mt-8" style="font-size:.76rem">
      ${rows.length} row${rows.length !== 1 ? 's' : ''}
    </p>`;
}
