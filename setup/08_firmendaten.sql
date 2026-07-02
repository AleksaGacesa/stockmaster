-- ============================================================
-- StockMaster — Firmendaten (own company info printed on orders).
-- Safe to run multiple times. Run after 01_schema.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

create table if not exists public.firmendaten (
  id         smallint primary key default 1 check (id = 1),
  name       text not null default '',
  adresse    text not null default '',
  telefon    text not null default '',
  email      text not null default '',
  notiz      text not null default '',
  updated_at timestamptz default now()
);

-- Single settings row — always exists so the app can just select/update it.
insert into public.firmendaten (id) values (1) on conflict (id) do nothing;

drop trigger if exists firmendaten_updated_at on public.firmendaten;
create trigger firmendaten_updated_at
  before update on public.firmendaten
  for each row execute function public.set_updated_at();

alter table public.firmendaten enable row level security;

do $$ begin
  drop policy if exists "Authenticated can read firmendaten" on public.firmendaten;
  drop policy if exists "Owner can update firmendaten" on public.firmendaten;
end $$;

create policy "Authenticated can read firmendaten" on public.firmendaten for select using (auth.role() = 'authenticated');
create policy "Owner can update firmendaten" on public.firmendaten for update using (public.current_role_is_owner());

-- ============================================================
-- Done.
-- ============================================================
