-- Schéma AMQ Trainer : à exécuter dans Supabase (SQL Editor → New query → Run).
-- Chaque utilisateur ne voit et ne modifie que ses propres lignes (Row Level Security).
-- Réexécutable sans risque : les tables existantes et leurs données sont conservées.

-- Progression par chanson (voir SongProgress dans amq-trainer/src/lib/progress.ts).
create table if not exists public.song_progress (
  user_id      uuid        not null default auth.uid() references auth.users on delete cascade,
  ann_song_id  integer     not null,
  seen         integer     not null default 0,
  correct      integer     not null default 0,
  last_seen    timestamptz not null,
  missed       boolean     not null default false,
  box          smallint    not null check (box between 1 and 5),
  due_at       timestamptz not null,
  updated_at   timestamptz not null default now(),
  primary key (user_id, ann_song_id)
);

-- Parties de Test terminées (voir TestResult dans amq-trainer/src/lib/testHistory.ts).
create table if not exists public.test_results (
  user_id    uuid        not null default auth.uid() references auth.users on delete cascade,
  list_name  text        not null,
  played_at  timestamptz not null,
  total      integer     not null,
  correct    integer     not null,
  primary key (user_id, list_name, played_at)
);

-- Listes d'animés composées à la main (voir SavedList dans amq-trainer/src/lib/savedLists.ts).
-- Une liste supprimée est gardée avec deleted = true, pour que la suppression se propage aux autres appareils.
create table if not exists public.saved_lists (
  user_id     uuid        not null default auth.uid() references auth.users on delete cascade,
  id          uuid        not null,
  name        text        not null,
  entries     jsonb       not null default '[]',
  created_at  timestamptz not null,
  updated_at  timestamptz not null,
  deleted     boolean     not null default false,
  primary key (user_id, id)
);

alter table public.song_progress enable row level security;
alter table public.test_results enable row level security;
alter table public.saved_lists enable row level security;

drop policy if exists "own rows" on public.song_progress;
create policy "own rows" on public.song_progress
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own rows" on public.test_results;
create policy "own rows" on public.test_results
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own rows" on public.saved_lists;
create policy "own rows" on public.saved_lists
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
