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
  if (!isAuthenticated(getSession(req))) {
    res.redirect('/login');
    return;
  }
  if (!isAdmin(getSession(req))) {
    res.status(403).send('Admin access required');
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
