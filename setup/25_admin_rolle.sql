-- ============================================================
-- StockMaster — third role: "admin" (Administration). Gets almost
-- everything the owner has for day-to-day business data (articles,
-- lieferanten, bestellungen, projekte, inventur), but NOT:
--   - Firmendaten/Einstellungen (including the Änderungs-PIN)
--   - Managing other users (add/delete employee, change roles)
-- Deliberately does NOT widen current_role_is_owner() itself — that
-- function is already relied on for those exact restrictions
-- (firmendaten update, admin_delete_user, profile role changes), so
-- leaving it untouched keeps them owner-only for free. A new,
-- separate function grants the broader business-data access instead.
-- Safe to run multiple times. Run after 22_bestellung_notiz_dokument_nr.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner', 'admin', 'worker'));

create or replace function public.current_role_is_manager()
returns boolean language sql security definer as $$
  select coalesce(
    (select role in ('owner', 'admin') from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ── Business-data policies: owner-only → owner-or-admin.
drop policy if exists "Owner can insert artikel" on public.artikel;
drop policy if exists "Owner can update artikel" on public.artikel;
drop policy if exists "Owner can delete artikel" on public.artikel;
create policy "Manager can insert artikel" on public.artikel for insert with check (public.current_role_is_manager());
create policy "Manager can update artikel" on public.artikel for update using (public.current_role_is_manager());
create policy "Manager can delete artikel" on public.artikel for delete using (public.current_role_is_manager());

drop policy if exists "Owner can manage inventur sessions" on public.inventur_sessions;
create policy "Manager can manage inventur sessions" on public.inventur_sessions for all using (public.current_role_is_manager());

drop policy if exists "Owner can manage lieferanten" on public.lieferanten;
drop policy if exists "Owner can manage bestellungen" on public.bestellungen;
drop policy if exists "Owner can manage positionen" on public.bestellung_positionen;
create policy "Manager can manage lieferanten" on public.lieferanten for all using (public.current_role_is_manager());
create policy "Manager can manage bestellungen" on public.bestellungen for all using (public.current_role_is_manager());
create policy "Manager can manage positionen" on public.bestellung_positionen for all using (public.current_role_is_manager());

drop policy if exists "Owner can insert projekte" on public.projekte;
drop policy if exists "Owner can update projekte" on public.projekte;
drop policy if exists "Owner can delete projekte" on public.projekte;
drop policy if exists "Owner can manage projekt_material" on public.projekt_material;
create policy "Manager can insert projekte" on public.projekte for insert with check (public.current_role_is_manager());
create policy "Manager can update projekte" on public.projekte for update using (public.current_role_is_manager());
create policy "Manager can delete projekte" on public.projekte for delete using (public.current_role_is_manager());
create policy "Manager can manage projekt_material" on public.projekt_material for all using (public.current_role_is_manager());

drop policy if exists "Owner can manage projekt_zeiterfassung" on public.projekt_zeiterfassung;
create policy "Manager can manage projekt_zeiterfassung" on public.projekt_zeiterfassung for all using (public.current_role_is_manager());

drop policy if exists "Owner can upload artikelbilder" on storage.objects;
drop policy if exists "Owner can update artikelbilder" on storage.objects;
drop policy if exists "Owner can delete artikelbilder" on storage.objects;
create policy "Manager can upload artikelbilder" on storage.objects for insert with check (bucket_id = 'artikelbilder' and public.current_role_is_manager());
create policy "Manager can update artikelbilder" on storage.objects for update using (bucket_id = 'artikelbilder' and public.current_role_is_manager());
create policy "Manager can delete artikelbilder" on storage.objects for delete using (bucket_id = 'artikelbilder' and public.current_role_is_manager());

-- receive_bestellung — same body as 22_bestellung_notiz_dokument_nr.sql,
-- only the permission check changes.
create or replace function public.receive_bestellung(p_bestellung_id bigint, p_mengen jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_item       record;
  v_pos        record;
  v_name       text;
  v_menge      numeric;
  v_dokument_nr text;
begin
  if not public.current_role_is_manager() then
    raise exception 'Keine Berechtigung, Bestellungen zu empfangen.';
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

-- Everything else (firmendaten, firmenlogo storage, profiles
-- update/delete, admin_delete_user, role-escalation prevention) still
-- checks current_role_is_owner() unchanged — admin stays locked out
-- of settings, the PIN, and user management.

-- ============================================================
-- Done.
-- ============================================================
