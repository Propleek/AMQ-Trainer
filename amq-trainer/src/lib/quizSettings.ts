import type { Song, SongKind } from '../types';

const STORAGE_KEY = 'amq-trainer:settings:v1';

export type SamplePoint = 'random' | 'start';

/** Réglages d'une partie (§3.3 de la feuille de route). */
export interface QuizSettings {
  /** Statuts de liste exclus (vide = tous inclus) : un nouveau statut est inclus par défaut. */
  excludedStatuses: string[];
  kinds: SongKind[];
  /** Nombre de musiques de la partie ; `null` = toutes celles qui correspondent. */
  count: number | null;
  /** Durée de réponse en secondes. */
  guessTime: number;
  /** Difficulté AnisongDB min / max (0 = très difficile, 100 = très facile). */
  difficulty: [number, number];
  samplePoint: SamplePoint;
}

export const DEFAULT_SETTINGS: QuizSettings = {
  excludedStatuses: [],
  kinds: ['opening', 'ending', 'insert'],
  count: 20,
  guessTime: 20,
  difficulty: [0, 100],
  samplePoint: 'random',
};

export const GUESS_TIME_RANGE = { min: 5, max: 60 } as const;

/** Derniers réglages utilisés, complétés par les valeurs par défaut. */
export function loadSettings(): QuizSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<QuizSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: QuizSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Préférence facultative.
  }
}

const isFullRange = ([min, max]: [number, number]) => min <= 0 && max >= 100;

/**
 * Chansons qui correspondent aux réglages (statut de l'animé, type, difficulté).
 * Une chanson sans difficulté connue n'est gardée que si l'intervalle n'est pas restreint.
 */
export function filterSongs(songs: Song[], statusOf: Map<number, string>, settings: QuizSettings): Song[] {
  const excluded = new Set(settings.excludedStatuses);
  const kinds = new Set(settings.kinds);
  const [min, max] = settings.difficulty;
  const anyDifficulty = isFullRange(settings.difficulty);
  return songs.filter((song) => {
    if (!kinds.has(song.kind)) return false;
    if (excluded.has(statusOf.get(song.annSongId) ?? '')) return false;
    if (anyDifficulty) return true;
    return song.difficulty !== null && song.difficulty >= min && song.difficulty <= max;
  });
}

/** Mélange de Fisher-Yates (copie). */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Tirage aléatoire de `count` chansons (toutes si `null`), dans un ordre mélangé. */
export function drawSongs(pool: Song[], count: number | null): Song[] {
  return shuffle(pool).slice(0, count ?? pool.length);
}
