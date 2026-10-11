import { clearCache } from './cache';

const STORAGE_KEY = 'amq-trainer:progress:v1';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Boîtes de Leitner : 1 = à réviser, 5 = la mieux connue. */
export const BOXES = [1, 2, 3, 4, 5] as const;
export type Box = (typeof BOXES)[number];
/** Délai avant de revoir une chanson, par boîte (jours). La boîte 1 est à réviser tout de suite. */
export const BOX_INTERVAL_DAYS: Record<Box, number> = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 21 };
/** Boîte d'une chanson trouvée dès sa découverte. */
const DISCOVERED_BOX: Box = 3;

/** Progression d'une chanson (clé : `Song.progressId`), partagée par toutes les listes qui la contiennent. */
export interface SongProgress {
  /** Nombre de fois jouée. */
  seen: number;
  correct: number;
  /** Date ISO du dernier passage. */
  lastSeen: string;
  /** Ratée au dernier passage : dans le pool « À réviser ». */
  missed: boolean;
  box: Box;
  /** Date ISO à partir de laquelle la chanson est à revoir. */
  dueAt: string;
}

/**
 * État d'une chanson (§4.1 et §4.3 de la feuille de route) : jamais vue, ratée (à réviser),
 * connue mais dont la date de révision est passée (à revoir), connue et à jour.
 */
export type SongState = 'unseen' | 'review' | 'due' | 'known';

export const SONG_STATE_LABELS: Record<SongState, string> = {
  unseen: 'Jamais vues',
  review: 'À réviser',
  due: 'À revoir',
  known: 'Connues',
};

type ProgressMap = Record<number, SongProgress>;

/** Lecture unique du localStorage, puis copie en mémoire. */
let progress: ProgressMap | null = null;

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS).toISOString();

/** Complète un enregistrement d'avant les boîtes de Leitner (étape 5). */
function migrate(record: SongProgress): SongProgress {
  if (record.box) return record;
  const box: Box = record.missed ? 1 : DISCOVERED_BOX;
  return { ...record, box, dueAt: addDays(new Date(record.lastSeen), BOX_INTERVAL_DAYS[box]) };
}

function getAll(): ProgressMap {
  if (!progress) {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as ProgressMap;
      progress = Object.fromEntries(Object.entries(raw).map(([id, record]) => [id, migrate(record)]));
    } catch {
      progress = {};
    }
  }
  return progress;
}

export function getProgress(progressId: number): SongProgress | undefined {
  return getAll()[progressId];
}

export function songState(progressId: number, now = Date.now()): SongState {
  const record = getAll()[progressId];
  if (!record) return 'unseen';
  if (record.missed) return 'review';
  return Date.parse(record.dueAt) <= now ? 'due' : 'known';
}

/** Nouvelle progression après une réponse (fonction pure, testable). */
export function nextProgress(previous: SongProgress | undefined, correct: boolean, now = new Date()): SongProgress {
  const base = {
    seen: (previous?.seen ?? 0) + 1,
    correct: (previous?.correct ?? 0) + (correct ? 1 : 0),
    lastSeen: now.toISOString(),
    missed: !correct,
  };
  let box: Box;
  if (!correct) box = 1;
  else if (!previous) box = DISCOVERED_BOX;
  else if (previous.missed || Date.parse(previous.dueAt) <= now.getTime()) box = Math.min(5, previous.box + 1) as Box;
  // Trouvée avant sa date de révision : rien ne change (pas de montée en rejouant la même chanson).
  else return { ...base, box: previous.box, dueAt: previous.dueAt };
  return { ...base, box, dueAt: addDays(now, BOX_INTERVAL_DAYS[box]) };
}

/**
 * Écrit la progression dans le localStorage. Si le stockage est plein, le cache d'API est vidé
 * (il se reconstruit) avant de réessayer. Renvoie `false` si l'écriture a échoué.
 */
