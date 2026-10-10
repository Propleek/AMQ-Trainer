/** Préfixe propre au cache : `clearCache` ne touche pas aux données de l'utilisateur. */
const PREFIX = 'amq-trainer:cache:';
export const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TTL_MS = 7 * DAY_MS;

interface CacheRecord<T> {
  savedAt: number;
  /** Durée de validité ; absente des anciens enregistrements (7 jours). */
  ttl?: number;
  value: T;
}

/** Lit une valeur du cache localStorage, `undefined` si absente ou expirée. */
export function cacheGet<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const record = JSON.parse(raw) as CacheRecord<T>;
    if (Date.now() - record.savedAt > (record.ttl ?? DEFAULT_TTL_MS)) {
      localStorage.removeItem(PREFIX + key);
      return undefined;
    }
    return record.value;
  } catch {
    return undefined;
  }
}

/** Vide le cache (réponses d'API), pour libérer de la place dans le localStorage. */
export function clearCache(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Stockage indisponible.
  }
}

export function cacheSet<T>(key: string, value: T, ttl = DEFAULT_TTL_MS): void {
  try {
    const record: CacheRecord<T> = { savedAt: Date.now(), ttl, value };
    localStorage.setItem(PREFIX + key, JSON.stringify(record));
  } catch {
    // Quota dépassé ou stockage indisponible : le cache est facultatif.
  }
}
