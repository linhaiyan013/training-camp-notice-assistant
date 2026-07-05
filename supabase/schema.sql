create extension if not exists pgcrypto;

create table if not exists public.training_camps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  topic text not null,
  teacher text,
  start_date date not null,
  end_date date not null,
  class_time time not null default '20:00',
  duration_minutes integer not null default 90,
  live_link text,
  highlights text,
  audience text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.camp_groups (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.training_camps(id) on delete cascade,
  name text not null,
  position integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.camp_lessons (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.training_camps(id) on delete cascade,
  day_number integer not null,
  sort_order integer not null,
  kind text not null default '正课',
  title text not null,
  detail text,
  created_at timestamptz not null default now()
);

create table if not exists public.message_tasks (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.training_camps(id) on delete cascade,
  lesson_id uuid references public.camp_lessons(id) on delete cascade,
  type text not null check (type in ('noon', 'before')),
  type_label text not null,
  lesson_index integer not null,
  class_date date not null,
  send_at timestamp not null,
  message text not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_group_statuses (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.message_tasks(id) on delete cascade,
  group_id uuid references public.camp_groups(id) on delete set null,
  group_name text not null,
  sent boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in (
    'daily',
    'noon',
    'before',
    'replay',
    'homework',
    'opening',
    'start',
    'closing',
    'conversion',
    'general'
  )),
  content text not null,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, type)
);

create table if not exists public.lesson_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  camp_name text,
  topic text,
  teacher text,
  class_time time default '20:00',
  duration_minutes integer default 90,
  highlights text,
  audience text,
  groups text[] default '{}',
  created_at timestamptz not null default now(),
  unique (name)
);

create table if not exists public.lesson_preset_items (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid not null references public.lesson_presets(id) on delete cascade,
  day_number integer not null,
  sort_order integer not null,
  kind text not null default '正课',
  title text not null,
  detail text,
  created_at timestamptz not null default now(),
  unique (preset_id, sort_order)
);

alter table public.training_camps enable row level security;
alter table public.camp_groups enable row level security;
alter table public.camp_lessons enable row level security;
alter table public.message_tasks enable row level security;
alter table public.task_group_statuses enable row level security;
alter table public.message_templates enable row level security;
alter table public.lesson_presets enable row level security;
alter table public.lesson_preset_items enable row level security;

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
    execute format('drop policy if exists "public insert %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "public update %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "public delete %1$s" on public.%1$I', table_name);

    execute format('create policy "public read %1$s" on public.%1$I for select using (true)', table_name);
    execute format('create policy "public insert %1$s" on public.%1$I for insert with check (true)', table_name);
    execute format('create policy "public update %1$s" on public.%1$I for update using (true) with check (true)', table_name);
    execute format('create policy "public delete %1$s" on public.%1$I for delete using (true)', table_name);
  end loop;
end $$;
