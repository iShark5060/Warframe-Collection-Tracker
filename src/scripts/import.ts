/**
 * Import Script for Warframe Collection Tracker
 *
 * Imports CSV files from the import directory into the SQLite database.
 * CSV format: Row 1 = worksheet name, Row 2 = column headers, Row 3+ = data.
 * Semicolon-delimited by default.
 *
 * Usage: npm run import
 * Or: npx ts-node src/scripts/import.ts
 */

import { config as loadEnv } from '@dotenvx/dotenvx';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import {
  CSV_IMPORT_DIR,
  CSV_DELIMITER,
  SQLITE_DB_PATH,
  VALID_STATUSES,
} from '../config';
import { createSchema } from '../db/schema';

loadEnv();

function output(msg: string): void {
  console.log(msg);
}

function outputError(msg: string): void {
  console.error('ERROR:', msg);
}

function outputSuccess(msg: string): void {
  console.log('✓', msg);
}

function parseCsvLine(line: string): string[] {
  return line.split(CSV_DELIMITER).map((c) => c.replace(/^\uFEFF/, '').trim());
}

function runImport(): void {
  output('Starting import process...');
  output('');

  if (!fs.existsSync(CSV_IMPORT_DIR)) {
    outputError(`Import directory not found: ${CSV_IMPORT_DIR}`);
    outputError('Please create the directory and place your CSV files there.');
    process.exit(1);
  }

  const csvFiles = fs
    .readdirSync(CSV_IMPORT_DIR)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .map((f) => path.join(CSV_IMPORT_DIR, f));

  if (csvFiles.length === 0) {
    outputError(`No CSV files found in: ${CSV_IMPORT_DIR}`);
    outputError(
      'Please export your Excel worksheets as CSV and place them in the import folder.',
    );
    process.exit(1);
  }

  output(`Found ${csvFiles.length} CSV file(s) to import.`);
  output('');

  const dbDir = path.dirname(SQLITE_DB_PATH);
  if (!fs.existsSync(dbDir)) {
    output('Creating database directory...');
    fs.mkdirSync(dbDir, { recursive: true });
  }

  output(`Database: ${SQLITE_DB_PATH}`);
  output('');

  let db: Database.Database;
  try {
    db = new Database(SQLITE_DB_PATH);
  } catch (e) {
    outputError(
      `Database connection failed: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    process.exit(1);
  }

  output('Creating database schema...');
  createSchema(db);
  outputSuccess('Schema created successfully.');
  output('');

  let worksheetOrder = 0;
  for (const csvPath of csvFiles) {
    const filename = path.basename(csvPath);
    output(`Importing: ${filename}`);

    let content: string;
    try {
      content = fs.readFileSync(csvPath, 'utf-8');
    } catch {
      outputError(`Could not open file: ${csvPath}`);
      continue;
    }

    const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length < 2) {
      outputError(`Could not read worksheet name / headers from: ${filename}`);
      continue;
    }

    const row1 = parseCsvLine(lines[0]!);
    let worksheetName = (row1[0] ?? '').replace(/^\uFEFF/, '').trim();
    if (!worksheetName) worksheetName = path.basename(filename, '.csv');

    const row2 = parseCsvLine(lines[1]!);
    const columnHeaders = row2.slice(1).filter((h) => h.length > 0);

    const insertWs = db.prepare(
      'INSERT INTO worksheets (name, display_order) VALUES (?, ?)',
    );
    const wsResult = insertWs.run(worksheetName, worksheetOrder++);
    const worksheetId = Number(wsResult.lastInsertRowid);

    const insertCol = db.prepare(
      'INSERT INTO columns (worksheet_id, name, display_order) VALUES (?, ?, ?)',
    );
    const columnIds: number[] = [];
    for (let i = 0; i < columnHeaders.length; i++) {
      const colResult = insertCol.run(worksheetId, columnHeaders[i], i);
      columnIds.push(Number(colResult.lastInsertRowid));
    }

    const insertRow = db.prepare(
      'INSERT INTO rows (worksheet_id, item_name, display_order) VALUES (?, ?, ?)',
    );
    const insertCell = db.prepare(
      'INSERT INTO cell_values (row_id, column_id, value) VALUES (?, ?, ?)',
    );

    let rowOrder = 0;
    let rowCount = 0;
    for (let i = 2; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i]!);
      const itemName = (cells[0] ?? '').trim();
      if (!itemName) continue;

      const rowResult = insertRow.run(worksheetId, itemName, rowOrder++);
      const rowId = Number(rowResult.lastInsertRowid);

      for (let c = 0; c < columnIds.length; c++) {
        let value = (cells[c + 1] ?? '').trim();
        if (!VALID_STATUSES.includes(value as never)) value = '';
        insertCell.run(rowId, columnIds[c]!, value);
      }
      rowCount++;
    }

    outputSuccess(`  Worksheet: ${worksheetName}`);
    outputSuccess(
      `  Columns: ${columnIds.length} (${columnHeaders.join(', ')})`,
    );
    outputSuccess(`  Rows imported: ${rowCount}`);
    output('');
  }

  db.close();
  output('');
  outputSuccess('Import complete!');
  output('');
  output('You can now run the app: npm run dev or npm start');
}

runImport();
