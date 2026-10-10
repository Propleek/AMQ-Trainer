import { clearCache } from './cache';

const STORAGE_KEY = 'amq-trainer:progress:v1';

/** Progression d'une chanson (`annSongId`), partagée par toutes les listes qui la contiennent. */
export interface SongProgress {
  /** Nombre de fois jouée. */
  seen: number;
  correct: number;
  /** Date ISO du dernier passage. */
  lastSeen: string;
  /** Ratée au dernier passage : dans le pool « À réviser ». */
  missed: boolean;
}

/** État d'une chanson (§4.1 de la feuille de route). */
export type SongState = 'unseen' | 'review' | 'known';

export const SONG_STATE_LABELS: Record<SongState, string> = {
  unseen: 'Jamais vues',
  review: 'À réviser',
  known: 'Connues',
};

type ProgressMap = Record<number, SongProgress>;

/** Lecture unique du localStorage, puis copie en mémoire. */
let progress: ProgressMap | null = null;

function getAll(): ProgressMap {
  if (!progress) {
    try {
      progress = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as ProgressMap;
    } catch {
      progress = {};
    }
  }
  return progress;
}

export function songState(annSongId: number): SongState {
  const record = getAll()[annSongId];
  if (!record) return 'unseen';
  return record.missed ? 'review' : 'known';
}

/**
 * Enregistre une réponse : l'état suit le dernier passage (trouvée → Connue, ratée → À réviser).
 * Écrit aussitôt, pour qu'une partie abandonnée garde les réponses déjà données.
 * Si le stockage est plein, le cache d'API est vidé (il se reconstruit) avant de réessayer.
 * Renvoie `false` si la progression n'a pas pu être enregistrée.
 */
export function recordAnswer(annSongId: number, correct: boolean): boolean {
  const all = getAll();
  const previous = all[annSongId];
  all[annSongId] = {
    seen: (previous?.seen ?? 0) + 1,
    correct: (previous?.correct ?? 0) + (correct ? 1 : 0),
    lastSeen: new Date().toISOString(),
    missed: !correct,
  };
  const json = JSON.stringify(all);
  try {
    localStorage.setItem(STORAGE_KEY, json);
    return true;
  } catch {
    clearCache();
    try {
      localStorage.setItem(STORAGE_KEY, json);
      return true;
    } catch {
      // Stockage indisponible : la progression reste en mémoire pour cette session.
      return false;
    }
  }
}
