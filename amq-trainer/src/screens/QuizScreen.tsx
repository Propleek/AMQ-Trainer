import { useCallback, useEffect, useRef, useState } from 'react';
import type { Song } from '../types';
import { songTypeLabel } from '../types';
import type { QuizStart } from './SetupScreen';
import { isCorrect } from '../lib/answer';
import { buildAutocompleteNames, fetchAnimeNames } from '../lib/animeNames';
import { disposeMedia, disposeTrack, loadVolume, prepareRevealVideo, prepareTrack, saveVolume } from '../lib/quizAudio';
import { recordAnswer } from '../lib/progress';
import { addTestResult } from '../lib/testHistory';
import { pushChanges } from '../lib/sync';
import { MODE_LABELS } from '../lib/quizSettings';
import type { QuizMode } from '../lib/quizSettings';
import type { RevealVideo, Track } from '../lib/quizAudio';
import AnswerInput from '../components/AnswerInput';
import PlayerCard from '../components/PlayerCard';
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

/** Média de la révélation : vidéo du passage, sinon l'extrait rejoué en audio (avec la couverture). */
type RevealMedia = 'loading' | 'video' | 'audio' | 'none';

/** Attente maximale de la vidéo à la révélation, avant de rejouer l'extrait en audio. */
const VIDEO_WAIT_MS = 4000;

interface Props {
  start: QuizStart;
  /** Nom de la liste, pour l'historique des Tests. */
  listName: string;
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

export default function QuizScreen({ start, listName, listSongs, covers, onQuit, onReplay, getNextBatch }: Props) {
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
  const [revealMedia, setRevealMedia] = useState<RevealMedia>('loading');
  /** Fin de la révélation (passage automatique à la musique suivante) ; 0 tant qu'elle n'a pas démarré. */
  const [revealDeadline, setRevealDeadline] = useState(0);

  const currentTrack = useRef<Track | null>(null);
  const nextTrack = useRef<Track | null>(null);
  const revealVideo = useRef<RevealVideo | null>(null);
  /** Emplacement de la vidéo, toujours présent (masqué hors révélation) pour l'y insérer à tout moment. */
  const videoHost = useRef<HTMLDivElement>(null);
  const volumeRef = useRef(volume);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Réponse validée avec Entrée (modifiable jusqu'à la fin du temps), affichée dans la bulle. */
  const [submitted, setSubmitted] = useState('');
  const submittedRef = useRef('');
  /** Empêche une double révélation (Passer et fin du temps au même moment). */
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
    submittedRef.current = '';
    setSubmitted('');
    const t = performance.now();
    setNow(t);
    setDeadline(t + settings.guessTime * 1000);
    setPhase('guess');
  }, [settings.guessTime]);

