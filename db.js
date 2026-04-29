const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "data.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    canvas_id TEXT,
    title TEXT NOT NULL,
    class TEXT NOT NULL,
    due INTEGER,
    submitted INTEGER DEFAULT 0,
    manual_submitted INTEGER DEFAULT 0,
    graded INTEGER DEFAULT 0,
    grade TEXT,
    graded_at TEXT,
    priority_dismissed INTEGER DEFAULT 0,
    points_possible REAL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Migrations — add columns that didn't exist in earlier versions
try { db.exec("ALTER TABLE assignments ADD COLUMN points_possible REAL"); } catch {}

module.exports = db;
