alter table public.wishes add column if not exists target_date date;

create table if not exists public.couple_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  event_date date not null,
  event_time time,
  emojis text[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  check (cardinality(emojis) <= 3)
);

create table if not exists public.message_likes (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.couple_events enable row level security;
alter table public.message_likes enable row level security;

create policy "members read events" on public.couple_events for select
  using (couple_id = public.my_couple_id());
create policy "members create events" on public.couple_events for insert
  with check (couple_id = public.my_couple_id() and author_id = auth.uid());
create policy "authors update events" on public.couple_events for update
  using (author_id = auth.uid()) with check (couple_id = public.my_couple_id() and author_id = auth.uid());
create policy "authors delete events" on public.couple_events for delete
  using (author_id = auth.uid());

create policy "members read message likes" on public.message_likes for select
  using (exists(select 1 from public.messages m where m.id = message_id and m.couple_id = public.my_couple_id()));
create policy "members like messages" on public.message_likes for insert
  with check (user_id = auth.uid() and exists(select 1 from public.messages m where m.id = message_id and m.couple_id = public.my_couple_id()));
create policy "owners remove message likes" on public.message_likes for delete
  using (user_id = auth.uid());

do $$ begin
  alter publication supabase_realtime add table public.couple_events;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.message_likes;
exception when duplicate_object then null;
end $$;
