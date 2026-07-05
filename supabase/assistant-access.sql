create table if not exists public.assistant_codes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  secret_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.assistant_codes enable row level security;

create or replace function public.request_assistant_code()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-assistant-code', ''),
    nullif(current_setting('request.header.x-assistant-code', true), '')
  );
$$;

create or replace function public.is_assistant_request()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assistant_codes
    where active is true
      and secret_hash = public.admin_code_hash(public.request_assistant_code())
  );
$$;

create or replace function public.verify_assistant_code()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_assistant_request();
$$;

create or replace function public.set_assistant_code(assistant_name text, assistant_secret text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_admin_request() then
    raise exception 'not admin';
  end if;

  if length(trim(coalesce(assistant_secret, ''))) < 8 then
    raise exception 'assistant secret is too short';
  end if;

  update public.assistant_codes
  set active = false
  where active is true;

  insert into public.assistant_codes (name, secret_hash, active)
  values (
    coalesce(nullif(trim(assistant_name), ''), '助理访问码'),
    public.admin_code_hash(trim(assistant_secret)),
    true
  )
  on conflict (secret_hash) do update set
    name = excluded.name,
    active = true
  returning id into new_id;

  return new_id;
end;
$$;

insert into public.assistant_codes (name, secret_hash)
values ('默认助理访问码', '90bbcfe20280f90f7d8a7f096d6af119e21c55ccbcce6bed03ea41a869d2419b')
on conflict (secret_hash) do update set
  name = excluded.name,
  active = true;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'training_camps',
    'camp_groups',
    'camp_lessons',
    'message_tasks',
    'task_group_statuses',
    'message_templates',
    'lesson_presets',
    'lesson_preset_items'
  ]
  loop
    execute format('drop policy if exists "public read %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "access read %1$s" on public.%1$I', table_name);
    execute format(
      'create policy "access read %1$s" on public.%1$I for select using (public.is_admin_request() or public.is_assistant_request())',
      table_name
    );
  end loop;
end $$;

drop policy if exists "public read assistant_codes" on public.assistant_codes;
drop policy if exists "public insert assistant_codes" on public.assistant_codes;
drop policy if exists "public update assistant_codes" on public.assistant_codes;
drop policy if exists "public delete assistant_codes" on public.assistant_codes;
drop policy if exists "admin read assistant_codes" on public.assistant_codes;
drop policy if exists "admin insert assistant_codes" on public.assistant_codes;
drop policy if exists "admin update assistant_codes" on public.assistant_codes;
drop policy if exists "admin delete assistant_codes" on public.assistant_codes;

create policy "admin read assistant_codes"
on public.assistant_codes for select
using (public.is_admin_request());

create policy "admin insert assistant_codes"
on public.assistant_codes for insert
with check (public.is_admin_request());

create policy "admin update assistant_codes"
on public.assistant_codes for update
using (public.is_admin_request())
with check (public.is_admin_request());

create policy "admin delete assistant_codes"
on public.assistant_codes for delete
using (public.is_admin_request());

drop policy if exists "assistant update task_group_statuses" on public.task_group_statuses;
drop policy if exists "access update task_group_statuses" on public.task_group_statuses;

create policy "access update task_group_statuses"
on public.task_group_statuses for update
using (public.is_admin_request() or public.is_assistant_request())
with check (public.is_admin_request() or public.is_assistant_request());

revoke all on public.assistant_codes from anon, authenticated;
grant execute on function public.verify_assistant_code() to anon, authenticated;
grant execute on function public.set_assistant_code(text, text) to anon, authenticated;
