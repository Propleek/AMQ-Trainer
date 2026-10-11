import { signInWithDiscord, useAccount } from '../lib/sync';
import type { SyncStatus } from '../lib/sync';
import styles from './AccountBar.module.css';

const STATUS_LABELS: Record<Exclude<SyncStatus, 'signed-out'>, string> = {
  syncing: 'Synchronisation…',
  synced: 'Progression synchronisée',
  error: 'Synchronisation impossible',
};

/**
 * Connexion Discord et état de la synchronisation, dans l'en-tête (masquée sans Supabase).
 * Avatar, nom et pastille d'état ouvrent le tableau de bord du compte (`onOpenAccount`).
 */
export default function AccountBar({ onOpenAccount }: { onOpenAccount: () => void }) {
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
      <button type="button" className={styles.profile} onClick={onOpenAccount} title="Ouvrir mon compte">
        {account.user.avatarUrl && <img src={account.user.avatarUrl} alt="" className={styles.avatar} />}
        <strong>{account.user.name}</strong>
      </button>
      <button
        type="button"
        className={`${styles.status} ${styles[status]}`}
        onClick={onOpenAccount}
        title="Détails de la synchronisation"
        aria-live="polite"
      >
        {STATUS_LABELS[status]}
      </button>
    </div>
  );
}
