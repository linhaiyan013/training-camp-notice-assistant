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

  if length(trim(coalesce(assistant_secret, ''))) < 4 then
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

update public.assistant_codes
set active = false
where active is true;

insert into public.assistant_codes (name, secret_hash, active)
values ('默认助理访问码', '16740bf13991fe083fbe5820cc8da08a5d88e5a48f44a3cfcc283c27b2797ba7', true)
on conflict (secret_hash) do update set
  name = excluded.name,
  active = true;

grant execute on function public.set_primary_admin_code(text, text) to anon, authenticated;
grant execute on function public.set_assistant_code(text, text) to anon, authenticated;
