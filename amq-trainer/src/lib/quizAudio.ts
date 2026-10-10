import type { Song } from '../types';
import type { SamplePoint } from './quizSettings';

/** Au-delà, la musique est considérée comme indisponible. */
const LOAD_TIMEOUT_MS = 20_000;
/** Temps d'écoute réservé après la réponse, pour que la révélation ne tombe pas en fin de fichier. */
const REVEAL_MARGIN_S = 10;
const VOLUME_KEY = 'amq-trainer:volume';

/** Musique préparée : chargée et positionnée sur son point de départ, prête à jouer. */
export interface Track {
  song: Song;
  audio: HTMLAudioElement;
  /** Résolue quand l'extrait peut démarrer sans attendre ; rejetée si le fichier est indisponible. */
  ready: Promise<void>;
}

function once(audio: HTMLAudioElement, event: string): Promise<void> {
  return new Promise((resolve) => audio.addEventListener(event, () => resolve(), { once: true }));
}

/** Point de départ : aléatoire dans le fichier (en gardant le temps de réponse et de révélation), ou début. */
function startPoint(duration: number, samplePoint: SamplePoint, guessTime: number): number {
  if (samplePoint === 'start' || !Number.isFinite(duration)) return 0;
  return Math.random() * Math.max(0, duration - guessTime - REVEAL_MARGIN_S);
}

/**
 * Lance le chargement d'une musique et la positionne sur son point de départ.
 * Le navigateur met en mémoire tampon à partir de ce point : la lecture démarre sans attente.
 */
export function prepareTrack(song: Song, samplePoint: SamplePoint, guessTime: number): Track {
  const audio = new Audio();
  audio.preload = 'auto';

  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Délai de chargement dépassé')), LOAD_TIMEOUT_MS);
    audio.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('Fichier audio indisponible'));
    });

    void (async () => {
      await once(audio, 'loadedmetadata');
      const start = startPoint(audio.duration, samplePoint, guessTime);
      if (start > 0) {
        const seeked = once(audio, 'seeked');
        audio.currentTime = start;
        await seeked;
      }
      // HAVE_FUTURE_DATA : assez de données pour démarrer.
      if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) await once(audio, 'canplay');
      clearTimeout(timer);
      resolve();
    })();
  });
  // Évite une erreur « non gérée » si la musique est jetée avant d'être attendue.
  ready.catch(() => {});

  audio.src = song.audioUrl;
  return { song, audio, ready };
}

/** Arrête la lecture et libère le chargement en cours. */
export function disposeTrack(track: Track): void {
  track.audio.pause();
  track.audio.removeAttribute('src');
  track.audio.load();
}

export function loadVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const value = Number(raw);
    return raw !== null && value >= 0 && value <= 1 ? value : 0.7;
  } catch {
    return 0.7;
  }
}

export function saveVolume(volume: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // Préférence facultative.
  }
}
