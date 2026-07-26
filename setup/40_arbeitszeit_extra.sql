-- ============================================================
-- StockMaster/Werkheld — Zeiterfassung-Extras & Zugangsverwaltung
--   * firmendaten.pause_min_default   — Standard-Pause (Minuten)
--   * firmendaten.max_ueberstunden_tag — max. erlaubte Überstunden pro
--     Tag (h); 0 = kein Limit. Grundlage für eine spätere E-Mail-
--     Warnung, wenn ein Mitarbeiter das Limit überschreitet.
--   * admin_update_user(...) — der Inhaber kann E-Mail und/oder
--     Passwort eines Mitarbeiters ändern, ohne ihn zu löschen und neu
--     anzulegen. SECURITY DEFINER + Inhaber-Check, spiegelt das
--     bestehende admin_delete_user. Passwort wird als bcrypt-Hash
--     gesetzt (kompatibel mit Supabase Auth).
-- Safe to run multiple times. Run after 39_arbeitszeit_config.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.firmendaten add column if not exists pause_min_default    integer  not null default 30;
alter table public.firmendaten add column if not exists max_ueberstunden_tag numeric  not null default 0;

create or replace function public.admin_update_user(
  p_user_id uuid, p_email text default null, p_password text default null)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.current_role_is_owner() then
    raise exception 'Nur Inhaber können Zugangsdaten ändern.';
  end if;

  if p_email is not null and length(trim(p_email)) > 0 then
    update auth.users
      set email = lower(trim(p_email)),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
      where id = p_user_id;
    -- keep the email identity in sync so login by e-mail keeps working
    update auth.identities
      set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(lower(trim(p_email))))
      where user_id = p_user_id and provider = 'email';
  end if;

  if p_password is not null and length(p_password) > 0 then
    update auth.users
      set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
          updated_at = now()
      where id = p_user_id;
  end if;
end;
$$;

-- ============================================================
-- Fertig.
-- ============================================================
