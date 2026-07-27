-- ============================================================
-- Werkheld — Arbeitsbeginn getrennt von der Ankunft
--   Bisher startete die Arbeitszeit automatisch bei "Angekommen".
--   Jetzt ist der Ablauf voll aufgetrennt:
--     Abfahrt → Angekommen (nur Ankunft, Fahrzeit endet)
--            → Arbeit starten (arbeit_start_at, Arbeitszeit läuft)
--            → Feierabend (ende_at)
--   So zählt die Zeit zwischen Ankunft und Arbeitsbeginn (Vorbereitung,
--   Frühstück …) nicht als Arbeitszeit.
--
--   arbeit_start_at ist NULL, solange die Arbeit noch nicht begonnen
--   hat. Für Alt-Einträge (vor dieser Migration, ende_at gesetzt) fällt
--   die App auf ankunft_at zurück, damit die Historie unverändert bleibt.
-- Safe to run multiple times. Run after 41_montage_ohne_fahrt.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.montagen add column if not exists arbeit_start_at timestamptz;

-- ============================================================
-- Fertig.
-- ============================================================
