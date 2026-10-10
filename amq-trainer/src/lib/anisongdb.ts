import type { SharedAnime, Song, SongKind } from '../types';
import { cacheGet, cacheSet, DAY_MS } from './cache';
import { chunk, postJson, sleep } from './http';

const MAL_IDS_URL = 'https://anisongdb.com/api/mal_ids_request';
const SEARCH_URL = 'https://anisongdb.com/api/search_request';
const AMQ_SONG_IDS_URL = 'https://anisongdb.com/api/amq_song_ids_request';
const AUDIO_BASE_URL = 'https://naedist.animemusicquiz.com/';
const MAX_IDS_PER_REQUEST = 500;
// AnisongDB limite le débit (réponse 429 sans en-tête CORS, vue comme une erreur réseau).
const DELAY_BETWEEN_SEARCHES_MS = 500;
/** Version du cache : à incrémenter quand la logique de recherche ou la forme de `Song` change. */
const CACHE_PREFIX = 'anisongdb:v2:';
/** Un résultat vide est revérifié plus tôt : AnisongDB ajoute régulièrement des chansons. */
const EMPTY_TTL_MS = DAY_MS;

/**
 * Tous les types sont toujours demandés : le cache ne dépend pas des réglages de la partie,
 * le filtrage par type se fait ensuite côté client.
 */
const ALL_KINDS: SongKind[] = ['opening', 'ending', 'insert'];
const FILTERS = { song_types: ALL_KINDS, broadcasts: ['normal'] };

/** Champs utilisés d'une `SongEntry` AnisongDB. */
interface SongEntry {
  annId: number;
  annSongId: number;
  /** Identifiant AMQ de la musique : identique dans tous les animés qui l'utilisent. */
  amqSongId: number | null;
  animeJPName: string;
  animeENName: string;
  animeAltName: string[] | null;
  animeVintage: string | null;
  animeType: string | null;
  linked_ids: { myanimelist: number | null };
  /** « Opening 1 », « Ending 2 », « Insert Song »… */
  songType: string;
  songName: string;
  songArtist: string;
  songDifficulty: number | null;
  songLength: number | null;
  audio: string | null;
  MQ: string | null;
  HQ: string | null;
}

/** Animé dont on cherche les chansons. */
export interface SongQuery {
  /** Clé de l'animé (`animeKey`), utilisée pour le cache et le résultat. */
  key: string;
  malId: number | null;
  title: string;
  /** Année et format AniList, pour départager les homonymes de la recherche par nom. */
  year: number | null;
  format: string | null;
}

/** Formats AniList → types AnisongDB. */
const FORMAT_TO_TYPE: Record<string, string> = {
  TV: 'tv',
  TV_SHORT: 'tv',
  MOVIE: 'movie',
  SPECIAL: 'special',
  OVA: 'ova',
  ONA: 'ona',
};

function toKind(songType: string): SongKind | null {
  const type = songType.toLowerCase();
  if (type.startsWith('opening')) return 'opening';
  if (type.startsWith('ending')) return 'ending';
  if (type.startsWith('insert')) return 'insert';
  return null;
}

function toSong(entry: SongEntry): Song | null {
  // Les animés récents n'ont parfois que la vidéo : <audio> sait en lire la piste son (streaming).
  const file = entry.audio ?? entry.MQ ?? entry.HQ;
  const kind = toKind(entry.songType);
  if (!file || !kind) return null;
  return {
    annSongId: entry.annSongId,
    amqSongId: entry.amqSongId ?? null,
    sharedAnime: [],
    annId: entry.annId,
    kind,
    number: Number(/\d+/.exec(entry.songType)?.[0] ?? 0),
    name: entry.songName,
    artist: entry.songArtist,
    audioUrl: AUDIO_BASE_URL + file,
    length: entry.songLength,
    difficulty: entry.songDifficulty,
    anime: {
      jpName: entry.animeJPName,
      enName: entry.animeENName,
      altNames: entry.animeAltName ?? [],
      vintage: entry.animeVintage,
      type: entry.animeType,
    },
  };
}

const KIND_ORDER: Record<SongKind, number> = { opening: 0, ending: 1, insert: 2 };

/** Chansons dédoublonnées, triées par type puis par numéro. */
function toSongs(entries: SongEntry[]): Song[] {
  const songs = new Map<number, Song>();
  for (const entry of entries) {
    const song = toSong(entry);
    if (song) songs.set(song.annSongId, song);
  }
  return [...songs.values()].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.number - b.number);
}

/** Nom comparable : minuscules, sans accents ni ponctuation, « wo » romanisé en « o ». */
function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\bwo\b/g, 'o')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Repli : recherche par nom, pour les animés mal reliés à leur ID MAL dans AnisongDB.
 * Ne garde que les entrées dont un nom correspond exactement, puis vérifie l'année et le format
 * AniList ; abandonne s'il ne reste pas exactement un animé.
 */
