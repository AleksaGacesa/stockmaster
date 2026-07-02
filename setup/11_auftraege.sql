-- ============================================================
-- StockMaster — Aufträge (Projekte): Materialplanung, Lagerprüfung,
-- Verbrauchs-Tracking gegen Warenausgang, Budget/Gewinn.
-- Safe to run multiple times. Run after 05_lieferanten.sql / 03_fixes.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

create table if not exists public.projekte (
  id                   bigint generated always as identity primary key,
  name                 text not null,
  kunde                text not null default '',
  rok                  date,
  verantwortlich_id    uuid references public.profiles on delete set null,
  verantwortlich_name  text not null default '',
  status               text not null default 'geplant' check (status in ('geplant', 'aktiv', 'pausiert', 'abgeschlossen', 'storniert')),
  verkaufspreis        numeric not null default 0,
  arbeitskosten        numeric not null default 0,
  notiz                text not null default '',
  erstellt_von         text not null default '',
  erstellt_von_id      uuid references public.profiles on delete set null,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

drop trigger if exists projekte_updated_at on public.projekte;
create trigger projekte_updated_at
  before update on public.projekte
  for each row execute function public.set_updated_at();

-- Planned material lines per project. `preis` snapshots artikel.preis
-- at planning time, same pattern as bestellung_positionen, so later
-- price changes don't retroactively change a project's estimate.
create table if not exists public.projekt_material (
  id             bigint generated always as identity primary key,
  projekt_id     bigint not null references public.projekte on delete cascade,
  artikel_id     bigint references public.artikel on delete set null,
  artikel_name   text not null,
  artikel_nummer text not null,
  einheit        text not null default 'Stk',
  geplant_menge  numeric not null check (geplant_menge > 0),
  preis          numeric not null default 0,
  created_at     timestamptz default now()
);
create index if not exists idx_projekt_material_projekt on public.projekt_material(projekt_id);

-- Ties a Warenausgang booking to the project it was issued for, so
-- "geplant vs. verbraucht" can be computed by summing warenbewegungen
-- instead of a separate consumption table.
alter table public.warenbewegungen add column if not exists projekt_id bigint references public.projekte on delete set null;
create index if not exists idx_warenbewegungen_projekt on public.warenbewegungen(projekt_id);

-- book_movement gains an optional Projekt tag. Existing callers
-- (manual Wareneingang/-ausgang, receive_bestellung) keep working
-- unchanged since the new parameter defaults to null.
create or replace function public.book_movement(
  p_artikel_id  bigint,
  p_typ         text,
  p_menge       numeric,
  p_projekt     text,
  p_notiz       text,
  p_von_user    text,
  p_von_user_id uuid,
  p_projekt_id  bigint default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_menge  numeric;
  v_name   text;
  v_nummer text;
begin
  if p_typ not in ('eingang', 'ausgang') then
    raise exception 'Ungültiger Bewegungstyp: %', p_typ;
  end if;
  if p_menge <= 0 then
    raise exception 'Menge muss größer als 0 sein.';
  end if;

  select menge, name, nummer into v_menge, v_name, v_nummer
  from public.artikel where id = p_artikel_id
  for update;

  if not found then
    raise exception 'Artikel nicht gefunden.';
  end if;

  if p_typ = 'ausgang' and p_menge > v_menge then
    raise exception 'Nicht genug Bestand. Verfügbar: %', v_menge;
  end if;

  update public.artikel
  set menge = case when p_typ = 'eingang' then v_menge + p_menge else v_menge - p_menge end
  where id = p_artikel_id;

  insert into public.warenbewegungen
    (artikel_id, artikel_name, artikel_nummer, typ, menge, projekt, notiz, von_user, von_user_id, projekt_id)
  values
    (p_artikel_id, v_name, v_nummer, p_typ, p_menge, p_projekt, p_notiz, p_von_user, p_von_user_id, p_projekt_id);
end;
$$;

revoke all on function public.book_movement(bigint, text, numeric, text, text, text, uuid, bigint) from public;
grant execute on function public.book_movement(bigint, text, numeric, text, text, text, uuid, bigint) to authenticated;

-- RLS — projects are readable by every authenticated user (workers
-- need the list to pick a project when booking Warenausgang), but
-- only the owner can create/edit/delete them or their material lines.
-- The project page itself stays owner-only in the app (route guard),
-- same pattern as Lieferanten/Import.
alter table public.projekte        enable row level security;
alter table public.projekt_material enable row level security;

do $$ begin
  drop policy if exists "Authenticated can read projekte" on public.projekte;
  drop policy if exists "Owner can insert projekte" on public.projekte;
  drop policy if exists "Owner can update projekte" on public.projekte;
  drop policy if exists "Owner can delete projekte" on public.projekte;
  drop policy if exists "Authenticated can read projekt_material" on public.projekt_material;
  drop policy if exists "Owner can manage projekt_material" on public.projekt_material;
end $$;

create policy "Authenticated can read projekte" on public.projekte for select using (auth.role() = 'authenticated');
create policy "Owner can insert projekte" on public.projekte for insert with check (public.current_role_is_owner());
create policy "Owner can update projekte" on public.projekte for update using (public.current_role_is_owner());
create policy "Owner can delete projekte" on public.projekte for delete using (public.current_role_is_owner());

create policy "Authenticated can read projekt_material" on public.projekt_material for select using (auth.role() = 'authenticated');
create policy "Owner can manage projekt_material" on public.projekt_material for all using (public.current_role_is_owner());

-- ============================================================
-- Done.
-- ============================================================
