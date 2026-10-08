-- 在 Supabase Dashboard → SQL Editor 中运行一次。
-- auth.users 由 Supabase Auth 管理；这里只建立每位用户自己的账目。
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount numeric(12, 2) not null check (amount > 0),
  category text not null check (
    (type = 'expense' and category in ('餐饮', '购物', '交通', '居住', '娱乐', '健康', '其他'))
    or (type = 'income' and category in ('工资', '奖金', '理财', '其他'))
  ),
  note text check (char_length(note) <= 200),
  occurred_on date not null,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, occurred_on desc, created_at desc);

alter table public.transactions enable row level security;

-- 浏览器使用 publishable key + 用户会话。每个操作都限定在当前用户的数据上。
grant select, insert, update, delete on public.transactions to authenticated;
revoke all on public.transactions from anon;

create policy "Users can read their own transactions"
  on public.transactions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own transactions"
  on public.transactions for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own transactions"
  on public.transactions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own transactions"
  on public.transactions for delete to authenticated
  using ((select auth.uid()) = user_id);
