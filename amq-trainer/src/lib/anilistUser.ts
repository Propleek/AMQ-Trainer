import type { AnimeEntry, MalList } from '../types';
import { ANILIST_URL, cacheAnimeInfo, toAnimeInfo } from './anilist';
import type { Media } from './anilist';
import { HttpError, postJson } from './http';

const QUERY = `
query ($userName: String) {
  MediaListCollection(userName: $userName, type: ANIME) {
    user { name }
    lists {
      isCustomList
      entries {
        status
        score(format: POINT_10)
        media {
          id
          idMal
          title { romaji english native }
          format
          seasonYear
          startDate { year }
          coverImage { large }
        }
      }
    }
  }
}`;

type ListStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'DROPPED' | 'PAUSED' | 'REPEATING';

interface ListMedia extends Media {
  title: { romaji: string | null; english: string | null; native: string | null };
}

interface CollectionResponse {
  data?: {
    MediaListCollection: {
      user: { name: string };
      lists: { isCustomList: boolean; entries: { status: ListStatus; score: number; media: ListMedia }[] }[];
    } | null;
  };
  errors?: { message: string }[];
}

/** Statuts AniList → libellés de l'export MyAnimeList (le reste du site les utilise). */
const STATUS_LABELS: Record<ListStatus, string> = {
  CURRENT: 'Watching',
  REPEATING: 'Watching',
  COMPLETED: 'Completed',
  PAUSED: 'On-Hold',
  DROPPED: 'Dropped',
  PLANNING: 'Plan to Watch',
};

export class AnilistUserError extends Error {}

/**
 * Liste d'animés publique d'un utilisateur AniList, au même format qu'un export XML.
 * Les couvertures reçues sont mises en cache : le chargement de la tierlist n'aura pas à les redemander.
 */
export async function fetchAnilistList(userName: string, signal?: AbortSignal): Promise<MalList> {
  let res: CollectionResponse;
  try {
    res = await postJson<CollectionResponse>(ANILIST_URL, { query: QUERY, variables: { userName } }, signal);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) {
      throw new AnilistUserError(`Aucune liste publique pour « ${userName} » : pseudo introuvable ou liste privée.`);
    }
    throw e;
  }

  const collection = res.data?.MediaListCollection;
  if (!collection) {
    throw new AnilistUserError(`AniList : ${res.errors?.map((e) => e.message).join(', ') ?? 'réponse vide'}`);
  }

  // Les listes personnalisées reprennent des animés déjà présents dans les listes de statut.
  const seen = new Set<number>();
  const entries: AnimeEntry[] = [];
  for (const list of collection.lists.filter((l) => !l.isCustomList)) {
    for (const { status, score, media } of list.entries) {
      if (seen.has(media.id)) continue;
      seen.add(media.id);
      const entry: AnimeEntry = {
        malId: media.idMal,
        anilistId: media.id,
        title: media.title.romaji ?? media.title.english ?? media.title.native ?? `AniList #${media.id}`,
        status: STATUS_LABELS[status] ?? status,
        score: Math.round(score),
      };
      entries.push(entry);
      cacheAnimeInfo(entry, toAnimeInfo(media, media.idMal));
    }
  }

  if (!entries.length) throw new AnilistUserError(`La liste d'animés de « ${collection.user.name} » est vide.`);
  return { userName: collection.user.name, entries };
}
