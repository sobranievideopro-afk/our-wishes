alter table public.couple_events
  add column if not exists event_color text not null default 'family';

alter table public.couple_events
  drop constraint if exists couple_events_event_color_check;
alter table public.couple_events
  add constraint couple_events_event_color_check check (event_color in ('family', 'work'));

create table if not exists public.wish_comment_views (
  wish_id uuid not null references public.wishes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (wish_id, user_id)
);

alter table public.wish_comment_views enable row level security;

create policy "users read own comment views" on public.wish_comment_views for select
  using (user_id = auth.uid());
create policy "members mark comments viewed" on public.wish_comment_views for insert
  with check (
    user_id = auth.uid() and
    exists(select 1 from public.wishes w where w.id = wish_id and w.couple_id = public.my_couple_id())
  );
create policy "users refresh own comment views" on public.wish_comment_views for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$ begin
  alter publication supabase_realtime add table public.wish_comment_views;
exception when duplicate_object then null;
end $$;
