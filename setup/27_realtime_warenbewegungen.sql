-- Enables live updates for the Verlauf/Warenbewegung feed: a booking made
-- on one device (e.g. phone) now shows up on another (e.g. desktop)
-- without a manual refresh — same mechanism already used for "artikel".
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'warenbewegungen'
  ) then
    alter publication supabase_realtime add table public.warenbewegungen;
  end if;
end $$;
