-- ============================================================
-- StockMaster — links a Bestellung to the Projekt it was created
-- for, so a project's detail page can show live order status
-- ("Entwurf" / "Gesendet" / "Bestätigt" / "Eingetroffen") instead of
-- a one-off "created" message that forgets itself on reload.
-- Safe to run multiple times. Run after 15_book_movement_fix.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.bestellungen add column if not exists projekt_id bigint references public.projekte on delete set null;
create index if not exists idx_bestellungen_projekt on public.bestellungen(projekt_id);

-- ============================================================
-- Done.
-- ============================================================
