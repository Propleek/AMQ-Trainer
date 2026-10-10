import { useEffect, useMemo, useState } from 'react';
import type { MalList, Song, SongKind } from '../types';
import { SONG_KIND_LABELS } from '../types';
import { countByStatus } from '../lib/parseMalXml';
import { loadSongs } from '../lib/loadSongs';
import type { LoadProgress, LoadResult } from '../lib/loadSongs';
import { DEFAULT_SETTINGS, drawForMode, filterSongs, GUESS_TIME_RANGE, loadSettings, MODE_LABELS, modePool, saveSettings } from '../lib/quizSettings';
import type { QuizMode, QuizSettings, SamplePoint } from '../lib/quizSettings';
import { SONG_STATE_LABELS, songState } from '../lib/progress';
import type { SongState } from '../lib/progress';
import styles from './SetupScreen.module.css';

const KINDS: SongKind[] = ['opening', 'ending', 'insert'];
/** Nombre maximal de titres listés pour les animés sans musique. */
const MAX_LISTED_TITLES = 30;

const STEP_LABELS: Record<LoadProgress['step'], string> = {
  anime: 'Informations AniList',
  songs: 'Recherche des musiques',
};

const MODES: { value: QuizMode; description: string; empty: string }[] = [
  { value: 'discovery', description: 'Musiques jamais vues, par paquets', empty: 'Toute la liste a été découverte' },
  { value: 'review', description: 'Ratées, puis celles dont la révision est due', empty: 'Rien à réviser' },
  { value: 'test', description: 'Partie comme sur AMQ, pour mesurer son niveau', empty: 'Aucune musique déjà vue' },
];

const STATES: SongState[] = ['unseen', 'review', 'due', 'known'];

const SAMPLE_POINTS: { value: SamplePoint; label: string }[] = [
  { value: 'random', label: 'Aléatoire (comme AMQ)' },
  { value: 'start', label: 'Début du morceau' },
];

export interface QuizStart {
  settings: QuizSettings;
  /** Chansons tirées pour la partie, dans l'ordre de jeu. */
  songs: Song[];
}

interface Props {
  list: MalList;
  /** Chansons déjà chargées pour cette liste (retour sur l'écran), sinon chargées ici. */
  loaded: LoadResult | null;
  onLoaded: (result: LoadResult) => void;
  onBack: () => void;
  onStart: (start: QuizStart) => void;
  /** Ouvre le tableau de bord de la liste. */
  onStats: () => void;
}

type LoadState = { status: 'loading'; progress: LoadProgress | null } | { status: 'error'; message: string };

