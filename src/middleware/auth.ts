import { Request, Response, NextFunction } from 'express';

import { isAuthenticated } from '../auth.js';

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isAuthenticated(req.session as { authenticated?: boolean } | undefined)) {
    next();
    return;
  }
  res.redirect('/login');
}

export function requireAuthApi(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isAuthenticated(req.session as { authenticated?: boolean } | undefined)) {
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
  if (isAuthenticated(req.session as { authenticated?: boolean } | undefined)) {
    res.redirect('/');
    return;
  }
  next();
}
