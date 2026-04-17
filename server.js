const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5501;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

let dbPool = null;
let activeConfig = null;

function ensureConnected(res) {
  if (!dbPool) {
    res.status(400).json({ error: 'Database is not connected. Use /api/connect first.' });
    return false;
  }
  return true;
}

async function query(sql, params = []) {
  const [rows] = await dbPool.execute(sql, params);
  return rows;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, connected: !!dbPool, config: activeConfig });
});

app.post('/api/connect', async (req, res) => {
  const host = (req.body.host || process.env.DB_HOST || '').trim();
  const port = (req.body.port || process.env.DB_PORT || '').toString().trim();
  const user = (req.body.user || process.env.DB_USER || '').trim();
  const password = (req.body.password ?? process.env.DB_PASSWORD ?? '').toString();
  const database = (req.body.database || process.env.DB_NAME || '').trim();

  if (!host || !port || !user || !database) {
    res.status(400).json({ error: 'host, port, user, and database are required.' });
    return;
  }

  try {
    const pool = mysql.createPool({
      host,
      port: Number(port),
      user,
      password: password || '',
      database,
      waitForConnections: true,
      connectionLimit: 8
    });
    await pool.query('SELECT 1');

    if (dbPool) {
      await dbPool.end();
    }
    dbPool = pool;
    activeConfig = { host, port, user, database };

    res.json({ ok: true, message: `Connected to ${database}@${host}:${port}` });
  } catch (error) {
    res.status(500).json({ error: `Connection failed: ${error.message}` });
  }
});

