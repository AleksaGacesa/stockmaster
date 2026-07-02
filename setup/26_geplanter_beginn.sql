-- ============================================================
-- StockMaster — Geplanter Beginn (planned start date) for projects.
-- The frozen "Geplant" labor cost was computed from the project's
-- creation moment to its deadline (rok) — fine for a job that starts
-- right away, but wrong for one quoted well in advance: the idle time
-- before work actually begins got counted as paid crew time, wildly
-- inflating the planned cost and showing a false loss. Now it's
-- computed from geplanter_beginn to rok instead.
-- Safe to run multiple times. Run after 23_geplante_arbeitskosten.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.projekte add column if not exists geplanter_beginn date;

-- ============================================================
-- Done.
-- ============================================================
