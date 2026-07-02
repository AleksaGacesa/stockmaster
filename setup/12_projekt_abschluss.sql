-- ============================================================
-- StockMaster — Zeitpunkt des Projektabschlusses, für spätere
-- zeitbasierte Auswertungen (z.B. abgeschlossene Projekte pro Monat).
-- Safe to run multiple times. Run after 11_auftraege.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.projekte add column if not exists abgeschlossen_at timestamptz;

-- ============================================================
-- Done.
-- ============================================================
