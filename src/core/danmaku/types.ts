/** DanDanPlay API types */

export interface DandanplayEpisode {
  episodeId: number;
  animeId: number;
  animeTitle: string;
  episodeTitle: string;
  type: string;
  typeDescription: string;
  shift: number;
}

export interface SearchEpisodesResponse {
  hasMore: boolean;
  animes: {
    animeId: number;
    animeTitle: string;
    type: string;
    typeDescription: string;
    episodes: DandanplayEpisode[];
  }[];
  errorCode: number;
  success: boolean;
  errorMessage: string;
}

export interface DandanplayComment {
  cid: number;
  p: string; // "time,mode,color,userId"
  m: string; // content
}

export interface GetCommentsResponse {
  count: number;
  comments: DandanplayComment[];
  errorCode: number;
  success: boolean;
  errorMessage: string;
}
