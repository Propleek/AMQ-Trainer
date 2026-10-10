import { useEffect, useRef, useState } from 'react';
import type { Song } from '../types';
import { songTypeLabel } from '../types';
import type { QuizAnswer } from '../screens/QuizScreen';
import { MODE_LABELS } from '../lib/quizSettings';
import type { QuizMode } from '../lib/quizSettings';
import styles from './QuizResults.module.css';

interface Props {
  mode: QuizMode;
  answers: QuizAnswer[];
  /** La progression n'a pas pu être enregistrée (stockage indisponible). */
  saveFailed: boolean;
  onReplay: (songs: Song[], mode: QuizMode) => void;
  getNextBatch: (() => Song[]) | null;
  onQuit: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Bilan de fin de partie : score, effet sur la progression, réécoute et suite. */
export default function QuizResults({ mode, answers, saveFailed, onReplay, getNextBatch, onQuit }: Props) {
  const played = answers.filter((a) => !a.unavailable);
  const missed = played.filter((a) => !a.correct);
  const score = played.length - missed.length;
  const unavailable = answers.length - played.length;
  // Paquet suivant tiré une fois, avec la progression à jour de cette partie.
  const [nextBatch] = useState(() => getNextBatch?.() ?? []);
  const preview = usePreview();

  return (
    <section>
      <h2>Résultats — {MODE_LABELS[mode]}</h2>
      <p className={styles.score}>
        <strong>{score}</strong> / {played.length}
        {played.length > 0 && <span className="muted"> ({Math.round((score / played.length) * 100)} %)</span>}
      </p>
      <p>{summary(mode, score, missed.length)}</p>
      {unavailable > 0 && (
        <p className="muted">
          {plural(unavailable, 'musique')} indisponible{unavailable > 1 ? 's' : ''}, non comptée{unavailable > 1 ? 's' : ''}.
        </p>
      )}
      {saveFailed && <p className="error">Stockage du navigateur indisponible : la progression de cette partie n'a pas été conservée.</p>}

      <div className={styles.actions}>
        {missed.length > 0 && (
          <button type="button" className="primary" onClick={() => onReplay(missed.map((a) => a.song), 'review')}>
            Rejouer les ratés ({missed.length})
          </button>
        )}
        {nextBatch.length > 0 && (
          <button type="button" className={missed.length ? undefined : 'primary'} onClick={() => onReplay(nextBatch, 'discovery')}>
            Paquet suivant ({nextBatch.length})
          </button>
        )}
        <button type="button" onClick={onQuit}>
          Retour à la configuration
        </button>
      </div>

      <ul className={styles.list}>
        {answers.map(({ song, answer, correct, unavailable: isUnavailable }) => (
          <li key={song.annSongId} className={isUnavailable ? styles.unavailable : correct ? styles.correct : styles.wrong}>
            <span className={styles.mark} aria-label={isUnavailable ? 'Indisponible' : correct ? 'Trouvée' : 'Ratée'}>
              {isUnavailable ? '–' : correct ? '✔' : '✘'}
            </span>
            <div className={styles.info}>
              <strong>{song.anime.jpName}</strong>
              <span className="muted">
                {songTypeLabel(song)} · {song.name} — {song.artist}
              </span>
              {!isUnavailable && !correct && <span className="muted">Ta réponse : {answer || '(aucune)'}</span>}
            </div>
            {!isUnavailable && (
              <button
                type="button"
                className={styles.play}
                onClick={() => preview.toggle(song)}
                aria-label={preview.playingId === song.annSongId ? `Arrêter ${song.name}` : `Écouter ${song.name}`}
              >
                {preview.playingId === song.annSongId ? '■' : '▶'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function summary(mode: QuizMode, found: number, missed: number): string {
  switch (mode) {
    case 'discovery':
      return `${plural(found, 'nouvelle musique')} connue${found > 1 ? 's' : ''}, ${plural(missed, 'musique')} à réviser.`;
    case 'review':
      return missed
        ? `${plural(found, 'musique')} sortie${found > 1 ? 's' : ''} de la révision, ${missed} encore à réviser.`
        : 'Toutes les musiques de cette révision sont trouvées !';
    case 'test':
      return missed ? `Les ${plural(missed, 'musique')} ratée${missed > 1 ? 's' : ''} passent dans « À réviser ».` : 'Sans faute !';
  }
}

/** Réécoute d'une chanson depuis le début, une à la fois. */
function usePreview() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);

  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );

  function toggle(song: Song) {
    audio.current?.pause();
    if (playingId === song.annSongId) {
      setPlayingId(null);
      return;
    }
    const next = new Audio(song.audioUrl);
    next.addEventListener('ended', () => setPlayingId(null));
    audio.current = next;
    setPlayingId(song.annSongId);
    void next.play().catch(() => setPlayingId(null));
  }

  return { playingId, toggle };
}
