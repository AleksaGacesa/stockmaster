-- ============================================================
-- Werkheld — Montage ohne Anfahrt
--   Bisher begann jede Montage zwingend mit einer "Abfahrt"
--   (abfahrt_at NOT NULL DEFAULT now()). Nicht jede Firma hat aber
--   jeden Tag eine bezahlte Anfahrt — z. B. bei mehrtägigen Einsätzen,
--   bei denen nur die eigentliche An-/Rückreise vergütet wird und der
--   tägliche Weg zur Baustelle nicht. Solche Tage werden jetzt direkt
--   mit "Arbeit starten" erfasst: abfahrt_at bleibt leer (keine
--   Fahrzeit), ankunft_at markiert den Arbeitsbeginn.
--
--   Zeitliche Einordnung/Sortierung nutzt weiterhin zuverlässig die
--   Spalte datum (NOT NULL DEFAULT current_date) bzw.
--   COALESCE(abfahrt_at, ankunft_at) in der App.
-- Safe to run multiple times. Run after 35_montagen.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.montagen alter column abfahrt_at drop not null;

-- ============================================================
-- Fertig.
-- ============================================================
