alter table public.couple_events add column if not exists updated_at timestamptz not null default now();

create table if not exists public.wish_views (
  wish_id uuid not null references public.wishes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (wish_id, user_id)
);

alter table public.wish_views enable row level security;

create policy "users read own wish views" on public.wish_views for select
  using (user_id = auth.uid());
create policy "husband marks wishes viewed" on public.wish_views for insert
  with check (
    user_id = auth.uid() and public.my_role() = 'husband' and
    exists(select 1 from public.wishes w where w.id = wish_id and w.couple_id = public.my_couple_id())
  );
create policy "users refresh own wish views" on public.wish_views for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- VAPID keys are generated inside the Edge Function. RLS has no client policies,
-- so only the service-role client in the function can read or change them.
create table if not exists public.push_config (
  singleton boolean primary key default true check (singleton),
  public_jwk jsonb not null,
  private_jwk jsonb not null,
  application_server_key text not null,
  created_at timestamptz not null default now()
);

alter table public.push_config enable row level security;

do $$ begin
  alter publication supabase_realtime add table public.wish_views;
exception when duplicate_object then null;
end $$;
