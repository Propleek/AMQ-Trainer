import type { AnimeEntry } from '../types';

const STORAGE_KEY = 'amq-trainer:lists:v1';

/** Liste d'animés constituée à la main, gardée dans le navigateur. */
export interface SavedList {
  id: string;
  name: string;
  entries: AnimeEntry[];
  /** Dates ISO. */
  createdAt: string;
  updatedAt: string;
}

/** Listes enregistrées, de la plus récemment modifiée à la plus ancienne. */
export function loadSavedLists(): SavedList[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const lists = raw ? (JSON.parse(raw) as SavedList[]) : [];
    return lists.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function writeLists(lists: SavedList[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

/** Crée ou remplace une liste (même `id`). Lève une erreur si le stockage est indisponible ou plein. */
export function saveList(list: SavedList): void {
  writeLists([...loadSavedLists().filter((l) => l.id !== list.id), list]);
}

export function deleteList(id: string): void {
  writeLists(loadSavedLists().filter((l) => l.id !== id));
}

export function newListId(): string {
  return crypto.randomUUID();
}
