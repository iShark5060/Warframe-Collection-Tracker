import Database from 'better-sqlite3';
import cookieParser from 'cookie-parser';
import { csrfSync } from 'csrf-sync';
import express from 'express';
import session from 'express-session';
import fs from 'fs';
import helmet from 'helmet';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

import { SQLITE_DB_PATH } from './config.js';
import { apiLimiter, generalLimiter } from './middleware/rateLimit.js';
import { apiRouter } from './routes/apiRouter.js';
import { registerPageRoutes } from './routes/pages.js';

const require = createRequire(import.meta.url);
const SQLiteStore = require('better-sqlite3-session-store')(session);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const viewsPath = __dirname.includes('dist')
  ? path.join(process.cwd(), 'dist', 'views')
  : path.join(process.cwd(), 'src', 'views');

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const SESSION_SECRET =
  process.env.SESSION_SECRET ?? 'warframe-tracker-dev-secret';
const TRUST_PROXY =
  process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
const SECURE_COOKIES =
  process.env.SECURE_COOKIES === '1' || process.env.SECURE_COOKIES === 'true';

if (TRUST_PROXY) {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', viewsPath);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionDb = new Database(SQLITE_DB_PATH);
const sessionStore = new SQLiteStore({
  client: sessionDb,
  expired: {
    clear: true,
    intervalMs: 15 * 60 * 1000,
  },
});

app.use(
  session({
    store: sessionStore,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: SECURE_COOKIES,
      sameSite: 'lax',
    },
  }),
);

const { csrfSynchronisedProtection, csrfToken, generateToken } = csrfSync({
  getTokenFromRequest: (req) =>
    (req.body && req.body._csrf) ||
    (req.query && req.query._csrf) ||
    (req.headers && (req.headers['x-csrf-token'] || req.headers['x-xsrf-token'])),
});

app.use((req, res, next) => {
  const method = req.method.toUpperCase();

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    // Generate and expose a CSRF token for safe methods
    generateToken(req);
    res.locals.csrfToken = csrfToken(req);
    return next();
  }

  // Enforce CSRF validation for unsafe methods
  return csrfSynchronisedProtection(req, res, next);
});

const { csrfSynchronisedProtection, generateToken } = csrfSync({
  getTokenFromRequest: (req: express.Request) => {
    if (req.body?._csrf) {
      return req.body._csrf as string;
    }
    const header = req.headers['x-csrf-token'];
    if (Array.isArray(header)) {
      return header[0] ?? null;
    }
    return (header as string | undefined) ?? null;
  },
});

app.use(csrfSynchronisedProtection);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  }),
);

app.get('/favicon.ico', generalLimiter, (req, res) => {
  const distPath = path.join(process.cwd(), 'dist', 'favicon.ico');
  const rootPath = path.join(process.cwd(), 'favicon.ico');
  const favicon = fs.existsSync(distPath) ? distPath : rootPath;
  res.sendFile(favicon, (err) => {
    if (err) res.status(404).end();
  });
});

app.use((req, res, next) => {
  res.locals.csrfToken = generateToken(req);
  next();
});

app.use('/api', apiLimiter, apiRouter);
registerPageRoutes(app);

app.listen(PORT, () => {
  console.log(
    `Warframe Collection Tracker running at http://localhost:${PORT}`,
  );
});
