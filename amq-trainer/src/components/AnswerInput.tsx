import { forwardRef, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { searchKey } from '../lib/answer';
import styles from './AnswerInput.module.css';

const MAX_SUGGESTIONS = 50;

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Validation : touche Entrée, ou clic sur une proposition. */
  onSubmit: (value: string) => void;
  /** Noms proposés (toute la base AnisongDB + noms de la liste). */
  names: string[];
  disabled?: boolean;
}

/** Champ de réponse avec la liste déroulante des noms d'animés, comme sur AMQ. */
const AnswerInput = forwardRef<HTMLInputElement, Props>(function AnswerInput({ value, onChange, onSubmit, names, disabled }, ref) {
  const [highlighted, setHighlighted] = useState(-1);
  const [open, setOpen] = useState(false);

  // Clés de recherche calculées une fois pour les ~9 000 noms.
  const index = useMemo(() => names.map((name) => ({ name, key: searchKey(name) })), [names]);

  const suggestions = useMemo(() => {
    const query = searchKey(value);
    if (!query) return [];
    const matches = index.filter((n) => n.key.includes(query));
    // Les noms qui commencent par la saisie d'abord, puis les plus courts.
    matches.sort((a, b) => Number(b.key.startsWith(query)) - Number(a.key.startsWith(query)) || a.name.length - b.name.length);
    return matches.slice(0, MAX_SUGGESTIONS).map((n) => n.name);
  }, [index, value]);

  const visible = open && !disabled && suggestions.length > 0;

  // Garde la proposition surlignée visible dans la liste déroulante.
  useEffect(() => {
    if (visible && highlighted >= 0) document.getElementById(`answer-suggestion-${highlighted}`)?.scrollIntoView({ block: 'nearest' });
  }, [visible, highlighted]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!suggestions.length) return;
      e.preventDefault();
      setOpen(true);
      // -1 = aucune proposition surlignée (Entrée valide alors le texte tapé) ; on boucle aux extrémités.
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((h) => {
        const next = h + step;
        if (next >= suggestions.length) return -1;
        if (next < -1) return suggestions.length - 1;
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      const chosen = visible && highlighted >= 0 ? suggestions[highlighted] : value;
      setOpen(false);
      setHighlighted(-1);
      onSubmit(chosen);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlighted(-1);
    }
  }

  return (
    <div className={styles.wrapper}>
      <input
        ref={ref}
        type="text"
        className={styles.input}
        placeholder="Nom de l'animé…"
        aria-label="Nom de l'animé"
        role="combobox"
        aria-expanded={visible}
        aria-controls="answer-suggestions"
        aria-autocomplete="list"
        aria-activedescendant={visible && highlighted >= 0 ? `answer-suggestion-${highlighted}` : undefined}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlighted(-1);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(false)}
        onFocus={() => setOpen(true)}
      />
      {visible && (
        <ul id="answer-suggestions" role="listbox" className={styles.suggestions}>
          {suggestions.map((name, i) => (
            <li
              key={name}
              id={`answer-suggestion-${i}`}
              role="option"
              aria-selected={i === highlighted}
              className={i === highlighted ? styles.highlighted : undefined}
              // mousedown plutôt que click : le champ ne doit pas perdre le focus avant la sélection.
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                setHighlighted(-1);
                onChange(name);
                onSubmit(name);
              }}
              onMouseEnter={() => setHighlighted(i)}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default AnswerInput;
