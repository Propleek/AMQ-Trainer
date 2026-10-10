import { useCallback, useState } from 'react';
import type { MalList } from './types';
import type { SavedList } from './lib/savedLists';
import type { LoadResult } from './lib/loadSongs';
import ImportScreen from './screens/ImportScreen';
import ListEditorScreen from './screens/ListEditorScreen';
import SetupScreen from './screens/SetupScreen';
import type { QuizStart } from './screens/SetupScreen';
import QuizScreen from './screens/QuizScreen';
import { drawSongs, filterSongs, modePool, shuffle } from './lib/quizSettings';

type Screen =
  | { name: 'import' }
  | { name: 'list-editor'; list: SavedList | null }
  | { name: 'setup' }
  | { name: 'quiz'; id: number; start: QuizStart };

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
          onStart={(start) => setScreen({ name: 'quiz', id: 0, start })}
        />
      )}
      {screen.name === 'quiz' && loaded && (
        <QuizScreen
          // Une clé par partie : « Rejouer les ratés » repart d'un écran neuf.
          key={screen.id}
          start={screen.start}
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
                  return drawSongs(pool, settings.counts.discovery);
                }
              : null
          }
        />
      )}
    </main>
  );
}
