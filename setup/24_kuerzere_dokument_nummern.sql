-- ============================================================
-- StockMaster — Shorter document numbers: PROJ-2026-000002 becomes
-- PROJ-2026-0002 (4-digit padding instead of 6). Same for BEST-, WE-,
-- and INV-. Updates the generator for new numbers and re-pads every
-- existing number — this only changes zero-padding width, never the
-- underlying sequence, so ordering and uniqueness are untouched.
-- Safe to run multiple times. Run after 18_dokument_nummern.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

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
  return p_praefix || '-' || v_jahr || '-' || lpad(v_counter::text, 4, '0');
end;
$$;

-- Re-pad every already-issued number (PREFIX-YYYY-NNNNNN → PREFIX-YYYY-NNNN).
update public.bestellungen
set dokument_nr = split_part(dokument_nr, '-', 1) || '-' || split_part(dokument_nr, '-', 2) || '-' || lpad(split_part(dokument_nr, '-', 3)::int::text, 4, '0')
where dokument_nr is not null;

update public.bestellungen
set wareneingang_nr = split_part(wareneingang_nr, '-', 1) || '-' || split_part(wareneingang_nr, '-', 2) || '-' || lpad(split_part(wareneingang_nr, '-', 3)::int::text, 4, '0')
where wareneingang_nr is not null;

update public.projekte
set dokument_nr = split_part(dokument_nr, '-', 1) || '-' || split_part(dokument_nr, '-', 2) || '-' || lpad(split_part(dokument_nr, '-', 3)::int::text, 4, '0')
where dokument_nr is not null;

update public.inventur_sessions
set dokument_nr = split_part(dokument_nr, '-', 1) || '-' || split_part(dokument_nr, '-', 2) || '-' || lpad(split_part(dokument_nr, '-', 3)::int::text, 4, '0')
where dokument_nr is not null;

-- ============================================================
-- Done.
-- ============================================================
