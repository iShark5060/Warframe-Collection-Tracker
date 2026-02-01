import { Application, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

import {
  attemptLogin,
  getClientIP,
  isLockedOut,
  getLockoutRemaining,
  createUser,
} from '../auth.js';
import { APP_NAME, SQLITE_DB_PATH } from '../config.js';
import {
  requireAuth,
  requireAdmin,
  redirectIfAuthenticated,
} from '../middleware/auth.js';
import {
  generalLimiter,
  loginLimiter,
  adminLimiter,
} from '../middleware/rateLimit.js';

function getBackgroundArt(): string {
  const distPath = path.join(process.cwd(), 'dist', 'background.txt');
  const rootPath = path.join(process.cwd(), 'background.txt');

  const backgroundPath = fs.existsSync(distPath) ? distPath : rootPath;

  if (!fs.existsSync(backgroundPath)) return '';
  try {
    return fs.readFileSync(backgroundPath, 'utf-8');
  } catch {
    return '';
  }
}

function esc(s: unknown): string {
  if (s == null) return '';
  const str = String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function dbExists(): boolean {
  return fs.existsSync(SQLITE_DB_PATH);
}

export function registerPageRoutes(app: Application): void {
  const art = getBackgroundArt();

  app.get(
    '/login',
    generalLimiter,
    redirectIfAuthenticated,
    (req: Request, res: Response) => {
      const ip = getClientIP(req);
      const lockedOut = isLockedOut(ip);
      const lockoutRemaining = getLockoutRemaining(ip);
      res.render('login', {
        appName: APP_NAME,
        art,
        error: '',
        lockedOut,
        lockoutRemaining,
        dbExists: dbExists(),
        csrfToken: res.locals.csrfToken ?? '',
        esc,
      });
    },
  );

  app.post(
    '/login',
    loginLimiter,
    redirectIfAuthenticated,
    async (req: Request, res: Response) => {
      const ip = getClientIP(req);
      const lockedOut = isLockedOut(ip);
      const lockoutRemaining = getLockoutRemaining(ip);

      if (lockedOut) {
        return res.render('login', {
          appName: APP_NAME,
          art,
          error: 'Too many failed attempts. Try again later.',
          lockedOut: true,
          lockoutRemaining,
          dbExists: dbExists(),
          csrfToken: res.locals.csrfToken ?? '',
          esc,
        });
      }

      const username = String(req.body?.username ?? '').trim();
      const password = String(req.body?.password ?? '');

      const result = await attemptLogin(username, password, ip);

      if (result.success && result.user) {
        const user = result.user;

        const loginErrorPayload = () =>
          res.render('login', {
            appName: APP_NAME,
            art,
            error: 'Session error. Please try again.',
            lockedOut: false as const,
            lockoutRemaining: 0,
            dbExists: dbExists(),
            csrfToken: res.locals.csrfToken ?? '',
            esc,
          });

        req.session.regenerate((err) => {
          if (err) {
            loginErrorPayload();
            return;
          }
          req.session.user_id = user.id;
          req.session.username = user.username;
          req.session.is_admin = Boolean(user.is_admin);
          req.session.login_time = Math.floor(Date.now() / 1000);
          req.session.save((saveErr) => {
            if (saveErr) {
              return loginErrorPayload();
            }
            return res.redirect('/');
          });
          return;
        });
        // eslint-disable-next-line consistent-return -- regenerate path returns void; other paths return Response
        return;
      }

      // Any non-success: !result.success or result.success but missing result.user
      const errorMessage =
        !result.success ? result.error : 'Invalid login response. Please try again.';
      return res.render('login', {
        appName: APP_NAME,
        art,
        error: errorMessage,
        lockedOut: isLockedOut(ip),
        lockoutRemaining: getLockoutRemaining(ip),
        dbExists: dbExists(),
        csrfToken: res.locals.csrfToken ?? '',
        esc,
      });
    },
  );

  app.post(
    '/logout',
    generalLimiter,
    requireAuth,
    (req: Request, res: Response) => {
      req.session.destroy(() => {
        res.redirect('/login');
      });
    },
  );

  app.get('/', generalLimiter, requireAuth, (req: Request, res: Response) => {
    res.render('index', {
      appName: APP_NAME,
      art,
      isAdmin: Boolean(req.session.is_admin),
      esc,
      csrfToken: res.locals.csrfToken ?? '',
    });
  });

  app.get(
    '/admin',
    adminLimiter,
    requireAdmin,
    (req: Request, res: Response) => {
      res.render('admin', {
        appName: APP_NAME,
        art,
        esc,
        csrfToken: res.locals.csrfToken ?? '',
      });
    },
  );

  app.get(
    '/register',
    adminLimiter,
    requireAdmin,
    (req: Request, res: Response) => {
      res.render('register', {
        appName: APP_NAME,
        art,
        error: '',
        success: '',
        csrfToken: res.locals.csrfToken ?? '',
      });
    },
  );

  app.post(
    '/register',
    adminLimiter,
    requireAdmin,
    async (req: Request, res: Response) => {
      const username = String(req.body?.username ?? '').trim();
      const password = String(req.body?.password ?? '');
      const confirmPassword = String(req.body?.confirm_password ?? '');
      const isAdminUser = Boolean(req.body?.is_admin);

      let error = '';
      let success = '';

      if (!username || !password) {
        error = 'Username and password are required.';
      } else if (password !== confirmPassword) {
        error = 'Passwords do not match.';
      } else {
        const result = await createUser(username, password, isAdminUser);
        if (result.success) {
          success = `User '${esc(username)}' created successfully!`;
        } else {
          error = result.error;
        }
      }

      res.render('register', {
        appName: APP_NAME,
        art,
        error,
        success,
        username: error ? username : '',
        csrfToken: res.locals.csrfToken ?? '',
      });
    },
  );
}
