import { describe, expect, test } from "bun:test";
import { groupPreviewItems, UNKNOWN_PREVIEW_GROUP, type PreviewGroupItem } from "../../src/core/rss/preview-grouping.ts";

function createPreviewItem(title: string, group: string, episode: number, publishedAt: string | null): PreviewGroupItem {
  return {
    title,
    link: null,
    homepage: null,
    magnetUrl: null,
    torrentUrl: null,
    sizeBytes: null,
    publishedAt,
    parsed: {
      nameEn: null,
      nameZh: null,
      nameJp: null,
      season: 1,
      seasonRaw: "",
      episode,
      sub: null,
      group,
      resolution: null,
      source: null,
      year: null,
    },
  };
}

describe("RSS preview grouping", () => {
  test("groups preview items by subtitle group and sorts each group chronologically", () => {
    const groups = groupPreviewItems([
      createPreviewItem("[黒ネズミたち] 黑猫与魔女的教室 - 02", "黒ネズミたち", 2, "2026-04-20T01:50:00.213"),
      createPreviewItem("[LoliHouse] 黑猫与魔女的教室 - 01", "LoliHouse", 1, "2026-04-13T02:00:00.000"),
      createPreviewItem("[黒ネズミたち] 黑猫与魔女的教室 - 01", "黒ネズミたち", 1, "2026-04-13T01:50:00.213"),
    ]);

    expect(groups.map((group) => group.groupName)).toEqual(["LoliHouse", "黒ネズミたち"]);
    const targetGroup = groups.find((group) => group.groupName === "黒ネズミたち");

    expect(targetGroup?.items.map((item) => item.title)).toEqual([
      "[黒ネズミたち] 黑猫与魔女的教室 - 01",
      "[黒ネズミたち] 黑猫与魔女的教室 - 02",
    ]);
  });

  test("falls back to unknown group when parser group is missing", () => {
    const groups = groupPreviewItems([
      createPreviewItem("黑猫与魔女的教室 - 03", "", 3, null),
    ]);

    expect(groups.length).toBe(1);
    expect(groups[0]?.groupName).toBe(UNKNOWN_PREVIEW_GROUP);
  });

  test("falls back to episode order when timestamps are missing", () => {
    const groups = groupPreviewItems([
      createPreviewItem("[Group] 黑猫与魔女的教室 - 03", "Group", 3, null),
      createPreviewItem("[Group] 黑猫与魔女的教室 - 01", "Group", 1, null),
      createPreviewItem("[Group] 黑猫与魔女的教室 - 02", "Group", 2, null),
    ]);

    expect(groups[0]?.items.map((item) => item.parsed?.episode)).toEqual([1, 2, 3]);
  });
});