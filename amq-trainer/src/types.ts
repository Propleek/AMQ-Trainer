/** Animé d'une liste (import AniList, export XML MyAnimeList ou liste manuelle). */
export interface AnimeEntry {
  malId: number | null;
  /** Renseigné pour les entrées « MAL entry not found » et les listes AniList / manuelles. */
  anilistId: number | null;
  title: string;
  status: string;
  score: number;
}

/** Liste d'animés importée. */
export interface MalList {
  userName: string;
  entries: AnimeEntry[];
}

export type SongKind = 'opening' | 'ending' | 'insert';

export const SONG_KIND_LABELS: Record<SongKind, string> = {
  opening: 'Openings',
  ending: 'Endings',
  insert: 'Insert songs',
};

const SONG_TYPE_NAMES: Record<SongKind, string> = { opening: 'Opening', ending: 'Ending', insert: 'Insert Song' };

/** Type de la chanson, comme sur AMQ : « Opening 2 », « Ending 1 », « Insert Song ». */
export function songTypeLabel(song: Pick<Song, 'kind' | 'number'>): string {
  return song.number ? `${SONG_TYPE_NAMES[song.kind]} ${song.number}` : SONG_TYPE_NAMES[song.kind];
}

/** Autre animé qui utilise la même musique (même `amqSongId`) : sa réponse est aussi acceptée. */
export interface SharedAnime {
  annId: number;
  jpName: string;
  enName: string;
  altNames: string[];
  /** Type de la chanson dans cet animé, ex. « Ending 1 » (pas forcément le même). */
  songType: string;
}

/** Chanson jouable dans le quiz. */
export interface Song {
  annSongId: number;
  /** Identifiant AMQ de la musique, commun à tous les animés qui l'utilisent. */
  amqSongId: number | null;
  /** Autres animés qui utilisent cette musique : impossibles à distinguer, donc acceptés aussi. */
  sharedAnime: SharedAnime[];
  /** Identifiant ANN de l'animé : la réponse doit désigner cet animé exact. */
  annId: number;
  kind: SongKind;
  /** Numéro de l'opening / ending (0 si absent, toujours pour les insert songs). */
  number: number;
  name: string;
  artist: string;
  audioUrl: string;
  /** Vidéo de l'extrait (480p, sinon 720p), montrée à la révélation ; `null` si absente. */
  videoUrl: string | null;
  /** Durée de l'extrait en secondes, si connue. */
  length: number | null;
  /** Difficulté AnisongDB (0 = très difficile, 100 = très facile), si connue. */
  difficulty: number | null;
  anime: {
    /** Nom romaji, celui de l'autocomplétion AnisongDB. */
    jpName: string;
    enName: string;
    altNames: string[];
    /** Ex. « Spring 2013 ». */
    vintage: string | null;
    /** Ex. « TV », « Movie ». */
    type: string | null;
  };
}
