-- ============================================================
-- StockMaster — Fortlaufende Dokumentnummern (BEST-2026-000123,
-- WE-2026-000089, PROJ-2026-000031, INV-2026-000015).
-- Required for a serious Steuerberater-facing paper trail: numbers
-- are assigned once, never reused, never renumbered.
-- Safe to run multiple times. Run after 05_lieferanten.sql,
-- 10_teilweise_erhalten.sql, 11_auftraege.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- One counter per (Präfix, Jahr) — numbering restarts each year, per
-- document type. No RLS policies on purpose: nobody should touch this
-- table directly, only next_dokument_nr() (security definer) may.
create table if not exists public.dokument_zaehler (
  praefix text not null,
  jahr    smallint not null,
  counter integer not null default 0,
  primary key (praefix, jahr)
);
alter table public.dokument_zaehler enable row level security;

-- Atomic "give me the next number" — the upsert's row lock makes this
-- safe under concurrent inserts (two Bestellungen created at the same
-- instant still get distinct, gapless numbers).
create or replace function public.next_dokument_nr(p_praefix text, p_jahr int default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_jahr    int := coalesce(p_jahr, extract(year from now())::int);
  v_counter int;
begin
  insert into public.dokument_zaehler (praefix, jahr, counter)
  values (p_praefix, v_jahr, 1)
  on conflict (praefix, jahr) do update set counter = public.dokument_zaehler.counter + 1
  returning counter into v_counter;
  return p_praefix || '-' || v_jahr || '-' || lpad(v_counter::text, 6, '0');
end;
$$;

revoke all on function public.next_dokument_nr(text, int) from public;
grant execute on function public.next_dokument_nr(text, int) to authenticated;

-- ── Bestellung: BEST-YYYY-NNNNNN, assigned once at creation.
-- Wareneingang: WE-YYYY-NNNNNN, assigned once when the order is
-- actually received (see receive_bestellung below) — not at creation,
-- since a draft/sent order was never "received".
alter table public.bestellungen add column if not exists dokument_nr text unique;
alter table public.bestellungen add column if not exists wareneingang_nr text unique;

create or replace function public.assign_bestellung_nr()
returns trigger language plpgsql as $$
begin
  if new.dokument_nr is null then
    new.dokument_nr := public.next_dokument_nr('BEST');
  end if;
  return new;
end;
$$;

drop trigger if exists bestellung_dokument_nr on public.bestellungen;
create trigger bestellung_dokument_nr
  before insert on public.bestellungen
  for each row execute function public.assign_bestellung_nr();

-- ── Projekt: PROJ-YYYY-NNNNNN, assigned once at creation.
alter table public.projekte add column if not exists dokument_nr text unique;

create or replace function public.assign_projekt_nr()
returns trigger language plpgsql as $$
begin
  if new.dokument_nr is null then
    new.dokument_nr := public.next_dokument_nr('PROJ');
  end if;
  return new;
end;
$$;

drop trigger if exists projekt_dokument_nr on public.projekte;
create trigger projekt_dokument_nr
  before insert on public.projekte
  for each row execute function public.assign_projekt_nr();

-- ── Inventur: INV-YYYY-NNNNNN, assigned once at creation.
alter table public.inventur_sessions add column if not exists dokument_nr text unique;

create or replace function public.assign_inventur_nr()
returns trigger language plpgsql as $$
begin
  if new.dokument_nr is null then
    new.dokument_nr := public.next_dokument_nr('INV');
  end if;
  return new;
end;
$$;

drop trigger if exists inventur_dokument_nr on public.inventur_sessions;
create trigger inventur_dokument_nr
  before insert on public.inventur_sessions
  for each row execute function public.assign_inventur_nr();

-- receive_bestellung() now also stamps wareneingang_nr the first time
-- an order is received. Guarded by "where wareneingang_nr is null" so
-- calling it again (shouldn't happen via the UI, but just in case)
-- never overwrites an already-assigned number.
create or replace function public.receive_bestellung(p_bestellung_id bigint, p_mengen jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_item  record;
  v_pos   record;
  v_name  text;
  v_menge numeric;
begin
  if not public.current_role_is_owner() then
    raise exception 'Nur Inhaber können Bestellungen empfangen.';
  end if;

  select display_name into v_name from public.profiles where id = auth.uid();

  for v_item in select * from jsonb_to_recordset(p_mengen) as x(id bigint, menge numeric)
  loop
    select * into v_pos from public.bestellung_positionen
    where id = v_item.id and bestellung_id = p_bestellung_id;
    if not found then continue; end if;

    v_menge := greatest(coalesce(v_item.menge, 0), 0);

    update public.bestellung_positionen set empfangen_menge = v_menge where id = v_pos.id;

    if v_pos.artikel_id is not null and v_menge > 0 then
      perform public.book_movement(
        v_pos.artikel_id, 'eingang', v_menge,
        null, 'Bestellung #' || p_bestellung_id,
        coalesce(v_name, ''), auth.uid()
      );
    end if;
  end loop;

  update public.bestellungen
  set status = 'eingetroffen', eingetroffen_at = now(),
      wareneingang_nr = coalesce(wareneingang_nr, public.next_dokument_nr('WE'))
  where id = p_bestellung_id;
end;
$$;

revoke all on function public.receive_bestellung(bigint, jsonb) from public;
grant execute on function public.receive_bestellung(bigint, jsonb) to authenticated;

-- ============================================================
-- Backfill — existing rows get numbers too, assigned in creation
-- order so BEST-2025-000001 really is the oldest 2025 order etc.
-- Iterating in chronological order across all years is safe: each
-- (praefix, jahr) counter only advances when a row of that year is
-- processed, so per-year ordering stays correct even though the loop
-- itself walks all years together.
-- ============================================================
do $$
declare r record;
begin
  for r in select id, created_at from public.bestellungen where dokument_nr is null order by created_at loop
    update public.bestellungen set dokument_nr = public.next_dokument_nr('BEST', extract(year from r.created_at)::int) where id = r.id;
  end loop;

  for r in select id, created_at from public.projekte where dokument_nr is null order by created_at loop
    update public.projekte set dokument_nr = public.next_dokument_nr('PROJ', extract(year from r.created_at)::int) where id = r.id;
  end loop;

  for r in select id, created_at from public.inventur_sessions where dokument_nr is null order by created_at loop
    update public.inventur_sessions set dokument_nr = public.next_dokument_nr('INV', extract(year from r.created_at)::int) where id = r.id;
  end loop;

  for r in select id, eingetroffen_at from public.bestellungen
           where status = 'eingetroffen' and wareneingang_nr is null order by eingetroffen_at loop
    update public.bestellungen set wareneingang_nr = public.next_dokument_nr('WE', extract(year from r.eingetroffen_at)::int) where id = r.id;
  end loop;
end $$;

-- ============================================================
-- Done.
-- ============================================================
