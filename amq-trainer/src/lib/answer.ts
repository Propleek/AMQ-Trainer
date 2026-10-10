import type { Song } from '../types';

/** Forme comparée d'une réponse : comme AMQ, seules la casse et les espaces superflus sont ignorés. */
export function normalizeAnswer(answer: string): string {
  return answer.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Tous les noms acceptés (romaji, anglais, alternatifs) : ceux de l'animé de la chanson et ceux
 * des autres animés qui utilisent exactement la même musique (`sharedAnime`).
 */
export function acceptedNames(song: Song): string[] {
  const animes = [song.anime, ...song.sharedAnime];
  return animes.flatMap((a) => [a.jpName, a.enName, ...a.altNames]).filter((n) => n.trim());
}

/**
 * Réponse juste si elle correspond exactement à l'un des noms acceptés.
 * Validation stricte : une autre saison, un film ou une OVA de la même licence est faux,
 * sauf s'il utilise la même musique (impossible à distinguer à l'écoute).
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
