-- ============================================================
--  CRIME HOTSPOT ANALYSER — MariaDB / MySQL Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS crime_hotspot_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE crime_hotspot_db;

-- -----------------------------------------------------------
-- 1. LOCATIONS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  location_id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  city          VARCHAR(100)   NOT NULL,
  district      VARCHAR(100)   NOT NULL,
  area_name     VARCHAR(150)   NOT NULL,
  latitude      DECIMAL(10,7)  NOT NULL,
  longitude     DECIMAL(10,7)  NOT NULL,
  zone_type     ENUM('residential','commercial','industrial','rural','mixed') DEFAULT 'mixed',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_city_district (city, district),
  INDEX idx_coords (latitude, longitude)
) ENGINE=InnoDB;

-- -----------------------------------------------------------
-- 2. CRIME CATEGORIES
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS crime_categories (
  category_id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL UNIQUE,
  severity      TINYINT UNSIGNED NOT NULL COMMENT '1=low, 5=critical',
  description   TEXT,
  color_code    CHAR(7) DEFAULT '#FF0000' COMMENT 'HEX color for map markers'
) ENGINE=InnoDB;

INSERT INTO crime_categories (category_name, severity, description, color_code) VALUES
  ('Theft',            2, 'Shoplifting, pickpocketing, vehicle theft',   '#FFA500'),
  ('Assault',          3, 'Physical attack, battery',                    '#FF4500'),
  ('Burglary',         3, 'Breaking and entering a building',            '#FF6347'),
  ('Robbery',          4, 'Theft involving force or threat',             '#DC143C'),
  ('Homicide',         5, 'Murder and manslaughter',                     '#8B0000'),
  ('Fraud',            2, 'Financial fraud, identity theft',             '#DAA520'),
  ('Drug Offence',     3, 'Possession, trafficking of controlled drugs', '#9400D3'),
  ('Vandalism',        1, 'Property damage, graffiti',                   '#4682B4'),
  ('Sexual Offence',   5, 'Rape, molestation, harassment',              '#B22222'),
  ('Cybercrime',       2, 'Hacking, online scams',                       '#00CED1');

