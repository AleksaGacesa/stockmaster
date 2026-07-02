-- ============================================================
-- StockMaster — Artikelbilder-Upload (Storage bucket), same pattern
-- as firmenlogo (09_dashboard_v2.sql) but for individual article
-- photos instead of the company logo. Public read (needed so the
-- image renders in <img> tags without an auth header), owner-only
-- write.
-- Safe to run multiple times.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

insert into storage.buckets (id, name, public)
values ('artikelbilder', 'artikelbilder', true)
on conflict (id) do nothing;

do $$ begin
  drop policy if exists "Public can read artikelbilder"  on storage.objects;
  drop policy if exists "Owner can upload artikelbilder"  on storage.objects;
  drop policy if exists "Owner can update artikelbilder"  on storage.objects;
  drop policy if exists "Owner can delete artikelbilder"  on storage.objects;
end $$;

create policy "Public can read artikelbilder" on storage.objects
  for select using (bucket_id = 'artikelbilder');

create policy "Owner can upload artikelbilder" on storage.objects
  for insert with check (bucket_id = 'artikelbilder' and public.current_role_is_owner());

create policy "Owner can update artikelbilder" on storage.objects
  for update using (bucket_id = 'artikelbilder' and public.current_role_is_owner());

create policy "Owner can delete artikelbilder" on storage.objects
  for delete using (bucket_id = 'artikelbilder' and public.current_role_is_owner());

-- ============================================================
-- Done.
-- ============================================================
