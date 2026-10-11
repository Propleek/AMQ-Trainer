const STORAGE_KEY = 'amq-trainer:anime-catalog:v1';

/**
 * Animé connu de ce navigateur, avec toutes ses musiques (identifiants de progression).
 * Sert au tableau de bord du compte : un animé est maîtrisé quand toutes ses musiques sont connues.
 */
export interface CatalogAnime {
  annId: number;
  name: string;
  /** `annSongId` sous lesquels la progression est enregistrée (une musique partagée garde le même). */
  songIds: number[];
}

type Catalog = Record<number, CatalogAnime>;

export function loadCatalog(): CatalogAnime[] {
  try {
    return Object.values(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Catalog);
  } catch {
    return [];
  }
}

/**
 * Ajoute ou met à jour des animés (à chaque chargement de liste). Pas d'expiration, contrairement
 * au cache d'API : le catalogue grandit avec les listes chargées sur ce navigateur.
 */
export function updateCatalog(animes: CatalogAnime[]): void {
  try {
    const catalog = Object.fromEntries(loadCatalog().map((a) => [a.annId, a])) as Catalog;
    for (const anime of animes) catalog[anime.annId] = anime;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
  } catch {
    // Facultatif : seul le décompte des animés maîtrisés en dépend.
  }
}
