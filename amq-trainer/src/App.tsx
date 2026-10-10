import { useState } from 'react';
import type { MalList } from './types';
import type { SavedList } from './lib/savedLists';
import ImportScreen from './screens/ImportScreen';
import ListEditorScreen from './screens/ListEditorScreen';

type Screen = { name: 'import' } | { name: 'list-editor'; list: SavedList | null } | { name: 'setup' };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'import' });
  const [list, setList] = useState<MalList | null>(null);

  return (
    <main className="app">
      <header className="app-header">
        <h1>AMQ Trainer</h1>
      </header>
      {screen.name === 'import' && (
        <ImportScreen
          list={list}
          onLoad={setList}
          onEditList={(saved) => {
            // La liste sélectionnée peut être celle qu'on va modifier : on la désélectionne.
            setList(null);
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
        <section className="panel">
          <h2>{list.userName}</h2>
          <p className="muted">Configuration de la partie : étape 3, à venir.</p>
          <button type="button" onClick={() => setScreen({ name: 'import' })}>
            Retour
          </button>
        </section>
      )}
    </main>
  );
}
