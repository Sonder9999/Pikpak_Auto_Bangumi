import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let tempDir: string | null = null;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("rss source migration", () => {
  test("backfills mikanBangumiId without rewriting corrected bangumiSubjectId", () => {
    tempDir = mkdtempSync(join(tmpdir(), "pikpak-rss-migration-"));
    const dbPath = join(tempDir, "migration.sqlite");
    const db = new Database(dbPath);

    try {
      db.exec(`
        CREATE TABLE rss_sources (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          poll_interval_ms INTEGER NOT NULL DEFAULT 300000,
          bangumi_subject_id INTEGER,
          last_success_at TEXT,
          last_error_at TEXT,
          last_error TEXT,
          consecutive_failures INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      db.exec(`
        INSERT INTO rss_sources (
          name,
          url,
          enabled,
          poll_interval_ms,
          bangumi_subject_id,
          last_success_at,
          last_error_at,
          last_error,
          consecutive_failures,
          created_at,
          updated_at
        ) VALUES
          (
            'Manual RSS - 576351',
            'https://mikanani.me/RSS/Bangumi?bangumiId=3928',
            1,
            300000,
            576351,
            NULL,
            NULL,
            NULL,
            0,
            '2026-04-22T00:00:00.000Z',
            '2026-04-22T00:00:00.000Z'
          ),
          (
            'Manual RSS - 1000',
            'https://example.com/feed.xml',
            1,
            300000,
            1000,
            NULL,
            NULL,
            NULL,
            0,
            '2026-04-22T00:00:00.000Z',
            '2026-04-22T00:00:00.000Z'
          );
      `);

      const migrationSql = readFileSync(resolve(import.meta.dir, "../../drizzle/0005_peaceful_starbolt.sql"), "utf8");
      db.exec(migrationSql);

      const columns = db.query("PRAGMA table_info('rss_sources')").all() as Array<{ name: string }>;
      expect(columns.some((column) => column.name === "mikan_bangumi_id")).toBe(true);

      const rows = db
        .query("SELECT url, bangumi_subject_id, mikan_bangumi_id FROM rss_sources ORDER BY id")
        .all() as Array<{ url: string; bangumi_subject_id: number | null; mikan_bangumi_id: number | null }>;

      expect(rows[0]).toEqual({
        url: "https://mikanani.me/RSS/Bangumi?bangumiId=3928",
        bangumi_subject_id: 576351,
        mikan_bangumi_id: 3928,
      });
      expect(rows[1]).toEqual({
        url: "https://example.com/feed.xml",
        bangumi_subject_id: 1000,
        mikan_bangumi_id: null,
      });
    } finally {
      db.close();
    }
  });
});