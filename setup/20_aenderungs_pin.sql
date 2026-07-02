-- ============================================================
-- StockMaster — Änderungs-PIN: required before a manual stock
-- quantity correction (Artikel bearbeiten) is saved. Empty by
-- default, meaning the PIN check is off until the owner sets one in
-- Einstellungen. Reusable for future PIN-gated actions.
-- Safe to run multiple times. Run after 08_firmendaten.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.firmendaten add column if not exists aenderungs_pin text not null default '';

-- ============================================================
-- Done.
-- ============================================================
