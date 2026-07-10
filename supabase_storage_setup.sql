-- BERAMETHODE - Supabase Storage setup
-- Run this once in the Supabase SQL Editor as a project owner/admin.
--
-- Buckets:
--   - bera-assets: public image/media bucket used by app snapshots.
--   - bera-backups: private SQLite backup bucket used by server/supabaseSync.ts.
--
-- Important:
--   - Public buckets can serve files by public URL without a SELECT policy.
--   - Upload/upsert still needs storage.objects RLS policies.
--   - Supabase Storage upsert needs INSERT + SELECT + UPDATE policies.

-- 1) Public assets bucket.
insert into storage.buckets (id, name, public)
values ('bera-assets', 'bera-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "bera_assets_public_read" on storage.objects;
drop policy if exists "bera_assets_auth_select" on storage.objects;
drop policy if exists "bera_assets_auth_insert" on storage.objects;
drop policy if exists "bera_assets_auth_update" on storage.objects;
drop policy if exists "bera_assets_anon_insert" on storage.objects;
drop policy if exists "bera_assets_all_access" on storage.objects;

-- Allow all users (authenticated and anonymous) full access to 'bera-assets'
-- to support local SQLite sessions and public image sharing.
create policy "bera_assets_all_access" on storage.objects
  for all to public
  using (bucket_id = 'bera-assets')
  with check (bucket_id = 'bera-assets');

-- 2) Private backup bucket.
insert into storage.buckets (id, name, public)
values ('bera-backups', 'bera-backups', false)
on conflict (id) do update set public = false;

drop policy if exists "bera_backups_auth_select" on storage.objects;
drop policy if exists "bera_backups_auth_insert" on storage.objects;
drop policy if exists "bera_backups_auth_update" on storage.objects;

-- Backup files are written as:
--   bera-backups/backups/{auth.uid()}/backup_TIMESTAMP.sqlite
create policy "bera_backups_auth_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bera-backups'
    and (storage.foldername(name))[1] = 'backups'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy "bera_backups_auth_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bera-backups'
    and (storage.foldername(name))[1] = 'backups'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy "bera_backups_auth_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'bera-backups'
    and (storage.foldername(name))[1] = 'backups'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'bera-backups'
    and (storage.foldername(name))[1] = 'backups'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- Verification:
--   select id, public from storage.buckets where id in ('bera-assets', 'bera-backups');
--   select policyname, cmd from pg_policies
--     where schemaname = 'storage'
--       and tablename = 'objects'
--       and policyname like 'bera_%'
--     order by policyname;
