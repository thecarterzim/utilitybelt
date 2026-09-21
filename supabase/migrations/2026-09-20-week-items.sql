-- "This week": recipes chosen for the current week, grouped into buckets
-- instead of calendar days. One row per (bucket, recipe). Cleared by
-- "Start new week". Schema.sql carries the same definition for fresh installs.
create table if not exists week_items (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check (bucket in ('make', 'prep', 'dinners', 'lunches', 'snacks')),
  recipe_id uuid not null references recipes(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (bucket, recipe_id)
);
alter table week_items enable row level security;
grant all on public.week_items to service_role;
