-- ============================================================
-- StockMaster — per-Lieferant standard order message.
-- Safe to run multiple times. Run after 05_lieferanten.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- A standing note (delivery instructions, payment terms, etc.) that
-- gets included on every printed/PDF Bestellung sent to this
-- Lieferant, so it doesn't have to be retyped each time.
alter table public.lieferanten add column if not exists bestellnachricht text not null default '';

-- ============================================================
-- Done.
-- ============================================================
