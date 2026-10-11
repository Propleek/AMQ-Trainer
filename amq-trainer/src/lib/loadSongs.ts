import type { AnimeEntry, Song } from '../types';
import { animeKey, fetchAnimeInfo } from './anilist';
import { fetchSongs } from './anisongdb';
import type { SongQuery } from './anisongdb';
import { updateCatalog } from './animeCatalog';
import type { CatalogAnime } from './animeCatalog';

export interface LoadProgress {
  step: 'anime' | 'songs';
  done: number;
  total: number;
}

export interface LoadResult {
  /**
   * Toutes les chansons de la liste, tous types confondus. Une musique utilisée par plusieurs
   * animés de la liste (même `amqSongId`) n'apparaît qu'une fois.
   */
  songs: Song[];
  /** Couverture AniList par ANN ID, pour l'écran de révélation. */
  covers: Map<number, string>;
  /** Statuts des animés de la liste qui utilisent la chanson, par `annSongId` (filtre par statut). */
  statusOf: Map<number, string[]>;
  /** Titres des animés sans chanson trouvée. */
  withoutSongs: string[];
}

/** Clé d'une musique : une même musique utilisée par plusieurs animés n'est jouée qu'une fois. */
const songKey = (song: Song) => (song.amqSongId !== null ? `amq-${song.amqSongId}` : `ann-${song.annSongId}`);

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

  /** Par `amqSongId` (ou `annSongId` à défaut) : une même musique n'est jouée qu'une fois. */
  const songs = new Map<string, Song>();
  const covers = new Map<number, string>();
  /** Statuts par musique (même clé que `songs`). */
  const statuses = new Map<string, Set<string>>();
  const withoutSongs: string[] = [];
  for (const entry of entries) {
    const found = songsByKey.get(animeKey(entry)) ?? [];
    if (!found.length) withoutSongs.push(entry.title);

    const cover = infos.get(animeKey(entry))?.imageUrl;
    if (cover) for (const song of found) covers.set(song.annId, cover);
    for (const song of found) {
      const key = songKey(song);
      statuses.set(key, (statuses.get(key) ?? new Set()).add(entry.status));
      const kept = songs.get(key);
      // Doublon : on garde l'entrée au plus petit annSongId, stable d'un chargement à l'autre
      // (la progression est enregistrée sous cet identifiant).
      if (!kept || song.annSongId < kept.annSongId) songs.set(key, song);
    }
  }
  const statusOf = new Map<number, string[]>();
  for (const [key, song] of songs) statusOf.set(song.annSongId, [...statuses.get(key)!]);

  // Catalogue animé → musiques, pour le tableau de bord du compte (animés maîtrisés).
  const catalog: CatalogAnime[] = [];
  for (const entry of entries) {
    const found = songsByKey.get(animeKey(entry)) ?? [];
    if (!found.length) continue;
    catalog.push({
      annId: found[0].annId,
      name: found[0].anime.jpName,
      songIds: [...new Set(found.map((song) => songs.get(songKey(song))!.annSongId))],
    });
  }
  updateCatalog(catalog);

  return { songs: [...songs.values()], covers, statusOf, withoutSongs };
}