app.get('/api/locations', async (_req, res) => {
  if (!ensureConnected(res)) return;
  try {
    const rows = await query(
      `SELECT location_id, area_name, city, district, latitude, longitude, zone_type
       FROM locations
       ORDER BY city, area_name`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/categories', async (_req, res) => {
  if (!ensureConnected(res)) return;
  try {
    const rows = await query(
      `SELECT category_id, category_name
       FROM crime_categories
       ORDER BY category_name`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/incidents', async (_req, res) => {
  if (!ensureConnected(res)) return;
  try {
    const rows = await query(
      `SELECT ci.fir_number AS id,
              DATE_FORMAT(ci.incident_date, '%Y-%m-%d') AS date,
              l.area_name AS loc,
              cc.category_name AS cat,
              ci.victim_count AS victims,
              ci.suspect_count AS suspects,
              ci.status,
              COALESCE(ci.severity_score, cc.severity) AS severity
       FROM crime_incidents ci
       JOIN locations l ON l.location_id = ci.location_id
       JOIN crime_categories cc ON cc.category_id = ci.category_id
       ORDER BY ci.incident_date DESC, ci.incident_id DESC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/hotspots', async (_req, res) => {
  if (!ensureConnected(res)) return;
  try {
    const rows = await query(
      `SELECT l.area_name AS area,
              l.city,
              ha.total_crimes AS crimes,
              ha.risk_score AS score,
              ha.risk_level AS level,
              COALESCE(cc.category_name, 'N/A') AS crime,
              ha.trend
       FROM hotspot_analysis ha
       JOIN locations l ON l.location_id = ha.location_id
       LEFT JOIN crime_categories cc ON cc.category_id = ha.dominant_crime
       JOIN (
         SELECT location_id, MAX(analysis_date) AS max_analysis_date
         FROM hotspot_analysis
         GROUP BY location_id
       ) latest ON latest.location_id = ha.location_id AND latest.max_analysis_date = ha.analysis_date
       ORDER BY ha.risk_score DESC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/alerts', async (_req, res) => {
  if (!ensureConnected(res)) return;
  try {
    const rows = await query(
      `SELECT a.alert_id AS id,
              a.priority,
              a.alert_type AS type,
              CONCAT(l.area_name, ', ', l.city) AS loc,
              a.message AS msg,
              CASE
                WHEN TIMESTAMPDIFF(HOUR, a.created_at, NOW()) < 24
                  THEN CONCAT(TIMESTAMPDIFF(HOUR, a.created_at, NOW()), ' hrs ago')
                ELSE CONCAT(TIMESTAMPDIFF(DAY, a.created_at, NOW()), ' days ago')
              END AS time,
              a.is_resolved AS resolved
       FROM alerts a
       JOIN locations l ON l.location_id = a.location_id
       ORDER BY a.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/suspects', async (_req, res) => {
  if (!ensureConnected(res)) return;
  try {
    const rows = await query(
      `SELECT s.suspect_id AS id,
              COALESCE(s.name, 'Unknown') AS name,
              COALESCE(s.age, '?') AS age,
              s.gender,
              ci.fir_number AS incident,
              COALESCE(s.nationality, 'Unknown') AS nat,
              s.arrested
       FROM suspects s
       JOIN crime_incidents ci ON ci.incident_id = s.incident_id
       ORDER BY s.suspect_id DESC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard-summary', async (_req, res) => {
  if (!ensureConnected(res)) return;
  try {
    const [incidentsCount] = await query('SELECT COUNT(*) AS total FROM crime_incidents');
    const [solvedCount] = await query("SELECT COUNT(*) AS solved FROM crime_incidents WHERE status = 'solved'");
    const [hotspotsCount] = await query(
      `SELECT COUNT(*) AS active_hotspots
       FROM (
         SELECT location_id, MAX(analysis_date) max_date
         FROM hotspot_analysis
         GROUP BY location_id
       ) latest
       JOIN hotspot_analysis ha ON ha.location_id = latest.location_id AND ha.analysis_date = latest.max_date
       WHERE ha.risk_level IN ('high', 'critical')`
    );
    const [alertsCount] = await query('SELECT COUNT(*) AS open_alerts FROM alerts WHERE is_resolved = 0');

    res.json({
      totalIncidents: incidentsCount.total || 0,
      solveRate: incidentsCount.total ? Math.round((solvedCount.solved / incidentsCount.total) * 100) : 0,
      activeHotspots: hotspotsCount.active_hotspots || 0,
      openAlerts: alertsCount.open_alerts || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/incidents', async (req, res) => {
  if (!ensureConnected(res)) return;
  try {
    const {
      firNumber,
      locationId,
      categoryId,
      incidentDate,
      incidentTime,
      victimCount,
      suspectCount,
      description,
      status
    } = req.body;

    if (!firNumber || !locationId || !categoryId || !incidentDate) {
      res.status(400).json({ error: 'firNumber, locationId, categoryId, and incidentDate are required.' });
      return;
    }

    await query(
      `INSERT INTO crime_incidents
         (fir_number, location_id, category_id, incident_date, incident_time, victim_count, suspect_count, description, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        firNumber,
        Number(locationId),
        Number(categoryId),
        incidentDate,
        incidentTime || null,
        Number(victimCount || 1),
        Number(suspectCount || 0),
        description || null,
        status || 'reported'
      ]
    );

    res.json({ ok: true, message: 'Incident inserted successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/patrols', async (req, res) => {
  if (!ensureConnected(res)) return;
  try {
    const { officerBadgeNo, locationId, patrolStart, patrolEnd, observations } = req.body;
    if (!officerBadgeNo || !locationId || !patrolStart) {
      res.status(400).json({ error: 'officerBadgeNo, locationId, and patrolStart are required.' });
      return;
    }

    const officers = await query('SELECT officer_id FROM officers WHERE badge_no = ? LIMIT 1', [officerBadgeNo]);
    if (!officers.length) {
      res.status(404).json({ error: `Officer with badge ${officerBadgeNo} was not found.` });
      return;
    }

    await query(
      `INSERT INTO patrol_logs (officer_id, location_id, patrol_start, patrol_end, observations)
       VALUES (?, ?, ?, ?, ?)`,
      [officers[0].officer_id, Number(locationId), patrolStart, patrolEnd || null, observations || null]
    );
    res.json({ ok: true, message: 'Patrol logged successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/patrols', async (_req, res) => {
  if (!ensureConnected(res)) return;
  try {
    const rows = await query(
      `SELECT pl.log_id AS id,
              o.badge_no AS badge,
              l.area_name AS location,
              DATE_FORMAT(pl.patrol_start, '%Y-%m-%d %H:%i') AS start,
              IFNULL(DATE_FORMAT(pl.patrol_end, '%Y-%m-%d %H:%i'), '—') AS end,
              IFNULL(pl.observations, '—') AS notes
       FROM patrol_logs pl
       JOIN officers o ON o.officer_id = pl.officer_id
       JOIN locations l ON l.location_id = pl.location_id
       ORDER BY pl.patrol_start DESC
       LIMIT 30`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/alerts/:id/resolve', async (req, res) => {
  if (!ensureConnected(res)) return;
  try {
    await query('UPDATE alerts SET is_resolved = 1, resolved_at = NOW() WHERE alert_id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/alerts/resolve-all', async (_req, res) => {
  if (!ensureConnected(res)) return;
  try {
    await query('UPDATE alerts SET is_resolved = 1, resolved_at = NOW() WHERE is_resolved = 0');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/query', async (req, res) => {
  if (!ensureConnected(res)) return;
  try {
    const sql = String(req.body.sql || '').trim();
    if (!sql) {
      res.status(400).json({ error: 'sql is required.' });
      return;
    }
    const firstWord = sql.split(/\s+/)[0].toLowerCase();
    const safeStatements = new Set(['select', 'show', 'describe', 'desc', 'call', 'insert', 'update']);
    if (!safeStatements.has(firstWord)) {
      res.status(400).json({ error: 'Only SELECT/SHOW/DESCRIBE/CALL/INSERT/UPDATE are allowed.' });
      return;
    }
    const [rows] = await dbPool.query(sql);
    res.json({ ok: true, rows: Array.isArray(rows) ? rows : [], info: Array.isArray(rows) ? `${rows.length} rows` : 'Query OK' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/schema', async (_req, res) => {
  if (!ensureConnected(res)) return;
  try {
    const tables = await query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );
    const columns = await query(
      `SELECT table_name, column_name, column_key
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
       ORDER BY table_name, ordinal_position`
    );
    res.json({ tables, columns });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
