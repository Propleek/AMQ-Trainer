import type { Song } from '../types';
import type { SamplePoint } from './quizSettings';

/** Au-delà, la musique est considérée comme indisponible. */
const LOAD_TIMEOUT_MS = 20_000;
const VOLUME_KEY = 'amq-trainer:volume';

/** Média préparé : chargé et positionné sur son point de départ, prêt à jouer. */
interface PreparedMedia<T extends HTMLMediaElement> {
  element: T;
  /** Résolue quand l'extrait peut démarrer sans attendre ; rejetée si le fichier est indisponible. */
  ready: Promise<void>;
}

/** Musique de la manche : le son pendant la réponse, puis la vidéo du même passage à la révélation. */
export interface Track {
  song: Song;
  audio: HTMLAudioElement;
  ready: Promise<void>;
  /** Point de départ de l'extrait (s), connu une fois `ready` résolue ; la révélation rejoue ce passage. */
  startAt: number;
}

export interface RevealVideo {
  video: HTMLVideoElement;
  ready: Promise<void>;
}

function once(media: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve) => media.addEventListener(event, () => resolve(), { once: true }));
}

/** Point de départ : aléatoire dans le fichier (en gardant le temps de réponse jusqu'à la fin), ou début. */
function startPoint(duration: number, samplePoint: SamplePoint, guessTime: number): number {
  if (samplePoint === 'start' || !Number.isFinite(duration)) return 0;
  return Math.random() * Math.max(0, duration - guessTime);
}

/**
 * Charge un média et le positionne sur son point de départ (calculé d'après la durée du fichier).
 * Le navigateur met en mémoire tampon à partir de ce point : la lecture démarre sans attente.
 */
function prepareMedia<T extends HTMLMediaElement>(element: T, url: string, start: (duration: number) => number): PreparedMedia<T> {
  element.preload = 'auto';
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Délai de chargement dépassé')), LOAD_TIMEOUT_MS);
    element.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('Fichier indisponible'));
    });

    void (async () => {
      await once(element, 'loadedmetadata');
      const at = start(element.duration);
      if (at > 0) {
        const seeked = once(element, 'seeked');
        element.currentTime = at;
        await seeked;
      }
      // HAVE_FUTURE_DATA : assez de données pour démarrer.
      if (element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) await once(element, 'canplay');
      clearTimeout(timer);
      resolve();
    })();
  });
  // Évite une erreur « non gérée » si le média est jeté avant d'être attendu.
  ready.catch(() => {});
  element.src = url;
  return { element, ready };
}

/** Prépare la musique d'une manche sur un point de départ aléatoire (ou au début). */
export function prepareTrack(song: Song, samplePoint: SamplePoint, guessTime: number): Track {
  const track: Track = { song, audio: new Audio(), ready: Promise.resolve(), startAt: 0 };
  const { ready } = prepareMedia(track.audio, song.audioUrl, (duration) => {
    track.startAt = startPoint(duration, samplePoint, guessTime);
    return track.startAt;
  });
  track.ready = ready;
  return track;
}

/** Prépare la vidéo de la révélation, calée sur le même passage que le son de la manche. */
export function prepareRevealVideo(url: string, startAt: number): RevealVideo {
  const video = document.createElement('video');
  video.playsInline = true;
  const { ready } = prepareMedia(video, url, (duration) => Math.min(startAt, Math.max(0, duration - 1)));
  return { video, ready };
}

/** Arrête la lecture et libère le chargement en cours. */
export function disposeMedia(media: HTMLMediaElement): void {
  media.pause();
  media.removeAttribute('src');
  media.load();
  media.remove();
}

export function disposeTrack(track: Track): void {
  disposeMedia(track.audio);
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
