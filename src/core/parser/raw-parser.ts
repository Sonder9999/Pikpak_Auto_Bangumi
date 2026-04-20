import { createLogger } from "../logger.ts";
import type { Episode } from "./types.ts";

const logger = createLogger("parser");

const EPISODE_RE = /\d+/;
const TITLE_RE =
  /(.*?|\[.*])((?: ?-) ?\d+ |\[\d+]|\[\d+.?[vV]\d]|第\d+[话話集]|\[第?\d+[话話集]]|\[\d+.?END]|[Ee][Pp]?\d+)(.*)/;
const RESOLUTION_RE = /1080|720|2160|4K/;
const SOURCE_RE = /B-Global|[Bb]aha|[Bb]ilibili|AT-X|Web/;
const SUB_RE = /[简繁日字幕]|CH|BIG5|GB/;

const FALLBACK_EP_PATTERNS = [
  / (\d+) ?(?=\[)/, // digits before [
  /\[(\d+)\(\d+\)\]/, // [02(57)]
  /- (\d+)\(\d+\)/, // - 01(73)
  /\[(\d+)\s*-\s*总第\d+]/, // [01 - total ep]
  /\[(\d+)[^\]]*]/, // [01 ...] generic bracket episode
];

const PREFIX_RE = /[^\w\s\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff-]/g;

const CHINESE_NUMBER_MAP: Record<string, number> = {
  "\u4e00": 1,
  "\u4e8c": 2,
  "\u4e09": 3,
  "\u56db": 4,
  "\u4e94": 5,
  "\u516d": 6,
  "\u4e03": 7,
  "\u516b": 8,
  "\u4e5d": 9,
  "\u5341": 10,
};

function getGroup(name: string): string {
  const parts = name.split(/[\[\]]/);
  if (parts.length > 1) {
    return parts[1] ?? "";
  }
  return "";
}

function preProcess(rawName: string): string {
  return rawName.replace(/\u3010/g, "[").replace(/\u3011/g, "]");
}

function prefixProcess(raw: string, group: string): string {
  if (group) {
    raw = raw.replace(new RegExp(`.${escapeRegex(group)}.`), "");
  }
  const rawProcess = raw.replace(PREFIX_RE, "/");
  let argGroup = rawProcess.split("/").filter((s) => s !== "");
  if (argGroup.length === 1) {
    argGroup = argGroup[0]!.split(" ");
  }
  for (const arg of argGroup) {
    if (/新番|月?番/.test(arg) && arg.length <= 5) {
      raw = raw.replace(new RegExp(`.${escapeRegex(arg)}.`), "");
    } else if (/港澳台地区/.test(arg)) {
      raw = raw.replace(new RegExp(`.${escapeRegex(arg)}.`), "");
    }
  }
  return raw;
}

function seasonProcess(seasonInfo: string): {
  name: string;
  seasonRaw: string;
  season: number;
} {
  let nameSeason = seasonInfo;
  const seasonRule = /S\d{1,2}|Season \d{1,2}|[第].[季期]/g;
  nameSeason = nameSeason.replace(/[\[\]]/g, " ");
  const seasons = nameSeason.match(seasonRule);

  if (!seasons || seasons.length === 0) {
    return { name: nameSeason, seasonRaw: "", season: 1 };
  }

  const name = nameSeason.replace(seasonRule, "");
  let seasonNum = 1;
  let seasonRaw = "";

  for (const s of seasons) {
    seasonRaw = s;
    if (/Season|S/.test(s)) {
      seasonNum = parseInt(s.replace(/Season|S/, ""), 10);
      break;
    } else if (/[第 ].*[季期(部分)]|部分/.test(s)) {
      const seasonPro = s.replace(/[第季期 ]/g, "");
      const parsed = parseInt(seasonPro, 10);
      if (!isNaN(parsed)) {
        seasonNum = parsed;
      } else if (CHINESE_NUMBER_MAP[seasonPro] !== undefined) {
        seasonNum = CHINESE_NUMBER_MAP[seasonPro]!;
      }
      break;
    }
  }

  return { name, seasonRaw, season: seasonNum };
}

