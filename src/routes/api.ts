import { Request, Response } from 'express';
import fs from 'fs';

import { DEBUG_MODE, SQLITE_DB_PATH, VALID_STATUSES } from '../config';
import * as q from '../db/queries';
import { getDb } from '../db/schema';

type JsonResponse = (data: object, status?: number) => void;

function jsonResponse(res: Response): JsonResponse {
  return (data: object, status = 200) => {
    res.status(status).json(data);
  };
}

function jsonError(res: Response, message: string, status = 400): void {
  res.status(status).json({ error: message });
}

function getDbOrFail(res: Response): ReturnType<typeof getDb> | null {
  if (!fs.existsSync(SQLITE_DB_PATH)) {
    jsonError(res, 'Database not found. Please run import first.', 500);
    return null;
  }
  try {
    return getDb();
  } catch (e) {
    const msg =
      DEBUG_MODE && e instanceof Error
        ? e.message
        : 'Database connection failed.';
    jsonError(res, msg, 500);
    return null;
  }
}

const ALLOWED_UPDATE_VALUES = ['', 'Obtained', 'Complete'];

export function handleWorksheets(_req: Request, res: Response): void {
  const db = getDbOrFail(res);
  if (!db) return;
  try {
    const worksheets = q.getWorksheets(db);
    jsonResponse(res)({ worksheets });
  } finally {
    db.close();
  }
}

export function handleData(req: Request, res: Response): void {
  const db = getDbOrFail(res);
  if (!db) return;
  try {
    let worksheetId = parseInt(String(req.query.worksheet ?? '0'), 10);
    if (worksheetId <= 0) {
      const first = q.getFirstWorksheetId(db);
      if (!first) {
        jsonError(res, 'No worksheets found.', 404);
        return;
      }
      worksheetId = first;
    }
    const data = q.getWorksheetData(db, worksheetId);
    if (!data) {
      jsonError(res, 'Worksheet not found.', 404);
      return;
    }
    jsonResponse(res)({
      worksheet: data.worksheet,
      columns: data.columns,
      rows: data.rows,
    });
  } finally {
    db.close();
  }
}

export function handleUpdate(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    jsonError(res, 'POST method required.', 405);
    return;
  }
  const body = req.body as {
    row_id?: number;
    column_id?: number;
    value?: string;
  };
  const rowId = parseInt(String(body?.row_id ?? 0), 10);
  const columnId = parseInt(String(body?.column_id ?? 0), 10);
  const value = String(body?.value ?? '').trim();

  if (rowId <= 0 || columnId <= 0) {
    jsonError(res, 'Invalid row_id or column_id.');
    return;
  }
  if (!ALLOWED_UPDATE_VALUES.includes(value)) {
    jsonError(res, 'Invalid status value.');
    return;
  }

  const db = getDbOrFail(res);
  if (!db) return;
  try {
    const current = q.getCellValue(db, rowId, columnId);
    if (current === 'Unavailable') {
      jsonError(res, 'Cannot modify unavailable items.');
      return;
    }
    q.updateCell(db, rowId, columnId, value);
    jsonResponse(res)({ success: true, value });
  } finally {
    db.close();
  }
}

export function handleAddRow(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    jsonError(res, 'POST method required.', 405);
    return;
  }
  const body = req.body as {
    worksheet_id?: number;
    item_name?: string;
    values?: Record<string, string>;
  };
  const worksheetId = parseInt(String(body?.worksheet_id ?? 0), 10);
  const itemName = String(body?.item_name ?? '').trim();
  const valuesRaw = (body?.values ?? {}) as Record<string, string>;

  if (worksheetId <= 0) {
    jsonError(res, 'Invalid worksheet_id.');
    return;
  }
  if (!itemName) {
    jsonError(res, 'Item name is required.');
    return;
  }

  const values: Record<number, string> = {};
  for (const [k, v] of Object.entries(valuesRaw)) {
    const id = parseInt(k, 10);
    if (!isNaN(id) && VALID_STATUSES.includes(v as never)) values[id] = v;
  }

  const db = getDbOrFail(res);
  if (!db) return;
  try {
    const rowId = q.addRow(db, worksheetId, itemName, values);
    jsonResponse(res)({ success: true, row_id: rowId });
  } finally {
    db.close();
  }
}

export function handleEditRow(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    jsonError(res, 'POST method required.', 405);
    return;
  }
  const body = req.body as {
    row_id?: number;
    item_name?: string;
    values?: Record<string, string>;
  };
  const rowId = parseInt(String(body?.row_id ?? 0), 10);
  const itemName =
    body?.item_name != null ? String(body.item_name).trim() : null;
  const valuesRaw = (body?.values ?? {}) as Record<string, string>;

  if (rowId <= 0) {
    jsonError(res, 'Invalid row_id.');
    return;
  }

  const values: Record<number, string> = {};
  for (const [k, v] of Object.entries(valuesRaw)) {
    const id = parseInt(k, 10);
    if (!isNaN(id) && VALID_STATUSES.includes(v as never)) values[id] = v;
  }

  const db = getDbOrFail(res);
  if (!db) return;
  try {
    const ok = q.editRow(db, rowId, itemName, values);
    if (!ok) {
      jsonError(res, 'Row not found.', 404);
      return;
    }
    jsonResponse(res)({ success: true });
  } finally {
    db.close();
  }
}

export function handleDeleteRow(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    jsonError(res, 'POST method required.', 405);
    return;
  }
  const body = req.body as { row_id?: number };
  const rowId = parseInt(String(body?.row_id ?? 0), 10);
  if (rowId <= 0) {
    jsonError(res, 'Invalid row_id.');
    return;
  }

  const db = getDbOrFail(res);
  if (!db) return;
  try {
    const ok = q.deleteRow(db, rowId);
    if (!ok) {
      jsonError(res, 'Row not found.', 404);
      return;
    }
    jsonResponse(res)({ success: true });
  } finally {
    db.close();
  }
}

export function handleAdminUpdate(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    jsonError(res, 'POST method required.', 405);
    return;
  }
  const body = req.body as {
    row_id?: number;
    column_id?: number;
    value?: string;
  };
  const rowId = parseInt(String(body?.row_id ?? 0), 10);
  const columnId = parseInt(String(body?.column_id ?? 0), 10);
  const value = String(body?.value ?? '').trim();

  if (rowId <= 0 || columnId <= 0) {
    jsonError(res, 'Invalid row_id or column_id.');
    return;
  }
  if (!VALID_STATUSES.includes(value as never)) {
    jsonError(res, 'Invalid status value.');
    return;
  }

  const db = getDbOrFail(res);
  if (!db) return;
  try {
    q.adminUpdateCell(db, rowId, columnId, value);
    jsonResponse(res)({ success: true, value });
  } catch (e) {
    jsonError(res, e instanceof Error ? e.message : 'Invalid status value.');
  } finally {
    db.close();
  }
}