export default function SetupScreen({ list, loaded, onLoaded, onBack, onStart, onStats }: Props) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading', progress: null });
  const [attempt, setAttempt] = useState(0);
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    if (loaded) return;
    const controller = new AbortController();
    loadSongs(list.entries, (progress) => !controller.signal.aborted && setLoadState({ status: 'loading', progress }), controller.signal).then(
      (result) => !controller.signal.aborted && onLoaded(result),
      (e: unknown) => {
        if (!controller.signal.aborted) {
          setLoadState({ status: 'error', message: `Chargement impossible : ${e instanceof Error ? e.message : String(e)}` });
        }
      },
    );
    return () => controller.abort();
  }, [list, loaded, onLoaded, attempt]);

  const statusCounts = useMemo(() => countByStatus(list.entries), [list]);
  /** Chansons qui correspondent aux filtres, tous états confondus. */
  const filtered = useMemo(() => (loaded ? filterSongs(loaded.songs, loaded.statusOf, settings) : []), [loaded, settings]);
  const stateCounts = useMemo(() => {
    const counts: Record<SongState, number> = { unseen: 0, review: 0, due: 0, known: 0 };
    for (const song of filtered) counts[songState(song.annSongId)]++;
    return counts;
  }, [filtered]);
  const modeCounts: Record<QuizMode, number> = {
    discovery: stateCounts.unseen,
    review: stateCounts.review + stateCounts.due,
    test: settings.testIncludesUnseen ? filtered.length : filtered.length - stateCounts.unseen,
  };
  /** Pool du mode choisi : la partie y est tirée. */
  const pool = useMemo(() => modePool(filtered, settings), [filtered, settings]);
  const kindCounts = useMemo(() => {
    const counts: Record<SongKind, number> = { opening: 0, ending: 0, insert: 0 };
    for (const song of loaded?.songs ?? []) counts[song.kind]++;
    return counts;
  }, [loaded]);

  function update(changes: Partial<QuizSettings>) {
    setSettings((current) => {
      const next = { ...current, ...changes };
      saveSettings(next);
      return next;
    });
  }

  function toggleStatus(status: string) {
    const excluded = new Set(settings.excludedStatuses);
    if (!excluded.delete(status)) excluded.add(status);
    update({ excludedStatuses: [...excluded] });
  }

  function toggleKind(kind: SongKind) {
    update({ kinds: settings.kinds.includes(kind) ? settings.kinds.filter((k) => k !== kind) : [...settings.kinds, kind] });
  }

  if (!loaded) {
    return (
      <section>
        <h2>{list.userName}</h2>
        {loadState.status === 'loading' ? (
          <Loading progress={loadState.progress} />
        ) : (
          <>
            <p className="error">{loadState.message}</p>
            <div className={styles.actions}>
              <button type="button" onClick={onBack}>
                Retour
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setLoadState({ status: 'loading', progress: null });
                  setAttempt((n) => n + 1);
                }}
              >
                Réessayer
              </button>
            </div>
          </>
        )}
      </section>
    );
  }

  const count = settings.counts[settings.mode];
  const playCount = Math.min(count ?? pool.length, pool.length);
  const [minDifficulty, maxDifficulty] = settings.difficulty;

  function setCount(value: number | null) {
    update({ counts: { ...settings.counts, [settings.mode]: value } });
  }

  return (
    <section>
      <div className={styles.header}>
        <h2>{list.userName}</h2>
        <button type="button" onClick={onStats}>
          Statistiques
        </button>
      </div>
      <p className="muted">
        {loaded.songs.length} musiques trouvées pour {list.entries.length} animés.
      </p>

      <div className={`panel ${styles.group}`}>
        <div className={styles.stateBar} aria-hidden="true">
          {STATES.map((state) =>
            stateCounts[state] ? (
              <div key={state} className={styles[state]} style={{ flexGrow: stateCounts[state] }} />
            ) : null,
          )}
        </div>
        <ul className={styles.stateLegend}>
          {STATES.map((state) => (
            <li key={state}>
              <span className={`${styles.dot} ${styles[state]}`} />
              {SONG_STATE_LABELS[state]} : <strong>{stateCounts[state]}</strong>
            </li>
          ))}
          <li className="muted">sur {filtered.length} musiques sélectionnées</li>
        </ul>
      </div>

      <fieldset className={`panel ${styles.group}`}>
        <legend>Mode</legend>
        <div className={styles.modes}>
          {MODES.map((mode) => (
            <label key={mode.value} className={`${styles.mode} ${settings.mode === mode.value ? styles.active : ''}`}>
              <input type="radio" name="mode" checked={settings.mode === mode.value} onChange={() => update({ mode: mode.value })} />
              <strong>
                {MODE_LABELS[mode.value]} <span className={styles.modeCount}>{modeCounts[mode.value]}</span>
              </strong>
              <span>{modeCounts[mode.value] ? mode.description : mode.empty}</span>
            </label>
          ))}
        </div>
        {settings.mode === 'test' && (
          <label className={`${styles.option} ${styles.modeOption}`}>
            <input
              type="checkbox"
              checked={settings.testIncludesUnseen}
              onChange={(e) => update({ testIncludesUnseen: e.target.checked })}
            />
            Inclure les musiques jamais vues (toute la liste)
          </label>
        )}
      </fieldset>

      {statusCounts.length > 1 && (
        <fieldset className={`panel ${styles.group}`}>
          <legend>Animés à inclure (par statut)</legend>
          <div className={styles.options}>
            {statusCounts.map(([status, count]) => (
              <label key={status} className={styles.option}>
                <input type="checkbox" checked={!settings.excludedStatuses.includes(status)} onChange={() => toggleStatus(status)} />
                {status} <span className="muted">({count})</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className={`panel ${styles.group}`}>
        <legend>Types de musiques</legend>
        <div className={styles.options}>
          {KINDS.map((kind) => (
            <label key={kind} className={styles.option}>
              <input type="checkbox" checked={settings.kinds.includes(kind)} onChange={() => toggleKind(kind)} />
              {SONG_KIND_LABELS[kind]} <span className="muted">({kindCounts[kind]})</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={`panel ${styles.group}`}>
        <legend>Partie</legend>
        <div className={styles.fields}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Nombre de musiques</span>
            <div className={styles.inline}>
              <input
                type="number"
                aria-label="Nombre de musiques"
                min={1}
                max={Math.max(pool.length, 1)}
                value={count ?? pool.length}
                disabled={count === null}
                onChange={(e) => setCount(Math.max(1, Math.round(Number(e.target.value)) || 1))}
              />
              <label className={styles.option}>
                <input
                  type="checkbox"
                  checked={count === null}
                  onChange={(e) => setCount(e.target.checked ? null : (DEFAULT_SETTINGS.counts[settings.mode] ?? 20))}
                />
                Toutes
              </label>
            </div>
          </div>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Durée de réponse (secondes)</span>
            <input
              type="number"
              min={GUESS_TIME_RANGE.min}
              max={GUESS_TIME_RANGE.max}
              value={settings.guessTime}
              onChange={(e) => update({ guessTime: Number(e.target.value) })}
              onBlur={() =>
                update({ guessTime: Math.min(GUESS_TIME_RANGE.max, Math.max(GUESS_TIME_RANGE.min, Math.round(settings.guessTime) || 20)) })
              }
            />
          </label>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Difficulté AnisongDB (0 = très dur, 100 = très facile)</span>
            <div className={styles.inline}>
              <input
                type="number"
                aria-label="Difficulté minimale"
                min={0}
                max={100}
                value={minDifficulty}
                onChange={(e) => update({ difficulty: [clampPercent(e.target.value), maxDifficulty] })}
              />
              <span className="muted">à</span>
              <input
                type="number"
                aria-label="Difficulté maximale"
                min={0}
                max={100}
                value={maxDifficulty}
                onChange={(e) => update({ difficulty: [minDifficulty, clampPercent(e.target.value)] })}
              />
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Point de départ de l'extrait</span>
            <div className={styles.inline}>
              {SAMPLE_POINTS.map((point) => (
                <label key={point.value} className={styles.option}>
                  <input
                    type="radio"
                    name="sample-point"
                    checked={settings.samplePoint === point.value}
                    onChange={() => update({ samplePoint: point.value })}
                  />
                  {point.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </fieldset>

      <p>
        {MODE_LABELS[settings.mode]} : <strong>{pool.length}</strong> musique{pool.length > 1 ? 's' : ''} disponible
        {pool.length > 1 ? 's' : ''}
        {pool.length > 0 && (
          <>
            {' '}
            — la partie en jouera <strong>{playCount}</strong>
          </>
        )}
        .
      </p>

      <div className={styles.actions}>
        <button type="button" onClick={onBack}>
          Retour
        </button>
        <button type="button" className="primary" disabled={!pool.length} onClick={() => onStart({ settings, songs: drawForMode(pool, settings.mode, playCount) })}>
          Lancer la partie
        </button>
      </div>

      {loaded.withoutSongs.length > 0 && (
        <details className={styles.missing}>
          <summary className="muted">
            {loaded.withoutSongs.length} animé{loaded.withoutSongs.length > 1 ? 's' : ''} sans musique trouvée
          </summary>
          <p className="muted">
            {loaded.withoutSongs.slice(0, MAX_LISTED_TITLES).join(', ')}
            {loaded.withoutSongs.length > MAX_LISTED_TITLES && '…'}
          </p>
        </details>
      )}
    </section>
  );
}

function clampPercent(value: string): number {
  return Math.min(100, Math.max(0, Math.round(Number(value)) || 0));
}

function Loading({ progress }: { progress: LoadProgress | null }) {
  const ratio = progress && progress.total ? progress.done / progress.total : 0;
  return (
    <div className={`panel ${styles.loading}`}>
      <p>{progress ? `${STEP_LABELS[progress.step]} : ${progress.done} / ${progress.total}` : 'Préparation…'}</p>
      <div className={styles.bar} role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className={styles.fill} style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="muted">Le premier chargement d'une liste peut prendre un moment ; les suivants sont quasi instantanés.</p>
    </div>
  );
}
