import { useCallback, useEffect, useRef, useState } from 'react';
import type { Song } from '../types';
import { songTypeLabel } from '../types';
import type { QuizStart } from './SetupScreen';
import { isCorrect } from '../lib/answer';
import { buildAutocompleteNames, fetchAnimeNames } from '../lib/animeNames';
import { disposeTrack, loadVolume, prepareTrack, saveVolume } from '../lib/quizAudio';
import { recordAnswer } from '../lib/progress';
import { MODE_LABELS } from '../lib/quizSettings';
import type { QuizMode } from '../lib/quizSettings';
import type { Track } from '../lib/quizAudio';
import AnswerInput from '../components/AnswerInput';
import QuizResults from '../components/QuizResults';
import styles from './QuizScreen.module.css';

/** Réponse donnée pour une chanson de la partie. */
export interface QuizAnswer {
  song: Song;
  answer: string;
  correct: boolean;
  /** Fichier audio impossible à charger : la chanson ne compte pas dans le score. */
  unavailable: boolean;
}

/**
 * loading : chargement de l'extrait · blocked : lecture refusée par le navigateur (clic requis) ·
 * guess : temps de réponse · reveal : révélation · done : fin de partie.
 */
type Phase = 'loading' | 'blocked' | 'guess' | 'reveal' | 'done';

interface Props {
  start: QuizStart;
  /** Toutes les chansons de la liste : leurs noms complètent l'autocomplétion. */
  listSongs: Song[];
  /** Couverture AniList par ANN ID. */
  covers: Map<number, string>;
  onQuit: () => void;
  /** Relance une partie sur ces chansons, dans ce mode (« Rejouer les ratés », « Paquet suivant »). */
  onReplay: (songs: Song[], mode: QuizMode) => void;
  /** Mode Découverte : tire le paquet suivant de chansons jamais vues (lu à la fin de la partie). */
  getNextBatch: (() => Song[]) | null;
}

