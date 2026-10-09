-- 在已运行 add_fixed_expense_schedule.sql 的项目中执行一次。
-- 仅重命名尚未由用户改名的默认账本；保留账本 ID 和关联账目。
begin;

update public.ledger_books as b
set name = '日常消费'
where b.is_default
  and b.name = '默认账本'
  and not exists (
    select 1 from public.ledger_books as other
    where other.user_id = b.user_id and other.name = '日常消费'
  );

create or replace function public.create_default_ledger_book()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ledger_books (user_id, name, is_default)
  values (new.id, '日常消费', true);
  insert into public.ledger_books (user_id, name, is_salary)
  values (new.id, '工资账本', true);
  insert into public.ledger_books (user_id, name, is_fixed_expense)
  values (new.id, '固定支出', true);
  return new;
end;
$$;

commit;
