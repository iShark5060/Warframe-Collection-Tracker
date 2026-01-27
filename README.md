# Warframe Collection Tracker

A TypeScript/Node.js web app for tracking your Warframe collection (Warframes, weapons, accessories, etc.). Built with Express, SQLite, and EJS.

## Requirements

- **Node.js** 18+
- **Build tools** (for `better-sqlite3` on Windows):  
  [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **“Desktop development with C++”** workload.  
  On Linux/macOS, common build tools (e.g. `build-essential`, Xcode CLI) are usually enough.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

   If `better-sqlite3` fails to build on Windows, install the build tools above and run `npm install` again.

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set at least:
   - `AUTH_USERNAME` / `AUTH_PASSWORD` – login credentials
   - `SESSION_SECRET` – secret for session cookies (use a long random string in production)

3. **Create folders**

   ```bash
   mkdir -p data import
   ```

4. **Import data (optional)**

   Place CSV files in the `import/` folder (see [CSV format](#csv-format) below), then:

   ```bash
   npm run import
   ```

   This creates `data/collection.db` and (re)builds the schema. **Warning:** Import overwrites existing data.

5. **Run the app**

   ```bash
   npm run dev    # development (ts-node-dev)
   npm start      # production (after npm run build)
   ```

   By default the app runs at **http://localhost:3000**. Use `PORT` in `.env` to change it.

## Deployment (Apache + HTTPS on 443)

To serve the app behind **Apache** on port 443 (HTTPS):

1. Run the Node app as a service (e.g. **PM2** or **systemd**) on a local port (e.g. `3000`).
2. Set `TRUST_PROXY=1` and `SECURE_COOKIES=1` in `.env`.
3. Use Apache as a **reverse proxy**: enable `mod_proxy`, `mod_proxy_http`, `mod_ssl`, then `ProxyPass` / `ProxyPassReverse` to `http://127.0.0.1:3000/`.

See **[DEPLOY.md](DEPLOY.md)** for step‑by‑step Apache config, PM2/systemd examples, and troubleshooting.

## CSV format

Each CSV file = one worksheet/tab. Semicolon-delimited by default (`CSV_DELIMITER` in `.env`).

- **Row 1:** Worksheet name (e.g. `Warframes;;`)
- **Row 2:** Column headers. First column = “Name”, then status columns (e.g. `Name;Normal;Prime`)
- **Row 3+:** Data rows. First column = item name, then status values per column.

Allowed status values: empty, `Obtained`, `Complete`, `Unavailable`.

## Routes

| Route     | Description                               |
| --------- | ----------------------------------------- |
| `/`       | Main tracker (tabs, search)               |
| `/admin`  | Add/edit/delete items, set any status     |
| `/login`  | Login                                     |
| `/logout` | Logout                                    |
| `/api`    | JSON API (worksheets, data, update, CRUD) |

API usage: `GET /api?action=worksheets`, `GET /api?action=data&worksheet=1`,  
`POST /api?action=update` with JSON `{ row_id, column_id, value }`, etc.

## Project layout

```
├── src/
│   ├── index.ts          # Express app
│   ├── config.ts         # Env config
│   ├── auth.ts           # Login, lockout
│   ├── db/               # SQLite schema & queries
│   ├── middleware/       # Auth middleware
│   ├── routes/           # API & page routes
│   ├── views/            # EJS (index, login, admin)
│   ├── scripts/          # Import script
│   └── types/            # Session typings
├── data/                 # SQLite DB, lockout JSON (gitignored)
├── import/               # CSV files (gitignored)
├── .env.example
├── package.json
└── tsconfig.json
```

## Scripts

- `npm run dev` – run with ts-node-dev
- `npm run build` – compile TypeScript to `dist/`
- `npm start` – run compiled app
- `npm run import` – run CSV import

## License

MIT
