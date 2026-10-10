import type { AnimeEntry, Song } from '../types';
import { animeKey, fetchAnimeInfo } from './anilist';
import { fetchSongs } from './anisongdb';
import type { SongQuery } from './anisongdb';

export interface LoadProgress {
  step: 'anime' | 'songs';
  done: number;
  total: number;
}

export interface LoadResult {
  /** Toutes les chansons de la liste, tous types confondus, dédoublonnées. */
  songs: Song[];
  /** Couverture AniList par ANN ID, pour l'écran de révélation. */
  covers: Map<number, string>;
  /** Titres des animés sans chanson trouvée. */
  withoutSongs: string[];
}

/** Chansons des animés d'une liste : infos AniList (ID MAL, année, format), puis AnisongDB. */
export async function loadSongs(
  entries: AnimeEntry[],
  onProgress: (progress: LoadProgress) => void,
  signal?: AbortSignal,
): Promise<LoadResult> {
  const infos = await fetchAnimeInfo(entries, (done, total) => onProgress({ step: 'anime', done, total }), signal);

  const queries = entries.map<SongQuery>((e) => {
    const info = infos.get(animeKey(e));
    return { key: animeKey(e), malId: info?.malId ?? e.malId, title: e.title, year: info?.year ?? null, format: info?.format ?? null };
  });
  const songsByKey = await fetchSongs(queries, (done, total) => onProgress({ step: 'songs', done, total }), signal);

  const songs = new Map<number, Song>();
  const covers = new Map<number, string>();
  const withoutSongs: string[] = [];
  for (const entry of entries) {
    const found = songsByKey.get(animeKey(entry)) ?? [];
    if (!found.length) withoutSongs.push(entry.title);

    const cover = infos.get(animeKey(entry))?.imageUrl;
    for (const song of found) {
      songs.set(song.annSongId, song);
      if (cover) covers.set(song.annId, cover);
    }
  }
  return { songs: [...songs.values()], covers, withoutSongs };
}
