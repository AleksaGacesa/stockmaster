-- ============================================================
-- StockMaster Database Schema — safe to run multiple times
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

create extension if not exists "uuid-ossp";

-- PROFILES
create table if not exists public.profiles (
  id           uuid references auth.users on delete cascade primary key,
  display_name text not null,
  role         text not null default 'worker' check (role in ('owner', 'worker')),
  created_at   timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'worker')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ARTIKEL
create table if not exists public.artikel (
  id             bigint generated always as identity primary key,
  nummer         text not null unique,
  name           text not null,
  kategorie      text not null default '',
  menge          numeric not null default 0,
  einheit        text not null default 'Stk',
  mindestbestand numeric not null default 0,
  lagerort       text not null default '',
  preis          numeric not null default 0,
  lieferant      text not null default '',
  bild           text not null default '',
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists artikel_updated_at on public.artikel;
create trigger artikel_updated_at
  before update on public.artikel
  for each row execute function public.set_updated_at();

-- WARENBEWEGUNGEN
create table if not exists public.warenbewegungen (
  id              bigint generated always as identity primary key,
  artikel_id      bigint references public.artikel on delete set null,
  artikel_name    text not null,
  artikel_nummer  text not null,
  typ             text not null check (typ in ('eingang', 'ausgang')),
  menge           numeric not null,
  projekt         text,
  notiz           text,
  von_user        text not null default '',
  von_user_id     uuid references public.profiles on delete set null,
  created_at      timestamptz default now()
);

-- INVENTUR SESSIONS
create table if not exists public.inventur_sessions (
  id           bigint generated always as identity primary key,
  name         text not null,
  status       text not null default 'aktiv' check (status in ('aktiv', 'abgeschlossen')),
  erstellt_von text not null default '',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

drop trigger if exists inventur_updated_at on public.inventur_sessions;
create trigger inventur_updated_at
  before update on public.inventur_sessions
  for each row execute function public.set_updated_at();

-- INVENTUR ERFASSUNGEN
create table if not exists public.inventur_erfassungen (
  id          bigint generated always as identity primary key,
  session_id  bigint references public.inventur_sessions on delete cascade not null,
  artikel_id  bigint references public.artikel on delete cascade not null,
  gezaehlt    numeric not null,
  von_user    text not null default '',
  von_user_id uuid references public.profiles on delete set null,
  created_at  timestamptz default now(),
  unique (session_id, artikel_id)
);

-- ROW LEVEL SECURITY
alter table public.profiles             enable row level security;
alter table public.artikel              enable row level security;
alter table public.warenbewegungen      enable row level security;
alter table public.inventur_sessions    enable row level security;
alter table public.inventur_erfassungen enable row level security;

create or replace function public.current_role_is_owner()
returns boolean language sql security definer as $$
  select coalesce(
    (select role = 'owner' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Drop existing policies to avoid conflicts, then recreate
do $$ begin
  drop policy if exists "Users can read own profile"      on public.profiles;
  drop policy if exists "Users can update own profile"    on public.profiles;
  drop policy if exists "Authenticated can read artikel"  on public.artikel;
  drop policy if exists "Owner can insert artikel"        on public.artikel;
  drop policy if exists "Owner can update artikel"        on public.artikel;
  drop policy if exists "Owner can delete artikel"        on public.artikel;
  drop policy if exists "Authenticated can read bewegungen"   on public.warenbewegungen;
  drop policy if exists "Authenticated can insert bewegungen" on public.warenbewegungen;
  drop policy if exists "Authenticated can read inventur"     on public.inventur_sessions;
  drop policy if exists "Owner can manage inventur sessions"  on public.inventur_sessions;
  drop policy if exists "Authenticated can read erfassungen"  on public.inventur_erfassungen;
  drop policy if exists "Authenticated can upsert erfassungen" on public.inventur_erfassungen;
  drop policy if exists "Authenticated can update erfassungen" on public.inventur_erfassungen;
end $$;

create policy "Users can read own profile"      on public.profiles for select using (true);
create policy "Users can update own profile"    on public.profiles for update using (auth.uid() = id);
create policy "Authenticated can read artikel"  on public.artikel for select using (auth.role() = 'authenticated');
create policy "Owner can insert artikel"        on public.artikel for insert with check (public.current_role_is_owner());
create policy "Owner can update artikel"        on public.artikel for update using (public.current_role_is_owner());
create policy "Owner can delete artikel"        on public.artikel for delete using (public.current_role_is_owner());
create policy "Authenticated can read bewegungen"   on public.warenbewegungen for select using (auth.role() = 'authenticated');
create policy "Authenticated can insert bewegungen" on public.warenbewegungen for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can read inventur"     on public.inventur_sessions for select using (auth.role() = 'authenticated');
create policy "Owner can manage inventur sessions"  on public.inventur_sessions for all using (public.current_role_is_owner());
create policy "Authenticated can read erfassungen"   on public.inventur_erfassungen for select using (auth.role() = 'authenticated');
create policy "Authenticated can upsert erfassungen" on public.inventur_erfassungen for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update erfassungen" on public.inventur_erfassungen for update using (auth.role() = 'authenticated');

-- ============================================================
-- Done! Run 02_seed.sql next for test data.
-- ============================================================
