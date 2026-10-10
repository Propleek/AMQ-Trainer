import { useRef, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import type { MalList } from '../types';
import { countByStatus, parseMalXml, XmlParseError } from '../lib/parseMalXml';
import { AnilistUserError, fetchAnilistList } from '../lib/anilistUser';
import { deleteList, loadSavedLists } from '../lib/savedLists';
import { pushChanges, useAccount } from '../lib/sync';
import type { SavedList } from '../lib/savedLists';
import styles from './ImportScreen.module.css';

const ANILIST_USER_KEY = 'amq-trainer:anilist-user';
/** Nombre maximal de titres listés pour les animés sans ID MAL. */
const MAX_LISTED_TITLES = 10;

function loadAnilistUser(): string {
  try {
    return localStorage.getItem(ANILIST_USER_KEY) ?? '';
  } catch {
    return '';
  }
}

interface Props {
  list: MalList | null;
  onLoad: (list: MalList) => void;
  /** Ouvre l'éditeur sur une liste existante, ou sur une nouvelle liste (`null`). */
  onEditList: (list: SavedList | null) => void;
  onNext: () => void;
}

export default function ImportScreen({ list, onLoad, onEditList, onNext }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [anilistUser, setAnilistUser] = useState(loadAnilistUser);
  const [fetching, setFetching] = useState(false);
  const [savedLists, setSavedLists] = useState(loadSavedLists);
  const account = useAccount();

  async function handleAnilist(e: FormEvent) {
    e.preventDefault();
    const userName = anilistUser.trim();
    if (!userName || fetching) return;
    setError(null);
    setFetching(true);
    try {
      onLoad(await fetchAnilistList(userName));
      try {
        localStorage.setItem(ANILIST_USER_KEY, userName);
      } catch {
        // Préférence facultative.
      }
    } catch (err) {
      setError(err instanceof AnilistUserError ? err.message : `Récupération impossible : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setFetching(false);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.name.toLowerCase().endsWith('.xml')) {
      setError(`« ${file.name} » n'est pas un export .xml MyAnimeList.`);
      return;
    }
    try {
      onLoad(parseMalXml(await file.text()));
    } catch (e) {
      setError(e instanceof XmlParseError ? e.message : `Lecture impossible : ${String(e)}`);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void handleFile(e.dataTransfer.files[0]);
  }

  function handleDelete(saved: SavedList) {
    if (!window.confirm(`Supprimer la liste « ${saved.name} » ?`)) return;
    try {
      deleteList(saved.id);
      void pushChanges();
    } catch (e) {
      setError(`Suppression impossible : ${String(e)}`);
    }
    setSavedLists(loadSavedLists());
  }

  function pickSavedList(saved: SavedList) {
    setError(null);
    onLoad({ userName: saved.name, entries: saved.entries });
  }

  const anilistOnly = list?.entries.filter((e) => e.malId === null) ?? [];

  return (
    <section>
      <div className={styles.columns}>
        <div className={styles.column}>
          <h2>Importer une liste</h2>

          <form className={`panel ${styles.anilist}`} onSubmit={handleAnilist}>
            <label htmlFor="anilist-user">Depuis AniList</label>
            <div className={styles.row}>
              <input
                id="anilist-user"
                type="text"
                placeholder="Pseudo AniList"
                autoComplete="username"
                spellCheck={false}
                value={anilistUser}
                onChange={(e) => setAnilistUser(e.target.value)}
              />
              <button type="submit" className="primary" disabled={!anilistUser.trim() || fetching}>
                {fetching ? 'Chargement…' : 'Importer'}
              </button>
            </div>
            <p className="muted">La liste doit être publique.</p>
          </form>

          <p className={`muted ${styles.separator}`}>ou</p>

          <div
            className={`${styles.dropzone} ${dragging ? styles.dragging : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <p>Glissez un export XML MyAnimeList ici</p>
            <p className="muted">ou</p>
            <button type="button">Choisir un fichier</button>
            <input
              ref={inputRef}
              type="file"
              accept=".xml,application/xml,text/xml"
              hidden
              onChange={(e) => {
                void handleFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <div className={styles.column}>
          <h2 className={styles.listsTitle}>
            Mes listes
            {account.user && <span className="muted">synchronisées avec ton compte</span>}
          </h2>
          <div className="panel">
            {savedLists.length === 0 ? (
              <p className={`muted ${styles.empty}`}>Aucune liste pour l'instant. Composez-en une en cherchant des animés sur AniList.</p>
            ) : (
              <ul className={styles.savedLists}>
                {savedLists.map((saved) => (
                  <li key={saved.id}>
                    <div className={styles.savedInfo}>
                      <strong>{saved.name}</strong>
                      <span className="muted">{saved.entries.length} animés</span>
                    </div>
                    <div className={styles.savedActions}>
                      <button type="button" className="primary" onClick={() => pickSavedList(saved)} disabled={!saved.entries.length}>
                        Utiliser
                      </button>
                      <button type="button" onClick={() => onEditList(saved)}>
                        Modifier
                      </button>
                      <button type="button" className="danger" onClick={() => handleDelete(saved)} aria-label={`Supprimer ${saved.name}`}>
                        Supprimer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className={styles.newList} onClick={() => onEditList(null)}>
              + Nouvelle liste
            </button>
          </div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {list && !error && !fetching && (
        <div className={`panel ${styles.summary}`}>
          <h3>{list.userName}</h3>
          <p>
            <strong>{list.entries.length}</strong> animés
          </p>
          <ul className={styles.statuses}>
            {countByStatus(list.entries).map(([status, count]) => (
              <li key={status}>
                {status} : {count}
              </li>
            ))}
          </ul>
          {anilistOnly.length > 0 && (
            <p className="muted">
              Dont {anilistOnly.length} sans identifiant MyAnimeList (musiques cherchées par nom) :{' '}
              {anilistOnly.slice(0, MAX_LISTED_TITLES).map((e) => e.title).join(', ')}
              {anilistOnly.length > MAX_LISTED_TITLES && '…'}
            </p>
          )}
          <button type="button" className={`primary ${styles.next}`} onClick={onNext}>
            Continuer
          </button>
        </div>
      )}
    </section>
  );
}
