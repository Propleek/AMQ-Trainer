import { useCallback, useState } from 'react';
import type { MalList } from './types';
import type { SavedList } from './lib/savedLists';
import type { LoadResult } from './lib/loadSongs';
import ImportScreen from './screens/ImportScreen';
import ListEditorScreen from './screens/ListEditorScreen';
import SetupScreen from './screens/SetupScreen';
import type { QuizStart } from './screens/SetupScreen';
import QuizScreen from './screens/QuizScreen';
import AccountBar from './components/AccountBar';
import ErrorBoundary from './components/ErrorBoundary';
import CrashPanel from './components/CrashPanel';
import { useAccount } from './lib/sync';
import StatsScreen from './screens/StatsScreen';
import AccountScreen from './screens/AccountScreen';
import { drawForMode, filterSongs, modePool, shuffle } from './lib/quizSettings';

type Screen =
  | { name: 'import' }
  | { name: 'list-editor'; list: SavedList | null }
  | { name: 'setup' }
  | { name: 'stats' }
  | { name: 'quiz'; id: number; start: QuizStart }
  /** Tableau de bord du compte ; `back` : écran où revenir. */
  | { name: 'account'; back: Screen };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'import' });
  const account = useAccount();
  const [list, setList] = useState<MalList | null>(null);
  /** Chansons de la liste sélectionnée, gardées pour ne pas les recharger au retour sur la configuration. */
  const [loaded, setLoaded] = useState<{ list: MalList; result: LoadResult } | null>(null);

  const selectList = useCallback((newList: MalList | null) => {
    setList(newList);
    setLoaded(null);
  }, []);

  const handleLoaded = useCallback((result: LoadResult) => {
    setLoaded((current) => (list ? { list, result } : current));
  }, [list]);

  /** Retour à l'accueil depuis n'importe quel écran ; la liste en cours reste sélectionnée. */
  function goHome() {
    if (screen.name === 'import') return;
    if (screen.name === 'quiz' && !window.confirm('Quitter la partie en cours ? Les réponses déjà données sont enregistrées.')) return;
    if (screen.name === 'list-editor' && !window.confirm("Quitter l'éditeur ? Les modifications non enregistrées seront perdues.")) return;
    setScreen({ name: 'import' });
  }

  /** Tableau de bord du compte (clic sur l'avatar, le nom ou la pastille de synchronisation). */
  function openAccount() {
    if (screen.name === 'account') return;
    if (screen.name === 'quiz' && !window.confirm('Quitter la partie en cours ? Les réponses déjà données sont enregistrées.')) return;
    if (screen.name === 'list-editor' && !window.confirm("Quitter l'éditeur ? Les modifications non enregistrées seront perdues.")) return;
    // Une partie ou l'éditeur ne se reprennent pas : retour à la configuration, ou à l'accueil.
    const back: Screen = screen.name === 'quiz' ? { name: 'setup' } : screen.name === 'list-editor' ? { name: 'import' } : screen;
    setScreen({ name: 'account', back });
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>
          <a href="./" className="app-title" onClick={(e) => { e.preventDefault(); goHome(); }}>
            AMQ Trainer
          </a>
        </h1>
        {screen.name !== 'import' && screen.name !== 'list-editor' && (
          <button type="button" className="app-home" onClick={goHome}>
            ← Changer de liste
          </button>
        )}
        <AccountBar onOpenAccount={openAccount} />
      </header>
      <ErrorBoundary
        fallback={(error, reset) => (
          <CrashPanel
            error={error}
            onHome={() => {
              setScreen({ name: 'import' });
              reset();
            }}
          />
        )}
      >
        {screen.name === 'import' && (
          <ImportScreen
            // Remonté quand la synchronisation apporte des listes d'un autre appareil.
            key={account.revision}
            list={list}
            onLoad={selectList}
            onEditList={(saved) => {
              // La liste sélectionnée peut être celle qu'on va modifier : on la désélectionne.
              selectList(null);
              setScreen({ name: 'list-editor', list: saved });
            }}
            onNext={() => setScreen({ name: 'setup' })}
          />
        )}
        {screen.name === 'list-editor' && (
          <ListEditorScreen
            // Une clé par liste : l'éditeur repart de zéro quand on change de liste.
            key={screen.list?.id ?? 'new'}
            initial={screen.list}
            onClose={() => setScreen({ name: 'import' })}
          />
        )}
        {screen.name === 'setup' && list && (
          <SetupScreen
            // Remonté quand la synchronisation modifie la progression : les compteurs sont recalculés.
            key={account.revision}
            list={list}
            loaded={loaded?.list === list ? loaded.result : null}
            onLoaded={handleLoaded}
            onBack={() => setScreen({ name: 'import' })}
            onStart={(start) => setScreen({ name: 'quiz', id: 0, start })}
            onStats={() => setScreen({ name: 'stats' })}
          />
        )}
        {screen.name === 'account' && <AccountScreen onBack={() => setScreen(screen.back)} />}
        {screen.name === 'stats' && loaded && (
          <StatsScreen key={account.revision} listName={loaded.list.userName} songs={loaded.result.songs} onBack={() => setScreen({ name: 'setup' })} />
        )}
        {screen.name === 'quiz' && loaded && (
          <QuizScreen
            // Une clé par partie : « Rejouer les ratés » repart d'un écran neuf.
            key={screen.id}
            start={screen.start}
            listName={loaded.list.userName}
            listSongs={loaded.result.songs}
            covers={loaded.result.covers}
            onQuit={() => setScreen({ name: 'setup' })}
            onReplay={(songs, mode) =>
              setScreen({ name: 'quiz', id: screen.id + 1, start: { settings: { ...screen.start.settings, mode }, songs: shuffle(songs) } })
            }
            getNextBatch={
              screen.start.settings.mode === 'discovery'
                ? () => {
                    const { settings } = screen.start;
                    const pool = modePool(filterSongs(loaded.result.songs, loaded.result.statusOf, settings), settings);
                    return drawForMode(pool, 'discovery', settings.counts.discovery);
                  }
                : null
            }
          />
        )}
      </ErrorBoundary>
    </main>
  );
}