  /**
   * Révélation à la manière d'AMQ : le son s'arrête et le même passage est rejoué en vidéo (ou en
   * audio à défaut), pendant la durée de la manche ; ensuite, musique suivante automatiquement.
   */
  const startReveal = useCallback(
    (unavailable: boolean) => {
      const track = currentTrack.current;
      const reveal = revealVideo.current;
      const startCountdown = () => {
        const t = performance.now();
        setNow(t);
        setRevealDeadline(t + settings.guessTime * 1000);
      };
      track?.audio.pause();
      setRevealDeadline(0);
      if (unavailable || !track) {
        setRevealMedia('none');
        startCountdown();
        return;
      }
      const replayAudio = () => {
        if (currentTrack.current !== track) return;
        track.audio.currentTime = track.startAt;
        void track.audio.play().catch(() => {});
        setRevealMedia('audio');
        startCountdown();
      };
      if (!reveal) {
        replayAudio();
        return;
      }
      setRevealMedia('loading');
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Vidéo trop lente')), VIDEO_WAIT_MS));
      Promise.race([reveal.ready, timeout])
        .then(async () => {
          if (revealVideo.current !== reveal) return;
          reveal.video.volume = volumeRef.current;
          videoHost.current?.appendChild(reveal.video);
          await reveal.video.play();
          setRevealMedia('video');
          startCountdown();
        })
        .catch(() => {
          if (revealVideo.current !== reveal) return;
          disposeMedia(reveal.video);
          replayAudio();
        });
    },
    [settings.guessTime],
  );

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
        // Vidéo de la révélation, calée sur le passage qui vient de démarrer.
        if (song.videoUrl) revealVideo.current = prepareRevealVideo(song.videoUrl, track.startAt);
        if (index + 1 < songs.length) {
          nextTrack.current = prepareTrack(songs[index + 1], settings.samplePoint, settings.guessTime);
        }
      },
      () => {
        if (cancelled) return;
        setAnswers((a) => [...a, { song, answer: '', correct: false, unavailable: true }]);
        setPhase('reveal');
        startReveal(true);
      },
    );
    return () => {
      cancelled = true;
      disposeTrack(track);
      currentTrack.current = null;
      if (revealVideo.current) disposeMedia(revealVideo.current.video);
      revealVideo.current = null;
    };
  }, [index, songs, covers, settings.samplePoint, settings.guessTime, beginGuess, startReveal]);

  // Libère la musique préchargée en quittant l'écran.
  useEffect(
    () => () => {
      if (nextTrack.current) disposeTrack(nextTrack.current);
    },
    [],
  );

  /** Fin de la manche (fin du temps ou Passer) : la réponse est jugée et révélée. */
  const finalize = useCallback(
    (answer: string) => {
      if (answered.current) return;
      answered.current = true;
      const song = songs[index];
      const correct = isCorrect(answer, song);
      if (!recordAnswer(song.progressId, correct)) setSaveFailed(true);
      setAnswers((a) => [...a, { song, answer: answer.trim(), correct, unavailable: false }]);
      setPhase('reveal');
      startReveal(false);
    },
    [songs, index, startReveal],
  );


  /** Passer : révèle tout de suite, sans attendre la fin du temps. */
  const skip = useCallback(() => {
    finalize(submittedRef.current);
  }, [finalize]);

  // Minuteur : à la fin du temps, la manche est jugée.
  useEffect(() => {
    if (phase !== 'guess') return;
    const timer = setInterval(() => {
      const t = performance.now();
      setNow(t);
      // Seule la réponse validée avec Entrée compte : un texte tapé mais non validé est ignoré.
      if (t >= deadline) finalize(submittedRef.current);
    }, 100);
    return () => clearInterval(timer);
  }, [phase, deadline, finalize]);

  // Ctrl + Entrée hors du champ (après un clic sur le volume, par exemple) : passer aussi.
  useEffect(() => {
    if (phase !== 'guess') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.repeat) return;
      e.preventDefault();
      skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, skip]);

  const next = useCallback(() => {
    setInput('');
    submittedRef.current = '';
    setSubmitted('');
    const finished = index + 1 >= songs.length;
    if (finished && settings.mode === 'test') {
      const played = answers.filter((a) => !a.unavailable);
      if (played.length) {
        addTestResult({ listName, playedAt: new Date().toISOString(), total: played.length, correct: played.filter((a) => a.correct).length });
      }
    }
    setPhase(finished ? 'done' : 'loading');
    setIndex(index + 1);
  }, [index, songs.length, settings.mode, answers, listName]);

  // Révélation : passage automatique à la musique suivante une fois le passage rejoué.
  useEffect(() => {
    if (phase !== 'reveal' || !revealDeadline) return;
    const timer = setInterval(() => {
      const t = performance.now();
      setNow(t);
      if (t >= revealDeadline) next();
    }, 100);
    return () => clearInterval(timer);
  }, [phase, revealDeadline, next]);

  // Fin de partie : envoi des réponses au compte (sans compte, rien n'est envoyé).
  useEffect(() => {
    if (phase === 'done') void pushChanges();
  }, [phase]);

  // Écran quitté en cours de partie (Quitter, accueil, changement de liste) : envoi aussi.
  useEffect(() => () => void pushChanges(), []);

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
    if (revealVideo.current) revealVideo.current.video.volume = value;
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
  const showVideo = phase === 'reveal' && revealMedia === 'video';
  // Révélation : temps restant avant la musique suivante (barre pleine tant que la lecture n'a pas démarré).
  const revealRemaining = revealDeadline ? Math.max(0, revealDeadline - now) : settings.guessTime * 1000;
  const revealRatio = revealRemaining / (settings.guessTime * 1000);
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

      <div className={`panel ${styles.stage} ${showVideo ? styles.stageVideo : ''}`}>
        <div ref={videoHost} className={showVideo ? styles.videoHost : styles.hidden} />
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
            {!showVideo && (cover ? <img src={cover} alt="" className={styles.cover} /> : <div className={styles.cover} />)}
            <div className={styles.revealInfo}>
              <p className={answer.unavailable ? styles.unavailable : answer.correct ? styles.correct : styles.wrong}>
                {answer.unavailable ? 'Musique indisponible (non comptée)' : answer.correct ? '✔ Bonne réponse' : '✘ Raté'}
              </p>
              <h2 className={styles.animeName}>{song.anime.jpName}</h2>
              {song.anime.enName && song.anime.enName !== song.anime.jpName && <p className="muted">{song.anime.enName}</p>}
              {song.sharedAnime.length > 0 && (
                <p className={styles.shared}>
                  Aussi accepté :{' '}
                  {song.sharedAnime.map((shared, i) => (
                    <span key={shared.annId}>
                      {i > 0 && ', '}
                      <strong>{shared.jpName}</strong> <span className="muted">({shared.songType})</span>
                    </span>
                  ))}
                </p>
              )}
              <p className={styles.songLine}>
                <strong>{songTypeLabel(song)}</strong> · {song.name} — {song.artist}
              </p>
              <p className="muted">
                {[song.anime.vintage, song.anime.type, song.difficulty !== null && `difficulté ${Math.round(song.difficulty)}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {revealMedia === 'loading' && <p className="muted">Chargement de la vidéo…</p>}
              <button type="button" className={`primary ${styles.next}`} onClick={next}>
                {index + 1 >= songs.length ? 'Voir les résultats' : 'Suivant'}
                {revealDeadline > 0 && ` (${Math.ceil(revealRemaining / 1000)} s)`} <span className={styles.key}>Entrée</span>
              </button>
            </div>
          </div>
        )}
        {phase === 'reveal' && (
          <div className={styles.bar} aria-hidden="true">
            <div className={styles.fill} style={{ width: `${revealRatio * 100}%` }} />
          </div>
        )}
      </div>

      <PlayerCard
        answer={answer ? answer.answer : submitted}
        verdict={!answer ? 'pending' : answer.unavailable ? 'neutral' : answer.correct ? 'correct' : 'wrong'}
        score={score}
        round={index}
      />
      <p className={`muted ${styles.played}`}>
        Score : {score} / {played}
      </p>

      {phase !== 'reveal' && (
        <>
          <div className={styles.answerRow}>
            <AnswerInput
              ref={inputRef}
              value={input}
              onChange={setInput}
              onSubmit={(value) => {
                if (phase !== 'guess' || !value.trim()) return;
                submittedRef.current = value.trim();
                setSubmitted(value.trim());
              }}
              onSkip={() => phase === 'guess' && skip()}
              names={names}
              disabled={phase === 'blocked'}
            />
            <button type="button" className={styles.skip} onClick={skip} disabled={phase !== 'guess'}>
              Passer
            </button>
          </div>
          <p className={`muted ${styles.hint}`}>
            <span className={styles.key}>Tab</span> compléter · <span className={styles.key}>Entrée</span> valider (modifiable
            jusqu'à la fin du temps) ·{' '}
            <span className={styles.key}>Ctrl</span> + <span className={styles.key}>Entrée</span> passer
          </p>
        </>
      )}
    </section>
  );
}
