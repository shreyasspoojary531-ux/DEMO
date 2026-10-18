import { getDb } from "./db/index.js";

/**
 * Gets a value from lookup_cache if present and not expired.
 *
 * @param {string} key
 * @param {import("better-sqlite3").Database} [db]
 * @returns {any | null} Parsed JSON result or null if missing/expired
 */
export function get(key, db = getDb()) {
  const stmt = db.prepare(`SELECT result_json, fetched_at, ttl_seconds FROM lookup_cache WHERE key = ?`);
  const row = stmt.get(key);

  if (!row) {
    return null;
  }

  const fetchedAt = new Date(row.fetched_at).getTime();
  const expiresAt = fetchedAt + row.ttl_seconds * 1000;
  const now = Date.now();

  if (now > expiresAt) {
    // Expired: clean it up
    db.prepare(`DELETE FROM lookup_cache WHERE key = ?`).run(key);
    return null;
  }

  try {
    return JSON.parse(row.result_json);
  } catch {
    return null;
  }
}

/**
 * Sets a value in lookup_cache with a TTL in seconds.
 *
 * @param {string} key
 * @param {any} value JSON-serializable value
 * @param {number} [ttlSeconds=3600] Time to live in seconds
 * @param {import("better-sqlite3").Database} [db]
 */
export function set(key, value, ttlSeconds = 3600, db = getDb()) {
  const fetchedAt = new Date().toISOString();
  const resultJson = JSON.stringify(value);

  const stmt = db.prepare(`
    INSERT INTO lookup_cache (key, result_json, fetched_at, ttl_seconds)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      result_json = excluded.result_json,
      fetched_at = excluded.fetched_at,
      ttl_seconds = excluded.ttl_seconds
  `);

  stmt.run(key, resultJson, fetchedAt, ttlSeconds);
}

/**
 * Deletes an entry from lookup_cache.
 *
 * @param {string} key
 * @param {import("better-sqlite3").Database} [db]
 */
export function del(key, db = getDb()) {
  db.prepare(`DELETE FROM lookup_cache WHERE key = ?`).run(key);
}
