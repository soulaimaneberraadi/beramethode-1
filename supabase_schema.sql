-- BERAMETHODE — Cloud sync schema
-- À copier-coller dans Supabase SQL Editor puis cliquer Run

create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop policy if exists "users_select_own" on public.user_data;
drop policy if exists "users_insert_own" on public.user_data;
drop policy if exists "users_update_own" on public.user_data;

create policy "users_select_own" on public.user_data
  for select using (auth.uid() = user_id);

create policy "users_insert_own" on public.user_data
  for insert with check (auth.uid() = user_id);

create policy "users_update_own" on public.user_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Activer realtime sur la table
alter publication supabase_realtime add table public.user_data;
