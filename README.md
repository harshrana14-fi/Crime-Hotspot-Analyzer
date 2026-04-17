# Crime Hotspot Analyzer (Mini Project)

A simple **crime hotspot analysis dashboard** built with:

- **Frontend**: HTML + CSS + Vanilla JS + Chart.js
- **Backend**: Node.js (Express)
- **Database**: MySQL / MariaDB (schema + seed data in `cirme-hotspot.db`)

The UI shows incidents, hotspot scores, alerts, suspects, patrol logs, and basic charts.  
All dynamic data is fetched from your database through the backend API (no hardcoded lists).

---

## Features

- Dashboard summary (total incidents, solve rate, open alerts, active hotspots)
- Hotspot list + map table (based on `hotspot_analysis`)
- Incidents list + filtering
- Add Incident (inserts into `crime_incidents`)
- Alerts (resolve single / resolve all)
- Patrol logs (insert + view recent patrols)
- SQL terminal (runs queries through backend)
- DB schema viewer (reads from `information_schema`)

---

## Requirements

- **Node.js** (recommended: recent LTS)
- **MySQL** or **MariaDB**

---

## 1) Create the database

1. Open your MySQL/MariaDB client (Workbench / phpMyAdmin / terminal).
2. Run the SQL script:
   - `cirme-hotspot.db`

This creates the database `crime_hotspot_db`, tables, views, and sample data.

---

## 2) Install dependencies

From the project folder:

```bash
npm install
```

---

## 3) Run the app

Start the backend server:

```bash
npm start
```

Open in browser:

- `http://localhost:5501/index.html`

---

## Usage

1. Click **Connect DB**
2. Enter your DB credentials
3. After connection:
   - Locations dropdowns, tables, and charts load from DB
   - Adding incidents/patrols writes to DB and refreshes the UI

---

## Project files

- `index.html` — UI layout
- `style.css` — black/white minimal theme
- `script.js` — frontend logic (fetches data from backend)
- `server.js` — Express API + static file server
- `cirme-hotspot.db` — MySQL/MariaDB schema + seed data

---

## Troubleshooting

- **Port already in use**
  - Stop the other process using port `5501`, then run `npm start` again.

- **Can’t connect to DB**
  - Verify MySQL is running
  - Check host/port/user/password/database
  - Ensure `crime_hotspot_db` exists (SQL script executed successfully)

