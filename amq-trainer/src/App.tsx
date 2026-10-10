import { useCallback, useState } from 'react';
import type { MalList } from './types';
import type { SavedList } from './lib/savedLists';
import type { LoadResult } from './lib/loadSongs';
import ImportScreen from './screens/ImportScreen';
import ListEditorScreen from './screens/ListEditorScreen';
import SetupScreen from './screens/SetupScreen';
import type { QuizStart } from './screens/SetupScreen';

type Screen =
  | { name: 'import' }
  | { name: 'list-editor'; list: SavedList | null }
  | { name: 'setup' }
  | { name: 'quiz'; start: QuizStart };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'import' });
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

  return (
    <main className="app">
      <header className="app-header">
        <h1>AMQ Trainer</h1>
      </header>
      {screen.name === 'import' && (
        <ImportScreen
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
          list={list}
          loaded={loaded?.list === list ? loaded.result : null}
          onLoaded={handleLoaded}
          onBack={() => setScreen({ name: 'import' })}
          onStart={(start) => setScreen({ name: 'quiz', start })}
        />
      )}
      {screen.name === 'quiz' && (
        <section className="panel">
          <h2>Partie</h2>
          <p className="muted">
            {screen.start.songs.length} musiques tirées, {screen.start.settings.guessTime} s par réponse. Le quiz arrive à l'étape 4.
          </p>
          <ol>
            {screen.start.songs.slice(0, 10).map((song) => (
              <li key={song.annSongId}>
                {song.anime.jpName} — {song.name} ({song.artist})
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => setScreen({ name: 'setup' })}>
            Retour
          </button>
        </section>
      )}
    </main>
  );
}
