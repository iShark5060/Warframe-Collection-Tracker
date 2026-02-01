import argon2 from 'argon2';
import type { SessionData } from 'express-session';
import fs from 'fs';
import path from 'path';

import {
  AUTH_LOCKOUT_FILE,
  AUTH_MAX_ATTEMPTS,
  AUTH_LOCKOUT_MINUTES,
} from './config.js';
import * as q from './db/queries.js';
import { getDb } from './db/schema.js';

export type AuthSession = SessionData | undefined;

interface LockoutRecord {
  attempts: number;
  first_attempt: number;
  last_attempt?: number;
  locked_until?: number;
}

type LockoutData = Record<string, LockoutRecord>;

let lockoutCache: LockoutData | null = null;
let lockoutCacheDirty = false;
let lockoutCacheLastLoad = 0;
const LOCKOUT_CACHE_TTL = 5000;
const LOCKOUT_PERSIST_MAX_ATTEMPTS = 5;
const LOCKOUT_PERSIST_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000];

async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19 * 1024,
    timeCost: 2,
    parallelism: 1,
  });
}

async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

function ensureLockoutDir(): void {
  const dir = path.dirname(AUTH_LOCKOUT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getLockoutData(): LockoutData {
  const now = Date.now();
  const stale =
    lockoutCache === null ||
    (!lockoutCacheDirty && now - lockoutCacheLastLoad > LOCKOUT_CACHE_TTL);

  if (stale) {
    if (!lockoutCacheDirty) {
      if (!fs.existsSync(AUTH_LOCKOUT_FILE)) {
        lockoutCache = {};
        lockoutCacheLastLoad = now;
        return lockoutCache;
      }
      try {
        const data = fs.readFileSync(AUTH_LOCKOUT_FILE, 'utf-8');
        lockoutCache = JSON.parse(data) as LockoutData;
        lockoutCacheLastLoad = now;
      } catch {
        lockoutCache = {};
        lockoutCacheLastLoad = now;
      }
    }
  }

  return lockoutCache ?? {};
}

function retryPersistLockoutCache(attempt: number = 0): void {
  if (!lockoutCacheDirty || !lockoutCache) return;
  ensureLockoutDir();
  try {
    fs.writeFileSync(AUTH_LOCKOUT_FILE, JSON.stringify(lockoutCache, null, 0));
    lockoutCacheDirty = false;
  } catch (error) {
    console.error('Failed to write lockout data:', error);
    if (attempt < LOCKOUT_PERSIST_MAX_ATTEMPTS) {
      const delay = LOCKOUT_PERSIST_BACKOFF_MS[attempt] ?? 16000;
      setTimeout(() => retryPersistLockoutCache(attempt + 1), delay);
    } else {
      console.error(
        'Lockout persistence failed after max attempts; in-memory state retained.',
      );
      lockoutCacheDirty = false;
    }
  }
}

let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash('timing-dummy', {
      type: argon2.argon2id,
      memoryCost: 19 * 1024,
      timeCost: 2,
      parallelism: 1,
    });
  }
  return dummyHashPromise;
}

function saveLockoutData(data: LockoutData): void {
  lockoutCache = data;
  lockoutCacheDirty = true;
  lockoutCacheLastLoad = Date.now();
  setImmediate(() => retryPersistLockoutCache(0));
}

export function getClientIP(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded.split(',')[0];
    return first?.trim() ?? 'unknown';
  }
  const real = req.headers?.['x-real-ip'];
  if (real) return Array.isArray(real) ? real[0] : real;
  return req.ip ?? 'unknown';
}

export function isLockedOut(ip: string): boolean {
  const data = getLockoutData();
  const record = data[ip];
  if (!record?.locked_until) return false;
  if (Date.now() / 1000 < record.locked_until) return true;
  delete data[ip];
  saveLockoutData(data);
  return false;
}

export function getLockoutRemaining(ip: string): number {
  const data = getLockoutData();
  const until = data[ip]?.locked_until;
  if (!until) return 0;
  const remaining = Math.floor(until - Date.now() / 1000);
  return Math.max(0, remaining);
}

