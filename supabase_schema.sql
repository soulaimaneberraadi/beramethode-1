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
drop policy if exists "users_delete_own" on public.user_data;

-- NB : auth.uid() est enveloppé dans (select …) pour qu'il soit évalué une
-- seule fois par requête au lieu d'une fois par ligne (perf : auth_rls_initplan).
create policy "users_select_own" on public.user_data
  for select using ((select auth.uid()) = user_id);

create policy "users_insert_own" on public.user_data
  for insert with check ((select auth.uid()) = user_id);

create policy "users_update_own" on public.user_data
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Un utilisateur ne peut supprimer que SA propre ligne (jamais celle d'autrui).
create policy "users_delete_own" on public.user_data
  for delete using ((select auth.uid()) = user_id);

-- ⚠️ IMPORTANT : user_data NE DOIT **PAS** être dans la publication Realtime.
-- La sync inter-appareils passe par Realtime *Broadcast* (WebSocket pur, zéro
-- charge DB) — PAS par postgres_changes. Laisser user_data dans la publication
-- force le décodage WAL du blob (~2 Mo) à CHAQUE écriture → sature la base
-- free-tier → erreurs 522 sur /auth/v1/token (login bloqué). On le RETIRE ici.
do $$
begin
  alter publication supabase_realtime drop table public.user_data;
exception when undefined_object then null; when others then null;
end $$;

-- Récupère l'espace gonflé (bloat MVCC) par les anciennes versions du blob.
-- VACUUM FULL ne peut pas tourner dans un bloc/transaction : à lancer À LA MAIN
-- dans le SQL Editor, hors heures de prod (pose un lock bref) :
--   vacuum full public.user_data;

-- ─────────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION (à exécuter après le Run ci-dessus) :
--   1. RLS doit être ACTIVÉ :
--        select relname, relrowsecurity from pg_class where relname = 'user_data';
--      → relrowsecurity doit valoir true.
--   2. Les 4 policies doivent exister :
--        select polname from pg_policies where tablename = 'user_data';
--      → users_select_own / insert / update / delete.
-- Si relrowsecurity = false, l'isolation entre comptes N'EST PAS active : tout
-- utilisateur connecté pourrait lire les données d'un autre via l'anon_key.
-- ─────────────────────────────────────────────────────────────────────────────
