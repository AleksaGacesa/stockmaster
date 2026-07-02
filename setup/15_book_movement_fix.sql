-- ============================================================
-- StockMaster — fixes "function book_movement(...) is not unique".
-- 11_auftraege.sql added an 8th parameter (p_projekt_id) to
-- book_movement via "create or replace function" — but changing the
-- parameter list doesn't replace a function in Postgres, it creates a
-- SECOND overload. So there were two book_movement functions (the
-- original 7-arg one from 03_fixes.sql, and the new 8-arg one with a
-- default last parameter). Any call with exactly 7 arguments (e.g.
-- receive_bestellung marking a Bestellung as eingetroffen) then
-- matches both candidates and Postgres errors with "is not unique".
-- Dropping the old 7-arg overload leaves only the 8-arg version,
-- whose last parameter defaults to null, so every existing caller
-- keeps working unchanged.
-- Safe to run multiple times. Run after 14_projekt_zeiterfassung.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

drop function if exists public.book_movement(bigint, text, numeric, text, text, text, uuid);

-- ============================================================
-- Done.
-- ============================================================
