-- BERAMETHODE — Storage setup (Phase 1 « WhatsApp-style » : médias séparés du blob)
-- À exécuter dans le SQL Editor du projet Supabase (ou via MCP apply_migration).
--
-- Pourquoi : les images (photos de modèles, logos) sont aujourd'hui stockées en
-- base64 INLINE dans user_data.data → le blob atteint ~2,2 Mo et est retéléchargé
-- à chaque sync. Le code (src/lib/cloudSync.ts + server/supabaseSync.ts) tente
-- DÉJÀ d'uploader vers le bucket `bera-assets` puis de ne garder qu'une URL ;
-- il échoue uniquement parce que le bucket n'existe pas. Ce script le crée.
--
-- Résultat attendu (au prochain push, service rétabli) : images → Storage (CDN),
-- blob ~2,2 Mo ⟶ ~0,3 Mo, egress par utilisateur −85 %.

-- 1) Bucket public (lecture des images sans auth, pour l'affichage sur Vercel)
insert into storage.buckets (id, name, public)
values ('bera-assets', 'bera-assets', true)
on conflict (id) do update set public = true;

-- 2) Policies sur storage.objects, limitées à ce bucket.
--    Lecture publique (bucket public) + écriture/upsert réservée aux connectés.
drop policy if exists "bera_assets_public_read"  on storage.objects;
drop policy if exists "bera_assets_auth_insert"  on storage.objects;
drop policy if exists "bera_assets_auth_update"  on storage.objects;

create policy "bera_assets_public_read" on storage.objects
  for select using (bucket_id = 'bera-assets');

create policy "bera_assets_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bera-assets');

-- UPDATE = nécessaire pour l'upsert (x-upsert: true) lors des ré-uploads.
create policy "bera_assets_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'bera-assets')
  with check (bucket_id = 'bera-assets');

-- VÉRIFICATION :
--   select id, public from storage.buckets where id = 'bera-assets';   -> public = true
--   select polname from pg_policies where tablename = 'objects'
--     and polname like 'bera_assets%';                                 -> 3 policies
