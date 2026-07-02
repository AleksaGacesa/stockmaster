-- ============================================================
-- StockMaster — confirm actual received quantity per position when
-- a Bestellung arrives (suppliers don't always deliver everything).
-- Safe to run multiple times. Run after 05_lieferanten.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- What actually arrived, per position. Null until the Bestellung is
-- received; can differ from `menge` (what was ordered) on a partial
-- delivery.
alter table public.bestellung_positionen add column if not exists empfangen_menge numeric;

-- receive_bestellung() used to always book the full ordered `menge`.
-- It now takes the actually-received quantity per position (as
-- jsonb: [{"id": <position id>, "menge": <received qty>}, ...]) so
-- stock only increases by what really arrived.
drop function if exists public.receive_bestellung(bigint);

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
  set status = 'eingetroffen', eingetroffen_at = now()
  where id = p_bestellung_id;
end;
$$;

revoke all on function public.receive_bestellung(bigint, jsonb) from public;
grant execute on function public.receive_bestellung(bigint, jsonb) to authenticated;

-- ============================================================
-- Done.
-- ============================================================