function recordFailedAttempt(ip: string): number {
  const data = getLockoutData();
  if (!data[ip]) {
    data[ip] = { attempts: 0, first_attempt: Math.floor(Date.now() / 1000) };
  }
  data[ip].attempts++;
  data[ip].last_attempt = Math.floor(Date.now() / 1000);
  if (data[ip].attempts >= AUTH_MAX_ATTEMPTS) {
    data[ip].locked_until =
      Math.floor(Date.now() / 1000) + AUTH_LOCKOUT_MINUTES * 60;
  }
  saveLockoutData(data);
  return AUTH_MAX_ATTEMPTS - data[ip].attempts;
}

function clearFailedAttempts(ip: string): void {
  const data = getLockoutData();
  if (data[ip]) {
    delete data[ip];
    saveLockoutData(data);
  }
}

export async function attemptLogin(
  username: string,
  password: string,
  ip: string,
): Promise<
  | { success: true; user: { id: number; username: string; is_admin: number } }
  | { success: false; error: string }
> {
  if (isLockedOut(ip)) {
    return {
      success: false,
      error: 'Too many failed attempts. Try again later.',
    };
  }

  const db = getDb();
  try {
    const user = q.getUserByUsername(db, username.trim());
    if (!user) {
      await getDummyHash().then((h) => verifyPassword(password, h));
      const remaining = recordFailedAttempt(ip);
      if (remaining <= 0) {
        return {
          success: false,
          error: `Too many failed attempts. Locked out for ${AUTH_LOCKOUT_MINUTES} minutes.`,
        };
      }
      return {
        success: false,
        error: `Invalid username or password. ${remaining} attempt(s) remaining.`,
      };
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      const remaining = recordFailedAttempt(ip);
      if (remaining <= 0) {
        return {
          success: false,
          error: `Too many failed attempts. Locked out for ${AUTH_LOCKOUT_MINUTES} minutes.`,
        };
      }
      return {
        success: false,
        error: `Invalid username or password. ${remaining} attempt(s) remaining.`,
      };
    }

    clearFailedAttempts(ip);
    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin,
      },
    };
  } finally {
    db.close();
  }
}

export function getUserForLogin(
  username: string,
): { id: number; username: string; is_admin: number } | null {
  const db = getDb();
  try {
    const user = q.getUserByUsername(db, username.trim());
    if (!user) return null;
    return { id: user.id, username: user.username, is_admin: user.is_admin };
  } finally {
    db.close();
  }
}

export async function createUser(
  username: string,
  password: string,
  isAdminUser: boolean,
): Promise<
  { success: true; user_id: number } | { success: false; error: string }
> {
  const db = getDb();
  try {
    const u = username.trim();
    if (!u || !password) {
      return { success: false, error: 'Username and password are required' };
    }
    if (password.length < 4) {
      return {
        success: false,
        error: 'Password must be at least 4 characters',
      };
    }
    const hash = await hashPassword(password);
    const result = q.createUser(db, u, hash, isAdminUser);
    if (!result.inserted) {
      return { success: false, error: 'Username already exists' };
    }
    return { success: true, user_id: result.id };
  } finally {
    db.close();
  }
}

export function deleteUser(
  currentUserId: number,
  targetUserId: number,
): { success: true } | { success: false; error: string } {
  if (targetUserId === currentUserId) {
    return { success: false, error: 'Cannot delete your own account' };
  }
  const db = getDb();
  try {
    if (!q.deleteUser(db, targetUserId)) {
      return { success: false, error: 'User not found' };
    }
    return { success: true };
  } finally {
    db.close();
  }
}

export async function changePassword(
  userId: number,
  newPassword: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (newPassword.length < 4) {
    return { success: false, error: 'Password must be at least 4 characters' };
  }
  const db = getDb();
  try {
    const hash = await hashPassword(newPassword);
    if (!q.updateUserPassword(db, userId, hash)) {
      return { success: false, error: 'User not found' };
    }
    return { success: true };
  } finally {
    db.close();
  }
}

export function getAllUsers(): {
  id: number;
  username: string;
  is_admin: number;
  created_at: string;
  account_count: number;
}[] {
  const db = getDb();
  try {
    return q.getAllUsers(db);
  } finally {
    db.close();
  }
}

export function isAuthenticated(session: AuthSession): boolean {
  return typeof session?.user_id === 'number' && session.user_id > 0;
}

export function isAdmin(session: AuthSession): boolean {
  return Boolean(session?.is_admin);
}
