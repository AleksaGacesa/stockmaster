-- ============================================================
-- StockMaster — Lieferanten & Bestellungen
-- Safe to run multiple times. Run after 01_schema.sql / 03_fixes.sql
-- / 04_delete_user.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

create table if not exists public.lieferanten (
  id              bigint generated always as identity primary key,
  name            text not null unique,
  email           text not null default '',
  telefon         text not null default '',
  ansprechpartner text not null default '',
  adresse         text not null default '',
  notiz           text not null default '',
  created_at      timestamptz default now()
);

-- Link artikel to a proper Lieferant record. The existing free-text
-- `lieferant` column is left as-is — ImportPage and the article form
-- still read/write it, this is additive.
alter table public.artikel add column if not exists lieferant_id bigint references public.lieferanten(id) on delete set null;
create index if not exists idx_artikel_lieferant_id on public.artikel(lieferant_id);

-- Backfill: turn distinct existing artikel.lieferant text values into
-- real lieferanten rows and link matching articles to them.
insert into public.lieferanten (name)
select distinct trim(lieferant) from public.artikel
where trim(coalesce(lieferant, '')) <> ''
on conflict (name) do nothing;

update public.artikel a
set lieferant_id = l.id
from public.lieferanten l
where a.lieferant_id is null and trim(a.lieferant) = l.name;

create table if not exists public.bestellungen (
  id              bigint generated always as identity primary key,
  lieferant_id    bigint not null references public.lieferanten(id),
  status          text not null default 'entwurf' check (status in ('entwurf', 'gesendet', 'bestaetigt', 'eingetroffen')),
  notiz           text not null default '',
  erstellt_von    text not null default '',
  erstellt_von_id uuid references public.profiles on delete set null,
  gesendet_at     timestamptz,
  eingetroffen_at timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

drop trigger if exists bestellungen_updated_at on public.bestellungen;
create trigger bestellungen_updated_at
  before update on public.bestellungen
  for each row execute function public.set_updated_at();

create table if not exists public.bestellung_positionen (
  id             bigint generated always as identity primary key,
  bestellung_id  bigint not null references public.bestellungen on delete cascade,
  artikel_id     bigint references public.artikel on delete set null,
  artikel_name   text not null,
  artikel_nummer text not null,
  einheit        text not null default 'Stk',
  menge          numeric not null check (menge > 0),
  created_at     timestamptz default now()
);
create index if not exists idx_bestellung_positionen_bestellung on public.bestellung_positionen(bestellung_id);

-- RLS — this whole feature is owner-only. The route it lives behind
-- is OwnerRoute-gated, so workers never reach it anyway; the policies
-- just make sure that's also true if someone calls Supabase directly.
alter table public.lieferanten           enable row level security;
alter table public.bestellungen          enable row level security;
alter table public.bestellung_positionen enable row level security;

do $$ begin
  drop policy if exists "Owner can manage lieferanten"  on public.lieferanten;
  drop policy if exists "Owner can manage bestellungen" on public.bestellungen;
  drop policy if exists "Owner can manage positionen"   on public.bestellung_positionen;
end $$;

create policy "Owner can manage lieferanten"  on public.lieferanten  for all using (public.current_role_is_owner());
create policy "Owner can manage bestellungen" on public.bestellungen for all using (public.current_role_is_owner());
create policy "Owner can manage positionen"   on public.bestellung_positionen for all using (public.current_role_is_owner());

-- Marking a Bestellung "eingetroffen" books a Wareneingang for every
-- position in one atomic step, reusing book_movement (see
-- 03_fixes.sql) so stock updates stay race-safe and consistent with
-- normal Wareneingang bookings.
create or replace function public.receive_bestellung(p_bestellung_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pos record;
  v_name text;
begin
  if not public.current_role_is_owner() then
    raise exception 'Nur Inhaber können Bestellungen empfangen.';
  end if;

  select display_name into v_name from public.profiles where id = auth.uid();

  for v_pos in
    select * from public.bestellung_positionen where bestellung_id = p_bestellung_id
  loop
    if v_pos.artikel_id is not null then
      perform public.book_movement(
        v_pos.artikel_id, 'eingang', v_pos.menge,
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

revoke all on function public.receive_bestellung(bigint) from public;
grant execute on function public.receive_bestellung(bigint) to authenticated;

-- ============================================================
-- Done.
-- ============================================================
