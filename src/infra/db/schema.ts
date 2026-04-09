import Database from "better-sqlite3";

export function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL DEFAULT 'main',
      last_synced_sha TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      polling_interval_min INTEGER NOT NULL DEFAULT 15,
      user_id TEXT NOT NULL DEFAULT '',
      clone_url TEXT NOT NULL DEFAULT '',
      clone_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, clone_url)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      credential TEXT NOT NULL,
      label TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, provider)
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('success', 'error')),
      commits_processed INTEGER NOT NULL DEFAULT 0,
      tasks_created INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );
  `);
}

export function migrateSchema(db: Database.Database): void {
  const repoColumns = db.prepare("PRAGMA table_info(repositories)").all() as any[];
  const repoColumnNames = repoColumns.map((c: any) => c.name);

  if (!repoColumnNames.includes("user_id")) {
    db.exec("ALTER TABLE repositories ADD COLUMN user_id TEXT NOT NULL DEFAULT ''");
  }
  if (!repoColumnNames.includes("clone_url")) {
    db.exec("ALTER TABLE repositories ADD COLUMN clone_url TEXT NOT NULL DEFAULT ''");
  }
  if (!repoColumnNames.includes("clone_path")) {
    db.exec("ALTER TABLE repositories ADD COLUMN clone_path TEXT");
  }

  const syncColumns = db.prepare("PRAGMA table_info(sync_logs)").all() as any[];
  const syncColumnNames = syncColumns.map((c: any) => c.name);

  if (!syncColumnNames.includes("user_id")) {
    db.exec("ALTER TABLE sync_logs ADD COLUMN user_id TEXT NOT NULL DEFAULT ''");
  }
}
