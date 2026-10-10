import { useSyncExternalStore } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Box, SongProgress } from './progress';
import { dirtyIds, getAllProgress, markClean, mergeProgress, replaceAllProgress } from './progress';
import type { TestResult } from './testHistory';
import { loadAll as loadAllTests, replaceAll as replaceAllTests } from './testHistory';

/** Lignes par requête (lecture paginée et envoi groupé). */
const PAGE_SIZE = 1000;

export type SyncStatus = 'signed-out' | 'syncing' | 'synced' | 'error';

export interface AccountState {
  /** `false` si le site est compilé sans Supabase : l'interface de compte est masquée. */
  available: boolean;
  user: { name: string; avatarUrl: string | null } | null;
  status: SyncStatus;
  /** Incrémenté quand la fusion modifie la progression locale : les écrans recalculent leurs chiffres. */
  revision: number;
}

let state: AccountState = { available: !!supabase, user: null, status: 'signed-out', revision: 0 };
const listeners = new Set<() => void>();

function setState(changes: Partial<AccountState>) {
  state = { ...state, ...changes };
  listeners.forEach((l) => l());
}

export function useAccount(): AccountState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/* ---------- Conversion lignes ↔ progression locale ---------- */

interface ProgressRow {
  ann_song_id: number;
  seen: number;
  correct: number;
  last_seen: string;
  missed: boolean;
  box: number;
  due_at: string;
}

interface TestRow {
  list_name: string;
  played_at: string;
  total: number;
  correct: number;
}

const toRow = (id: number, p: SongProgress): ProgressRow => ({
  ann_song_id: id,
  seen: p.seen,
  correct: p.correct,
  last_seen: p.lastSeen,
  missed: p.missed,
  box: p.box,
  due_at: p.dueAt,
});

const fromRow = (r: ProgressRow): SongProgress => ({
  seen: r.seen,
  correct: r.correct,
  lastSeen: new Date(r.last_seen).toISOString(),
  missed: r.missed,
  box: r.box as Box,
  dueAt: new Date(r.due_at).toISOString(),
});

const sameProgress = (a: SongProgress, b: SongProgress) =>
  a.seen === b.seen &&
  a.correct === b.correct &&
  a.missed === b.missed &&
  a.box === b.box &&
  Date.parse(a.lastSeen) === Date.parse(b.lastSeen) &&
  Date.parse(a.dueAt) === Date.parse(b.dueAt);

const testKey = (t: { listName: string; playedAt: string }) => `${t.listName}\u0000${Date.parse(t.playedAt)}`;

/* ---------- Requêtes ---------- */

/** Toutes les lignes d'une table pour l'utilisateur connecté (la RLS filtre), par pages. */
async function selectAll<T>(table: string, columns: string, order: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase!.from(table).select(columns).order(order).range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) return rows;
  }
}

async function upsertProgress(ids: number[]): Promise<void> {
  const all = getAllProgress();
  const rows = ids.filter((id) => all[id]).map((id) => ({ ...toRow(id, all[id]), updated_at: new Date().toISOString() }));
  for (let i = 0; i < rows.length; i += PAGE_SIZE) {
    const { error } = await supabase!.from('song_progress').upsert(rows.slice(i, i + PAGE_SIZE), { onConflict: 'user_id,ann_song_id' });
    if (error) throw error;
  }
}

async function upsertTests(tests: TestResult[]): Promise<void> {
  const rows: TestRow[] = tests.map((t) => ({ list_name: t.listName, played_at: t.playedAt, total: t.total, correct: t.correct }));
  for (let i = 0; i < rows.length; i += PAGE_SIZE) {
    const { error } = await supabase!
      .from('test_results')
      .upsert(rows.slice(i, i + PAGE_SIZE), { onConflict: 'user_id,list_name,played_at', ignoreDuplicates: true });
    if (error) throw error;
  }
}

/* ---------- Synchronisation ---------- */

let running: Promise<void> | null = null;

/** Évite deux synchronisations simultanées : la suivante attend la fin de la précédente. */
function exclusive(task: () => Promise<void>): Promise<void> {
  const run = (running ?? Promise.resolve()).then(task, task);
  running = run.finally(() => {
    if (running === run) running = null;
  });
  return run;
}

/**
 * Synchronisation complète (à la connexion et au démarrage) : lit le compte, fusionne avec la
 * progression locale (`mergeProgress`), puis envoie tout ce que le compte n'a pas encore.
 */
