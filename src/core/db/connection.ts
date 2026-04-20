import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";
import * as schema from "./schema.ts";
import { createLogger } from "../logger.ts";

const logger = createLogger("db");

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: Database | null = null;

export function getDb(dbPath = "./data/pikpak-bangumi.db") {
  if (_db) return _db;

  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  _sqlite = new Database(dbPath);
  _sqlite.exec("PRAGMA journal_mode = WAL");
  _sqlite.exec("PRAGMA foreign_keys = ON");

  _db = drizzle(_sqlite, { schema });

  logger.info("Database initialized", { path: dbPath });
  return _db;
}

export function closeDb() {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
    logger.info("Database closed");
  }
}

export { schema };
