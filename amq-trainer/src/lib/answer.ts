import type { Song } from '../types';

/** Forme comparée d'une réponse : comme AMQ, seules la casse et les espaces superflus sont ignorés. */
export function normalizeAnswer(answer: string): string {
  return answer.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Tous les noms acceptés pour l'animé de la chanson (romaji, anglais, alternatifs). */
export function acceptedNames(song: Song): string[] {
  return [song.anime.jpName, song.anime.enName, ...song.anime.altNames].filter((n) => n.trim());
}

/**
 * Réponse juste si elle correspond exactement à l'un des noms de l'animé de la chanson.
 * Validation stricte : une autre saison, un film ou une OVA de la même licence est faux.
 */
export function isCorrect(answer: string, song: Song): boolean {
  const normalized = normalizeAnswer(answer);
  return normalized !== '' && acceptedNames(song).some((name) => normalizeAnswer(name) === normalized);
}

/** Clé de recherche de l'autocomplétion : plus tolérante (accents et ponctuation ignorés). */
export function searchKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
