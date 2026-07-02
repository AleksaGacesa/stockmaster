-- ============================================================
-- StockMaster — receive_bestellung() was still stamping the
-- warenbewegungen notiz with the raw internal bestellungen.id
-- ("Bestellung #20") instead of the human-facing dokument_nr
-- ("Bestellung BEST-2026-000020") introduced in 18_dokument_nummern.sql.
-- Fixes new bookings and backfills the notiz on existing ones.
-- Safe to run multiple times. Run after 18_dokument_nummern.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

create or replace function public.receive_bestellung(p_bestellung_id bigint, p_mengen jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_item       record;
  v_pos        record;
  v_name       text;
  v_menge      numeric;
  v_dokument_nr text;
begin
  if not public.current_role_is_owner() then
    raise exception 'Nur Inhaber können Bestellungen empfangen.';
  end if;

  select display_name into v_name from public.profiles where id = auth.uid();
  select dokument_nr into v_dokument_nr from public.bestellungen where id = p_bestellung_id;

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
        null, 'Bestellung ' || coalesce(v_dokument_nr, '#' || p_bestellung_id),
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

-- Backfill: rewrite existing "Bestellung #<id>" notiz values into the
-- new "Bestellung <dokument_nr>" format so old bookings show the same
-- friendly number as new ones.
update public.warenbewegungen wb
set notiz = 'Bestellung ' || b.dokument_nr
from public.bestellungen b
where wb.notiz ~ '^Bestellung #\d+$'
  and b.id = substring(wb.notiz from '\d+')::bigint
  and b.dokument_nr is not null;

-- ============================================================
-- Done.
-- ============================================================
