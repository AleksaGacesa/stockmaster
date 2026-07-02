-- ============================================================
-- StockMaster — Lieferdatum-Tracking, Steuersatz pro Lieferant,
-- Firmenlogo-Upload. Safe to run multiple times.
-- Run after 05_lieferanten.sql / 08_firmendaten.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- 1) Expected delivery date, set when a Bestellung is marked
--    "gesendet". Compared against eingetroffen_at later to compute
--    on-time-delivery % and average delay per Lieferant.
alter table public.bestellungen add column if not exists erwartete_lieferung date;

-- 2) Per-Lieferant VAT rate, used to break Bestellung totals into
--    Netto / MwSt / Brutto.
alter table public.lieferanten add column if not exists steuersatz numeric not null default 19;

-- 3) Company logo, shown on printed/PDF Bestellungen.
alter table public.firmendaten add column if not exists logo_url text not null default '';

-- 4) Storage bucket for the logo upload. Public read (needed so the
--    browser can embed it in the PDF/print output), owner-only write.
insert into storage.buckets (id, name, public)
values ('firmenlogo', 'firmenlogo', true)
on conflict (id) do nothing;

drop policy if exists "Public can read firmenlogo"   on storage.objects;
drop policy if exists "Owner can upload firmenlogo"   on storage.objects;
drop policy if exists "Owner can update firmenlogo"   on storage.objects;
drop policy if exists "Owner can delete firmenlogo"   on storage.objects;

create policy "Public can read firmenlogo" on storage.objects
  for select using (bucket_id = 'firmenlogo');

create policy "Owner can upload firmenlogo" on storage.objects
  for insert with check (bucket_id = 'firmenlogo' and public.current_role_is_owner());

create policy "Owner can update firmenlogo" on storage.objects
  for update using (bucket_id = 'firmenlogo' and public.current_role_is_owner());

create policy "Owner can delete firmenlogo" on storage.objects
  for delete using (bucket_id = 'firmenlogo' and public.current_role_is_owner());

-- ============================================================
-- Done.
-- ============================================================
