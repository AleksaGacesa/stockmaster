-- ============================================================
-- StockMaster — Steuernummer / USt-IdNr on Firmendaten, printed on
-- Bestellung documents. Required for the paper trail to be usable by
-- a German Steuerberater.
-- Safe to run multiple times. Run after 08_firmendaten.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.firmendaten add column if not exists steuernummer text not null default '';
alter table public.firmendaten add column if not exists ust_idnr     text not null default '';

-- ============================================================
-- Done.
-- ============================================================
