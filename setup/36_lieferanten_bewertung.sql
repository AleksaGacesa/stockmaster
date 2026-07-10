-- ============================================================
-- StockMaster — Lieferanten-Bewertung & Lieferzeit
-- Für die neue "Artikel bestellen"-Ansicht (Lieferanten & Bestellungen):
--   * bewertung  — 0-5 Sterne, vom Inhaber gepflegt (0 = unbewertet)
--   * lieferzeit — Freitext, z.B. '2-3 Tage'
--   * versandart — z.B. 'Standard' oder 'Express'
-- Danach: Demo-Werte für alle noch unbewerteten Lieferanten, damit
-- die Präsentation gefüllt aussieht (überschreibt nie echte Werte).
-- Safe to run multiple times. Run after 35_montagen.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.lieferanten add column if not exists bewertung  numeric not null default 0;
alter table public.lieferanten add column if not exists lieferzeit text not null default '';
alter table public.lieferanten add column if not exists versandart text not null default '';

-- Demo-Werte: deterministisch aus der id abgeleitet, nur wo noch
-- nichts gepflegt ist (bewertung = 0 bzw. lieferzeit = '').
update public.lieferanten
set bewertung = 4.0 + ((id % 10) / 10.0)
where bewertung = 0;

update public.lieferanten
set lieferzeit = (array['1-2 Tage', '2-3 Tage', '2-4 Tage', '3-5 Tage', '5-7 Tage'])[1 + (id % 5)],
    versandart = case when id % 3 = 0 then 'Express' else 'Standard' end
where lieferzeit = '';

-- ============================================================
-- Fertig.
-- ============================================================
