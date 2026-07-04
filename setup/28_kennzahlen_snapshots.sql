-- ============================================================
-- StockMaster — Kennzahlen-Snapshots for the Home dashboard trends.
-- One row per day holding the six headline figures, so the stat
-- cards can show a real "vs. Vormonat" delta and a sparkline that
-- reflects actual recorded history instead of a live guess. The
-- client upserts today's row on every owner/admin visit (idempotent
-- via the datum primary key), so history accumulates automatically
-- with no server-side cron. Older history before this table existed
-- is reconstructed client-side from the movement/order log for the
-- charts — those reconstructed points are not written here; only the
-- exact daily figures are stored.
-- Safe to run multiple times. Run after 27_realtime_warenbewegungen.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

create table if not exists public.kennzahlen_snapshots (
  datum               date primary key,
  artikel_anzahl      int     not null default 0,
  lagerwert           numeric not null default 0,
  niedriger_bestand   int     not null default 0,
  offene_bestellungen int     not null default 0,
  aktive_projekte     int     not null default 0,
  erwarteter_gewinn   numeric not null default 0,
  created_at          timestamptz not null default now()
);

alter table public.kennzahlen_snapshots enable row level security;

drop policy if exists "Authenticated can read snapshots"   on public.kennzahlen_snapshots;
drop policy if exists "Manager can insert snapshots"       on public.kennzahlen_snapshots;
drop policy if exists "Manager can update snapshots"        on public.kennzahlen_snapshots;

create policy "Authenticated can read snapshots" on public.kennzahlen_snapshots
  for select using (auth.role() = 'authenticated');
create policy "Manager can insert snapshots" on public.kennzahlen_snapshots
  for insert with check (public.current_role_is_manager());
create policy "Manager can update snapshots" on public.kennzahlen_snapshots
  for update using (public.current_role_is_manager());

-- ============================================================
-- Done.
-- ============================================================
