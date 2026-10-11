import type { Song, SongKind } from '../types';
import { getProgress, songState } from './progress';

const STORAGE_KEY = 'amq-trainer:settings:v2';

export type SamplePoint = 'random' | 'start';

/** Modes de jeu (§4.2 de la feuille de route). */
export type QuizMode = 'discovery' | 'review' | 'test';

export const MODE_LABELS: Record<QuizMode, string> = {
  discovery: 'Découverte',
  review: 'Révision',
  test: 'Test',
};

/** Réglages d'une partie (§3.3 de la feuille de route). */
export interface QuizSettings {
  mode: QuizMode;
  /** Statuts de liste exclus (vide = tous inclus) : un nouveau statut est inclus par défaut. */
  excludedStatuses: string[];
  kinds: SongKind[];
  /** Nombre de musiques par mode ; `null` = toutes celles du pool. */
  counts: Record<QuizMode, number | null>;
  /** Mode Test : tirer aussi parmi les chansons jamais vues (toute la liste). */
  testIncludesUnseen: boolean;
  /** Durée de réponse en secondes. */
  guessTime: number;
  /** Difficulté AnisongDB min / max (0 = très difficile, 100 = très facile). */
  difficulty: [number, number];
  samplePoint: SamplePoint;
}

export const DEFAULT_SETTINGS: QuizSettings = {
  mode: 'discovery',
  excludedStatuses: [],
  kinds: ['opening', 'ending', 'insert'],
  counts: { discovery: 100, review: null, test: 20 },
  testIncludesUnseen: false,
  guessTime: 20,
  difficulty: [0, 100],
  samplePoint: 'random',
};

export const GUESS_TIME_RANGE = { min: 5, max: 60 } as const;

/** Derniers réglages utilisés, complétés par les valeurs par défaut. */
export function loadSettings(): QuizSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<QuizSettings>;
    return { ...DEFAULT_SETTINGS, ...saved, counts: { ...DEFAULT_SETTINGS.counts, ...saved.counts } };
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
 * Chansons qui correspondent aux réglages (statut de l'animé, type, difficulté), tous états confondus.
 * Une chanson sans difficulté connue n'est gardée que si l'intervalle n'est pas restreint.
 */
export function filterSongs(songs: Song[], statusOf: Map<number, string[]>, settings: QuizSettings): Song[] {
  const excluded = new Set(settings.excludedStatuses);
  const kinds = new Set(settings.kinds);
  const [min, max] = settings.difficulty;
  const anyDifficulty = isFullRange(settings.difficulty);
  return songs.filter((song) => {
    if (!kinds.has(song.kind)) return false;
    // Musique partagée par plusieurs animés de la liste : exclue seulement si tous leurs statuts le sont.
    if ((statusOf.get(song.annSongId) ?? ['']).every((status) => excluded.has(status))) return false;
    if (anyDifficulty) return true;
    return song.difficulty !== null && song.difficulty >= min && song.difficulty <= max;
  });
}

/**
 * Pool de chansons d'un mode : Découverte = jamais vues ; Révision = ratées puis à revoir ;
 * Test = déjà vues (ou toutes, selon le réglage).
 */
export function modePool(songs: Song[], settings: Pick<QuizSettings, 'mode' | 'testIncludesUnseen'>): Song[] {
  switch (settings.mode) {
    case 'discovery':
      return songs.filter((s) => songState(s.progressId) === 'unseen');
    case 'review':
      return songs.filter((s) => {
        const state = songState(s.progressId);
        return state === 'review' || state === 'due';
      });
    case 'test':
      return settings.testIncludesUnseen ? songs : songs.filter((s) => songState(s.progressId) !== 'unseen');
  }
}

/**
 * Tirage d'une partie dans le pool d'un mode. En Révision, les chansons ratées passent d'abord,
 * puis celles à revoir depuis le plus longtemps ; l'ordre de jeu est ensuite mélangé.
 */
export function drawForMode(pool: Song[], mode: QuizMode, count: number | null): Song[] {
  if (mode !== 'review' || count === null || count >= pool.length) return drawSongs(pool, count);
  const missed = shuffle(pool.filter((s) => songState(s.progressId) === 'review'));
  const due = pool
    .filter((s) => songState(s.progressId) === 'due')
    .sort((a, b) => (getProgress(a.progressId)?.dueAt ?? '').localeCompare(getProgress(b.progressId)?.dueAt ?? ''));
  return shuffle([...missed, ...due].slice(0, count));
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
