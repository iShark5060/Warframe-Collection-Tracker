import { Request, Response, NextFunction } from 'express';

import * as api from './api.js';
import { requireAuthApi } from '../middleware/auth.js';

function getAction(req: Request): string {
  const q = (req.query?.action as string) ?? '';
  const b = (req.body as { action?: string })?.action ?? '';
  return (q || b || '').trim();
}

function unknownAction(res: Response, action: string): void {
  res.status(400).json({ error: `Unknown action: ${action || '(empty)'}` });
}

export function apiRouter(
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  requireAuthApi(req, res, () => {
    const action = getAction(req);
    switch (action) {
      case 'worksheets':
        api.handleWorksheets(req, res);
        break;
      case 'data':
        api.handleData(req, res);
        break;
      case 'update':
        api.handleUpdate(req, res);
        break;
      case 'add_row':
        api.handleAddRow(req, res);
        break;
      case 'edit_row':
        api.handleEditRow(req, res);
        break;
      case 'delete_row':
        api.handleDeleteRow(req, res);
        break;
      case 'admin_update':
        api.handleAdminUpdate(req, res);
        break;
      default:
        unknownAction(res, action);
    }
  });
}