-- -----------------------------------------------------------
-- 3. OFFICERS / USERS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS officers (
  officer_id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  badge_no      VARCHAR(20)  NOT NULL UNIQUE,
  full_name     VARCHAR(150) NOT NULL,
  `rank`        VARCHAR(80)  NOT NULL,
  department    VARCHAR(120),
  email         VARCHAR(180) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('analyst','officer','supervisor','admin') DEFAULT 'officer',
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Demo admin (password: Admin@1234  — store bcrypt hash in production)
INSERT INTO officers (badge_no, full_name, `rank`, department, email, password_hash, role)
VALUES ('ADMIN001', 'System Admin', 'Inspector', 'Cyber & Analytics', 'admin@crimeanalyser.gov',
        '$2b$12$demoHashPlaceholderForDev', 'admin');

-- -----------------------------------------------------------
-- 4. CRIME INCIDENTS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS crime_incidents (
  incident_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fir_number      VARCHAR(50)    NOT NULL UNIQUE,
  location_id     INT UNSIGNED   NOT NULL,
  category_id     INT UNSIGNED   NOT NULL,
  reported_by     INT UNSIGNED            COMMENT 'officer_id',
  incident_date   DATE           NOT NULL,
  incident_time   TIME,
  day_of_week     TINYINT UNSIGNED GENERATED ALWAYS AS (DAYOFWEEK(incident_date)) STORED,
  victim_count    TINYINT UNSIGNED DEFAULT 1,
  suspect_count   TINYINT UNSIGNED DEFAULT 0,
  description     TEXT,
  status          ENUM('reported','under_investigation','solved','closed') DEFAULT 'reported',
  severity_score  TINYINT UNSIGNED,        -- overrides category default if needed
  weather         VARCHAR(60),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (location_id) REFERENCES locations(location_id) ON DELETE RESTRICT,
  FOREIGN KEY (category_id) REFERENCES crime_categories(category_id) ON DELETE RESTRICT,
  FOREIGN KEY (reported_by) REFERENCES officers(officer_id) ON DELETE SET NULL,
  INDEX idx_date (incident_date),
  INDEX idx_status (status),
  INDEX idx_location (location_id),
  INDEX idx_category (category_id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------
-- 5. SUSPECTS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS suspects (
  suspect_id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incident_id   INT UNSIGNED NOT NULL,
  name          VARCHAR(150),
  age           TINYINT UNSIGNED,
  gender        ENUM('male','female','other','unknown') DEFAULT 'unknown',
  nationality   VARCHAR(80),
  description   TEXT,
  arrested      BOOLEAN DEFAULT FALSE,
  arrest_date   DATE,
  FOREIGN KEY (incident_id) REFERENCES crime_incidents(incident_id) ON DELETE CASCADE,
  INDEX idx_incident (incident_id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------
-- 6. HOTSPOT ANALYSIS (pre-computed / cached results)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS hotspot_analysis (
  hotspot_id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  location_id     INT UNSIGNED NOT NULL,
  analysis_date   DATE NOT NULL,
  total_crimes    INT UNSIGNED DEFAULT 0,
  dominant_crime  INT UNSIGNED COMMENT 'category_id of most frequent crime',
  risk_score      DECIMAL(5,2)  DEFAULT 0.00 COMMENT '0-100 risk scale',
  risk_level      ENUM('low','moderate','high','critical') DEFAULT 'low',
  trend           ENUM('increasing','stable','decreasing') DEFAULT 'stable',
  notes           TEXT,
  FOREIGN KEY (location_id)   REFERENCES locations(location_id) ON DELETE CASCADE,
  FOREIGN KEY (dominant_crime) REFERENCES crime_categories(category_id) ON DELETE SET NULL,
  UNIQUE KEY uq_loc_date (location_id, analysis_date),
  INDEX idx_risk (risk_level),
  INDEX idx_date (analysis_date)
) ENGINE=InnoDB;

-- -----------------------------------------------------------
-- 7. PATROL LOGS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS patrol_logs (
  log_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  officer_id    INT UNSIGNED NOT NULL,
  location_id   INT UNSIGNED NOT NULL,
  patrol_start  DATETIME NOT NULL,
  patrol_end    DATETIME,
  observations  TEXT,
  FOREIGN KEY (officer_id)  REFERENCES officers(officer_id)  ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(location_id) ON DELETE CASCADE,
  INDEX idx_officer (officer_id),
  INDEX idx_patrol_date (patrol_start)
) ENGINE=InnoDB;

-- -----------------------------------------------------------
-- 8. ALERTS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
  alert_id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  location_id   INT UNSIGNED NOT NULL,
  category_id   INT UNSIGNED,
  alert_type    ENUM('spike','pattern','predicted','manual') DEFAULT 'manual',
  priority      ENUM('low','medium','high','critical') DEFAULT 'medium',
  message       VARCHAR(500) NOT NULL,
  is_resolved   BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at   TIMESTAMP NULL,
  FOREIGN KEY (location_id) REFERENCES locations(location_id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES crime_categories(category_id) ON DELETE SET NULL,
  INDEX idx_priority (priority),
  INDEX idx_resolved (is_resolved)
) ENGINE=InnoDB;

-- -----------------------------------------------------------
-- SAMPLE DATA — Locations
-- -----------------------------------------------------------
INSERT INTO locations (city, district, area_name, latitude, longitude, zone_type) VALUES
  ('Delhi',   'Central',   'Connaught Place',  28.6329,  77.2195, 'commercial'),
  ('Delhi',   'North',     'Chandni Chowk',    28.6506,  77.2334, 'commercial'),
  ('Delhi',   'South',     'Lajpat Nagar',     28.5677,  77.2433, 'residential'),
  ('Mumbai',  'South',     'Colaba',           18.9220,  72.8347, 'mixed'),
  ('Mumbai',  'Central',   'Dharavi',          19.0415,  72.8534, 'residential'),
  ('Kolkata', 'Central',   'Park Street',      22.5515,  88.3510, 'commercial'),
  ('Chennai', 'North',     'Royapuram',        13.1120,  80.2924, 'industrial'),
  ('Bengaluru','East',     'Whitefield',       12.9698,  77.7499, 'mixed'),
  ('Delhi',   'Central',   'Karol Bagh',       28.6518,  77.1909, 'commercial'),
  ('Delhi',   'South',     'Saket',            28.5245,  77.2066, 'mixed'),
  ('Mumbai',  'West',      'Bandra West',      19.0596,  72.8295, 'mixed'),
  ('Mumbai',  'East',      'Andheri East',     19.1136,  72.8697, 'commercial'),
  ('Kolkata', 'East',      'Salt Lake',        22.5867,  88.4171, 'residential'),
  ('Chennai', 'Central',   'T Nagar',          13.0418,  80.2337, 'commercial'),
  ('Bengaluru','Central',  'Indiranagar',      12.9784,  77.6408, 'mixed'),
  ('Bengaluru','South',    'Electronic City',  12.8399,  77.6770, 'industrial');

-- -----------------------------------------------------------
-- SAMPLE DATA — Incidents
-- -----------------------------------------------------------
INSERT INTO crime_incidents (fir_number, location_id, category_id, incident_date, incident_time, victim_count, suspect_count, description, status, severity_score)
VALUES
  ('FIR/2024/001', 1, 1, '2024-01-05', '14:30:00', 1, 1, 'Mobile phone snatched near metro gate', 'solved', 2),
  ('FIR/2024/002', 2, 2, '2024-01-07', '22:15:00', 2, 2, 'Fight outside restaurant, two injured', 'closed', 3),
  ('FIR/2024/003', 3, 3, '2024-01-10', '03:00:00', 1, 1, 'House broken into, jewellery stolen', 'under_investigation', 3),
  ('FIR/2024/004', 4, 4, '2024-01-12', '20:45:00', 1, 3, 'Bag snatching at knife-point', 'under_investigation', 4),
  ('FIR/2024/005', 5, 6, '2024-01-14', '11:00:00', 5, 1, 'Bank fraud via fake investment scheme', 'reported', 2),
  ('FIR/2024/006', 6, 7, '2024-01-16', '01:30:00', 0, 2, 'Drug peddling caught near park', 'solved', 3),
  ('FIR/2024/007', 7, 8, '2024-01-18', '16:00:00', 0, 0, 'Factory wall vandalized with graffiti', 'closed', 1),
  ('FIR/2024/008', 8, 10,'2024-01-20', '09:00:00', 3, 1, 'Corporate espionage via phishing', 'under_investigation', 2),
  ('FIR/2024/009', 1, 2, '2024-02-01', '23:50:00', 1, 1, 'Assault near CP parking area', 'reported', 3),
  ('FIR/2024/010', 2, 1, '2024-02-03', '13:10:00', 1, 2, 'Wallet stolen in crowded market', 'solved', 2);

-- -----------------------------------------------------------
-- SAMPLE DATA — Suspects
-- -----------------------------------------------------------
INSERT INTO suspects (incident_id, name, age, gender, nationality, description, arrested, arrest_date) VALUES
  (1, 'Rahul Verma', 24, 'male',   'Indian',  'Identified via CCTV near metro gate', TRUE,  '2024-01-08'),
  (2, 'Unknown',     28, 'male',   'Indian',  'Involved in late-night fight; fled scene', FALSE, NULL),
  (4, 'Imran Khan',  31, 'male',   'Indian',  'Knife-point snatching gang member', FALSE, NULL),
  (5, 'Neha Gupta',  29, 'female', 'Indian',  'Suspected mastermind of investment scam', FALSE, NULL),
  (6, 'Unknown',     22, 'unknown','Unknown', 'Drug peddling suspect apprehended nearby', TRUE, '2024-01-16');

-- -----------------------------------------------------------
-- SAMPLE DATA — Hotspot Analysis
-- -----------------------------------------------------------
INSERT INTO hotspot_analysis (location_id, analysis_date, total_crimes, dominant_crime, risk_score, risk_level, trend) VALUES
  (1, '2024-02-01', 12, 2, 78.50, 'high',     'increasing'),
  (2, '2024-02-01', 19, 1, 91.00, 'critical',  'increasing'),
  (3, '2024-02-01',  5, 3, 42.00, 'moderate',  'stable'),
  (4, '2024-02-01',  8, 4, 65.00, 'high',      'stable'),
  (5, '2024-02-01',  3, 6, 28.00, 'low',       'decreasing'),
  (6, '2024-02-01',  7, 7, 55.00, 'moderate',  'stable'),
  (7, '2024-02-01',  2, 8, 15.00, 'low',       'decreasing'),
  (8, '2024-02-01',  4, 10,35.00, 'moderate',  'increasing');

-- -----------------------------------------------------------
-- SAMPLE DATA — Alerts
-- -----------------------------------------------------------
INSERT INTO alerts (location_id, category_id, alert_type, priority, message) VALUES
  (2, 1, 'spike',    'critical', 'Theft incidents surged 40% in Chandni Chowk — increase patrols.'),
  (1, 2, 'pattern',  'high',     'Repeated assault reports after 10 PM near Connaught Place.'),
  (4, 4, 'predicted','high',     'Model predicts robbery spike this weekend in Colaba.'),
  (3, 3, 'manual',   'medium',   'Two burglaries reported in same block — area watch advised.');

-- -----------------------------------------------------------
-- USEFUL VIEWS
-- -----------------------------------------------------------

-- Summary per location
CREATE OR REPLACE VIEW v_crime_summary AS
SELECT
  l.location_id,
  l.city,
  l.district,
  l.area_name,
  l.latitude,
  l.longitude,
  COUNT(ci.incident_id)                        AS total_incidents,
  SUM(ci.victim_count)                         AS total_victims,
  ROUND(AVG(cc.severity),1)                    AS avg_severity,
  MAX(ha.risk_score)                           AS risk_score,
  MAX(ha.risk_level)                           AS risk_level,
  MAX(ha.trend)                                AS trend
FROM locations l
LEFT JOIN crime_incidents ci   ON ci.location_id  = l.location_id
LEFT JOIN crime_categories cc  ON cc.category_id  = ci.category_id
LEFT JOIN hotspot_analysis ha  ON ha.location_id  = l.location_id
GROUP BY l.location_id, l.city, l.district, l.area_name, l.latitude, l.longitude;

-- Monthly trend
CREATE OR REPLACE VIEW v_monthly_trend AS
SELECT
  DATE_FORMAT(incident_date,'%Y-%m') AS month,
  cc.category_name,
  COUNT(*)                           AS incident_count
FROM crime_incidents ci
JOIN crime_categories cc ON cc.category_id = ci.category_id
GROUP BY month, cc.category_name
ORDER BY month;

-- Top hotspots
CREATE OR REPLACE VIEW v_top_hotspots AS
SELECT
  l.area_name, l.city,
  ha.total_crimes, ha.risk_score, ha.risk_level, ha.trend,
  cc.category_name AS dominant_crime,
  cc.color_code
FROM hotspot_analysis ha
JOIN locations       l  ON l.location_id   = ha.location_id
LEFT JOIN crime_categories cc ON cc.category_id = ha.dominant_crime
ORDER BY ha.risk_score DESC;

-- -----------------------------------------------------------
-- STORED PROCEDURE — Recompute hotspot risk score
-- -----------------------------------------------------------
DELIMITER $$
CREATE PROCEDURE IF NOT EXISTS sp_update_hotspot(IN p_location_id INT UNSIGNED, IN p_date DATE)
BEGIN
  DECLARE v_total   INT DEFAULT 0;
  DECLARE v_avg_sev DECIMAL(4,2) DEFAULT 0;
  DECLARE v_dom_cat INT UNSIGNED DEFAULT NULL;
  DECLARE v_risk    DECIMAL(5,2) DEFAULT 0;
  DECLARE v_level   VARCHAR(20) DEFAULT 'low';

  -- Count incidents
  SELECT COUNT(*), COALESCE(AVG(COALESCE(ci.severity_score, cc.severity)),1)
  INTO v_total, v_avg_sev
  FROM crime_incidents ci
  JOIN crime_categories cc ON cc.category_id = ci.category_id
  WHERE ci.location_id = p_location_id AND ci.incident_date <= p_date;

  -- Dominant category
  SELECT ci.category_id INTO v_dom_cat
  FROM crime_incidents ci
  WHERE ci.location_id = p_location_id
  GROUP BY ci.category_id
  ORDER BY COUNT(*) DESC LIMIT 1;

  -- Risk score = weighted formula
  SET v_risk = LEAST(100, (v_total * v_avg_sev * 3.5));

  SET v_level = CASE
    WHEN v_risk >= 80 THEN 'critical'
    WHEN v_risk >= 55 THEN 'high'
    WHEN v_risk >= 30 THEN 'moderate'
    ELSE 'low'
  END;

  INSERT INTO hotspot_analysis
    (location_id, analysis_date, total_crimes, dominant_crime, risk_score, risk_level)
  VALUES
    (p_location_id, p_date, v_total, v_dom_cat, v_risk, v_level)
  ON DUPLICATE KEY UPDATE
    total_crimes  = v_total,
    dominant_crime= v_dom_cat,
    risk_score    = v_risk,
    risk_level    = v_level;
END$$
DELIMITER ;

-- Done!
SELECT 'Crime Hotspot Analyser database created successfully.' AS status;