function fullSync(): Promise<void> {
  return exclusive(async () => {
    setState({ status: 'syncing' });
    // Une réponse donnée pendant la synchronisation reste à envoyer : on ne nettoie que cet instantané.
    const dirty = dirtyIds();
    try {
      const remoteRows = await selectAll<ProgressRow>('song_progress', 'ann_song_id,seen,correct,last_seen,missed,box,due_at', 'ann_song_id');
      const remote = new Map(remoteRows.map((r) => [r.ann_song_id, fromRow(r)]));
      const local = getAllProgress();

      const merged: Record<number, SongProgress> = {};
      const toPush: number[] = [];
      let localChanged = false;
      for (const id of new Set([...Object.keys(local).map(Number), ...remote.keys()])) {
        const result = mergeProgress(local[id], remote.get(id))!;
        merged[id] = result;
        if (!remote.has(id) || !sameProgress(result, remote.get(id)!)) toPush.push(id);
        if (!local[id] || !sameProgress(result, local[id])) localChanged = true;
      }
      if (localChanged) replaceAllProgress(merged);
      const pushed = [...new Set([...toPush, ...dirty])];
      await upsertProgress(pushed);
      markClean(pushed);

      const remoteTests = (await selectAll<TestRow>('test_results', 'list_name,played_at,total,correct', 'played_at')).map<TestResult>((r) => ({
        listName: r.list_name,
        playedAt: new Date(r.played_at).toISOString(),
        total: r.total,
        correct: r.correct,
      }));
      const localTests = loadAllTests();
      const remoteKeys = new Set(remoteTests.map(testKey));
      const localKeys = new Set(localTests.map(testKey));
      await upsertTests(localTests.filter((t) => !remoteKeys.has(testKey(t))));
      const missingLocally = remoteTests.filter((t) => !localKeys.has(testKey(t)));
      if (missingLocally.length) replaceAllTests([...localTests, ...missingLocally]);

      setState({ status: 'synced', revision: state.revision + (localChanged || missingLocally.length ? 1 : 0) });
    } catch (e) {
      console.error('Synchronisation impossible', e);
      setState({ status: 'error' });
    }
  });
}

/**
 * Envoie les chansons modifiées et les Tests depuis la dernière synchronisation
 * (fin de partie, abandon). Sans compte, ne fait rien : tout reste dans le navigateur.
 */
export function pushChanges(): Promise<void> {
  if (!supabase || !state.user) return Promise.resolve();
  return exclusive(async () => {
    const ids = dirtyIds();
    setState({ status: 'syncing' });
    try {
      await upsertProgress(ids);
      markClean(ids);
      await upsertTests(loadAllTests());
      setState({ status: 'synced' });
    } catch (e) {
      console.error('Synchronisation impossible', e);
      setState({ status: 'error' });
    }
  });
}

/** Nouvel essai après une erreur. */
export const retrySync = () => (state.user ? fullSync() : Promise.resolve());

/** Métadonnées fournies par Supabase pour un compte Discord. */
interface DiscordMetadata {
  full_name?: string;
  name?: string;
  avatar_url?: string;
  /** Nom d'affichage Discord. */
  custom_claims?: { global_name?: string };
}

function toAccountUser(user: User): AccountState['user'] {
  const meta = user.user_metadata as DiscordMetadata;
  return {
    name: meta.custom_claims?.global_name || meta.full_name || meta.name || 'Compte Discord',
    avatarUrl: meta.avatar_url ?? null,
  };
}

export async function signInWithDiscord(): Promise<void> {
  if (!supabase) return;
  // Retour sur la page courante (fonctionne en local comme sous le sous-chemin GitHub Pages).
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) {
    console.error('Connexion impossible', error);
    setState({ status: 'error' });
  }
}

export async function signOut(): Promise<void> {
  // La progression reste dans ce navigateur ; elle sera refusionnée à la prochaine connexion.
  await supabase?.auth.signOut();
}

// Session existante au chargement, retour de Discord (jeton dans l'URL), connexion, déconnexion.
supabase?.auth.onAuthStateChange((event, session) => {
  if (!session?.user) {
    setState({ user: null, status: 'signed-out' });
    return;
  }
  const firstSignal = !state.user;
  setState({ user: toAccountUser(session.user) });
  // Synchronisation complète une fois par session ouverte (pas à chaque rafraîchissement du jeton).
  // Différée : onAuthStateChange interdit d'attendre d'autres appels Supabase dans son rappel.
  if (firstSignal && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) setTimeout(() => void fullSync(), 0);
});