function nameProcess(name: string): {
  nameEn: string | null;
  nameZh: string | null;
  nameJp: string | null;
} {
  let nameEn: string | null = null;
  let nameZh: string | null = null;
  let nameJp: string | null = null;

  name = name.trim();
  name = name.replace(/[(（]仅限港澳台地区[）)]/, "");

  let split = name.split(/\/|\s{2}|-\s{2}/).filter((s) => s !== "");

  if (split.length === 1) {
    if (/_/.test(name)) {
      split = name.split("_");
    } else if (/ - /.test(name)) {
      split = name.split("-");
    }
  }

  if (split.length === 1) {
    // "29 岁..." digits + Chinese
    if (/^\d+\s[\u4e00-\u9fa5]/.test(split[0]!)) {
      nameZh = split[0]!.trim();
      return { nameEn, nameZh, nameJp };
    }
    const splitSpace = split[0]!.split(" ");
    for (const idx of [0, splitSpace.length - 1]) {
      if (/^[\u4e00-\u9fa5]{2,}/.test(splitSpace[idx] ?? "")) {
        const chs = splitSpace[idx]!;
        const rest = splitSpace.filter((_, i) => i !== idx);
        split = [chs, rest.join(" ")];
        break;
      }
    }
  }

  for (const item of split) {
    if (/[\u0800-\u4e00]{2,}/.test(item) && !nameJp) {
      nameJp = item.trim();
    } else if (/[\u4e00-\u9fa5]{2,}/.test(item) && !nameZh) {
      nameZh = item.trim();
    } else if (/[a-zA-Z]{3,}/.test(item) && !nameEn) {
      nameEn = item.trim();
    }
  }

  return { nameEn, nameZh, nameJp };
}

function findTags(other: string): {
  sub: string | null;
  resolution: string | null;
  source: string | null;
} {
  const elements = other
    .replace(/[\[\]()（）]/g, " ")
    .split(" ")
    .filter((x) => x !== "");

  let sub: string | null = null;
  let resolution: string | null = null;
  let source: string | null = null;

  for (const element of elements) {
    if (SUB_RE.test(element) && !sub) {
      sub = element;
    } else if (RESOLUTION_RE.test(element) && !resolution) {
      resolution = element;
    } else if (SOURCE_RE.test(element) && !source) {
      source = element;
    }
  }

  if (sub) {
    sub = sub.replace(/_MP4|_MKV/, "");
  }

  return { sub, resolution, source };
}

function fallbackParse(contentTitle: string): [string, string, string] | null {
  for (const pattern of FALLBACK_EP_PATTERNS) {
    const m = pattern.exec(contentTitle);
    if (m) {
      const seasonInfo = contentTitle.slice(0, m.index).trim();
      const episodeInfo = m[1]!;
      const other = contentTitle.slice(m.index + m[0].length).trim();
      return [seasonInfo, episodeInfo, other];
    }
  }
  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function process(rawTitle: string): [
  string | null,
  string | null,
  string | null,
  number,
  string,
  number,
  string | null,
  string | null,
  string | null,
  string,
] | null {
  rawTitle = rawTitle.trim().replace(/\n/g, " ");
  const contentTitle = preProcess(rawTitle);
  const group = getGroup(contentTitle);

  let seasonInfo: string;
  let episodeInfo: string;
  let other: string;

  const matchObj = TITLE_RE.exec(contentTitle);
  if (matchObj) {
    seasonInfo = (matchObj[1] ?? "").trim();
    episodeInfo = (matchObj[2] ?? "").trim();
    other = (matchObj[3] ?? "").trim();
  } else {
    const fallback = fallbackParse(contentTitle);
    if (!fallback) {
      return null;
    }
    [seasonInfo, episodeInfo, other] = fallback;
  }

  const processRaw = prefixProcess(seasonInfo, group);
  const { name: rawName, seasonRaw, season } = seasonProcess(processRaw);

  let nameEn: string | null = null;
  let nameZh: string | null = null;
  let nameJp: string | null = null;
  try {
    const names = nameProcess(rawName);
    nameEn = names.nameEn;
    nameZh = names.nameZh;
    nameJp = names.nameJp;
  } catch {
    // Ignore name processing errors
  }

  const rawEpisode = EPISODE_RE.exec(episodeInfo);
  const episode = rawEpisode ? parseInt(rawEpisode[0], 10) : 0;

  const { sub, resolution, source } = findTags(other);

  return [nameEn, nameZh, nameJp, season, seasonRaw, episode, sub, resolution, source, group];
}

export function rawParser(raw: string): Episode | null {
  const ret = process(raw);
  if (ret === null) {
    logger.info("Detected non-episodic resource, skipping", { title: raw });
    return null;
  }
  const [nameEn, nameZh, nameJp, season, seasonRaw, episode, sub, resolution, source, group] = ret;
  return {
    nameEn,
    nameZh,
    nameJp,
    season,
    seasonRaw,
    episode,
    sub,
    group,
    resolution,
    source,
    year: null,
  };
}
