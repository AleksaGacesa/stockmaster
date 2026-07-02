-- ============================================================
-- StockMaster — price snapshot on order lines, for order totals.
-- Safe to run multiple times. Run after 05_lieferanten.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- Stores the article's price at the moment it was added to the
-- Bestellung, so totals stay correct even if the article's price
-- changes later. Existing rows default to 0 (no historical price
-- data to backfill from).
alter table public.bestellung_positionen add column if not exists preis numeric not null default 0;

-- ============================================================
-- Done.
-- ============================================================
