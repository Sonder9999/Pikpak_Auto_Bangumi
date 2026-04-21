import { describe, expect, test } from 'bun:test'
import {
  buildManualSubscriptionPayload,
  buildMikanSubscriptionPayload,
  extractSubscribedBangumiSubjectIds,
} from '../../frontend/src/subscription-helpers'

describe('frontend subscription helpers', () => {
  test('buildManualSubscriptionPayload keeps only explicit Bangumi identity', () => {
    expect(buildManualSubscriptionPayload({
      bangumiSubjectId: 576351,
      sourceId: 12,
      rssUrl: 'https://example.com/manual.xml',
      regexInclude: '1080p',
    })).toEqual({
      bangumiSubjectId: 576351,
      mikanBangumiId: null,
      sourceId: 12,
      rssUrl: 'https://example.com/manual.xml',
      regexInclude: '1080p',
      regexExclude: undefined,
    })
  })

  test('buildMikanSubscriptionPayload keeps both explicit identities', () => {
    expect(buildMikanSubscriptionPayload({
      bangumiSubjectId: 576351,
      mikanBangumiId: 3928,
      subgroupName: 'LoliHouse',
      rssUrl: 'https://mikanani.me/RSS/Bangumi?bangumiId=3928&subgroupid=370',
      regexInclude: '1080p',
      episodeOffset: 1,
    })).toEqual({
      bangumiSubjectId: 576351,
      mikanBangumiId: 3928,
      subgroupName: 'LoliHouse',
      rssUrl: 'https://mikanani.me/RSS/Bangumi?bangumiId=3928&subgroupid=370',
      regexInclude: '1080p',
      regexExclude: undefined,
      episodeOffset: 1,
    })
  })

  test('extractSubscribedBangumiSubjectIds ignores legacy fallback fields', () => {
    expect(extractSubscribedBangumiSubjectIds([
      { bangumiSubjectId: 576351 },
      { bangumiSubjectId: null },
      {} as { bangumiId: number },
    ])).toEqual([576351])
  })
})