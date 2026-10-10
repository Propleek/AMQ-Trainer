import type { Song } from '../types';
import { songTypeLabel } from '../types';
import type { QuizAnswer } from '../screens/QuizScreen';
import styles from './QuizResults.module.css';

interface Props {
  answers: QuizAnswer[];
  onReplay: (songs: Song[]) => void;
  onQuit: () => void;
}

/** Bilan de fin de partie (version simple ; enrichi à l'étape 5). */
export default function QuizResults({ answers, onReplay, onQuit }: Props) {
  const played = answers.filter((a) => !a.unavailable);
  const missed = played.filter((a) => !a.correct);
  const score = played.length - missed.length;
  const unavailable = answers.length - played.length;

  return (
    <section>
      <h2>Résultats</h2>
      <p className={styles.score}>
        <strong>{score}</strong> / {played.length}
        {played.length > 0 && <span className="muted"> ({Math.round((score / played.length) * 100)} %)</span>}
      </p>
      {unavailable > 0 && (
        <p className="muted">
          {unavailable} musique{unavailable > 1 ? 's' : ''} indisponible{unavailable > 1 ? 's' : ''}, non comptée{unavailable > 1 ? 's' : ''}.
        </p>
      )}

      <div className={styles.actions}>
        {missed.length > 0 && (
          <button type="button" className="primary" onClick={() => onReplay(missed.map((a) => a.song))}>
            Rejouer les ratés ({missed.length})
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
              {!isUnavailable && !correct && (
                <span className="muted">Ta réponse : {answer || '(aucune)'}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
