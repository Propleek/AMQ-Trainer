import { useAccount } from '../lib/sync';
import styles from './PlayerCard.module.css';

/** État de la bulle : réponse en cours de manche, ou verdict à la révélation. */
export type PlayerVerdict = 'pending' | 'correct' | 'wrong' | 'neutral';

interface Props {
  /** Réponse validée (Entrée), affichée dans la bulle ; vide = pas encore de réponse. */
  answer: string;
  verdict: PlayerVerdict;
  score: number;
  /** Change à chaque manche : rejoue l'animation de verdict. */
  round: number;
}

/** Joueur à la manière d'AMQ : bulle de réponse au-dessus de l'avatar, nom et score. */
export default function PlayerCard({ answer, verdict, score, round }: Props) {
  const account = useAccount();
  const name = account.user?.name ?? 'Joueur';
  const avatarUrl = account.user?.avatarUrl ?? null;
  // Une clé par manche et par verdict : l'animation repart à chaque révélation.
  const animKey = `${round}-${verdict}`;

  return (
    <div className={styles.player}>
      <div key={`bubble-${animKey}`} className={`${styles.bubble} ${styles[verdict]}`} aria-live="polite">
        {verdict === 'correct' && <span className={styles.icon} aria-label="Bonne réponse">✔</span>}
        {verdict === 'wrong' && <span className={styles.icon} aria-label="Mauvaise réponse">✘</span>}
        {answer ? <span className={styles.answer}>{answer}</span> : <span className={styles.empty}>{verdict === 'pending' ? '…' : '(aucune réponse)'}</span>}
      </div>
      <div key={`avatar-${animKey}`} className={`${styles.avatarWrap} ${styles[verdict]}`}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className={styles.avatar} />
        ) : (
          <svg viewBox="0 0 64 64" className={styles.avatar} aria-hidden="true">
            <rect width="64" height="64" fill="var(--surface)" />
            <circle cx="32" cy="25" r="11" fill="var(--text-muted)" />
            <path d="M12 58c2-12 10-18 20-18s18 6 20 18" fill="var(--text-muted)" />
          </svg>
        )}
        <span className={styles.score} aria-label={`Score : ${score}`}>
          {score}
        </span>
      </div>
      <span className={styles.name}>{name}</span>
    </div>
  );
}
