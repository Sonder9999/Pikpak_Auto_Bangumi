import { readFileSync } from "node:fs";
import { createLogger } from "../logger.ts";
import { createRule, deleteRule, getRulesBySourceId, updateRule } from "../filter/rule-crud.ts";
import { createSource, getAllSources, type RssSource, updateSource } from "./source-crud.ts";
import { resolveMikanBangumiIdentity } from "../mikan/index.ts";

const logger = createLogger("qbit-rule-import");

type RawQbitRule = {
  affectedFeeds?: string[];
  enabled?: boolean;
  mustContain?: string;
  mustNotContain?: string;
};

interface QbitRuleEntry {
  title: string;
  rssUrl: string;
  enabled: boolean;
  includePattern?: string;
  excludePattern?: string;
}

export interface QbitRuleImportResult {
  title: string;
  rssUrl: string;
  status: "created" | "updated" | "failed";
  sourceId?: number;
  bangumiSubjectId?: number;
  mikanBangumiId?: number;
  warnings?: string[];
  error?: string;
}

export interface QbitRuleImportSummary {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  duplicates: number;
  results: QbitRuleImportResult[];
}

function loadQbitRuleEntries(filePath: string): QbitRuleEntry[] {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, RawQbitRule>;

  return Object.entries(raw).map(([title, value]) => {
    const rssUrl = value.affectedFeeds?.[0];
    if (!rssUrl) {
      throw new Error(`Missing affectedFeeds[0] for ${title} in ${filePath}`);
    }

    return {
      title,
      rssUrl,
      enabled: value.enabled ?? true,
      includePattern: value.mustContain || undefined,
      excludePattern: value.mustNotContain || undefined,
    };
  });
}

function syncRule(sourceId: number, mode: "include" | "exclude", pattern: string | undefined, sourceName: string): void {
  const existingRule = getRulesBySourceId(sourceId).find((rule) => rule.mode === mode);

  if (!pattern) {
    if (existingRule) {
      deleteRule(existingRule.id);
    }
    return;
  }

  const ruleName = `${mode === "include" ? "Include" : "Exclude"}: ${sourceName}`;
  if (existingRule) {
    updateRule(existingRule.id, { name: ruleName, pattern, enabled: true });
    return;
  }

  createRule({
    name: ruleName,
    pattern,
    mode,
    sourceId,
    enabled: true,
  });
}

function pickPreferredExistingSource(
  sources: RssSource[],
  bangumiSubjectId: number,
  mikanBangumiId: number,
): { target: RssSource; duplicates: RssSource[] } {
  const target = sources.find((source) => {
    return source.bangumiSubjectId === bangumiSubjectId && source.mikanBangumiId === mikanBangumiId;
  })
    ?? sources.find((source) => source.bangumiSubjectId === bangumiSubjectId)
    ?? sources.find((source) => source.enabled && source.name.startsWith("Manual RSS -"))
    ?? sources.find((source) => source.enabled)
    ?? sources[0];

  return {
    target,
    duplicates: sources.filter((source) => source.id !== target.id),
  };
}

export async function importQbitRuleFiles(filePaths: string[]): Promise<QbitRuleImportSummary> {
  const summary: QbitRuleImportSummary = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    duplicates: 0,
    results: [],
  };

  for (const filePath of filePaths) {
    const entries = loadQbitRuleEntries(filePath);

    for (const entry of entries) {
      try {
        const identity = await resolveMikanBangumiIdentity({ rssUrl: entry.rssUrl });
        const matchingSources = getAllSources().filter((source) => source.url === entry.rssUrl);
        const sourceName = `Manual RSS - ${identity.bangumiSubjectId}`;
        const warnings: string[] = [];

        let targetSource: RssSource;
        let status: QbitRuleImportResult["status"];

        if (matchingSources.length > 0) {
          const { target, duplicates } = pickPreferredExistingSource(
            matchingSources,
            identity.bangumiSubjectId,
            identity.mikanBangumiId,
          );

          if (duplicates.length > 0) {
            summary.duplicates += 1;
            warnings.push(`Found ${matchingSources.length} matching sources; updated source ${target.id}`);
          }

          targetSource = updateSource(target.id, {
            name: sourceName,
            url: entry.rssUrl,
            enabled: entry.enabled,
            pollIntervalMs: 300000,
            bangumiSubjectId: identity.bangumiSubjectId,
            mikanBangumiId: identity.mikanBangumiId,
          }) ?? target;
          summary.updated += 1;
          status = "updated";
        } else {
          targetSource = createSource({
            name: sourceName,
            url: entry.rssUrl,
            enabled: entry.enabled,
            pollIntervalMs: 300000,
            bangumiSubjectId: identity.bangumiSubjectId,
            mikanBangumiId: identity.mikanBangumiId,
          });
          summary.created += 1;
          status = "created";
        }

        syncRule(targetSource.id, "include", entry.includePattern, sourceName);
        syncRule(targetSource.id, "exclude", entry.excludePattern, sourceName);

        logger.info("Imported qBit RSS rule entry", {
          title: entry.title,
          rssUrl: entry.rssUrl,
          sourceId: targetSource.id,
          status,
        });

        summary.results.push({
          title: entry.title,
          rssUrl: entry.rssUrl,
          status,
          sourceId: targetSource.id,
          bangumiSubjectId: identity.bangumiSubjectId,
          mikanBangumiId: identity.mikanBangumiId,
          warnings: warnings.length > 0 ? warnings : undefined,
        });
      } catch (error) {
        summary.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Failed to import qBit RSS rule entry", {
          title: entry.title,
          rssUrl: entry.rssUrl,
          error: message,
        });
        summary.results.push({
          title: entry.title,
          rssUrl: entry.rssUrl,
          status: "failed",
          error: message,
        });
      }
    }
  }

  return summary;
}