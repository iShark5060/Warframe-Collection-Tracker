import { config as loadEnv } from '@dotenvx/dotenvx';
import argon2 from 'argon2';
import Database from 'better-sqlite3';
import fs from 'fs';

import {
  SQLITE_DB_PATH,
  IMPORT_DEFAULT_ADMIN_USERNAME,
  IMPORT_DEFAULT_ADMIN_PASSWORD,
} from '../config.js';
import * as q from '../db/queries.js';

loadEnv();

const USERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

function output(msg: string): void {
  console.log(msg);
}

function outputError(msg: string): void {
  console.error('ERROR:', msg);
}

function outputSuccess(msg: string): void {
  console.log('✓', msg);
}

async function run(): Promise<void> {
  output('Migration: add users table and seed admin user');
  output('');

  if (!fs.existsSync(SQLITE_DB_PATH)) {
    outputError(`Database not found: ${SQLITE_DB_PATH}`);
    outputError(
      'Nothing to migrate. Run the app and create data first, or use npm run import for a fresh setup.',
    );
    process.exit(1);
  }

  const db = new Database(SQLITE_DB_PATH);

  try {
    output('Creating users table if not exists...');
    db.exec(USERS_TABLE_SQL);
    outputSuccess('Users table ready.');
    output('');

    const existing = db.prepare('SELECT id FROM users LIMIT 1').get();
    if (existing) {
      outputSuccess('Users already exist. Skipping seed.');
      output('No changes made. Migration complete.');
      return;
    }

    const username = IMPORT_DEFAULT_ADMIN_USERNAME.trim();
    const password = IMPORT_DEFAULT_ADMIN_PASSWORD;

    if (!username || !password) {
      outputError(
        'Set IMPORT_DEFAULT_ADMIN_USERNAME and IMPORT_DEFAULT_ADMIN_PASSWORD in .env',
      );
      outputError('(Use the credentials you want for your single admin user.)');
      process.exit(1);
    }

    if (password.length < 4) {
      outputError('Password must be at least 4 characters.');
      process.exit(1);
    }

    output('Creating admin user...');
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19 * 1024,
      timeCost: 2,
      parallelism: 1,
    });
    const createResult = q.createUser(db, username, hash, true);
    if (createResult.inserted) {
      outputSuccess('Admin user created.');
    } else {
      outputSuccess('Admin user already existed (no change).');
    }
    output('');
    output(
      'Migration complete. You can now log in with the new user-based auth.',
    );
  } finally {
    db.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