export default function QuizScreen({ start, listSongs, covers, onQuit, onReplay, getNextBatch }: Props) {
  const { songs, settings } = start;
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [input, setInput] = useState('');
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const [volume, setVolume] = useState(loadVolume);
  const [names, setNames] = useState(() => buildAutocompleteNames([], listSongs));
  const [saveFailed, setSaveFailed] = useState(false);

  const currentTrack = useRef<Track | null>(null);
  const nextTrack = useRef<Track | null>(null);
  const volumeRef = useRef(volume);
  const inputRef = useRef<HTMLInputElement>(null);
  const latestInput = useRef('');
  /** Empêche une double validation (Entrée et fin du temps au même moment). */
  const answered = useRef(false);

  // Noms de toute la base AnisongDB (en cache après la première partie).
  useEffect(() => {
    const controller = new AbortController();
    fetchAnimeNames(controller.signal).then(
      (base) => setNames(buildAutocompleteNames(base, listSongs)),
      () => {}, // Sans la base, l'autocomplétion se limite aux noms de la liste.
    );
    return () => controller.abort();
  }, [listSongs]);

  const beginGuess = useCallback(() => {
    answered.current = false;
    const t = performance.now();
    setNow(t);
    setDeadline(t + settings.guessTime * 1000);
    setPhase('guess');
  }, [settings.guessTime]);

  // Chargement et lecture de la chanson en cours, puis préchargement de la suivante.
  useEffect(() => {
    if (index >= songs.length) return;
    const song = songs[index];
    const preloaded = nextTrack.current;
    nextTrack.current = null;
    if (preloaded && preloaded.song !== song) disposeTrack(preloaded);
    const track = preloaded?.song === song ? preloaded : prepareTrack(song, settings.samplePoint, settings.guessTime);
    currentTrack.current = track;
    // Couverture chargée pendant l'écoute : elle s'affiche dès la révélation.
    const cover = covers.get(song.annId);
    if (cover) new Image().src = cover;

    let cancelled = false;
    track.ready.then(
      () => {
        if (cancelled) return;
        track.audio.volume = volumeRef.current;
        track.audio.play().then(
          () => !cancelled && beginGuess(),
          () => !cancelled && setPhase('blocked'),
        );
        if (index + 1 < songs.length) {
          nextTrack.current = prepareTrack(songs[index + 1], settings.samplePoint, settings.guessTime);
        }
      },
      () => {
        if (cancelled) return;
        setAnswers((a) => [...a, { song, answer: '', correct: false, unavailable: true }]);
        setPhase('reveal');
      },
    );
    return () => {
      cancelled = true;
      disposeTrack(track);
      currentTrack.current = null;
    };
  }, [index, songs, covers, settings.samplePoint, settings.guessTime, beginGuess]);

  // Libère la musique préchargée en quittant l'écran.
  useEffect(
    () => () => {
      if (nextTrack.current) disposeTrack(nextTrack.current);
    },
    [],
  );

  const submit = useCallback(
    (answer: string) => {
      if (answered.current) return;
      answered.current = true;
      const song = songs[index];
      const correct = isCorrect(answer, song);
      if (!recordAnswer(song.annSongId, correct)) setSaveFailed(true);
      setAnswers((a) => [...a, { song, answer: answer.trim(), correct, unavailable: false }]);
      setPhase('reveal');
    },
    [songs, index],
  );

  // Minuteur : à la fin du temps, la saisie en cours est validée.
  useEffect(() => {
    if (phase !== 'guess') return;
    const timer = setInterval(() => {
      const t = performance.now();
      setNow(t);
      if (t >= deadline) submit(latestInput.current);
    }, 100);
    return () => clearInterval(timer);
  }, [phase, deadline, submit]);

  const next = useCallback(() => {
    setInput('');
    latestInput.current = '';
    setPhase(index + 1 >= songs.length ? 'done' : 'loading');
    setIndex(index + 1);
  }, [index, songs.length]);

  // Révélation : Entrée passe à la musique suivante.
  useEffect(() => {
    if (phase !== 'reveal') return;
    const onKey = (e: KeyboardEvent) => {
      // React installe cet écouteur pendant la remontée de l'Entrée qui a validé la réponse :
      // cet appui-là (déjà traité par le champ, `defaultPrevented`) ne doit pas sauter la révélation.
      // Un bouton qui a le focus traite lui-même sa touche Entrée.
      if (e.defaultPrevented || e.target instanceof HTMLButtonElement) return;
      if (e.key === 'Enter' && !e.repeat) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, next]);

  // Le champ reprend le focus à chaque nouvelle manche.
  useEffect(() => {
    if (phase === 'loading' || phase === 'guess') inputRef.current?.focus();
  }, [phase]);

  function changeVolume(value: number) {
    setVolume(value);
    volumeRef.current = value;
    if (currentTrack.current) currentTrack.current.audio.volume = value;
    saveVolume(value);
  }

  function quit() {
    if (phase !== 'done' && answers.length > 0 && !window.confirm('Quitter la partie en cours ?')) return;
    onQuit();
  }

  if (phase === 'done') {
    return (
      <QuizResults
        mode={settings.mode}
        answers={answers}
        saveFailed={saveFailed}
        onReplay={onReplay}
        getNextBatch={getNextBatch}
        onQuit={onQuit}
      />
    );
  }

  const song = songs[index];
  const answer = phase === 'reveal' ? answers[answers.length - 1] : null;
  const remaining = Math.max(0, deadline - now);
  const score = answers.filter((a) => a.correct).length;
  const played = answers.filter((a) => !a.unavailable).length;
  const cover = covers.get(song.annId);

  return (
    <section className={styles.quiz}>
      {saveFailed && <p className="error">Stockage du navigateur indisponible : la progression de cette partie ne sera pas conservée.</p>}
      <div className={styles.topBar}>
        <span className={styles.mode}>{MODE_LABELS[settings.mode]}</span>
        <span>
          Musique <strong>{index + 1}</strong> / {songs.length}
        </span>
        <span>
          Score : <strong>{score}</strong> / {played}
        </span>
        <label className={styles.volume}>
          <span aria-hidden="true">🔊</span>
          <input
            type="range"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
          />
        </label>
        <button type="button" className="danger" onClick={quit}>
          Quitter
        </button>
      </div>

      <div className={`panel ${styles.stage}`}>
        {phase === 'loading' && <p className={styles.status}>Chargement de la musique…</p>}
        {phase === 'blocked' && (
          <button
            type="button"
            className="primary"
            onClick={() => currentTrack.current?.audio.play().then(beginGuess, () => {})}
          >
            ▶ Lancer la musique
          </button>
        )}
        {phase === 'guess' && (
          <>
            <p className={styles.timer} aria-live="off">
              {Math.ceil(remaining / 1000)}
            </p>
            <div className={styles.bar}>
              <div className={styles.fill} style={{ width: `${(remaining / (settings.guessTime * 1000)) * 100}%` }} />
            </div>
          </>
        )}
        {phase === 'reveal' && answer && (
          <div className={styles.reveal}>
            {cover ? <img src={cover} alt="" className={styles.cover} /> : <div className={styles.cover} />}
            <div className={styles.revealInfo}>
              <p className={answer.unavailable ? styles.unavailable : answer.correct ? styles.correct : styles.wrong}>
                {answer.unavailable ? 'Musique indisponible (non comptée)' : answer.correct ? '✔ Bonne réponse' : '✘ Raté'}
              </p>
              <h2 className={styles.animeName}>{song.anime.jpName}</h2>
              {song.anime.enName && song.anime.enName !== song.anime.jpName && <p className="muted">{song.anime.enName}</p>}
              <p className={styles.songLine}>
                <strong>{songTypeLabel(song)}</strong> · {song.name} — {song.artist}
              </p>
              <p className="muted">
                {[song.anime.vintage, song.anime.type, song.difficulty !== null && `difficulté ${Math.round(song.difficulty)}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {!answer.unavailable && (
                <p>
                  Ta réponse : {answer.answer ? <strong>{answer.answer}</strong> : <span className="muted">(aucune)</span>}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {phase === 'reveal' ? (
        <button type="button" className={`primary ${styles.next}`} onClick={next}>
          {index + 1 >= songs.length ? 'Voir les résultats' : 'Suivant'} <span className={styles.key}>Entrée</span>
        </button>
      ) : (
        <AnswerInput
          ref={inputRef}
          value={input}
          onChange={(value) => {
            setInput(value);
            latestInput.current = value;
          }}
          onSubmit={(value) => phase === 'guess' && submit(value)}
          names={names}
          disabled={phase === 'blocked'}
        />
      )}
    </section>
  );
}
