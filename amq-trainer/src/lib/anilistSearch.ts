import type { AnimeEntry } from '../types';
import { ANILIST_URL, cacheAnimeInfo, toAnimeInfo } from './anilist';
import type { Media } from './anilist';
import { postJson } from './http';

const PER_PAGE = 20;

const QUERY = `
query ($search: String, $perPage: Int) {
  Page(perPage: $perPage) {
    media(search: $search, type: ANIME, isAdult: false, sort: SEARCH_MATCH) {
      id
      idMal
      title { romaji english }
      format
      seasonYear
      startDate { year }
      coverImage { large }
    }
  }
}`;

interface SearchMedia extends Media {
  title: { romaji: string | null; english: string | null };
}

interface SearchResponse {
  data?: { Page: { media: SearchMedia[] } };
  errors?: { message: string }[];
}

/** Résultat de recherche affichable, avec l'entrée de liste correspondante. */
export interface SearchResult {
  entry: AnimeEntry;
  englishTitle: string | null;
  format: string | null;
  year: number | null;
  imageUrl: string | null;
}

/** Statut des animés ajoutés à la main (pas de statut de visionnage). */
export const MANUAL_STATUS = 'Liste manuelle';

/** Libellés courts des formats AniList. */
export const FORMAT_LABELS: Record<string, string> = {
  TV: 'TV',
  TV_SHORT: 'TV court',
  MOVIE: 'Film',
  SPECIAL: 'Spécial',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'Clip',
};

/**
 * Recherche d'animés sur AniList (20 premiers résultats, par pertinence).
 * Les infos reçues sont mises en cache : le chargement des chansons n'aura pas à les redemander.
 */
export async function searchAnime(search: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const res = await postJson<SearchResponse>(ANILIST_URL, { query: QUERY, variables: { search, perPage: PER_PAGE } }, signal);
  if (!res.data) throw new Error(`AniList : ${res.errors?.map((e) => e.message).join(', ') ?? 'réponse vide'}`);

  return res.data.Page.media.map((media) => {
    const entry: AnimeEntry = {
      malId: media.idMal,
      anilistId: media.id,
      title: media.title.romaji ?? media.title.english ?? `AniList #${media.id}`,
      status: MANUAL_STATUS,
      score: 0,
    };
    const info = toAnimeInfo(media, media.idMal);
    cacheAnimeInfo(entry, info);
    return { entry, englishTitle: media.title.english, format: info.format, year: info.year, imageUrl: info.imageUrl };
  });
}
