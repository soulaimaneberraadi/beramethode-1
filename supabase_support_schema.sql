-- BERAMETHODE — Schéma du système de Support (tickets + chat / Réclamations)
-- À exécuter dans le SQL Editor du nouveau projet Supabase (ou via MCP).
-- Reconstruit depuis src/lib/supportTypes.ts + policies de l'ancien projet.
-- RLS optimisé : auth.uid()/auth.jwt() enveloppés dans (select …).
--
-- NB : le master (réponses + lecture de tous les tickets) est identifié par
-- l'e-mail propriétaire. Adapter l'e-mail ci-dessous si besoin.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id text,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  kind text not null,
  message text not null,
  view text,
  url text,
  context jsonb,
  status text not null default 'nouveau',
  last_message_at timestamptz not null default now(),
  user_last_read_at timestamptz,
  master_last_read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender text not null,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

-- ── Policies ──
create policy "tickets_master_all" on public.support_tickets for all to authenticated
  using (((select auth.jwt()) ->> 'email') = 'soulaimaneberraadi@gmail.com')
  with check (((select auth.jwt()) ->> 'email') = 'soulaimaneberraadi@gmail.com');
create policy "tickets_user_insert" on public.support_tickets for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "tickets_user_read" on public.support_tickets for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "tickets_user_update" on public.support_tickets for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "messages_master_all" on public.support_messages for all to authenticated
  using (((select auth.jwt()) ->> 'email') = 'soulaimaneberraadi@gmail.com')
  with check (((select auth.jwt()) ->> 'email') = 'soulaimaneberraadi@gmail.com');
create policy "messages_user_insert" on public.support_messages for insert to authenticated
  with check ((sender = 'user') and exists (
    select 1 from public.support_tickets t
    where t.id = support_messages.ticket_id and t.user_id = (select auth.uid())));
create policy "messages_user_read" on public.support_messages for select to authenticated
  using (exists (
    select 1 from public.support_tickets t
    where t.id = support_messages.ticket_id and t.user_id = (select auth.uid())));

-- ── Trigger : last_message_at ──
create or replace function public.touch_ticket_on_message() returns trigger
  language plpgsql security definer set search_path to 'public' as $fn$
begin
  update public.support_tickets set last_message_at = new.created_at where id = new.ticket_id;
  return new;
end; $fn$;
revoke execute on function public.touch_ticket_on_message() from anon, authenticated, public;
drop trigger if exists trg_touch_ticket on public.support_messages;
create trigger trg_touch_ticket after insert on public.support_messages
  for each row execute function public.touch_ticket_on_message();

-- ── Index ──
create index if not exists tickets_tenant_idx on public.support_tickets(tenant_id);
create index if not exists tickets_user_idx on public.support_tickets(user_id);
create index if not exists tickets_status_idx on public.support_tickets(status);
