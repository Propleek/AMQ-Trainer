import type { Song } from '../types';
import { cacheGet, cacheSet } from './cache';
import { getJson } from './http';

const AUTOCOMPLETE_URL = 'https://anisongdb.com/api/anime_name_autocomplete';
const CACHE_KEY = 'anime-names:v1';

/**
 * Noms romaji de tous les animés d'AnisongDB (~8 800 noms, ~250 Ko), cache 7 jours.
 * C'est la base du menu d'autocomplétion, comme la liste déroulante d'AMQ.
 */
export async function fetchAnimeNames(signal?: AbortSignal): Promise<string[]> {
  const cached = cacheGet<string[]>(CACHE_KEY);
  if (cached) return cached;
  const names = await getJson<string[]>(AUTOCOMPLETE_URL, signal);
  cacheSet(CACHE_KEY, names);
  return names;
}

/**
 * Propositions de l'autocomplétion : noms romaji de toute la base, complétés des noms anglais et
 * alternatifs des animés de la liste et de ceux qui partagent leurs musiques (absents de l'endpoint
 * AnisongDB). Dédoublonnés, triés.
 */
export function buildAutocompleteNames(baseNames: string[], songs: Iterable<Song>): string[] {
  const names = new Set(baseNames);
  for (const song of songs) {
    for (const anime of [song.anime, ...song.sharedAnime]) {
      for (const name of [anime.jpName, anime.enName, ...anime.altNames]) {
        if (name.trim()) names.add(name);
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
