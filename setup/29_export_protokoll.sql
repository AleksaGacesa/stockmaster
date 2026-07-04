-- ============================================================
-- StockMaster — durable export history for the Administration page.
-- Previously the "Vorschau & Schnellzugriff" list lived in the
-- browser's localStorage, so it vanished when switching device,
-- browser, or origin (localhost vs. the deployed site) or when the
-- cache was cleared. This table stores each generated export in the
-- database instead, so the history is shared across every device and
-- survives cache clears.
-- Safe to run multiple times. Run after 28_kennzahlen_snapshots.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

create table if not exists public.export_protokoll (
  id              bigint generated always as identity primary key,
  typ             text not null,           -- REPORT_META key (lieferanten, zip, ...)
  detail          text,                    -- optional suffix (project name, year, ...)
  erstellt_von    text not null default '',
  erstellt_von_id uuid references public.profiles on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_export_protokoll_created_at
  on public.export_protokoll (created_at desc);

alter table public.export_protokoll enable row level security;

drop policy if exists "Manager can read export log"   on public.export_protokoll;
drop policy if exists "Manager can insert export log" on public.export_protokoll;
drop policy if exists "Manager can delete export log" on public.export_protokoll;

create policy "Manager can read export log" on public.export_protokoll
  for select using (public.current_role_is_manager());
create policy "Manager can insert export log" on public.export_protokoll
  for insert with check (public.current_role_is_manager());
create policy "Manager can delete export log" on public.export_protokoll
  for delete using (public.current_role_is_manager());

-- ============================================================
-- Done.
-- ============================================================
