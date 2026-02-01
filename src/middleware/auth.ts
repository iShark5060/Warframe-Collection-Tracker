import { Request, Response, NextFunction } from 'express';

import { isAuthenticated, isAdmin } from '../auth.js';

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isAuthenticated(req.session as { user_id?: number } | undefined)) {
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
  if (!isAuthenticated(req.session as { user_id?: number } | undefined)) {
    res.redirect('/login');
    return;
  }
  if (!isAdmin(req.session as { is_admin?: boolean } | undefined)) {
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
  if (isAuthenticated(req.session as { user_id?: number } | undefined)) {
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
  if (isAuthenticated(req.session as { user_id?: number } | undefined)) {
    res.redirect('/');
    return;
  }
  next();
}
