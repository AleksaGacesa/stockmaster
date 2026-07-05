-- ============================================================
-- StockMaster — adds a "ref" column to the export history so a saved
-- report can be re-opened as a live PDF preview in the browser. It
-- holds the parameter needed to regenerate that exact report: the
-- record id (Inventur session / Bestellung / Projekt), the year
-- (Jahresbericht) or the date (Tagesbewegung). Reports that need no
-- parameter (Lieferantenübersicht, Lagerbewertung) leave it null.
-- Safe to run multiple times. Run after 30_termine.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.export_protokoll add column if not exists ref text;

-- ============================================================
-- Done.
-- ============================================================
