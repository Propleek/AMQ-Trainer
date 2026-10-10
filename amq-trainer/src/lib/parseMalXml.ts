import type { AnimeEntry, MalList } from '../types';

const NOT_FOUND_RE = /MAL entry not found for "(.+)"\s+https?:\/\/anilist\.co\/anime\/(\d+)/;

export class XmlParseError extends Error {}

function text(parent: Element, tag: string): string {
  return parent.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';
}

function toEntry(el: Element, anilistId: number | null = null): AnimeEntry {
  const malId = Number.parseInt(text(el, 'series_animedb_id'), 10);
  const score = Number.parseInt(text(el, 'my_score'), 10);
  return {
    malId: Number.isNaN(malId) ? null : malId,
    anilistId,
    title: text(el, 'series_title'),
    status: text(el, 'my_status') || 'Unknown',
    score: Number.isNaN(score) ? 0 : score,
  };
}

/**
 * Entrées absentes de MAL. L'export les signale par deux commentaires :
 * `MAL entry not found for "<titre>" https://anilist.co/anime/<id>`,
 * puis la fiche `<anime>` elle-même mise en commentaire (`<!--anime>…</anime-->`).
 */
function parseAnilistOnlyEntries(doc: Document): AnimeEntry[] {
  const notFound: { title: string; anilistId: number }[] = [];
  const commentedByTitle = new Map<string, Element>();

  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const content = (node.nodeValue ?? '').trim();

    const match = NOT_FOUND_RE.exec(content);
    if (match) {
      notFound.push({ title: match[1], anilistId: Number(match[2]) });
      continue;
    }

    if (content.startsWith('anime>')) {
      const fragment = new DOMParser().parseFromString(`<${content}>`, 'application/xml');
      const anime = fragment.documentElement;
      if (anime.nodeName === 'anime' && !fragment.getElementsByTagName('parsererror').length) {
        commentedByTitle.set(text(anime, 'series_title'), anime);
      }
    }
  }

  return notFound.map(({ title, anilistId }) => {
    const anime = commentedByTitle.get(title);
    return anime
      ? { ...toEntry(anime, anilistId), malId: null, title }
      : { malId: null, anilistId, title, status: 'Unknown', score: 0 };
  });
}

export function parseMalXml(source: string): MalList {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new XmlParseError("Le fichier n'est pas un XML valide.");
  }
  if (doc.documentElement.nodeName !== 'myanimelist') {
    throw new XmlParseError("Ce fichier n'est pas un export MyAnimeList (balise <myanimelist> absente).");
  }

  const userName = text(doc.documentElement, 'user_name') || 'unknown_user';
  const entries = [
    ...Array.from(doc.getElementsByTagName('anime'), (el) => toEntry(el)).filter((e) => e.malId !== null),
    ...parseAnilistOnlyEntries(doc),
  ];

  if (!entries.length) {
    throw new XmlParseError('Aucun animé trouvé dans ce fichier.');
  }
  return { userName, entries };
}

/** Nombre d'animés par statut, du plus fréquent au moins fréquent. */
export function countByStatus(entries: AnimeEntry[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const { status } of entries) counts.set(status, (counts.get(status) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}
