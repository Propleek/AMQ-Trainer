import { retrySync, signInWithDiscord, signOut, useAccount } from '../lib/sync';
import type { SyncStatus } from '../lib/sync';
import styles from './AccountBar.module.css';

const STATUS_LABELS: Record<Exclude<SyncStatus, 'signed-out'>, string> = {
  syncing: 'Synchronisation…',
  synced: 'Progression synchronisée',
  error: 'Synchronisation impossible',
};

/** Connexion Discord et état de la synchronisation, dans l'en-tête. Masquée sans Supabase. */
export default function AccountBar() {
  const account = useAccount();
  if (!account.available) return null;

  if (!account.user) {
    return (
      <div className={styles.bar}>
        <span className={`muted ${styles.hint}`}>Progression gardée dans ce navigateur</span>
        <button type="button" className={styles.discord} onClick={() => void signInWithDiscord()}>
          Se connecter avec Discord
        </button>
      </div>
    );
  }

  const status = account.status === 'signed-out' ? 'syncing' : account.status;
  return (
    <div className={styles.bar}>
      {account.user.avatarUrl && <img src={account.user.avatarUrl} alt="" className={styles.avatar} />}
      <div className={styles.identity}>
        <strong>{account.user.name}</strong>
        <span className={`${styles.status} ${styles[status]}`} role="status">
          {STATUS_LABELS[status]}
          {status === 'error' && (
            <button type="button" className={styles.retry} onClick={() => void retrySync()}>
              Réessayer
            </button>
          )}
        </span>
      </div>
      <button type="button" onClick={() => void signOut()}>
        Se déconnecter
      </button>
    </div>
  );
}
