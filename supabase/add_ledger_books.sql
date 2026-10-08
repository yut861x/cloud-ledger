-- 在已运行 supabase/schema.sql 的项目中执行一次。
-- 迁移将已有账目归入每位用户的“默认账本”，不会删除账目。
begin;

create table public.ledger_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create unique index ledger_books_one_default_per_user
  on public.ledger_books (user_id) where is_default;

insert into public.ledger_books (user_id, name, is_default)
select id, '默认账本', true from auth.users;

create or replace function public.create_default_ledger_book()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ledger_books (user_id, name, is_default)
  values (new.id, '默认账本', true);
  return new;
end;
$$;

create trigger on_auth_user_created_ledger_book
  after insert on auth.users
  for each row execute function public.create_default_ledger_book();

alter table public.transactions add column book_id uuid;

update public.transactions as t
set book_id = b.id
from public.ledger_books as b
where b.user_id = t.user_id and b.is_default;

alter table public.transactions alter column book_id set not null;

alter table public.transactions
  add constraint transactions_book_owner_fk
  foreign key (book_id, user_id)
  references public.ledger_books (id, user_id);

create index transactions_book_date_idx
  on public.transactions (book_id, occurred_on desc, created_at desc);

alter table public.ledger_books enable row level security;

revoke all on public.ledger_books from anon, authenticated;
grant select on public.ledger_books to authenticated;
grant insert (user_id, name) on public.ledger_books to authenticated;
grant update (name) on public.ledger_books to authenticated;

create policy "Users can read their own books"
  on public.ledger_books for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own books"
  on public.ledger_books for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can rename their own books"
  on public.ledger_books for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';

commit;
