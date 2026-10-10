import styles from './CrashPanel.module.css';

/** Message affiché par la barrière d'erreur, à la place d'un écran vide. */
export default function CrashPanel({ error, onHome }: { error: Error; onHome: () => void }) {
  return (
    <div className={styles.panel} role="alert">
      <h3>Une erreur inattendue est survenue</h3>
      <p>Ta progression n'est pas perdue : chaque réponse est enregistrée dès qu'elle est donnée.</p>
      <div className={styles.actions}>
        <button type="button" onClick={onHome}>
          Revenir à l'accueil
        </button>
        <button type="button" onClick={() => window.location.reload()}>
          Recharger la page
        </button>
      </div>
      <details className={styles.details}>
        <summary>Détails techniques</summary>
        <pre>{error.message}</pre>
      </details>
    </div>
  );
}