function persist(): boolean {
  const json = JSON.stringify(getAll());
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

/**
 * Enregistre une réponse (boîte de Leitner et date de révision, voir `nextProgress`).
 * Écrit aussitôt, pour qu'une partie abandonnée garde les réponses déjà données.
 * Renvoie `false` si la progression n'a pas pu être enregistrée.
 */
export function recordAnswer(progressId: number, correct: boolean): boolean {
  getAll()[progressId] = nextProgress(getAll()[progressId], correct);
  markDirty([progressId]);
  return persist();
}

/* ---------- Synchronisation avec le compte (voir sync.ts) ---------- */

const DIRTY_KEY = 'amq-trainer:progress-dirty:v1';

/** Chansons modifiées depuis la dernière synchronisation (gardées si l'onglet est fermé ou hors ligne). */
export function dirtyIds(): number[] {
  try {
    return JSON.parse(localStorage.getItem(DIRTY_KEY) ?? '[]') as number[];
  } catch {
    return [];
  }
}

function writeDirty(ids: Iterable<number>): void {
  try {
    localStorage.setItem(DIRTY_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // Au pire, ces chansons seront renvoyées lors de la prochaine synchronisation complète.
  }
}

function markDirty(ids: number[]): void {
  writeDirty([...dirtyIds(), ...ids]);
}

/** Retire les chansons envoyées de la liste à synchroniser. */
export function markClean(ids: number[]): void {
  const sent = new Set(ids);
  writeDirty(dirtyIds().filter((id) => !sent.has(id)));
}

export function getAllProgress(): Readonly<Record<number, SongProgress>> {
  return getAll();
}

/**
 * Fusion idempotente d'une progression locale et distante : l'état (boîte, date, ratée) vient
 * du passage le plus récent ; les compteurs prennent le maximum, pour qu'une même progression
 * synchronisée plusieurs fois ne soit jamais comptée deux fois.
 */
export function mergeProgress(local: SongProgress | undefined, remote: SongProgress | undefined): SongProgress | undefined {
  if (!local || !remote) return local ?? remote;
  const latest = Date.parse(remote.lastSeen) > Date.parse(local.lastSeen) ? remote : local;
  return { ...latest, seen: Math.max(local.seen, remote.seen), correct: Math.max(local.correct, remote.correct) };
}

/* ---------- Identifiants retirés (musiques partagées, voir `adoptProgressIds`) ---------- */

const RETIRED_KEY = 'amq-trainer:progress-retired:v1';

/** Anciens identifiants de progression, à supprimer du compte (et à ignorer s'ils en reviennent). */
export function retiredIds(): number[] {
  try {
    return JSON.parse(localStorage.getItem(RETIRED_KEY) ?? '[]') as number[];
  } catch {
    return [];
  }
}

function writeRetired(ids: Iterable<number>): void {
  try {
    localStorage.setItem(RETIRED_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // Au pire, l'ancien identifiant revient du compte et sera de nouveau repris au prochain chargement.
  }
}

/** Retire de la liste les identifiants supprimés du compte. */
export function markRetiredClean(ids: number[]): void {
  const done = new Set(ids);
  writeRetired(retiredIds().filter((id) => !done.has(id)));
}

/**
 * Reprend la progression enregistrée sous un ancien identifiant d'une musique partagée par
 * plusieurs animés (`aliases` : ancien → `progressId`), en la fusionnant (`mergeProgress`).
 * L'ancien identifiant est retiré : supprimé du compte à la prochaine synchronisation.
 * Renvoie `true` si la progression a changé.
 */
export function adoptProgressIds(aliases: Map<number, number>): boolean {
  const all = getAll();
  const moved: number[] = [];
  for (const [oldId, progressId] of aliases) {
    if (oldId === progressId || !all[oldId]) continue;
    all[progressId] = mergeProgress(all[progressId], all[oldId])!;
    delete all[oldId];
    moved.push(oldId);
    markDirty([progressId]);
  }
  if (!moved.length) return false;
  writeRetired([...retiredIds(), ...moved]);
  persist();
  return true;
}

/** Remplace la progression locale par la version fusionnée avec le compte. */
export function replaceAllProgress(merged: Record<number, SongProgress>): void {
  progress = merged;
  persist();
}
