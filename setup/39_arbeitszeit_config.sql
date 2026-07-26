-- ============================================================
-- StockMaster/Werkheld — Arbeitszeit-Konfiguration & Vertragsdaten
--   * profiles.vertrag_stunden  — vertraglich vereinbarte Stunden je
--     Mitarbeiter; vertrag_periode sagt, ob das ein Tages- oder
--     Wochenwert ist. Zusammen mit stundensatz (schon vorhanden aus
--     Migration 35) ist das die Basis für Überstunden & Lohnkosten.
--   * firmendaten.soll_stunden_tag  — Firmen-Standard (Fallback, wenn
--     ein Mitarbeiter keinen eigenen Vertrag hat)
--   * firmendaten.benachrichtigungen — JSON-Schalter für die
--     Benachrichtigungs-Einstellungen (welche Ereignisse gemeldet
--     werden sollen)
-- Überstunden pro Tag = geleistete Netto-Zeit − Tages-Soll; das
-- Tages-Soll kommt aus dem Vertrag (Wochenwert / 5 Werktage) und
-- fällt sonst auf den Firmen-Standard bzw. 8 h zurück.
-- Safe to run multiple times. Run after 38_zeiterfassung.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.profiles add column if not exists vertrag_stunden numeric;
alter table public.profiles add column if not exists vertrag_periode text not null default 'woche';
alter table public.profiles drop constraint if exists profiles_vertrag_periode_check;
alter table public.profiles add constraint profiles_vertrag_periode_check
  check (vertrag_periode in ('tag', 'woche'));

alter table public.firmendaten add column if not exists soll_stunden_tag numeric not null default 8;
alter table public.firmendaten add column if not exists benachrichtigungen jsonb not null default '{}';

-- Managers may already update any profile (owner via existing policies).
-- Rate/contract editing needs manager write on profiles — the owner
-- "update any profile" policy from 03_fixes.sql already covers owners;
-- extend to admins so both manager roles can maintain rates.
drop policy if exists "Managers update any profile" on public.profiles;
create policy "Managers update any profile" on public.profiles
  for update using (public.current_role_is_manager());

-- ============================================================
-- Fertig.
-- ============================================================
