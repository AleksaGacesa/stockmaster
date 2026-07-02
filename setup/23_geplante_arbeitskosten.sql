-- ============================================================
-- StockMaster — Frozen "Geplant" labor cost for projects.
-- Previously the "Geplant" (planned) labor-cost card showed the same
-- live/actual number as "Live" — not an upfront estimate at all. Now
-- a new project asks for the initial crew's hourly rates and a
-- weekly-hours target; combined with the deadline, that gives a
-- planned labor cost computed ONCE at creation and frozen from then
-- on. Changing the crew later (see AuftraegePage.jsx persistCrew)
-- only ever updates projekte.stundensatz (the live rate) — these
-- columns are never touched again after insert.
-- Safe to run multiple times. Run after 11_auftraege.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.projekte add column if not exists arbeitsstunden_pro_woche numeric not null default 40;
alter table public.projekte add column if not exists geplante_arbeiter_anzahl integer;
alter table public.projekte add column if not exists geplante_wochen numeric;
alter table public.projekte add column if not exists geplante_stundensatz numeric;
alter table public.projekte add column if not exists geplante_arbeitskosten numeric;

-- ============================================================
-- Done.
-- ============================================================
