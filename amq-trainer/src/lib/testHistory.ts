const STORAGE_KEY = 'amq-trainer:tests:v1';

/** Résultat d'une partie de Test terminée. */
export interface TestResult {
  /** Nom de la liste (pseudo AniList / MAL ou nom de la liste manuelle). */
  listName: string;
  /** Date ISO. */
  playedAt: string;
  total: number;
  correct: number;
}

function loadAll(): TestResult[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as TestResult[];
  } catch {
    return [];
  }
}

/** Tests d'une liste, du plus ancien au plus récent. */
export function loadTestHistory(listName: string): TestResult[] {
  return loadAll()
    .filter((r) => r.listName === listName)
    .sort((a, b) => a.playedAt.localeCompare(b.playedAt));
}

export function addTestResult(result: TestResult): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...loadAll(), result]));
  } catch {
    // Historique facultatif : la progression des chansons, elle, est déjà enregistrée.
  }
}
