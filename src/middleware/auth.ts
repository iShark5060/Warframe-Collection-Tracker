import { Request, Response, NextFunction } from 'express';

import { type AuthSession, isAuthenticated, isAdmin } from '../auth.js';

function getSession(req: Request): AuthSession {
  return req.session as AuthSession;
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isAuthenticated(getSession(req))) {
    next();
    return;
  }
  res.redirect('/login');
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const session = getSession(req);
  if (!isAuthenticated(session)) {
    res.redirect('/login');
    return;
  }
  if (!isAdmin(session)) {
    const wantsJson =
      typeof req.headers.accept === 'string' &&
      req.headers.accept.includes('application/json');
    if (wantsJson) {
      res.status(403).json({ error: 'Admin access required' });
    } else {
      res.status(403).send('Admin access required');
    }
    return;
  }
  next();
}

export function requireAuthApi(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isAuthenticated(getSession(req))) {
    next();
    return;
  }
  res.status(401).json({ error: 'Unauthorized' });
}

export function redirectIfAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isAuthenticated(getSession(req))) {
    res.redirect('/');
    return;
  }
  next();
}
