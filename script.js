const state = {
  connected: false,
  dbConfig: {},
  charts: {},
  data: {
    incidents: [],
    hotspots: [],
    alerts: [],
    suspects: [],
    locations: [],
    categories: [],
    patrols: []
  }
};

const bwChartPalette = ['#ffffff', '#d9d9d9', '#bfbfbf', '#a6a6a6', '#8c8c8c', '#737373', '#595959', '#404040'];
const bwGridColor = 'rgba(255,255,255,.18)';
const bwTickColor = '#9a9a9a';
const bwTextColor = '#f2f2f2';
const bwPanelColor = '#111111';

function updateClock(){
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('en-IN', {hour12:false});
}
setInterval(updateClock, 1000);
updateClock();

async function apiFetch(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function showSection(id, el){
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('section-' + id).classList.add('active');
  if (el) el.classList.add('active');
  if (id === 'dashboard') refreshDashboard();
  if (id === 'schema') renderSchema();
}

function openDbModal(){ document.getElementById('db-modal').classList.add('open'); }
function closeDbModal(){ document.getElementById('db-modal').classList.remove('open'); }
function populateLocationDropdowns(){
  const incidentSelect = document.getElementById('f-loc');
  const patrolSelect = document.getElementById('p-loc');
  if (!incidentSelect || !patrolSelect) return;

  incidentSelect.innerHTML = '<option value="">Select...</option>';
  patrolSelect.innerHTML = '<option value="">Select...</option>';

  state.data.locations.forEach(loc => {
    const fullLabel = `${loc.area_name}, ${loc.city}`;
    incidentSelect.innerHTML += `<option value="${loc.location_id}">${fullLabel}</option>`;
    patrolSelect.innerHTML += `<option value="${loc.location_id}">${loc.area_name}</option>`;
  });
}
function populateCategoryDropdown(){
  const categorySelect = document.getElementById('f-cat');
  if (!categorySelect) return;
  categorySelect.innerHTML = '<option value="">Select...</option>';
  state.data.categories.forEach(cat => {
    categorySelect.innerHTML += `<option value="${cat.category_id}">${cat.category_name}</option>`;
  });
}
async function connectDb(){
  const host = document.getElementById('db-host').value.trim();
  const port = document.getElementById('db-port').value.trim();
  const db = document.getElementById('db-name').value.trim();
  const user = document.getElementById('db-user').value.trim();
  const password = document.getElementById('db-pass').value;
  const dot = document.getElementById('conn-dot');
  const txt = document.getElementById('conn-text');
  const headerLabel = document.getElementById('conn-label');

  // reset UI state for fresh attempt
  state.connected = false;
  headerLabel.textContent = 'DB DISCONNECTED';
  txt.textContent = 'Connecting...';
  dot.className = 'conn-dot';

  try {
    await apiFetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, user, password, database: db })
    });
    state.connected = true;
    state.dbConfig = {host, port, db, user};
    dot.className = 'conn-dot connected';
    txt.textContent = `Connected to ${db}@${host}:${port}`;
    headerLabel.textContent = 'DB CONNECTED';
    await loadAllDataFromDb();
    setTimeout(closeDbModal, 1200);
  } catch (error) {
    dot.className = 'conn-dot error';
    txt.textContent = error.message;
    headerLabel.textContent = 'DB DISCONNECTED';
    state.connected = false;
  }
}

async function loadAllDataFromDb(){
  if (!state.connected) return;
  const [
    summary,
    locations,
    categories,
    incidents,
    hotspots,
    alerts,
    suspects,
    patrols
  ] = await Promise.all([
    apiFetch('/api/dashboard-summary'),
    apiFetch('/api/locations'),
    apiFetch('/api/categories'),
    apiFetch('/api/incidents'),
    apiFetch('/api/hotspots'),
    apiFetch('/api/alerts'),
    apiFetch('/api/suspects'),
    apiFetch('/api/patrols')
  ]);

  state.data.locations = locations;
  state.data.categories = categories;
  state.data.incidents = incidents;
  state.data.hotspots = hotspots;
  state.data.alerts = alerts;
  state.data.suspects = suspects;
  state.data.patrols = patrols;

  populateLocationDropdowns();
  populateCategoryDropdown();
  refreshDashboard(summary);
  renderIncidents(state.data.incidents);
  renderSuspects();
  renderAlerts();
  renderMapTable();
  renderPatrols();
}

