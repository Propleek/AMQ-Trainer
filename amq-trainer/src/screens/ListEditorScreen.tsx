import { useEffect, useState } from 'react';
import type { AnimeEntry } from '../types';
import { FORMAT_LABELS, searchAnime } from '../lib/anilistSearch';
import type { SearchResult } from '../lib/anilistSearch';
import { newListId, saveList } from '../lib/savedLists';
import type { SavedList } from '../lib/savedLists';
import styles from './ListEditorScreen.module.css';

/** Délai après la dernière frappe avant de lancer la recherche (AniList limite le débit). */
const SEARCH_DEBOUNCE_MS = 400;
const MIN_SEARCH_LENGTH = 2;

/** Les entrées manuelles viennent toutes d'AniList : leur ID AniList les identifie. */
const entryId = (entry: AnimeEntry) => entry.anilistId!;

interface Props {
  /** Liste à modifier, ou `null` pour en créer une. */
  initial: SavedList | null;
  onClose: () => void;
}

export default function ListEditorScreen({ initial, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [entries, setEntries] = useState<AnimeEntry[]>(initial?.entries ?? []);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = query.trim();
  const searchable = search.length >= MIN_SEARCH_LENGTH;

  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      searchAnime(search, controller.signal)
        .then((found) => {
          setResults(found);
          setError(null);
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted) setError(`Recherche impossible : ${e instanceof Error ? e.message : String(e)}`);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, searchable]);

  // Résultats et indicateur ignorés tant que la recherche est trop courte.
  const visibleResults = searchable ? results : [];
  const showSearching = searchable && searching;

  // Avertit avant de quitter la page avec des modifications non enregistrées.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const addedIds = new Set(entries.map(entryId));

  function toggle(entry: AnimeEntry) {
    setEntries((current) =>
      current.some((e) => entryId(e) === entryId(entry))
        ? current.filter((e) => entryId(e) !== entryId(entry))
        : [...current, entry],
    );
    setDirty(true);
  }

  function remove(entry: AnimeEntry) {
    setEntries((current) => current.filter((e) => entryId(e) !== entryId(entry)));
    setDirty(true);
  }

  function handleSave() {
    const now = new Date().toISOString();
    try {
      saveList({
        id: initial?.id ?? newListId(),
        name: name.trim(),
        entries,
        createdAt: initial?.createdAt ?? now,
        updatedAt: now,
      });
      onClose();
    } catch (e) {
      setError(`Enregistrement impossible (stockage du navigateur indisponible ou plein) : ${String(e)}`);
    }
  }

  function handleCancel() {
    if (dirty && !window.confirm('Abandonner les modifications de cette liste ?')) return;
    onClose();
  }

  return (
    <section>
      <div className={styles.header}>
        <h2>{initial ? 'Modifier la liste' : 'Nouvelle liste'}</h2>
        <div className={styles.actions}>
          <button type="button" onClick={handleCancel}>
            Annuler
          </button>
          <button type="button" className="primary" onClick={handleSave} disabled={!name.trim()}>
            Enregistrer
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className={styles.columns}>
        <div className={`panel ${styles.column}`}>
          <label htmlFor="anime-search" className={styles.label}>
            Rechercher un animé sur AniList
          </label>
          <input
            id="anime-search"
            type="search"
            placeholder="Ex. Shingeki no Kyojin, Frieren…"
            spellCheck={false}
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {showSearching && <p className="muted">Recherche…</p>}
          {!showSearching && searchable && visibleResults.length === 0 && !error && <p className="muted">Aucun résultat.</p>}
          <ul className={styles.results}>
            {visibleResults.map((result) => {
              const added = addedIds.has(entryId(result.entry));
              return (
                <li key={entryId(result.entry)} className={added ? styles.added : undefined}>
                  {result.imageUrl ? (
                    <img src={result.imageUrl} alt="" loading="lazy" className={styles.cover} />
                  ) : (
                    <div className={styles.cover} />
                  )}
                  <div className={styles.resultInfo}>
                    <strong>{result.entry.title}</strong>
                    {result.englishTitle && result.englishTitle !== result.entry.title && (
                      <span className="muted">{result.englishTitle}</span>
                    )}
                    <span className="muted">
                      {[result.format && (FORMAT_LABELS[result.format] ?? result.format), result.year].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={added ? 'danger' : 'primary'}
                    onClick={() => toggle(result.entry)}
                    aria-label={added ? `Retirer ${result.entry.title}` : `Ajouter ${result.entry.title}`}
                  >
                    {added ? 'Retirer' : 'Ajouter'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={`panel ${styles.column}`}>
          <label htmlFor="list-name" className={styles.label}>
            Nom de la liste
          </label>
          <input
            id="list-name"
            type="text"
            placeholder="Ex. Shōnen à réviser"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
          />
          <p className={styles.count}>
            <strong>{entries.length}</strong> animé{entries.length > 1 ? 's' : ''}
          </p>
          {entries.length === 0 ? (
            <p className="muted">Ajoutez des animés depuis la recherche.</p>
          ) : (
            <ul className={styles.entries}>
              {entries.map((entry) => (
                <li key={entryId(entry)}>
                  <span>{entry.title}</span>
                  <button type="button" className="danger" onClick={() => remove(entry)} aria-label={`Retirer ${entry.title}`}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
