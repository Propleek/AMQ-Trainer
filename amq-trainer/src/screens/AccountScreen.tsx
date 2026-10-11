import { useEffect, useMemo, useState } from 'react';
import { loadCatalog } from '../lib/animeCatalog';
import { dirtyIds, getAllProgress, songState } from '../lib/progress';
import { dirtyListIds, loadSavedLists } from '../lib/savedLists';
import { retrySync, signOut, useAccount } from '../lib/sync';
import type { SyncStatus } from '../lib/sync';
import styles from './AccountScreen.module.css';

/** Seuil des animés « presque maîtrisés ». */
const NEAR_MASTERY = 0.8;
const MAX_NEAR_LISTED = 10;
const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

const STATUS_TEXT: Record<SyncStatus, { title: string; detail: string }> = {
  synced: { title: 'Progression synchronisée', detail: 'Tout ce qui a été joué sur ce navigateur est enregistré sur ton compte.' },
  syncing: { title: 'Synchronisation en cours…', detail: 'Envoi et récupération de tes données.' },
  error: {
    title: 'Synchronisation impossible',
    detail:
      "La dernière synchronisation a échoué (connexion ou serveur indisponible). Rien n'est perdu : tes données restent dans ce navigateur et partiront à la prochaine synchronisation.",
  },
  'signed-out': { title: 'Non connecté', detail: '' },
};

function since(date: Date, now: number): string {
  const seconds = Math.round((date.getTime() - now) / 1000);
  if (seconds > -60) return relative.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (minutes > -60) return relative.format(minutes, 'minute');
  return relative.format(Math.round(minutes / 60), 'hour');
}

/** Tableau de bord du compte : chiffres globaux (toutes listes) et détails de la synchronisation. */
export default function AccountScreen({ onBack }: { onBack: () => void }) {
  const account = useAccount();
  const [now, setNow] = useState(Date.now);

  // Rafraîchit « il y a … » et les envois en attente.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  // `revision` : recalcul quand la synchronisation apporte de nouvelles données.
  const revision = account.revision;
  const stats = useMemo(() => {
    const progress = getAllProgress();
    let seen = 0;
    let known = 0;
    let review = 0;
    let due = 0;
    for (const id of Object.keys(progress)) {
      const state = songState(Number(id), now);
      seen++;
      if (state === 'review') review++;
      else known++;
      if (state === 'due') due++;
    }

    // Maîtrise d'un animé : part de ses musiques connues (vues et pas ratées), tous types confondus.
    const animes = loadCatalog().map((anime) => {
      const knownSongs = anime.songIds.filter((id) => {
        const state = songState(id, now);
        return state === 'known' || state === 'due';
      }).length;
      return { ...anime, knownSongs, ratio: knownSongs / anime.songIds.length };
    });
    const mastered = animes.filter((a) => a.ratio === 1);
    const near = animes.filter((a) => a.ratio >= NEAR_MASTERY && a.ratio < 1).sort((a, b) => b.ratio - a.ratio);
    return { lists: loadSavedLists().length, seen, known, review, due, animes: animes.length, mastered: mastered.length, near, revision };
  }, [now, revision]);

  const pendingSongs = dirtyIds().length;
  const pendingLists = dirtyListIds().length;

  if (!account.user) {
    return (
      <section className="panel">
        <p>Tu n'es pas connecté.</p>
        <button type="button" onClick={onBack}>
          Retour
        </button>
      </section>
    );
  }

  const status = STATUS_TEXT[account.status];
  const tiles: { label: string; value: number; hint?: string }[] = [
    { label: 'Listes', value: stats.lists, hint: 'composées à la main' },
    { label: 'Musiques connues', value: stats.known, hint: `sur ${stats.seen} vues` },
    { label: 'À réviser', value: stats.review, hint: 'ratées au dernier passage' },
    { label: 'À revoir', value: stats.due, hint: 'connues, révision due' },
    { label: 'Animés maîtrisés', value: stats.mastered, hint: 'toutes leurs musiques connues' },
    { label: 'Presque maîtrisés', value: stats.near.length, hint: `${Math.round(NEAR_MASTERY * 100)} % ou plus` },
  ];

  return (
    <section className={styles.account}>
      <div className={styles.header}>
        {account.user.avatarUrl && <img src={account.user.avatarUrl} alt="" className={styles.avatar} />}
        <div>
          <h2>{account.user.name}</h2>
          <p className="muted">Compte Discord</p>
        </div>
        <button type="button" className={styles.back} onClick={onBack}>
          Retour
        </button>
      </div>

      <div className={styles.tiles}>
        {tiles.map((tile) => (
          <div key={tile.label} className={`panel ${styles.tile}`}>
            <span className={styles.tileLabel}>{tile.label}</span>
            <span className={styles.tileValue}>{tile.value}</span>
            {tile.hint && <span className={styles.tileHint}>{tile.hint}</span>}
          </div>
        ))}
      </div>
      <p className={`muted ${styles.note}`}>
        Animés comptés : les {stats.animes} des listes chargées sur ce navigateur. Une musique est connue quand tu l'as trouvée à son
        dernier passage ; openings, endings et insert songs comptent tous.
      </p>

      <div className={styles.cards}>
        <div className={`panel ${styles.card}`}>
          <h3>Presque maîtrisés</h3>
          {stats.near.length ? (
            <ul className={styles.near}>
              {stats.near.slice(0, MAX_NEAR_LISTED).map((anime) => (
                <li key={anime.annId}>
                  <span className={styles.nearName}>{anime.name}</span>
                  <span className="muted">
                    {anime.knownSongs} / {anime.songIds.length} · encore {anime.songIds.length - anime.knownSongs}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Aucun animé entre {Math.round(NEAR_MASTERY * 100)} % et 100 % pour l'instant.</p>
          )}
        </div>

        <div className={`panel ${styles.card}`}>
          <h3 className={styles.syncTitle}>
            <span className={`${styles.dot} ${styles[account.status]}`} aria-hidden="true" />
            {status.title}
          </h3>
          <p>{status.detail}</p>
          <dl className={styles.facts}>
            <dt>Dernière synchronisation</dt>
            <dd>{account.lastSyncedAt ? since(account.lastSyncedAt, now) : 'pas encore pendant cette visite'}</dd>
            <dt>En attente d'envoi</dt>
            <dd>
              {pendingSongs || pendingLists
                ? [pendingSongs && `${pendingSongs} musique${pendingSongs > 1 ? 's' : ''}`, pendingLists && `${pendingLists} liste${pendingLists > 1 ? 's' : ''}`]
                    .filter(Boolean)
                    .join(', ')
                : 'rien'}
            </dd>
          </dl>
          <details className={styles.details}>
            <summary>Ce qui est synchronisé, et quand</summary>
            <p>
              Sur ton compte : ta progression (musiques vues, réponses trouvées, boîtes et dates de révision), tes scores de Test et
              tes listes composées à la main. Tu les retrouves en te connectant sur n'importe quel appareil.
            </p>
            <p>
              Quand : à la connexion et à l'ouverture du site, à la fin de chaque partie (ou quand tu la quittes), et dès que tu
              enregistres ou supprimes une liste. Entre deux, tout est gardé dans ce navigateur, même hors connexion.
            </p>
            <p>Si une même musique a été jouée sur deux appareils, c'est le passage le plus récent qui l'emporte.</p>
          </details>
          <div className={styles.actions}>
            <button type="button" className="primary" onClick={() => void retrySync()} disabled={account.status === 'syncing'}>
              Synchroniser maintenant
            </button>
            <button type="button" className="danger" onClick={() => void signOut()}>
              Se déconnecter
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
