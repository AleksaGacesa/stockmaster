-- ============================================================
-- StockMaster — Termine (calendar/planner events) that power the
-- Kalender page and the "Heute anstehend" card on the Home dashboard.
-- One row per scheduled event: goods receipt, assembly job, inventory
-- count, delivery, or a free-form appointment. Optionally linked to a
-- project. Read by any authenticated user; only managers (owner/admin)
-- can create/edit/delete.
-- Safe to run multiple times. Run after 29_export_protokoll.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

create table if not exists public.termine (
  id              bigint generated always as identity primary key,
  titel           text not null,
  typ             text not null default 'sonstiges',  -- warenannahme|montage|inventur|lieferung|sonstiges
  datum           date not null,
  uhrzeit         time,                                -- null = ganztägig
  ort             text not null default '',
  notiz           text not null default '',
  projekt_id      bigint references public.projekte on delete set null,
  erledigt        boolean not null default false,
  erstellt_von    text not null default '',
  erstellt_von_id uuid references public.profiles on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_termine_datum on public.termine (datum);

alter table public.termine enable row level security;

drop policy if exists "Authenticated can read termine" on public.termine;
drop policy if exists "Manager can manage termine"     on public.termine;

create policy "Authenticated can read termine" on public.termine
  for select using (auth.role() = 'authenticated');
create policy "Manager can manage termine" on public.termine
  for all using (public.current_role_is_manager()) with check (public.current_role_is_manager());

-- ============================================================
-- Done.
-- ============================================================
