import type { AnimeEntry } from '../types';

const STORAGE_KEY = 'amq-trainer:lists:v1';
const DIRTY_KEY = 'amq-trainer:lists-dirty:v1';

/** Liste d'animés constituée à la main, gardée dans le navigateur et synchronisée avec le compte. */
export interface SavedList {
  id: string;
  name: string;
  entries: AnimeEntry[];
  /** Dates ISO. */
  createdAt: string;
  updatedAt: string;
  /** Liste supprimée, gardée comme marqueur pour que la suppression atteigne les autres appareils. */
  deleted?: boolean;
}

/** Toutes les listes, y compris les marqueurs de suppression. */
export function getAllLists(): SavedList[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedList[]) : [];
  } catch {
    return [];
  }
}

/** Listes affichées, de la plus récemment modifiée à la plus ancienne. */
export function loadSavedLists(): SavedList[] {
  return getAllLists()
    .filter((l) => !l.deleted)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function writeLists(lists: SavedList[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

/** Remplace toutes les listes (fusion avec le compte). */
export function replaceAllLists(lists: SavedList[]): void {
  try {
    writeLists(lists);
  } catch {
    // Stockage indisponible : les listes du compte restent consultables à la prochaine connexion.
  }
}

/* ---------- Listes modifiées depuis la dernière synchronisation ---------- */

export function dirtyListIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DIRTY_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function writeDirty(ids: Iterable<string>): void {
  try {
    localStorage.setItem(DIRTY_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // Au pire, la liste sera renvoyée lors de la prochaine synchronisation complète.
  }
}

export function markListsClean(ids: string[]): void {
  const sent = new Set(ids);
  writeDirty(dirtyListIds().filter((id) => !sent.has(id)));
}

/** Crée ou remplace une liste (même `id`). Lève une erreur si le stockage est indisponible ou plein. */
export function saveList(list: SavedList): void {
  writeLists([...getAllLists().filter((l) => l.id !== list.id), list]);
  writeDirty([...dirtyListIds(), list.id]);
}

/** Supprime une liste en la remplaçant par un marqueur de suppression. */
export function deleteList(id: string): void {
  const existing = getAllLists().find((l) => l.id === id);
  if (!existing) return;
  saveList({ ...existing, entries: [], updatedAt: new Date().toISOString(), deleted: true });
}

/**
 * Fusion des listes locales et du compte (fonction pure) : pour chaque liste, la version modifiée
 * le plus récemment l'emporte, suppressions comprises (marqueurs). À égalité, celle du compte.
 */
export function mergeLists(local: SavedList[], remote: SavedList[]): { merged: SavedList[]; toPush: string[]; localChanged: boolean } {
  const mine = new Map(local.map((l) => [l.id, l]));
  const theirs = new Map(remote.map((l) => [l.id, l]));
  const merged: SavedList[] = [];
  const toPush: string[] = [];
  let localChanged = false;
  for (const id of new Set([...mine.keys(), ...theirs.keys()])) {
    const l = mine.get(id);
    const r = theirs.get(id);
    const keepMine = !!l && (!r || Date.parse(l.updatedAt) > Date.parse(r.updatedAt));
    merged.push(keepMine ? l! : r!);
    if (keepMine) toPush.push(id);
    else if (!l || Date.parse(l.updatedAt) !== Date.parse(r!.updatedAt)) localChanged = true;
  }
  return { merged, toPush, localChanged };
}

export function newListId(): string {
  return crypto.randomUUID();
}
