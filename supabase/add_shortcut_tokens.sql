-- 在现有账本迁移之后执行一次。仅允许登录用户生成/撤销自己的快捷指令密钥。
begin;

create table public.shortcut_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

alter table public.shortcut_tokens enable row level security;
revoke all on public.shortcut_tokens from anon, authenticated;
grant select (user_id, created_at) on public.shortcut_tokens to authenticated;
create policy "Users can see their own shortcut token status"
  on public.shortcut_tokens for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.rotate_shortcut_token()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  raw_token text;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  raw_token := 'cl_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.shortcut_tokens (user_id, token_hash, created_at)
  values (caller, encode(sha256(convert_to(raw_token, 'UTF8')), 'hex'), now())
  on conflict (user_id) do update
  set token_hash = excluded.token_hash, created_at = excluded.created_at;
  return raw_token;
end;
$$;

create or replace function public.revoke_shortcut_token()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  delete from public.shortcut_tokens where user_id = (select auth.uid());
end;
$$;

revoke all on function public.rotate_shortcut_token() from public, anon;
revoke all on function public.revoke_shortcut_token() from public, anon;
grant execute on function public.rotate_shortcut_token() to authenticated;
grant execute on function public.revoke_shortcut_token() to authenticated;

notify pgrst, 'reload schema';
commit;
