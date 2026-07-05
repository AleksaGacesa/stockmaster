-- ============================================================
-- StockMaster — extends Inventur sessions for the redesigned page:
--   * "lager" (which warehouse/location the count covers)
--   * two new statuses: 'geplant' (created but not started) and
--     'abgebrochen' (cancelled mid-count)
-- Existing sessions keep working: default stays 'aktiv', lager
-- defaults to ''. Safe to run multiple times.
-- Run after 31_export_protokoll_ref.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.inventur_sessions add column if not exists lager text not null default '';

alter table public.inventur_sessions drop constraint if exists inventur_sessions_status_check;
alter table public.inventur_sessions
  add constraint inventur_sessions_status_check
  check (status in ('geplant', 'aktiv', 'abgeschlossen', 'abgebrochen'));

-- ============================================================
-- Done.
-- ============================================================
