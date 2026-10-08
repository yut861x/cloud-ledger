-- 在已有多账本表的项目中执行一次。
-- 工资计划由 pg_cron 每分钟检查；日期和时间按北京时间（Asia/Shanghai）解释。
-- 同一计划每月只处理一次。用户编辑或删除生成的账目后不会重新生成。
begin;

create extension if not exists pg_cron;

-- 工资账本固定排在默认账本之后，即使日后改名也保留位置。
alter table public.ledger_books
  add column is_salary boolean not null default false;

update public.ledger_books
set is_salary = true
where name = '工资账本' and not is_default;

create unique index ledger_books_one_salary_per_user
  on public.ledger_books (user_id) where is_salary;

-- 为现有用户补齐工资账本；新用户注册时也同时建立。
insert into public.ledger_books (user_id, name, is_salary)
select u.id, '工资账本', true
from auth.users as u
where not exists (
  select 1 from public.ledger_books as b
  where b.user_id = u.id and b.is_salary
);

create or replace function public.create_default_ledger_book()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ledger_books (user_id, name, is_default)
  values (new.id, '默认账本', true);
  insert into public.ledger_books (user_id, name, is_salary)
  values (new.id, '工资账本', true);
  return new;
end;
$$;

create table public.salary_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null unique,
  amount numeric(12, 2) not null check (amount > 0),
  pay_day smallint not null check (pay_day between 1 and 31),
  pay_time time(0) without time zone not null default '09:00',
  enabled boolean not null default true,
  starts_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (book_id, user_id) references public.ledger_books (id, user_id)
);

create table public.salary_schedule_runs (
  schedule_id uuid not null references public.salary_schedules(id) on delete cascade,
  pay_month date not null,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (schedule_id, pay_month)
);

create or replace function public.refresh_salary_schedule_start()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.starts_at := now();
  return new;
end;
$$;

create trigger salary_schedule_settings_changed
  before update of amount, pay_day, pay_time, enabled
  on public.salary_schedules
  for each row execute function public.refresh_salary_schedule_start();

create or replace function public.process_due_salaries()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  schedule_row public.salary_schedules%rowtype;
  current_local timestamp without time zone := now() at time zone 'Asia/Shanghai';
  month_start date := date_trunc('month', current_local)::date;
  last_day integer := extract(day from
    (date_trunc('month', current_local) + interval '1 month - 1 day')
  )::integer;
  due_day integer;
  due_date date;
  due_at timestamptz;
  entry_id uuid;
begin
  for schedule_row in
    select * from public.salary_schedules where enabled
  loop
    due_day := least(schedule_row.pay_day, last_day);
    due_date := month_start + (due_day - 1);
    due_at := (due_date + schedule_row.pay_time) at time zone 'Asia/Shanghai';

    if now() >= due_at and schedule_row.starts_at <= due_at then
      insert into public.salary_schedule_runs (schedule_id, pay_month)
      values (schedule_row.id, month_start)
      on conflict do nothing;

      if found then
        -- 当天已有手动记录的工资时，视为当月已到账，不再重复写入。
        select id into entry_id
        from public.transactions
        where book_id = schedule_row.book_id
          and user_id = schedule_row.user_id
          and type = 'income'
          and category = '工资'
          and occurred_on = due_date
        order by created_at
        limit 1;

        if entry_id is null then
          insert into public.transactions
            (user_id, book_id, type, amount, category, note, occurred_on)
          values
            (schedule_row.user_id, schedule_row.book_id, 'income',
             schedule_row.amount, '工资', '每月自动工资', due_date)
          returning id into entry_id;
        end if;

        update public.salary_schedule_runs
        set transaction_id = entry_id
        where schedule_id = schedule_row.id and pay_month = month_start;
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.process_due_salaries() from public, anon, authenticated;

alter table public.salary_schedules enable row level security;
alter table public.salary_schedule_runs enable row level security;

revoke all on public.salary_schedules from anon, authenticated;
revoke all on public.salary_schedule_runs from anon, authenticated;
grant select on public.salary_schedules to authenticated;
grant insert (user_id, book_id, amount, pay_day, pay_time, enabled)
  on public.salary_schedules to authenticated;
grant update (amount, pay_day, pay_time, enabled)
  on public.salary_schedules to authenticated;

create policy "Users can read their own salary schedules"
  on public.salary_schedules for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own salary schedules"
  on public.salary_schedules for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own salary schedules"
  on public.salary_schedules for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

select cron.schedule(
  'cloud-ledger-monthly-salaries',
  '* * * * *',
  'select public.process_due_salaries();'
);

notify pgrst, 'reload schema';

commit;
