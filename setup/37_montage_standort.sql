-- ============================================================
-- StockMaster — Montage-Standort (GPS) & Check-in-Nachweis
--   * projekte.standort_lat/lng — der Chef pinnt die Baustelle auf
--     der Karte; standort_radius (m) ist der erlaubte Check-in-Kreis
--   * montagen.ankunft_lat/lng/distanz — beim "Angekommen" wird die
--     Position des Arbeiters gespeichert; distanz (m) > radius wird
--     dem Chef rot markiert ("2,3 km entfernt eingecheckt"). Null =
--     kein Standort gesetzt oder GPS nicht verfügbar.
-- Safe to run multiple times. Run after 36_lieferanten_bewertung.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.projekte add column if not exists standort_lat    double precision;
alter table public.projekte add column if not exists standort_lng    double precision;
alter table public.projekte add column if not exists standort_radius integer not null default 150;

alter table public.montagen add column if not exists ankunft_lat     double precision;
alter table public.montagen add column if not exists ankunft_lng     double precision;
alter table public.montagen add column if not exists ankunft_distanz integer;

-- ============================================================
-- Fertig.
-- ============================================================
