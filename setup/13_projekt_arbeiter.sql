-- ============================================================
-- StockMaster — manuelle Anzahl der Arbeiter pro Projekt, jederzeit
-- änderbar (z.B. wenn aus 1 Mann 2 werden).
-- Safe to run multiple times. Run after 11_auftraege.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.projekte add column if not exists arbeiter_anzahl integer not null default 1;

-- ============================================================
-- Done.
-- ============================================================
