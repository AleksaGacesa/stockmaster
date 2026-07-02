-- ============================================================
-- StockMaster — actually delete a user, not just their profile row.
-- Safe to run multiple times. Run AFTER 01_schema.sql / 03_fixes.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- deleteUser() in Einstellungen only deleted the row in
-- public.profiles. The real account in auth.users was left behind,
-- so a "deleted" employee could still log in and read inventory data
-- (they just had no display name/role). This function deletes the
-- actual auth.users row; public.profiles is removed automatically
-- via its `on delete cascade` foreign key.
create or replace function public.admin_delete_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.current_role_is_owner() then
    raise exception 'Nur Inhaber können Benutzer löschen.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Sie können sich nicht selbst löschen.';
  end if;

  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ============================================================
-- Done.
-- ============================================================