async function searchByName(query: SongQuery, signal?: AbortSignal): Promise<Song[]> {
  const entries = await postJson<SongEntry[]>(
    SEARCH_URL,
    { anime_search_filter: { search: query.title, partial_match: false }, filters: FILTERS },
    signal,
  );

  const target = normalizeName(query.title);
  const byAnime = new Map<number, SongEntry[]>();
  for (const entry of entries) {
    const names = [entry.animeJPName, entry.animeENName, ...(entry.animeAltName ?? [])];
    if (!names.some((n) => normalizeName(n) === target)) continue;
    byAnime.set(entry.annId, [...(byAnime.get(entry.annId) ?? []), entry]);
  }

  // Année et format vérifiés même pour un candidat unique : une OVA ou une autre saison
  // porte souvent exactement le même nom que la série (ex. Violet Evergarden TV / OVA).
  let candidates = [...byAnime.values()];
  if (query.year !== null) {
    candidates = candidates.filter(([e]) => e.animeVintage?.endsWith(String(query.year)));
  }
  const type = query.format ? FORMAT_TO_TYPE[query.format] : undefined;
  if (type) {
    candidates = candidates.filter(([e]) => e.animeType?.toLowerCase() === type);
  }
  return candidates.length === 1 ? toSongs(candidates[0]) : [];
}

/** Chansons d'une liste d'ID MAL, groupées par ID MAL. */
async function requestByMalIds(malIds: number[], signal?: AbortSignal): Promise<Map<number, SongEntry[]>> {
  const entries = await postJson<SongEntry[]>(MAL_IDS_URL, { mal_ids: [...new Set(malIds)], filters: FILTERS }, signal);
  const byMal = new Map<number, SongEntry[]>();
  for (const entry of entries) {
    const malId = entry.linked_ids.myanimelist;
    if (malId !== null) byMal.set(malId, [...(byMal.get(malId) ?? []), entry]);
  }
  return byMal;
}

/**
 * Complète chaque chanson avec les autres animés qui utilisent la même musique (même `amqSongId`),
 * tous types et diffusions confondus : ex. l'Opening 1 de Higurashi est aussi l'Opening 1 du
 * Gaiden et l'Ending 1 de Gou. Une seule requête par lot de 500 musiques.
 */
async function attachSharedAnime(songs: Song[], signal?: AbortSignal): Promise<void> {
  const ids = [...new Set(songs.map((s) => s.amqSongId).filter((id): id is number => id !== null))];
  const byAmqId = new Map<number, SongEntry[]>();
  for (const batch of chunk(ids, MAX_IDS_PER_REQUEST)) {
    const entries = await postJson<SongEntry[]>(AMQ_SONG_IDS_URL, { amq_song_ids: batch }, signal);
    for (const entry of entries) {
      if (entry.amqSongId !== null) byAmqId.set(entry.amqSongId, [...(byAmqId.get(entry.amqSongId) ?? []), entry]);
    }
  }
  for (const song of songs) {
    const shared = new Map<number, SharedAnime>();
    for (const entry of byAmqId.get(song.amqSongId ?? -1) ?? []) {
      if (entry.annId === song.annId || shared.has(entry.annId)) continue;
      shared.set(entry.annId, {
        annId: entry.annId,
        jpName: entry.animeJPName,
        enName: entry.animeENName,
        altNames: entry.animeAltName ?? [],
        songType: entry.songType,
      });
    }
    song.sharedAnime = [...shared.values()];
  }
}

/**
 * Openings, endings et insert songs des animés, par clé d'animé.
 * 1. une requête groupée par ID MAL ; 2. repli par nom pour les animés restés sans chanson ;
 * 3. animés qui partagent chaque musique (`attachSharedAnime`).
 * Cache : 7 jours si des chansons sont trouvées, 1 jour sinon.
 */
export async function fetchSongs(
  queries: SongQuery[],
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Map<string, Song[]>> {
  const result = new Map<string, Song[]>();
  const toFetch: SongQuery[] = [];
  for (const query of queries) {
    const cached = cacheGet<Song[]>(CACHE_PREFIX + query.key);
    if (cached) result.set(query.key, cached);
    else toFetch.push(query);
  }
  onProgress(result.size, queries.length);

  /** Chansons trouvées pendant cet appel, mises en cache une fois complétées. */
  const fresh = new Map<string, Song[]>();
  const found = (key: string, songs: Song[]) => {
    fresh.set(key, songs);
    result.set(key, songs);
  };

  // 1. Recherche groupée par ID MAL.
  for (const batch of chunk(toFetch.filter((q) => q.malId !== null), MAX_IDS_PER_REQUEST)) {
    const byMal = await requestByMalIds(batch.map((q) => q.malId!), signal);
    for (const query of batch) {
      const songs = toSongs(byMal.get(query.malId!) ?? []);
      if (songs.length) found(query.key, songs);
    }
    onProgress(result.size, queries.length);
  }

  // 2. Repli par nom, un animé à la fois : animés inconnus sous leur ID MAL ou sans ID MAL.
  for (const [i, query] of toFetch.filter((q) => !result.has(q.key)).entries()) {
    if (i > 0) await sleep(DELAY_BETWEEN_SEARCHES_MS, signal);
    found(query.key, await searchByName(query, signal));
    onProgress(result.size, queries.length);
  }

  // 3. Animés qui partagent chaque musique, puis mise en cache.
  await attachSharedAnime([...fresh.values()].flat(), signal);
  for (const [key, songs] of fresh) cacheSet(CACHE_PREFIX + key, songs, songs.length ? undefined : EMPTY_TTL_MS);
  return result;
}