function refreshDashboard(summary){
  const inc = state.data.incidents;
  const solved = summary ? summary.solveRate : (inc.length ? Math.round((inc.filter(i => i.status === 'solved').length / inc.length) * 100) : 0);
  document.getElementById('s-total').textContent = summary ? summary.totalIncidents : inc.length;
  document.getElementById('s-total-d').textContent = 'Live from DB';
  document.getElementById('s-hotspot').textContent = summary ? summary.activeHotspots : state.data.hotspots.filter(h => h.level === 'critical' || h.level === 'high').length;
  document.getElementById('s-hotspot-d').textContent = 'High/Critical';
  document.getElementById('s-alerts').textContent = summary ? summary.openAlerts : state.data.alerts.filter(a => !a.resolved).length;
  document.getElementById('s-alerts-d').textContent = 'Open alerts';
  document.getElementById('s-solve').textContent = `${solved}%`;
  document.getElementById('s-solve-d').textContent = 'From incidents table';
  renderHotspotTable();
  renderCharts();
}

function renderHotspotTable(){
  const tb = document.getElementById('hotspot-tbody');
  tb.innerHTML = state.data.hotspots.map(h => `
    <tr>
      <td>${h.area}</td>
      <td>${h.city}</td>
      <td><span style="font-family:var(--font-mono);color:var(--accent)">${h.crimes}</span></td>
      <td><span style="font-family:var(--font-mono)">${h.score.toFixed(1)}</span></td>
      <td><span class="badge ${h.level}">${h.level.toUpperCase()}</span></td>
      <td>${h.crime}</td>
      <td class="trend-${h.trend === 'increasing' ? 'up' : h.trend === 'decreasing' ? 'down' : 'stable'}">
        ${h.trend === 'increasing' ? '↑' : h.trend === 'decreasing' ? '↓' : '→'} ${h.trend}
      </td>
    </tr>`).join('');
}

