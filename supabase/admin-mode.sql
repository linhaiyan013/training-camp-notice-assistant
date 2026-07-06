create extension if not exists pgcrypto;

create table if not exists public.admin_codes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  secret_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.admin_codes enable row level security;

create or replace function public.admin_code_hash(secret text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(convert_to(coalesce(secret, ''), 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public.request_admin_code()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-admin-code', ''),
    nullif(current_setting('request.header.x-admin-code', true), '')
  );
$$;

create or replace function public.is_admin_request()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_codes
    where active is true
      and secret_hash = public.admin_code_hash(public.request_admin_code())
  );
$$;

create or replace function public.verify_admin_code()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_request();
$$;

create or replace function public.add_admin_code(admin_name text, admin_secret text)
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

  if nullif(trim(admin_name), '') is null then
    raise exception 'admin name is required';
  end if;

  if length(trim(coalesce(admin_secret, ''))) < 8 then
    raise exception 'admin secret is too short';
  end if;

  insert into public.admin_codes (name, secret_hash)
  values (trim(admin_name), public.admin_code_hash(trim(admin_secret)))
  on conflict (secret_hash) do update set
    name = excluded.name,
    active = true
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.set_primary_admin_code(admin_name text, admin_secret text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_name text := coalesce(nullif(trim(admin_name), ''), '海岩管理员');
  new_id uuid;
begin
  if not public.is_admin_request() then
    raise exception 'not admin';
  end if;

  if length(trim(coalesce(admin_secret, ''))) < 4 then
    raise exception 'admin secret is too short';
  end if;

  update public.admin_codes
  set active = false
  where name = target_name;

  insert into public.admin_codes (name, secret_hash, active)
  values (target_name, public.admin_code_hash(trim(admin_secret)), true)
  on conflict (secret_hash) do update set
    name = excluded.name,
    active = true
  returning id into new_id;

  return new_id;
end;
$$;

insert into public.admin_codes (name, secret_hash)
values ('海岩管理员', '00f0c1279f47fac9ba1472a02d0e7f6e19c17f89c235fcc863a21a9bfff12f8a')
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
    'lesson_preset_items',
    'admin_codes'
  ]
  loop
    execute format('drop policy if exists "public read %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "public insert %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "public update %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "public delete %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "admin read %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "admin insert %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "admin update %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "admin delete %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "assistant update %1$s" on public.%1$I', table_name);
  end loop;
end $$;

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
    execute format('create policy "public read %1$s" on public.%1$I for select using (true)', table_name);
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'training_camps',
    'camp_groups',
    'camp_lessons',
    'message_tasks',
    'message_templates',
    'lesson_presets',
    'lesson_preset_items'
  ]
  loop
    execute format('create policy "admin insert %1$s" on public.%1$I for insert with check (public.is_admin_request())', table_name);
    execute format('create policy "admin update %1$s" on public.%1$I for update using (public.is_admin_request()) with check (public.is_admin_request())', table_name);
    execute format('create policy "admin delete %1$s" on public.%1$I for delete using (public.is_admin_request())', table_name);
  end loop;
end $$;

create policy "admin read admin_codes"
on public.admin_codes for select
using (public.is_admin_request());

create policy "admin insert admin_codes"
on public.admin_codes for insert
with check (public.is_admin_request());

create policy "admin update admin_codes"
on public.admin_codes for update
using (public.is_admin_request())
with check (public.is_admin_request());

create policy "admin delete admin_codes"
on public.admin_codes for delete
using (public.is_admin_request());

create policy "admin insert task_group_statuses"
on public.task_group_statuses for insert
with check (public.is_admin_request());

create policy "assistant update task_group_statuses"
on public.task_group_statuses for update
using (true)
with check (true);

create policy "admin delete task_group_statuses"
on public.task_group_statuses for delete
using (public.is_admin_request());

grant usage on schema public to anon, authenticated;

revoke all on public.admin_codes from anon, authenticated;
grant select on public.training_camps, public.camp_groups, public.camp_lessons, public.message_tasks,
  public.task_group_statuses, public.message_templates, public.lesson_presets, public.lesson_preset_items
to anon, authenticated;

grant insert, update, delete on public.training_camps, public.camp_groups, public.camp_lessons,
  public.message_tasks, public.message_templates, public.lesson_presets, public.lesson_preset_items
to anon, authenticated;

grant insert, delete on public.task_group_statuses to anon, authenticated;
grant update (sent, sent_at) on public.task_group_statuses to anon, authenticated;

grant execute on function public.verify_admin_code() to anon, authenticated;
grant execute on function public.add_admin_code(text, text) to anon, authenticated;
grant execute on function public.set_primary_admin_code(text, text) to anon, authenticated;
