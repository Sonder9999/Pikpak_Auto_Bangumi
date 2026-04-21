import type { Episode } from "../parser/types.ts";

export const UNKNOWN_PREVIEW_GROUP = "未识别字幕组";

export interface PreviewGroupItem {
  title: string;
  link: string | null;
  homepage: string | null;
  magnetUrl: string | null;
  torrentUrl: string | null;
  sizeBytes: number | null;
  publishedAt: string | null;
  parsed: Episode | null;
}

export interface PreviewGroupBucket {
  groupName: string;
  itemCount: number;
  items: PreviewGroupItem[];
}

function extractBracketGroup(title: string): string | null {
  const match = title.match(/^[\[【]([^\]】]+)[\]】]/);
  const groupName = match?.[1]?.trim();
  return groupName || null;
}

function resolveGroupName(item: PreviewGroupItem): string {
  const parsedGroup = item.parsed?.group?.trim();
  if (parsedGroup) {
    return parsedGroup;
  }

  return extractBracketGroup(item.title) ?? UNKNOWN_PREVIEW_GROUP;
}

function parsePublishedAt(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseEpisode(value: Episode | null): number | null {
  if (!value || !Number.isFinite(value.episode) || value.episode <= 0) {
    return null;
  }

  return value.episode;
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left !== null && right !== null) {
    return left - right;
  }

  if (left !== null) {
    return -1;
  }

  if (right !== null) {
    return 1;
  }

  return 0;
}

function sortPreviewItems(items: PreviewGroupItem[]): PreviewGroupItem[] {
  return [...items].sort((left, right) => {
    const publishedDiff = compareNullableNumber(parsePublishedAt(left.publishedAt), parsePublishedAt(right.publishedAt));
    if (publishedDiff !== 0) {
      return publishedDiff;
    }

    const episodeDiff = compareNullableNumber(parseEpisode(left.parsed), parseEpisode(right.parsed));
    if (episodeDiff !== 0) {
      return episodeDiff;
    }

    return left.title.localeCompare(right.title, "zh-CN");
  });
}

function sortGroupName(left: string, right: string): number {
  if (left === UNKNOWN_PREVIEW_GROUP && right !== UNKNOWN_PREVIEW_GROUP) {
    return 1;
  }

  if (left !== UNKNOWN_PREVIEW_GROUP && right === UNKNOWN_PREVIEW_GROUP) {
    return -1;
  }

  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

export function groupPreviewItems(items: PreviewGroupItem[]): PreviewGroupBucket[] {
  const groupedItems = new Map<string, PreviewGroupItem[]>();

  for (const item of items) {
    const groupName = resolveGroupName(item);
    const currentItems = groupedItems.get(groupName) ?? [];
    currentItems.push(item);
    groupedItems.set(groupName, currentItems);
  }

  return [...groupedItems.entries()]
    .sort(([leftGroup], [rightGroup]) => sortGroupName(leftGroup, rightGroup))
    .map(([groupName, groupItems]) => {
      const sortedItems = sortPreviewItems(groupItems);
      return {
        groupName,
        itemCount: sortedItems.length,
        items: sortedItems,
      };
    });
}