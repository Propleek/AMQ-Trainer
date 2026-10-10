import type { AnimeEntry } from '../types';
import { cacheGet, cacheSet } from './cache';
import { chunk, postJson, sleep } from './http';

export const ANILIST_URL = 'https://graphql.anilist.co';
const BATCH_SIZE = 50;
const DELAY_BETWEEN_BATCHES_MS = 1000;

const QUERY = `
query ($malIds: [Int], $ids: [Int]) {
  Page(perPage: 50) {
    media(idMal_in: $malIds, id_in: $ids, type: ANIME) {
      id
      idMal
      format
      seasonYear
      startDate { year }
      coverImage { large }
    }
  }
}`;

export interface Media {
  id: number;
  idMal: number | null;
  format: string | null;
  seasonYear: number | null;
  startDate: { year: number | null };
  coverImage: { large: string | null };
}

interface PageResponse {
  data?: { Page: { media: Media[] } };
  errors?: { message: string }[];
}

export interface AnimeInfo {
  imageUrl: string | null;
  /** ID MAL connu d'AniList (utile pour les entrées sans ID MAL dans le XML). */
  malId: number | null;
  /** Année et format (TV, MOVIE…) : départagent les homonymes lors de la recherche par nom. */
  year: number | null;
  format: string | null;
}

/** Version du cache : à incrémenter quand `AnimeInfo` change de forme. */
const CACHE_PREFIX = 'anilist:v2:';

/** Clé stable d'un animé, partagée par le cache et les identifiants d'éléments. */
export function animeKey(entry: AnimeEntry): string {
  return entry.malId !== null ? `mal-${entry.malId}` : `al-${entry.anilistId}`;
}

/** Infos utiles d'un média AniList ; l'ID MAL du XML prime sur celui d'AniList. */
export function toAnimeInfo(m: Media | undefined, malId: number | null): AnimeInfo {
  return {
    imageUrl: m?.coverImage.large ?? null,
    malId: malId ?? m?.idMal ?? null,
    year: m?.seasonYear ?? m?.startDate.year ?? null,
    format: m?.format ?? null,
  };
}

/** Pré-remplit le cache, pour une liste qui fournit déjà les médias (import par pseudo AniList). */
export function cacheAnimeInfo(entry: AnimeEntry, info: AnimeInfo): void {
  cacheSet(CACHE_PREFIX + animeKey(entry), info);
}

/** Un lot fait au plus 50 IDs, donc une seule page de 50 résultats suffit. */
async function queryBatch(variables: { malIds?: number[]; ids?: number[] }, signal?: AbortSignal): Promise<Media[]> {
  const res = await postJson<PageResponse>(ANILIST_URL, { query: QUERY, variables }, signal);
  if (!res.data) throw new Error(`AniList : ${res.errors?.map((e) => e.message).join(', ') ?? 'réponse vide'}`);
  return res.data.Page.media;
}

/**
 * Couvertures des animés, par lots de 50 (cache 7 jours).
 * Les entrées absentes d'AniList sont mises en cache avec `imageUrl: null`.
 */
export async function fetchAnimeInfo(
  entries: AnimeEntry[],
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Map<string, AnimeInfo>> {
  const result = new Map<string, AnimeInfo>();
  const toFetch: AnimeEntry[] = [];

  for (const entry of entries) {
    const cached = cacheGet<AnimeInfo>(CACHE_PREFIX + animeKey(entry));
    if (cached) result.set(animeKey(entry), cached);
    else toFetch.push(entry);
  }
  onProgress(result.size, entries.length);

  const byMal = toFetch.filter((e) => e.malId !== null);
  const byAnilist = toFetch.filter((e) => e.malId === null && e.anilistId !== null);
  const batches = [
    ...chunk(byMal, BATCH_SIZE).map((batch) => ({ batch, malIds: batch.map((e) => e.malId!) })),
    ...chunk(byAnilist, BATCH_SIZE).map((batch) => ({ batch, ids: batch.map((e) => e.anilistId!) })),
  ];

  for (const [i, { batch, ...variables }] of batches.entries()) {
    if (i > 0) await sleep(DELAY_BETWEEN_BATCHES_MS, signal);
    const media = await queryBatch(variables, signal);
    const byMalId = new Map(media.filter((m) => m.idMal !== null).map((m) => [m.idMal!, m]));
    const byId = new Map(media.map((m) => [m.id, m]));

    for (const entry of batch) {
      const m = entry.malId !== null ? byMalId.get(entry.malId) : byId.get(entry.anilistId!);
      const info = toAnimeInfo(m, entry.malId);
      result.set(animeKey(entry), info);
      cacheAnimeInfo(entry, info);
    }
    onProgress(result.size, entries.length);
  }
  return result;
}
