-- ============================================================
-- StockMaster — Zeiterfassung (Arbeitszeit für ALLE Mitarbeiter)
-- Getrennt von Montagen: Montagen = Projektkosten (Baustelle),
-- Zeiterfassung = An-/Abwesenheit für die Lohnabrechnung (Büro + Feld).
-- Doppelzählung wird vermieden, weil Berichte je Quelle rechnen und
-- Montage-Zeiten auf der Leseseite mit den Stempeln zusammengeführt
-- werden (Montage-Abfahrt zählt so automatisch als "Kommen").
--   * firmendaten.firma_lat/lng/radius — Firmenstandort; das "Kommen"
--     stempelt per GPS und wird außerhalb des Radius rot markiert
--     (erlaubt-aber-markiert, blockiert nie).
--   * arbeitszeiten — ein Tag je Mitarbeiter: Kommen/Gehen, Pausen als
--     Start/Stop-Segmente (jsonb), optional pause_override_min falls
--     jemand den Stop vergisst und der Wert am Ende korrigiert wird.
--   * arbeitszeit_korrekturen — Audit: jede nachträgliche Änderung
--     durch den Chef wird protokolliert und ist einsehbar.
-- Safe to run multiple times. Run after 37_montage_standort.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.firmendaten add column if not exists firma_lat    double precision;
alter table public.firmendaten add column if not exists firma_lng    double precision;
alter table public.firmendaten add column if not exists firma_radius integer not null default 120;

create table if not exists public.arbeitszeiten (
  id                 bigint generated always as identity primary key,
  arbeiter_id        uuid references public.profiles on delete set null,
  arbeiter_name      text not null default '',
  datum              date not null default current_date,
  kommen_at          timestamptz not null default now(),
  gehen_at           timestamptz,
  pausen             jsonb not null default '[]',  -- [{s: iso, e: iso|null}]
  pause_override_min integer,                       -- overrides pausen sum when set
  kommen_lat         double precision,
  kommen_lng         double precision,
  kommen_distanz     integer,                       -- meters from firma; null = no GPS/standort
  notiz              text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists arbeitszeiten_arbeiter_datum_idx
  on public.arbeitszeiten (arbeiter_id, datum);

create table if not exists public.arbeitszeit_korrekturen (
  id            bigint generated always as identity primary key,
  arbeitszeit_id bigint references public.arbeitszeiten on delete cascade,
  arbeiter_name text not null default '',
  beschreibung  text not null default '',   -- e.g. "Gehen 18:45 → 17:00"
  von_user      text not null default '',
  von_user_id   uuid references public.profiles on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.arbeitszeiten          enable row level security;
alter table public.arbeitszeit_korrekturen enable row level security;

do $$ begin
  drop policy if exists "Authenticated read arbeitszeiten"   on public.arbeitszeiten;
  drop policy if exists "Workers insert own arbeitszeiten"   on public.arbeitszeiten;
  drop policy if exists "Workers update own arbeitszeiten"   on public.arbeitszeiten;
  drop policy if exists "Managers delete arbeitszeiten"      on public.arbeitszeiten;
  drop policy if exists "Authenticated read korrekturen"     on public.arbeitszeit_korrekturen;
  drop policy if exists "Managers insert korrekturen"        on public.arbeitszeit_korrekturen;
end $$;

create policy "Authenticated read arbeitszeiten" on public.arbeitszeiten
  for select using (auth.role() = 'authenticated');

-- Everyone stamps only for themselves; managers may also create/correct
-- for others (forgotten stamps).
create policy "Workers insert own arbeitszeiten" on public.arbeitszeiten
  for insert with check (arbeiter_id = auth.uid() or public.current_role_is_manager());

create policy "Workers update own arbeitszeiten" on public.arbeitszeiten
  for update using (arbeiter_id = auth.uid() or public.current_role_is_manager());

create policy "Managers delete arbeitszeiten" on public.arbeitszeiten
  for delete using (public.current_role_is_manager());

create policy "Authenticated read korrekturen" on public.arbeitszeit_korrekturen
  for select using (auth.role() = 'authenticated');

create policy "Managers insert korrekturen" on public.arbeitszeit_korrekturen
  for insert with check (public.current_role_is_manager());

drop trigger if exists arbeitszeiten_updated_at on public.arbeitszeiten;
create trigger arbeitszeiten_updated_at
  before update on public.arbeitszeiten
  for each row execute function public.set_updated_at();

-- ============================================================
-- Fertig.
-- ============================================================
