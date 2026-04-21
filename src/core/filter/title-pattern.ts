const REGEX_LITERAL_RE = /^\/(.*)\/([dgimsuvy]*)$/;
const TERM_SEPARATOR_RE = /\s*(?:&&|&|\s+)\s*/;
const REGEX_INDICATORS = [
  /(^|[^\\])\|/,
  /\\/,
  /\.\*/,
  /\.\+/,
  /\.\?/,
  /\(\?[=!<:]/,
  /(^|[^\\])\^/,
  /(^|[^\\])\$/,
  /\{\d+(,\d*)?\}/,
];

export interface TitleMatcher {
  mode: "regex" | "terms";
  source: string;
  test: (title: string) => boolean;
}

function buildRegexMatcher(regex: RegExp, source: string): TitleMatcher {
  return {
    mode: "regex",
    source,
    test(title: string): boolean {
      regex.lastIndex = 0;
      return regex.test(title);
    },
  };
}

function parseRegexLiteral(pattern: string): RegExp | null {
  const match = pattern.match(REGEX_LITERAL_RE);
  if (!match) {
    return null;
  }

  const body = match[1] ?? "";
  const rawFlags = match[2] ?? "";
  const flags = rawFlags.includes("i") ? rawFlags : `${rawFlags}i`;
  return new RegExp(body, flags);
}

function shouldUseRegex(pattern: string): boolean {
  if (REGEX_LITERAL_RE.test(pattern)) {
    return true;
  }

  return REGEX_INDICATORS.some((indicator) => indicator.test(pattern));
}

export function compileTitleMatcher(pattern: string): TitleMatcher {
  const normalizedPattern = pattern.trim();
  if (!normalizedPattern) {
    throw new Error("Filter pattern is required");
  }

  const regexLiteral = parseRegexLiteral(normalizedPattern);
  if (regexLiteral) {
    return buildRegexMatcher(regexLiteral, normalizedPattern);
  }

  if (shouldUseRegex(normalizedPattern)) {
    return buildRegexMatcher(new RegExp(normalizedPattern, "i"), normalizedPattern);
  }

  const terms = normalizedPattern
    .split(TERM_SEPARATOR_RE)
    .map((term) => term.trim().toLocaleLowerCase())
    .filter(Boolean);

  if (terms.length === 0) {
    throw new Error("Filter pattern is required");
  }

  return {
    mode: "terms",
    source: normalizedPattern,
    test(title: string): boolean {
      const normalizedTitle = title.toLocaleLowerCase();
      return terms.every((term) => normalizedTitle.includes(term));
    },
  };
}

export function validateTitlePattern(pattern: string): void {
  compileTitleMatcher(pattern);
}