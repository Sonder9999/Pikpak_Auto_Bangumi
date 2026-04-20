import { createLogger } from "../logger.ts";
import type { DandanplayComment } from "./types.ts";

const logger = createLogger("danmaku-xml");

/**
 * Convert DanDanPlay comment p-field to bilibili 8-field format.
 * DanDanPlay: "time,mode,color,userId"
 * Bilibili:   "time,mode,fontSize,color,timestamp,pool,userId,cid"
 */
function convertPField(p: string, cid: number): string {
  const parts = p.split(",");
  const time = parts[0] ?? "0";
  const mode = parts[1] ?? "1";
  const color = parts[2] ?? "16777215";
  const userId = parts[3] ?? "0";
  return `${time},${mode},25,${color},0,0,${userId},${cid}`;
}

/** Escape XML special characters */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate KikoPlay-compatible danmaku XML from DanDanPlay comments.
 */
export function generateDanmakuXml(episodeId: number, comments: DandanplayComment[]): string {
  logger.debug("Generating XML", { episodeId, commentCount: comments.length });

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<i>",
    "  <chatserver>api.dandanplay.net</chatserver>",
    `  <chatid>${episodeId}</chatid>`,
  ];

  for (const comment of comments) {
    const p = convertPField(comment.p, comment.cid);
    const content = escapeXml(comment.m);
    lines.push(`  <d p="${p}">${content}</d>`);
  }

  lines.push("</i>");

  const xml = lines.join("\n");
  logger.info("XML generated", { episodeId, comments: comments.length, bytes: xml.length });
  return xml;
}
