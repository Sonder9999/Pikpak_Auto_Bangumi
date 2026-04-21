export interface SubscriptionSourceSummary {
  bangumiSubjectId?: number | null
}

export interface ManualSubscriptionPayloadInput {
  bangumiSubjectId: number
  sourceId?: number | null
  rssUrl: string
  regexInclude?: string
  regexExclude?: string
}

export interface MikanSubscriptionPayloadInput {
  bangumiSubjectId: number
  mikanBangumiId: number
  subgroupName: string
  rssUrl: string
  regexInclude?: string
  regexExclude?: string
  episodeOffset?: number
}

export const buildManualSubscriptionPayload = (input: ManualSubscriptionPayloadInput) => {
  return {
    bangumiSubjectId: input.bangumiSubjectId,
    mikanBangumiId: null,
    sourceId: input.sourceId || undefined,
    rssUrl: input.rssUrl,
    regexInclude: input.regexInclude || undefined,
    regexExclude: input.regexExclude || undefined,
  }
}

export const buildMikanSubscriptionPayload = (input: MikanSubscriptionPayloadInput) => {
  return {
    bangumiSubjectId: input.bangumiSubjectId,
    mikanBangumiId: input.mikanBangumiId,
    subgroupName: input.subgroupName,
    rssUrl: input.rssUrl,
    regexInclude: input.regexInclude || undefined,
    regexExclude: input.regexExclude || undefined,
    episodeOffset: input.episodeOffset || 0,
  }
}

export const extractSubscribedBangumiSubjectIds = (sources: SubscriptionSourceSummary[]): number[] => {
  return sources
    .map((source) => Number(source.bangumiSubjectId))
    .filter((value) => Number.isInteger(value) && value > 0)
}