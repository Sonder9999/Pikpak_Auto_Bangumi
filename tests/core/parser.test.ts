import { describe, test, expect } from "bun:test";
import { rawParser } from "../../src/core/parser/raw-parser.ts";

describe("rawParser", () => {
  test("standard format: [SubGroup] Title - Episode (specs)", () => {
    const r = rawParser(
      "[LoliHouse] 异世界悠闲农家 2 / Isekai Nonbiri Nouka 2 - 01 [WebRip 1080p HEVC-10bit AAC][简繁内封字幕][580.06 MB]"
    );
    expect(r).not.toBeNull();
    expect(r!.group).toBe("LoliHouse");
    expect(r!.episode).toBe(1);
    expect(r!.resolution).toBe("1080p");
  });

  test("ANi format with Baha source", () => {
    const r = rawParser(
      "[ANi] 异世界悠闲农家 2 - 01 [1080P][Baha][WEB-DL][AAC AVC][CHT][MP4][371.4 MB]"
    );
    expect(r).not.toBeNull();
    expect(r!.group).toBe("ANi");
    expect(r!.episode).toBe(1);
  });

  test("Chinese full-width brackets", () => {
    const r = rawParser(
      "【TSDM字幕组】[Re:从零开始的异世界生活 第4季][01][HEVC-10bit 1080p AAC][MKV][简日内封字幕][Re Zero kara Hajimeru Isekai Seikatsu 4th Season][388.1MB]"
    );
    expect(r).not.toBeNull();
    expect(r!.group).toBe("TSDM字幕组");
    expect(r!.episode).toBe(1);
  });

  test("season extraction: 第四季", () => {
    const r = rawParser(
      "[黒ネズミたち] 关于我转生变成史莱姆这档事 第四季 / Tensei shitara Slime Datta Ken 4th Season - 01 (B-Global 1920x1080 HEVC AAC MKV)[286.5 MB]"
    );
    expect(r).not.toBeNull();
    expect(r!.episode).toBe(1);
    expect(r!.group).toBe("黒ネズミたち");
  });

  test("season extraction: S04", () => {
    const r = rawParser(
      "[Skymoon-Raws] 关于我转生变成史莱姆这档事 第四季 / Tensei Shitara Slime Datta Ken S04 - 73 [ViuTV][WEB-DL][CHT][1080p][AVC AAC][337.2MB]"
    );
    expect(r).not.toBeNull();
    expect(r!.season).toBe(4);
    expect(r!.episode).toBe(73);
  });

  test("season extraction: S2 in ANi format", () => {
    const r = rawParser(
      "[ANi] Chained Soldier S02 / 魔都精兵的奴隶 第二季 - 01 [1080P][Baha][WEB-DL][AAC AVC][CHT][MP4][406.6 MB]"
    );
    expect(r).not.toBeNull();
    expect(r!.season).toBe(2);
    expect(r!.episode).toBe(1);
  });

  test("multiple groups with &", () => {
    const r = rawParser(
      "[豌豆字幕组&LoliHouse] 关于我转生变成史莱姆这档事 第四季 / Tensei Shitara Slime Datta Ken 4th Season - 01(73) [WebRip 1080p HEVC-10bit AAC][简繁外挂字幕][478.08 MB]"
    );
    expect(r).not.toBeNull();
    expect(r!.group).toBe("豌豆字幕组&LoliHouse");
    expect(r!.episode).toBe(1);
  });

  test("2160p HEVC from IQIYI", () => {
    const r = rawParser(
      "[沸班亚马制作组] 关于我转生变成史莱姆这档事 第四季 - 01 [IQIYI WebRip 2160p HEVC AAC][简繁内封字幕][1.0GB]"
    );
    expect(r).not.toBeNull();
    expect(r!.resolution).toBe("2160p");
  });

  test("Re:Zero with total episode number", () => {
    const r = rawParser(
      "[晚街与灯][Re：从零开始的异世界生活 第四季 / Re:Zero kara Hajimeru Isekai Seikatsu 4th Season][01 - 总第67][WEB-DL Remux][1080P_AVC_AAC][简繁日内封PGS][1.46 GB]"
    );
    expect(r).not.toBeNull();
    expect(r!.episode).toBe(1);
  });

  test("standard DMHY style", () => {
    const r = rawParser(
      "[动漫国字幕组&LoliHouse] THE MARGINAL SERVICE - 08 [WebRip 1080p HEVC-10bit AAC][简繁内封字幕]"
    );
    expect(r).not.toBeNull();
    expect(r!.group).toBe("动漫国字幕组&LoliHouse");
    expect(r!.episode).toBe(8);
    expect(r!.resolution).toBe("1080p");
  });

  test("title with period separator", () => {
    const r = rawParser(
      "[北宇治字幕组&LoliHouse] 地。-关于地球的运动- / Chi. Chikyuu no Undou ni Tsuite 03 [WebRip 1080p HEVC-10bit AAC ASSx2][简繁日内封字幕]"
    );
    expect(r).not.toBeNull();
    expect(r!.episode).toBe(3);
  });

  test("title with special punct and recruit notice", () => {
    const r = rawParser(
      "[御坂字幕组] 男女之间存在纯友情吗？（不，不存在!!）-01 [WebRip 1080p HEVC10-bit AAC] [简繁日内封] [急招翻校轴]"
    );
    expect(r).not.toBeNull();
    expect(r!.episode).toBe(1);
    expect(r!.group).toBe("御坂字幕组");
  });

  test("Hell Mode long title", () => {
    const r = rawParser(
      "[黒ネズミたち] 地狱模式 ～喜欢挑战特殊成就的玩家在废设定的异世界成为无双～ / Hell Mode - 01 (Baha 1920x1080 AVC AAC MP4)[436.1 MB]"
    );
    expect(r).not.toBeNull();
    expect(r!.episode).toBe(1);
    expect(r!.source).toBe("Baha");
  });

  test("Scum of the Brave - EN first", () => {
    const r = rawParser(
      "[ANi] Scum of the Brave / 勇者之渣 - 01 [1080P][Baha][WEB-DL][AAC AVC][CHT][MP4][322.7 MB]"
    );
    expect(r).not.toBeNull();
    expect(r!.episode).toBe(1);
  });

  test("search hint format (parenthetical note)", () => {
    const r = rawParser(
      "[LoliHouse] 勇者之渣 / Yuusha no Kuzu - 01 [WebRip 1080p HEVC-10bit AAC][简繁内封字幕](检索用：勇者之屑)[524.3MB]"
    );
    expect(r).not.toBeNull();
    expect(r!.episode).toBe(1);
  });

  test("bracket episode [01] format", () => {
    const r = rawParser(
      "[猎户压制部] 勇者之屑 / Yuusha no Kuzu [01] [1080p] [简日内嵌] [2026年1月番][383.3 MB]"
    );
    expect(r).not.toBeNull();
    expect(r!.episode).toBe(1);
  });

  test("triple-language title", () => {
    const r = rawParser(
      "[离谱Sub] 勇者之屑 / 勇者のクズ / Yuusha no Kuzu [01][HEVC AAC][1080p][简繁日内封][招募翻校轴][304.1MB]"
    );
    expect(r).not.toBeNull();
    expect(r!.episode).toBe(1);
  });

  test("Ep format episode", () => {
    const r = rawParser("[SubGroup] Some Anime Title Ep05 [1080p][HEVC]");
    expect(r).not.toBeNull();
    expect(r!.episode).toBe(5);
  });

  test("E format episode", () => {
    const r = rawParser("[SubGroup] Some Anime Title E12 [720p]");
    expect(r).not.toBeNull();
    expect(r!.episode).toBe(12);
  });

  test("Chinese episode marker: 第N话", () => {
    const r = rawParser("[字幕组] 某番剧名称 第05话 [1080p]");
    expect(r).not.toBeNull();
    expect(r!.episode).toBe(5);
  });

  test("returns null for non-episodic content", () => {
    const r = rawParser("Some random file.zip");
    expect(r).toBeNull();
  });

  test("B-Global source detection", () => {
    const r = rawParser(
      "[黒ネズミたち] 魔都精兵的奴隶 第二季 / Mato Seihei no Slave 2 - 01 (B-Global 1920x1080 HEVC AAC MKV)[292.2 MB]"
    );
    expect(r).not.toBeNull();
    expect(r!.source).toBe("B-Global");
  });

  test("GB + TSDM with MP4 format", () => {
    const r = rawParser(
      "【TSDM字幕组】[Re:从零开始的异世界生活 第4季][01][GB][1080P][MP4][简日双语内嵌][Re Zero kara Hajimeru Isekai Seikatsu 4th Season][472.1MB]"
    );
    expect(r).not.toBeNull();
    expect(r!.group).toBe("TSDM字幕组");
    expect(r!.episode).toBe(1);
  });

  test("Sakura sub embedded subs", () => {
    const r = rawParser(
      "[桜都字幕组] 魔都精兵的奴隶 第二季 / Mato Seihei no Slave 2 [01][1080p][简体内嵌][281MB]"
    );
    expect(r).not.toBeNull();
    expect(r!.episode).toBe(1);
  });
});
