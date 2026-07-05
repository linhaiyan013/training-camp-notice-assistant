alter table public.message_templates
  drop constraint if exists message_templates_type_check;

alter table public.message_templates
  add constraint message_templates_type_check
  check (type in (
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
  ));
