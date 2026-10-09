-- 在 add_fixed_expense_schedule.sql 之后执行一次。保留已有账本和账目。
begin;

alter table public.ledger_books
  add column book_type text not null default 'dynamic_expense'
  check (book_type in ('dynamic_expense', 'fixed_expense', 'dynamic_income', 'fixed_income'));

-- 内置账本按用途归类；其他旧账本按名称推断为动态收入或动态支出。
update public.ledger_books
set book_type = case
  when is_salary then 'fixed_income'
  when is_fixed_expense then 'fixed_expense'
  when is_default then 'dynamic_expense'
  when name ~ '(副业|工资|红包|收入|奖金|薪资|兼职|收益|理财|利息|分红)' then 'dynamic_income'
  else 'dynamic_expense'
end;

-- 内置账本今后由注册触发器创建时也保持正确的类别。
create or replace function public.set_system_ledger_book_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_salary then
    new.book_type := 'fixed_income';
  elsif new.is_fixed_expense then
    new.book_type := 'fixed_expense';
  elsif new.is_default then
    new.book_type := 'dynamic_expense';
  end if;
  return new;
end;
$$;

create trigger ledger_books_system_type
  before insert or update of book_type, is_default, is_salary, is_fixed_expense
  on public.ledger_books
  for each row execute function public.set_system_ledger_book_type();

grant insert (book_type) on public.ledger_books to authenticated;
grant update (book_type) on public.ledger_books to authenticated;

notify pgrst, 'reload schema';
commit;