function renderCharts(){
  const categoryMap = new Map();
  const statusMap = new Map();
  const monthlyMap = new Map();

  state.data.incidents.forEach(inc => {
    categoryMap.set(inc.cat, (categoryMap.get(inc.cat) || 0) + 1);
    const statusLabel = inc.status.replace('_', ' ');
    statusMap.set(statusLabel, (statusMap.get(statusLabel) || 0) + 1);
    const month = inc.date.slice(0, 7);
    monthlyMap.set(month, (monthlyMap.get(month) || 0) + 1);
  });

  const cats = Array.from(categoryMap.keys());
  const catCounts = Array.from(categoryMap.values());
  const statuses = Array.from(statusMap.keys());
  const stCounts = Array.from(statusMap.values());
  const months = Array.from(monthlyMap.keys()).sort();
  const monthly = months.map(m => monthlyMap.get(m));

  const opts = {
    responsive:true,
    maintainAspectRatio:true,
    plugins:{legend:{labels:{color:bwTextColor, font:{family:'Share Tech Mono', size:11}}}}
  };

  if (state.charts.cat) state.charts.cat.destroy();
  state.charts.cat = new Chart(document.getElementById('catChart'), {
    type:'doughnut',
    data:{labels:cats, datasets:[{data:catCounts, backgroundColor:bwChartPalette, borderColor:bwPanelColor, borderWidth:2}]},
    options:{...opts, cutout:'60%'}
  });

  if (state.charts.status) state.charts.status.destroy();
  state.charts.status = new Chart(document.getElementById('statusChart'), {
    type:'bar',
    data:{labels:statuses, datasets:[{label:'Incidents', data:stCounts, backgroundColor:bwChartPalette.slice(1, 5), borderRadius:4}]},
    options:{
      ...opts,
      plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:bwTickColor}, grid:{color:bwGridColor}}, y:{ticks:{color:bwTickColor}, grid:{color:bwGridColor}}}
    }
  });

  if (state.charts.trend) state.charts.trend.destroy();
  state.charts.trend = new Chart(document.getElementById('trendChart'), {
    type:'line',
    data:{labels:months, datasets:[{label:'Incidents', data:monthly, borderColor:'#ffffff', backgroundColor:'rgba(255,255,255,.08)', tension:.4, pointBackgroundColor:'#ffffff', pointRadius:5, fill:true}]},
    options:{...opts, scales:{x:{ticks:{color:bwTickColor}, grid:{color:bwGridColor}}, y:{ticks:{color:bwTickColor}, grid:{color:bwGridColor}}}}
  });

  if (document.getElementById('dowChart')){
    if (state.charts.dow) state.charts.dow.destroy();
    if (state.charts.sev) state.charts.sev.destroy();
    if (state.charts.city) state.charts.city.destroy();

    const severityCounts = [1, 2, 3, 4, 5].map(s =>
      state.data.incidents.filter(i => Number(i.severity) === s).length
    );
    const cityMap = new Map();
    state.data.hotspots.forEach(h => {
      cityMap.set(h.city, (cityMap.get(h.city) || 0) + Number(h.crimes || 0));
    });
    const cityLabels = Array.from(cityMap.keys());
    const cityCounts = Array.from(cityMap.values());

    state.charts.dow = new Chart(document.getElementById('dowChart'), {
      type:'bar',
      data:{labels:['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], datasets:[{label:'Incidents', data:[0, 0, 0, 0, 0, 0, 0], backgroundColor:'rgba(255,255,255,.5)', borderRadius:4}]},
      options:{...opts, plugins:{legend:{display:false}}, scales:{x:{ticks:{color:bwTickColor}, grid:{color:bwGridColor}}, y:{ticks:{color:bwTickColor}, grid:{color:bwGridColor}}}}
    });
    state.charts.sev = new Chart(document.getElementById('sevChart'), {
      type:'polarArea',
      data:{labels:['Low(1)', 'Mid(2)', 'High(3)', 'Severe(4)', 'Critical(5)'], datasets:[{data:severityCounts, backgroundColor:bwChartPalette.slice(1, 6), borderColor:bwPanelColor, borderWidth:2}]},
      options:{...opts}
    });
    state.charts.city = new Chart(document.getElementById('cityChart'), {
      type:'bar',
      data:{
        labels:cityLabels,
        datasets:[{label:'Total Crimes', data:cityCounts, backgroundColor:'rgba(255,255,255,.75)'}]
      },
      options:{...opts, scales:{x:{ticks:{color:bwTickColor}, grid:{color:bwGridColor}}, y:{ticks:{color:bwTickColor}, grid:{color:bwGridColor}}}}
    });
  }
}

function renderMapTable(){
  const hotspotsByArea = new Map(state.data.hotspots.map(h => [`${h.area}|${h.city}`, h]));
  const locations = state.data.locations.map(l => {
    const key = `${l.area_name}|${l.city}`;
    const h = hotspotsByArea.get(key);
    return {
      area: l.area_name,
      city: l.city,
      dist: l.district,
      lat: l.latitude,
      lon: l.longitude,
      zone: l.zone_type,
      inc: h ? Number(h.crimes) : 0,
      level: h ? h.level : 'low'
    };
  });
  document.getElementById('map-table-body').innerHTML = locations.map(l => `
    <tr>
      <td>${l.area}</td><td>${l.city}</td><td>${l.dist}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">${l.lat}, ${l.lon}</td>
      <td>${l.zone}</td>
      <td style="font-family:var(--font-mono);color:var(--accent)">${l.inc}</td>
      <td><span class="badge ${l.level}">${l.level.toUpperCase()}</span></td>
    </tr>`).join('');

  const mapDots = document.getElementById('mapDots');
  const colors = {critical:'#ffffff', high:'#d0d0d0', moderate:'#a8a8a8', low:'#7f7f7f'};
  const sizes = {critical:24, high:18, moderate:14, low:10};
  const positions = locations.map((_, i) => ({ t: 18 + (i * 9) % 64, l: 16 + (i * 11) % 68 }));
  mapDots.innerHTML = locations.map((l, i) => {
    const p = positions[i];
    const c = colors[l.level];
    const s = sizes[l.level];
    return `<div class="map-dot" title="${l.area}" style="width:${s}px;height:${s}px;top:${p.t}%;left:${p.l}%;background:${c};box-shadow:0 0 ${s}px ${c};margin-left:-${s/2}px;margin-top:-${s/2}px;animation-delay:${i*0.3}s"></div>`;
  }).join('');
}

function renderIncidents(data){
  const tb = document.getElementById('inc-tbody');
  tb.innerHTML = data.map(i => `
    <tr>
      <td style="font-family:var(--font-mono);color:var(--accent)">${i.id}</td>
      <td>${i.date}</td><td>${i.loc}</td><td>${i.cat}</td>
      <td>${i.victims}</td><td>${i.suspects}</td>
      <td><span class="badge ${i.status}">${i.status.replace('_', ' ')}</span></td>
      <td><span style="color:var(--accent2);font-family:var(--font-mono)">${'★'.repeat(i.severity)}${'☆'.repeat(5-i.severity)}</span></td>
    </tr>`).join('');
}
function filterIncidents(){
  const q = document.getElementById('inc-search').value.toLowerCase();
  const s = document.getElementById('inc-status').value;
  renderIncidents(state.data.incidents.filter(i => (!q || i.id.toLowerCase().includes(q) || i.loc.toLowerCase().includes(q)) && (!s || i.status === s)));
}

function renderSuspects(){
  document.getElementById('sus-tbody').innerHTML = state.data.suspects.map(s => `
    <tr>
      <td style="font-family:var(--font-mono);color:var(--text-dim)">${s.id}</td>
      <td>${s.name}</td><td>${s.age}</td><td>${s.gender}</td>
      <td style="font-family:var(--font-mono);color:var(--accent);font-size:11px">${s.incident}</td>
      <td>${s.nat}</td>
      <td><span class="badge ${s.arrested ? 'solved' : 'reported'}">${s.arrested ? 'YES' : 'NO'}</span></td>
    </tr>`).join('');
}

const alertIcons = {critical:'🚨', high:'⚠️', medium:'📢', low:'ℹ️'};
function renderAlerts(){
  const list = document.getElementById('alerts-list');
  const active = state.data.alerts.filter(a => !a.resolved);
  document.getElementById('alert-badge').textContent = active.length;
  list.innerHTML = active.map(a => `
    <div class="alert-item ${a.priority}" id="alert-${a.id}">
      <div class="alert-icon">${alertIcons[a.priority]}</div>
      <div class="alert-content">
        <div class="alert-title">${a.msg}</div>
        <div class="alert-meta">📍 ${a.loc} &nbsp;·&nbsp; ${a.type.toUpperCase()} &nbsp;·&nbsp; ${a.time}</div>
      </div>
      <div class="alert-actions"><button onclick="resolveAlert(${a.id})">✓ Resolve</button></div>
    </div>`).join('') || '<div style="color:var(--text-dim);font-family:var(--font-mono);padding:24px">No active alerts.</div>';
}
async function resolveAlert(id){
  if (!state.connected) return;
  await apiFetch(`/api/alerts/${id}/resolve`, { method: 'POST' });
  await loadAllDataFromDb();
}
async function resolveAll(){
  if (!state.connected) return;
  await apiFetch('/api/alerts/resolve-all', { method: 'POST' });
  await loadAllDataFromDb();
}

async function submitIncident(){
  const fir = document.getElementById('f-fir').value.trim();
  const date = document.getElementById('f-date').value;
  const cat = document.getElementById('f-cat');
  const catTxt = cat.options[cat.selectedIndex].text;
  const loc = document.getElementById('f-loc');
  const locTxt = loc.options[loc.selectedIndex].text;
  const msg = document.getElementById('form-msg');
  if (!fir || !date || !cat.value || !loc.value){
    msg.innerHTML = '<span style="color:var(--accent2)">✕ Fill all required fields.</span>';
    return;
  }
  if (!state.connected){
    msg.innerHTML = '<span style="color:var(--accent2)">✕ Connect DB first.</span>';
    return;
  }
  try {
    await apiFetch('/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firNumber: fir,
        locationId: loc.value,
        categoryId: cat.value,
        incidentDate: date,
        incidentTime: document.getElementById('f-time').value || null,
        victimCount: document.getElementById('f-victims').value,
        suspectCount: document.getElementById('f-suspects').value,
        description: document.getElementById('f-desc').value,
        status: document.getElementById('f-status').value
      })
    });
    msg.innerHTML = `<span style="color:var(--accent2)">✓ Incident ${fir} logged successfully.</span>`;
    printToTerminal(`INSERT INTO crime_incidents (...) VALUES (...);`, 'cmd');
    printToTerminal('Query OK, 1 row affected.', 'success');
    await loadAllDataFromDb();
  } catch (error) {
    msg.innerHTML = `<span style="color:var(--accent2)">✕ ${error.message}</span>`;
  }
}
function clearForm(){
  ['f-fir','f-date','f-time','f-desc'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-cat').selectedIndex = 0;
  document.getElementById('f-loc').selectedIndex = 0;
  document.getElementById('f-victims').value = 1;
  document.getElementById('f-suspects').value = 0;
  document.getElementById('form-msg').innerHTML = '';
}

function renderPatrols(){
  const tb = document.getElementById('patrol-tbody');
  if (!state.data.patrols.length) {
    tb.innerHTML = '<tr><td colspan="6" style="color:var(--text-dim);text-align:center;padding:24px">No patrol logs yet</td></tr>';
    return;
  }
  tb.innerHTML = state.data.patrols.map((p, i) => `
    <tr><td style="font-family:var(--font-mono);color:var(--text-dim)">${i + 1}</td>
    <td>${p.badge}</td><td>${p.location}</td>
    <td style="font-family:var(--font-mono);font-size:11px">${p.start}</td>
    <td style="font-family:var(--font-mono);font-size:11px">${p.end}</td>
    <td>${p.notes}</td></tr>`).join('');
}
async function submitPatrol(){
  const badge = document.getElementById('p-badge').value.trim();
  const loc = document.getElementById('p-loc');
  const locTxt = loc.options[loc.selectedIndex].text;
  const start = document.getElementById('p-start').value;
  const end = document.getElementById('p-end').value;
  const obs = document.getElementById('p-obs').value;
  const msg = document.getElementById('patrol-msg');
  if (!badge || !start || !loc.value){
    msg.innerHTML = '<span style="color:var(--accent2)">✕ Badge, location and start time required.</span>';
    return;
  }
  if (!state.connected){
    msg.innerHTML = '<span style="color:var(--accent2)">✕ Connect DB first.</span>';
    return;
  }
  try {
    await apiFetch('/api/patrols', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        officerBadgeNo: badge,
        locationId: loc.value,
        patrolStart: start.replace('T', ' '),
        patrolEnd: end ? end.replace('T', ' ') : null,
        observations: obs
      })
    });
    msg.innerHTML = '<span style="color:var(--accent2)">✓ Patrol logged.</span>';
    await loadAllDataFromDb();
  } catch (error) {
    msg.innerHTML = `<span style="color:var(--accent2)">✕ ${error.message}</span>`;
  }
}

