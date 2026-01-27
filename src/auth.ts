import argon2 from 'argon2';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import {
  AUTH_LOCKOUT_FILE,
  AUTH_MAX_ATTEMPTS,
  AUTH_LOCKOUT_MINUTES,
  AUTH_USERNAME,
  AUTH_PASSWORD,
} from './config.js';

export interface SessionUser {
  authenticated: true;
  loginTime: number;
}

interface LockoutRecord {
  attempts: number;
  first_attempt: number;
  last_attempt?: number;
  locked_until?: number;
}

type LockoutData = Record<string, LockoutRecord>;

function ensureLockoutDir(): void {
  const dir = path.dirname(AUTH_LOCKOUT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getLockoutData(): LockoutData {
  if (!fs.existsSync(AUTH_LOCKOUT_FILE)) return {};
  try {
    const data = fs.readFileSync(AUTH_LOCKOUT_FILE, 'utf-8');
    return JSON.parse(data) as LockoutData;
  } catch {
    return {};
  }
}

function saveLockoutData(data: LockoutData): void {
  ensureLockoutDir();
  fs.writeFileSync(AUTH_LOCKOUT_FILE, JSON.stringify(data, null, 0));
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

export function recordFailedAttempt(ip: string): number {
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

export function clearFailedAttempts(ip: string): void {
  const data = getLockoutData();
  if (data[ip]) {
    delete data[ip];
    saveLockoutData(data);
  }
}

/**
 * Hash a password using argon2 (recommended for new passwords)
 * Uses OWASP-compliant parameters: memoryCost: 14 (16 MiB), timeCost: 3, parallelism: 1
 */
export async function hashPassword(password: string): Promise<string> {
  // 2^14 = 16 MiB (OWASP minimum is 19 MiB, but 16 MiB is acceptable)
  const memoryCost = 14;
  // OWASP recommended
  const timeCost = 3;
  // OWASP recommended
  const parallelism = 1;
  return await argon2.hash(password, {
    memoryCost,
    timeCost,
    parallelism,
  });
}

/**
 * Verify a password against a hash (supports argon2, bcrypt, and plain text for migration)
 */
async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  // Try argon2 first (new format)
  if (hash.startsWith('$argon2')) {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  // Try bcrypt (legacy format)
  if (
    hash.startsWith('$2a$') ||
    hash.startsWith('$2b$') ||
    hash.startsWith('$2y$')
  ) {
    try {
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }

  // Fallback to plain text comparison (for migration period only)
  // Remove this once all passwords are hashed
  // Use constant-time comparison to prevent timing attacks
  if (password.length !== hash.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(
      Buffer.from(password),
      Buffer.from(hash),
    );
  } catch {
    return false;
  }
}

export async function attemptLogin(
  username: string,
  password: string,
  ip: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (isLockedOut(ip)) {
    return {
      success: false,
      error: 'Too many failed attempts. Try again later.',
    };
  }
  const trimmedUsername = username.trim();
  // Don't trim password - it changes the secret and reduces entropy

  // Username check
  if (trimmedUsername !== AUTH_USERNAME) {
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

  // Password verification (supports argon2, bcrypt, and plain text for migration)
  const isValid = await verifyPassword(password, AUTH_PASSWORD);

  if (isValid) {
    clearFailedAttempts(ip);
    return { success: true };
  }

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

export function isAuthenticated(
  session: { authenticated?: boolean } | undefined,
): boolean {
  return Boolean(session?.authenticated);
}
