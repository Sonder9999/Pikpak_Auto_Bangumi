import { closeDb, getDb } from "../core/db/connection.ts";
import { createLogger } from "../core/logger.ts";
import { importQbitRuleFiles } from "../core/rss/qbit-rule-import.ts";

const logger = createLogger("cli-qbit-rule-import");

export async function runQbitRuleImportCommand(args: string[]): Promise<void> {
  const filePaths: string[] = [];
  let dbPath: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--db-path") {
      dbPath = args[index + 1] ?? null;
      index += 1;
      continue;
    }

    filePaths.push(arg);
  }

  if (filePaths.length === 0) {
    throw new Error("At least one qBit JSON file path is required");
  }

  closeDb();
  if (dbPath) {
    getDb(dbPath);
  }

  const summary = await importQbitRuleFiles(filePaths);
  logger.info("qBit RSS rule import finished", summary);
  console.log(JSON.stringify(summary, null, 2));
  closeDb();
}