import { Application, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

import {
  attemptLogin,
  getClientIP,
  isLockedOut,
  getLockoutRemaining,
} from '../auth';
import { APP_NAME } from '../config';
import { requireAuth, redirectIfAuthenticated } from '../middleware/auth';
import {
  generalLimiter,
  loginLimiter,
  adminLimiter,
} from '../middleware/rateLimit';

const BACKGROUND_PATH = path.join(process.cwd(), 'background.txt');

function getBackgroundArt(): string {
  if (!fs.existsSync(BACKGROUND_PATH)) return '';
  try {
    return fs.readFileSync(BACKGROUND_PATH, 'utf-8');
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
        esc,
      });
    },
  );

  app.post(
    '/login',
    loginLimiter,
    redirectIfAuthenticated,
    (req: Request, res: Response) => {
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
          esc,
        });
      }

      const username = String(req.body?.username ?? '').trim();
      const password = String(req.body?.password ?? '');

      const result = attemptLogin(username, password, ip);

      if (result.success) {
        req.session.authenticated = true;
        req.session.loginTime = Math.floor(Date.now() / 1000);
        return res.redirect('/');
      }

      return res.render('login', {
        appName: APP_NAME,
        art,
        error: result.error,
        lockedOut: isLockedOut(ip),
        lockoutRemaining: getLockoutRemaining(ip),
        esc,
      });
    },
  );

  app.get('/logout', (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });

  app.get(
    '/',
    generalLimiter,
    requireAuth,
    (_req: Request, res: Response) => {
      res.render('index', { appName: APP_NAME, art, esc });
    },
  );

  app.get(
    '/admin',
    adminLimiter,
    requireAuth,
    (_req: Request, res: Response) => {
      res.render('admin', { appName: APP_NAME, art, esc });
    },
  );
}
