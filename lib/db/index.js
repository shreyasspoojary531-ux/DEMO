import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * Valid statuses for a check and the allowed transitions map.
 * Valid transitions:
 * created -> extracting
 * extracting -> awaiting_confirmation
 * awaiting_confirmation -> investigating
 * investigating -> scoring
 * scoring -> report_ready
 * any -> failed
 */
export const CHECK_STATUSES = [
  "created",
  "extracting",
  "awaiting_confirmation",
  "investigating",
  "scoring",
  "report_ready",
  "failed",
];

export const ALLOWED_TRANSITIONS = {
  created: ["extracting", "failed"],
  extracting: ["awaiting_confirmation", "failed"],
  awaiting_confirmation: ["investigating", "failed"],
  investigating: ["scoring", "failed"],
  scoring: ["report_ready", "failed"],
  report_ready: ["failed"],
  failed: [],
};

let dbInstance = null;

/**
 * Returns the SQLite database instance, creating directories and running migrations if needed.
 * @param {string} [customPath]
 * @returns {Database.Database}
 */
export function getDb(customPath) {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const dbPath = customPath || process.env.DB_PATH || "./data/app.db";
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  migrate(db);

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

/**
 * Runs migrations creating every table in the PRD data model.
 * @param {Database.Database} db
 */
export function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS checks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      risk_level TEXT,
      score REAL,
      confidence TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS check_inputs (
      id TEXT PRIMARY KEY,
      check_id TEXT NOT NULL,
      type TEXT NOT NULL,
      value TEXT,
      file_path TEXT,
      FOREIGN KEY (check_id) REFERENCES checks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      check_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT NOT NULL,
      confirmed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (check_id) REFERENCES checks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_results (
      id TEXT PRIMARY KEY,
      check_id TEXT NOT NULL,
      agent TEXT NOT NULL,
      status TEXT NOT NULL,
      flags_json TEXT NOT NULL DEFAULT '[]',
      verified_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      duration_ms INTEGER,
      FOREIGN KEY (check_id) REFERENCES checks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reports (
      check_id TEXT PRIMARY KEY,
      report_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (check_id) REFERENCES checks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS graph_nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      value TEXT NOT NULL,
      first_seen TEXT NOT NULL,
      report_count INTEGER NOT NULL DEFAULT 1,
      UNIQUE(kind, value)
    );

    CREATE TABLE IF NOT EXISTS graph_edges (
      id TEXT PRIMARY KEY,
      node_a TEXT NOT NULL,
      node_b TEXT NOT NULL,
      check_ref TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (node_a) REFERENCES graph_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (node_b) REFERENCES graph_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      check_id TEXT NOT NULL,
      verdict TEXT NOT NULL,
      comment TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lookup_cache (
      key TEXT PRIMARY KEY,
      result_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      ttl_seconds INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_checks_expires_at ON checks(expires_at);
    CREATE INDEX IF NOT EXISTS idx_check_inputs_check_id ON check_inputs(check_id);
    CREATE INDEX IF NOT EXISTS idx_entities_check_id ON entities(check_id);
    CREATE INDEX IF NOT EXISTS idx_agent_results_check_id ON agent_results(check_id);
  `);
}

/**
 * Creates a new check record with expires_at set to 24 hours after creation.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} [params.language='en']
 * @param {string} [params.status='created']
 * @param {Database.Database} [db]
 * @returns {object}
 */
export function createCheck({ id, language = "en", status = "created" }, db = getDb()) {
  if (!CHECK_STATUSES.includes(status)) {
    throw new Error(`Invalid initial status: ${status}`);
  }

  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const stmt = db.prepare(`
    INSERT INTO checks (id, status, language, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(id, status, language, createdAt, expiresAt);

  return getCheck(id, db);
}

/**
 * Gets a check by ID. Returns null if not found.
 *
 * @param {string} id
 * @param {Database.Database} [db]
 * @returns {object | null}
 */
export function getCheck(id, db = getDb()) {
  const stmt = db.prepare(`SELECT * FROM checks WHERE id = ?`);
  const row = stmt.get(id);
  return row || null;
}

/**
 * Updates a check's status, enforcing the state machine transitions.
 *
 * @param {string} id
 * @param {string} nextStatus
 * @param {Database.Database} [db]
 * @returns {object}
 */
export function updateStatus(id, nextStatus, db = getDb()) {
  if (!CHECK_STATUSES.includes(nextStatus)) {
    throw new Error(`Invalid status: ${nextStatus}`);
  }

  const check = getCheck(id, db);
  if (!check) {
    throw new Error(`Check not found: ${id}`);
  }

  const allowed = ALLOWED_TRANSITIONS[check.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new Error(
      `Invalid state transition from '${check.status}' to '${nextStatus}'. Allowed: [${allowed.join(", ")}]`
    );
  }

  const stmt = db.prepare(`UPDATE checks SET status = ? WHERE id = ?`);
  stmt.run(nextStatus, id);

  return getCheck(id, db);
}
