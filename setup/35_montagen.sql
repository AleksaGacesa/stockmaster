-- ============================================================
-- StockMaster — Montagen (Einsatz-Erfassung pro Arbeiter)
-- Arbeiter stempeln ihren Montage-Tag wie eine Stechuhr:
--   Abfahrt → Ankunft (Fahrzeit fixiert) → Feierabend
-- Beim Abschluss melden sie Pause, gefahrene km (hin+zurück),
-- Montage-Fortschritt (0-100%) und eine Notiz. Stundensatz und
-- €/km werden beim Abschluss in die Zeile eingefroren, damit
-- spätere Satzänderungen die Historie nicht umschreiben.
--   * profiles.stundensatz  — €/h je Arbeiter (Inhaber pflegt sie
--     direkt auf der Montagen-Seite)
--   * firmendaten.km_satz   — €/km Fahrtkostensatz der Firma
-- Safe to run multiple times. Run after 34_lieferanten_kontakte.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.profiles    add column if not exists stundensatz numeric not null default 0;
alter table public.firmendaten add column if not exists km_satz     numeric not null default 0.30;

create table if not exists public.montagen (
  id            bigint generated always as identity primary key,
  projekt_id    bigint not null references public.projekte on delete cascade,
  arbeiter_id   uuid references public.profiles on delete set null,
  arbeiter_name text not null default '',
  datum         date not null default current_date,
  abfahrt_at    timestamptz not null default now(),
  ankunft_at    timestamptz,
  ende_at       timestamptz,
  pause_min     integer not null default 0,
  km            numeric not null default 0,
  fortschritt   integer check (fortschritt is null or fortschritt between 0 and 100),
  notiz         text not null default '',
  stundensatz   numeric not null default 0,   -- Snapshot beim Abschluss
  km_satz       numeric not null default 0,   -- Snapshot beim Abschluss
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.montagen enable row level security;

do $$ begin
  drop policy if exists "Authenticated can read montagen"  on public.montagen;
  drop policy if exists "Workers insert own montagen"      on public.montagen;
  drop policy if exists "Workers update own montagen"      on public.montagen;
  drop policy if exists "Managers delete montagen"         on public.montagen;
  drop policy if exists "Workers delete own open montagen" on public.montagen;
end $$;

create policy "Authenticated can read montagen" on public.montagen
  for select using (auth.role() = 'authenticated');

-- Arbeiter stempeln nur für sich selbst; Manager dürfen auch für
-- andere anlegen/korrigieren (vergessene Stempelungen).
create policy "Workers insert own montagen" on public.montagen
  for insert with check (arbeiter_id = auth.uid() or public.current_role_is_manager());

create policy "Workers update own montagen" on public.montagen
  for update using (arbeiter_id = auth.uid() or public.current_role_is_manager());

create policy "Managers delete montagen" on public.montagen
  for delete using (public.current_role_is_manager());

-- Ein versehentlich gestarteter Einsatz muss vom Arbeiter selbst
-- verwerfbar sein — aber nur solange er noch offen ist. Abgeschlossene
-- Einträge löscht nur der Manager (Manipulationsschutz).
create policy "Workers delete own open montagen" on public.montagen
  for delete using (arbeiter_id = auth.uid() and ende_at is null);

drop trigger if exists montagen_updated_at on public.montagen;
create trigger montagen_updated_at
  before update on public.montagen
  for each row execute function public.set_updated_at();

-- ============================================================
-- Fertig.
-- ============================================================
