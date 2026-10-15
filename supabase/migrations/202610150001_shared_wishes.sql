drop policy if exists "wife creates wishes" on public.wishes;
drop policy if exists "wife updates wishes" on public.wishes;
drop policy if exists "wife deletes wishes" on public.wishes;

create policy "members create own wishes" on public.wishes for insert
  with check (couple_id = public.my_couple_id() and author_id = auth.uid());

create policy "authors update own wishes" on public.wishes for update
  using (couple_id = public.my_couple_id() and author_id = auth.uid())
  with check (couple_id = public.my_couple_id() and author_id = auth.uid());

create policy "authors delete own wishes" on public.wishes for delete
  using (couple_id = public.my_couple_id() and author_id = auth.uid());

drop policy if exists "husband marks wishes viewed" on public.wish_views;
create policy "members mark partner wishes viewed" on public.wish_views for insert
  with check (
    user_id = auth.uid() and
    exists(
      select 1 from public.wishes w
      where w.id = wish_id
        and w.couple_id = public.my_couple_id()
        and w.author_id <> auth.uid()
    )
  );