function setQuery(q){ document.getElementById('sql-input').value = q; }
function clearTerminal(){ document.getElementById('terminal').innerHTML = '<span class="terminal-output">// Terminal cleared.<br></span>'; }
function printToTerminal(txt, type = 'output'){
  const t = document.getElementById('terminal');
  const cls = type === 'cmd' ? 'terminal-cmd' : type === 'success' ? 'terminal-success' : type === 'error' ? 'terminal-error' : 'terminal-output';
  const prefix = type === 'cmd' ? '<span class="terminal-prompt">mysql> </span>' : '';
  t.innerHTML += `${prefix}<span class="${cls}">${txt}</span><br>`;
  t.scrollTop = t.scrollHeight;
}

async function runQuery(){
  const q = document.getElementById('sql-input').value.trim();
  if (!q) return;
  printToTerminal(q, 'cmd');
  if (!state.connected){
    printToTerminal('ERROR 2002: No database connection. Click "Connect DB" first.', 'error');
    return;
  }
  try {
    const result = await apiFetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: q })
    });
    const rows = result.rows || [];
    if (rows.length) {
      const headers = Object.keys(rows[0]);
      let tbl = '<table class="terminal-table"><thead><tr>';
      tbl += headers.map(h => `<th>${h}</th>`).join('');
      tbl += '</tr></thead><tbody>';
      rows.forEach(row => {
        tbl += `<tr>${headers.map(h => `<td>${row[h]}</td>`).join('')}</tr>`;
      });
      tbl += '</tbody></table>';
      document.getElementById('terminal').innerHTML += tbl;
      printToTerminal(`${rows.length} rows in set`, 'success');
    } else {
      printToTerminal(result.info || 'Query OK', 'success');
    }
    await loadAllDataFromDb();
  } catch (error) {
    printToTerminal(error.message, 'error');
  }
}

