-- ============================================================
-- StockMaster — follow-up fixes, safe to run multiple times.
-- Supabase Dashboard → SQL Editor → New query → Run
-- Run this AFTER 01_schema.sql (and optionally 02_seed.sql).
-- ============================================================

-- 1) `profiles` had no owner-wide UPDATE/DELETE policy — only
--    "Users can update own profile" (auth.uid() = id) existed. That
--    means changeRole()/deleteUser() in Einstellungen silently failed
--    (blocked by RLS) for every account except the owner's own row.
drop policy if exists "Owner can update any profile" on public.profiles;
create policy "Owner can update any profile" on public.profiles
  for update using (public.current_role_is_owner());

drop policy if exists "Owner can delete profile" on public.profiles;
create policy "Owner can delete profile" on public.profiles
  for delete using (public.current_role_is_owner());

-- 2) The self-update policy let ANY authenticated user set their own
--    role to 'owner' (privilege escalation) — the USING clause only
--    checked auth.uid() = id and never restricted which columns
--    could change. Block role changes unless the caller already is
--    an owner, regardless of which policy allowed the UPDATE.
create or replace function public.prevent_role_escalation()
returns trigger language plpgsql security definer as $$
begin
  if new.role is distinct from old.role and not public.current_role_is_owner() then
    raise exception 'Nur Inhaber können Rollen ändern.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- 3) Atomic stock booking. BewegungPage previously read `menge` into
--    the browser, computed the new value in JS, then wrote it back —
--    two concurrent bookings on the same article could overwrite
--    each other (lost update). It also updated `artikel` directly,
--    which "Owner can update artikel" blocks for worker accounts, so
--    workers could never actually complete a booking. This function
--    does the read-modify-write atomically on the server and runs as
--    security definer so both roles can call it, while direct table
--    writes to `artikel` stay owner-only.
create or replace function public.book_movement(
  p_artikel_id  bigint,
  p_typ         text,
  p_menge       numeric,
  p_projekt     text,
  p_notiz       text,
  p_von_user    text,
  p_von_user_id uuid
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
    (artikel_id, artikel_name, artikel_nummer, typ, menge, projekt, notiz, von_user, von_user_id)
  values
    (p_artikel_id, v_name, v_nummer, p_typ, p_menge, p_projekt, p_notiz, p_von_user, p_von_user_id);
end;
$$;

revoke all on function public.book_movement(bigint, text, numeric, text, text, text, uuid) from public;
grant execute on function public.book_movement(bigint, text, numeric, text, text, text, uuid) to authenticated;

-- ============================================================
-- Done.
-- ============================================================
