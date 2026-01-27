import Database from 'better-sqlite3';

import { SQLITE_DB_PATH } from '../config';

export function createSchema(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS cell_values;
    DROP TABLE IF EXISTS rows;
    DROP TABLE IF EXISTS columns;
    DROP TABLE IF EXISTS worksheets;

    CREATE TABLE worksheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worksheet_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (worksheet_id) REFERENCES worksheets(id) ON DELETE CASCADE
    );

    CREATE TABLE rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worksheet_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (worksheet_id) REFERENCES worksheets(id) ON DELETE CASCADE
    );

    CREATE TABLE cell_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      row_id INTEGER NOT NULL,
      column_id INTEGER NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (row_id) REFERENCES rows(id) ON DELETE CASCADE,
      FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE,
      UNIQUE(row_id, column_id)
    );

    CREATE INDEX idx_columns_worksheet ON columns(worksheet_id);
    CREATE INDEX idx_rows_worksheet ON rows(worksheet_id);
    CREATE INDEX idx_cell_values_row ON cell_values(row_id);
    CREATE INDEX idx_cell_values_column ON cell_values(column_id);
  `);
}

export function getDb(): Database.Database {
  return new Database(SQLITE_DB_PATH);
}
