import { useMemo, useState } from 'react';
import type { Song } from '../types';
import { songTypeLabel } from '../types';
import { BOX_INTERVAL_DAYS, BOXES, getProgress, SONG_STATE_LABELS, songState } from '../lib/progress';
import type { SongState } from '../lib/progress';
import { loadTestHistory } from '../lib/testHistory';
import { ColumnChart, ScoreLineChart } from '../components/Charts';
import styles from './StatsScreen.module.css';

const STATES: SongState[] = ['unseen', 'review', 'due', 'known'];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MISSED = 10;
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

interface Props {
  listName: string;
  /** Toutes les chansons de la liste. */
  songs: Song[];
  onBack: () => void;
}

/** Tableau de bord d'une liste : états, boîtes de Leitner, historique des Tests, chansons les plus ratées. */
export default function StatsScreen({ listName, songs, onBack }: Props) {
  // Heure figée à l'ouverture de l'écran : les chiffres ne bougent pas pendant la lecture.
  const [now] = useState(Date.now);
  const stats = useMemo(() => {
    const states: Record<SongState, number> = { unseen: 0, review: 0, due: 0, known: 0 };
    const boxes = new Map<number, number>(BOXES.map((b) => [b, 0]));
    let dueThisWeek = 0;
    const missed: { song: Song; misses: number; seen: number }[] = [];
    for (const song of songs) {
      states[songState(song.annSongId, now)]++;
      const progress = getProgress(song.annSongId);
      if (!progress) continue;
      boxes.set(progress.box, (boxes.get(progress.box) ?? 0) + 1);
      const due = Date.parse(progress.dueAt);
      if (!progress.missed && due > now && due <= now + WEEK_MS) dueThisWeek++;
      const misses = progress.seen - progress.correct;
      if (misses > 0) missed.push({ song, misses, seen: progress.seen });
    }
    missed.sort((a, b) => b.misses - a.misses || b.misses / b.seen - a.misses / a.seen);
    return { states, boxes, dueThisWeek, missed: missed.slice(0, MAX_MISSED) };
  }, [songs, now]);

  const tests = useMemo(() => loadTestHistory(listName), [listName]);
  const seen = songs.length - stats.states.unseen;

  return (
    <section className={styles.stats}>
      <div className={styles.header}>
        <h2>Statistiques — {listName}</h2>
        <button type="button" onClick={onBack}>
          Retour
        </button>
      </div>
      <p className="muted">
        {seen} musique{seen > 1 ? 's' : ''} vue{seen > 1 ? 's' : ''} sur {songs.length}.
      </p>

      <div className={styles.tiles}>
        {STATES.map((state) => (
          <div key={state} className={`panel ${styles.tile}`}>
            <span className={styles.tileLabel}>
              <span className={`${styles.dot} ${styles[state]}`} aria-hidden="true" />
              {SONG_STATE_LABELS[state]}
            </span>
            <span className={styles.tileValue}>{stats.states[state]}</span>
          </div>
        ))}
        <div className={`panel ${styles.tile}`}>
          <span className={styles.tileLabel}>À revoir sous 7 jours</span>
          <span className={styles.tileValue}>{stats.dueThisWeek}</span>
        </div>
      </div>

      <div className={styles.cards}>
        <div className={`panel ${styles.card}`}>
          <h3>Musiques par boîte</h3>
          {seen ? (
            <ColumnChart
              data={BOXES.map((box) => ({
                label: `Boîte ${box}`,
                sublabel: box === 1 ? 'à réviser' : `après ${BOX_INTERVAL_DAYS[box]} j`,
                value: stats.boxes.get(box) ?? 0,
              }))}
              unit={(n) => `${n} musique${n > 1 ? 's' : ''}`}
            />
          ) : (
            <p className="muted">Aucune musique vue pour l'instant.</p>
          )}
        </div>

        <div className={`panel ${styles.card}`}>
          <h3>Score des parties de Test</h3>
          {tests.length ? (
            <>
              <ScoreLineChart points={tests.map((t) => ({ date: new Date(t.playedAt), correct: t.correct, total: t.total }))} />
              <details className={styles.table}>
                <summary className="muted">Voir le tableau ({tests.length} partie{tests.length > 1 ? 's' : ''})</summary>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Score</th>
                      <th scope="col">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...tests].reverse().map((t) => (
                      <tr key={t.playedAt}>
                        <td>{dateFormat.format(new Date(t.playedAt))}</td>
                        <td>
                          {t.correct} / {t.total}
                        </td>
                        <td>{Math.round((t.correct / t.total) * 100)} %</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <p className="muted">Aucune partie de Test terminée pour cette liste.</p>
          )}
        </div>
      </div>

      <div className={`panel ${styles.card}`}>
        <h3>Musiques les plus ratées</h3>
        {stats.missed.length ? (
          <ul className={styles.missed}>
            {stats.missed.map(({ song, misses, seen: count }) => (
              <li key={song.annSongId}>
                <div className={styles.missedInfo}>
                  <strong>{song.anime.jpName}</strong>
                  <span className="muted">
                    {songTypeLabel(song)} · {song.name} — {song.artist}
                  </span>
                </div>
                <span className={styles.missedCount}>
                  ratée {misses} fois sur {count}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Aucune musique ratée pour l'instant.</p>
        )}
      </div>
    </section>
  );
}
