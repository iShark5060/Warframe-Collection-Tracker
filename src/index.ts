import cookieParser from 'cookie-parser';
import express from 'express';
import session from 'express-session';
import Database from 'better-sqlite3';
import lusca from 'lusca';
import path from 'path';
import { createRequire } from 'module';

import { SQLITE_DB_PATH } from './config.js';
import { apiLimiter, generalLimiter } from './middleware/rateLimit.js';
import { apiRouter } from './routes/apiRouter.js';
import { registerPageRoutes } from './routes/pages.js';

const require = createRequire(import.meta.url);
const SQLiteStore = require('better-sqlite3-session-store')(session);

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
app.set('views', path.join(process.cwd(), 'src', 'views'));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionDb = new Database(SQLITE_DB_PATH);
const sessionStore = new SQLiteStore({
  client: sessionDb,
  expired: {
    clear: true,
    intervalMs: 15 * 60 * 1000, // Clean up expired sessions every 15 minutes
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

app.use(lusca.csrf());

app.use('/api', apiLimiter, apiRouter);
registerPageRoutes(app);

app.get('/favicon.ico', generalLimiter, (req, res) => {
  const favicon = path.join(process.cwd(), 'favicon.ico');
  res.sendFile(favicon, (err) => {
    if (err) res.status(404).end();
  });
});

app.listen(PORT, () => {
  console.log(
    `Warframe Collection Tracker running at http://localhost:${PORT}`,
  );
});
