create extension if not exists pgcrypto;

create type public.member_role as enum ('wife', 'husband');

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  couple_id uuid references public.couples(id) on delete set null,
  role public.member_role,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  source_url text,
  price numeric(12,2) check (price is null or price >= 0),
  cover_path text,
  image_paths text[] not null default '{}',
  categories text[] not null default '{}',
  stars smallint not null default 3 check (stars between 1 and 5),
  details text,
  completed_at timestamptz,
  completion_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wish_comments (
  id uuid primary key default gen_random_uuid(),
  wish_id uuid not null references public.wishes(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.wish_likes (
  wish_id uuid not null references public.wishes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (wish_id, user_id)
);

-- Private husband-only state intentionally lives outside wishes.
create table public.wish_reservations (
  wish_id uuid primary key references public.wishes(id) on delete cascade,
  husband_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  text text,
  image_path text,
  created_at timestamptz not null default now(),
  check (nullif(trim(text), '') is not null or image_path is not null)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create or replace function public.my_couple_id()
returns uuid language sql stable security definer set search_path = public
as $$ select couple_id from public.profiles where id = auth.uid() $$;

create or replace function public.my_role()
returns public.member_role language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.create_couple(member_name text, member_role public.member_role)
returns table(couple_id uuid, invite_code text)
language plpgsql security definer set search_path = public
as $$
declare created public.couples;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.profiles where id = auth.uid() and profiles.couple_id is not null) then raise exception 'Already paired'; end if;
  insert into public.couples default values returning * into created;
  insert into public.profiles(id, couple_id, role, display_name)
    values(auth.uid(), created.id, member_role, left(member_name, 80))
    on conflict(id) do update set couple_id = created.id, role = member_role, display_name = left(member_name, 80);
  return query select created.id, created.invite_code;
end $$;

create or replace function public.join_couple(code text, member_name text, member_role public.member_role)
returns uuid language plpgsql security definer set search_path = public
as $$
declare target uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into target from public.couples where invite_code = upper(trim(code));
  if target is null then raise exception 'Invite code not found'; end if;
  if (select count(*) from public.profiles where couple_id = target) >= 2 then raise exception 'Couple is full'; end if;
  if exists(select 1 from public.profiles where couple_id = target and role = member_role) then raise exception 'Role already taken'; end if;
  insert into public.profiles(id, couple_id, role, display_name)
    values(auth.uid(), target, member_role, left(member_name, 80))
    on conflict(id) do update set couple_id = target, role = member_role, display_name = left(member_name, 80);
  return target;
end $$;

create or replace function public.set_wish_completed(target_wish uuid, completed boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.wishes
    set completed_at = case when completed then now() else null end,
        updated_at = now()
    where id = target_wish and couple_id = public.my_couple_id();
  if not found then raise exception 'Wish not found'; end if;
end $$;

alter table public.couples enable row level security;
alter table public.profiles enable row level security;
alter table public.wishes enable row level security;
alter table public.wish_comments enable row level security;
alter table public.wish_likes enable row level security;
alter table public.wish_reservations enable row level security;
alter table public.messages enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "members read own couple" on public.couples for select using (id = public.my_couple_id());
create policy "members read partner profiles" on public.profiles for select using (couple_id = public.my_couple_id() or id = auth.uid());
create policy "member updates own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and couple_id = public.my_couple_id());

create policy "members read wishes" on public.wishes for select using (couple_id = public.my_couple_id());
create policy "wife creates wishes" on public.wishes for insert with check (couple_id = public.my_couple_id() and author_id = auth.uid() and public.my_role() = 'wife');
create policy "wife updates wishes" on public.wishes for update using (couple_id = public.my_couple_id() and public.my_role() = 'wife') with check (couple_id = public.my_couple_id());
create policy "wife deletes wishes" on public.wishes for delete using (author_id = auth.uid() and public.my_role() = 'wife');

create policy "members read comments" on public.wish_comments for select using (exists(select 1 from public.wishes w where w.id = wish_id and w.couple_id = public.my_couple_id()));
create policy "members add comments" on public.wish_comments for insert with check (author_id = auth.uid() and exists(select 1 from public.wishes w where w.id = wish_id and w.couple_id = public.my_couple_id()));
create policy "authors delete comments" on public.wish_comments for delete using (author_id = auth.uid());

create policy "members read likes" on public.wish_likes for select using (exists(select 1 from public.wishes w where w.id = wish_id and w.couple_id = public.my_couple_id()));
create policy "husband adds likes" on public.wish_likes for insert with check (user_id = auth.uid() and public.my_role() = 'husband' and exists(select 1 from public.wishes w where w.id = wish_id and w.couple_id = public.my_couple_id()));
create policy "owner removes likes" on public.wish_likes for delete using (user_id = auth.uid());

-- The wife has no SELECT policy on reservations, so she cannot discover them through the API.
create policy "husband reads reservations" on public.wish_reservations for select using (husband_id = auth.uid() and public.my_role() = 'husband');
create policy "husband creates reservations" on public.wish_reservations for insert with check (husband_id = auth.uid() and public.my_role() = 'husband' and exists(select 1 from public.wishes w where w.id = wish_id and w.couple_id = public.my_couple_id()));
create policy "husband removes reservations" on public.wish_reservations for delete using (husband_id = auth.uid());

create policy "members read messages" on public.messages for select using (couple_id = public.my_couple_id());
create policy "members send messages" on public.messages for insert with check (couple_id = public.my_couple_id() and author_id = auth.uid());
create policy "authors delete messages" on public.messages for delete using (author_id = auth.uid());
create policy "user manages push subscription" on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('couple-media', 'couple-media', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict(id) do nothing;

create policy "members read couple media" on storage.objects for select using (
  bucket_id = 'couple-media' and (storage.foldername(name))[1] = public.my_couple_id()::text
);
create policy "members upload couple media" on storage.objects for insert with check (
  bucket_id = 'couple-media' and (storage.foldername(name))[1] = public.my_couple_id()::text
);
create policy "members delete own media" on storage.objects for delete using (
  bucket_id = 'couple-media' and owner_id = auth.uid()::text
);

alter publication supabase_realtime add table public.wishes, public.wish_comments, public.wish_likes, public.messages;
