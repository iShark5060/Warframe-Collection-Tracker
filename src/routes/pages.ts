import { Application, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

import {
  attemptLogin,
  getClientIP,
  isLockedOut,
  getLockoutRemaining,
} from '../auth.js';
import { APP_NAME } from '../config.js';
import { requireAuth, redirectIfAuthenticated } from '../middleware/auth.js';
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
          csrfToken: res.locals.csrfToken ?? '',
          esc,
        });
      }

      const username = String(req.body?.username ?? '').trim();
      const password = String(req.body?.password ?? '');

      const result = await attemptLogin(username, password, ip);

      if (result.success) {
        const loginErrorPayload = {
          appName: APP_NAME,
          art,
          error: 'Session error. Please try again.',
          lockedOut: false as const,
          lockoutRemaining: 0,
          csrfToken: res.locals.csrfToken ?? '',
          esc,
        };
        return void req.session.regenerate((err) => {
          if (err) {
            res.render('login', loginErrorPayload);
            return;
          }
          req.session.authenticated = true;
          req.session.loginTime = Math.floor(Date.now() / 1000);
          req.session.save((saveErr) => {
            if (saveErr) {
              res.render('login', loginErrorPayload);
              return;
            }
            res.redirect('/');
          });
        });
      }

      return res.render('login', {
        appName: APP_NAME,
        art,
        error: result.error,
        lockedOut: isLockedOut(ip),
        lockoutRemaining: getLockoutRemaining(ip),
        csrfToken: res.locals.csrfToken ?? '',
        esc,
      });
    },
  );

  app.post('/logout', generalLimiter, (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });

  app.get('/', generalLimiter, requireAuth, (req: Request, res: Response) => {
    res.render('index', {
      appName: APP_NAME,
      art,
      esc,
      csrfToken: res.locals.csrfToken ?? '',
    });
  });

  app.get(
    '/admin',
    adminLimiter,
    requireAuth,
    (req: Request, res: Response) => {
      res.render('admin', {
        appName: APP_NAME,
        art,
        esc,
        csrfToken: res.locals.csrfToken ?? '',
      });
    },
  );
}
