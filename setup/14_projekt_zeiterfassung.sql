-- ============================================================
-- StockMaster — Zeiterfassung für Arbeitskosten: die Uhr läuft,
-- solange ein Projekt "Aktiv" ist, mit der jeweils gültigen Anzahl
-- Arbeiter. Arbeitskosten = Summe(Stunden × Arbeiter) × Stundensatz.
-- Safe to run multiple times. Run after 13_projekt_arbeiter.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.projekte add column if not exists stundensatz numeric not null default 24;

-- One row per continuous stretch of "Aktiv" time with a fixed worker
-- count. A new row starts whenever the project becomes Aktiv, or
-- whenever Anzahl Arbeiter changes while already Aktiv. ended_at is
-- null while that stretch is still running.
create table if not exists public.projekt_zeiterfassung (
  id              bigint generated always as identity primary key,
  projekt_id      bigint not null references public.projekte on delete cascade,
  arbeiter_anzahl integer not null default 1,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz
);
create index if not exists idx_projekt_zeit_projekt on public.projekt_zeiterfassung(projekt_id);
create index if not exists idx_projekt_zeit_offen on public.projekt_zeiterfassung(projekt_id) where ended_at is null;

alter table public.projekt_zeiterfassung enable row level security;

do $$ begin
  drop policy if exists "Authenticated can read projekt_zeiterfassung" on public.projekt_zeiterfassung;
  drop policy if exists "Owner can manage projekt_zeiterfassung" on public.projekt_zeiterfassung;
end $$;

create policy "Authenticated can read projekt_zeiterfassung" on public.projekt_zeiterfassung for select using (auth.role() = 'authenticated');
create policy "Owner can manage projekt_zeiterfassung" on public.projekt_zeiterfassung for all using (public.current_role_is_owner());

-- ============================================================
-- Done.
-- ============================================================