async function renderSchema(){
  const cont = document.getElementById('schema-panels');
  if (cont.children.length) return;
  if (!state.connected) {
    cont.innerHTML = '<div style="color:var(--text-dim);font-family:var(--font-mono)">Connect DB to view schema.</div>';
    return;
  }
  try {
    const { tables, columns } = await apiFetch('/api/schema');
    const columnsByTable = new Map();
    columns.forEach(col => {
      if (!columnsByTable.has(col.table_name)) columnsByTable.set(col.table_name, []);
      columnsByTable.get(col.table_name).push(col);
    });

    cont.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px">
      ${tables.map(t => {
        const cols = columnsByTable.get(t.table_name) || [];
        return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px">
          <div style="font-family:var(--font-head);font-size:15px;font-weight:700;color:var(--accent);margin-bottom:14px;letter-spacing:1px">📋 ${t.table_name}</div>
          ${cols.map(c => {
            const isPK = c.column_key === 'PRI';
            const isUK = c.column_key === 'UNI';
            return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.18);font-family:var(--font-mono);font-size:11px">
              <span style="color:${isPK ? 'var(--accent)' : isUK ? 'var(--accent3)' : 'var(--text)'}">${c.column_name}</span>
              ${isPK ? '<span class="badge moderate" style="font-size:9px;padding:1px 5px">PK</span>' : ''}
              ${isUK ? '<span class="badge low" style="font-size:9px;padding:1px 5px">UK</span>' : ''}
            </div>`;
          }).join('')}
        </div>`;
      }).join('')}
    </div>`;
  } catch (error) {
    cont.innerHTML = `<div style="color:var(--text-dim);font-family:var(--font-mono)">Schema load failed: ${error.message}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderPatrols();
  document.querySelector('[onclick*="analytics"]').addEventListener('click', () => {
    setTimeout(renderCharts, 100);
  });
});

document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'Enter' && document.getElementById('section-query').classList.contains('active')) runQuery();
});
