-- The Larder — schema for a single-user recipe/meal-planner app.
-- Run this once in the Supabase SQL editor for your project.
--
-- There is no auth and no per-row ownership: every table has RLS enabled
-- with zero policies, which blocks the public anon/authenticated keys
-- entirely. The app only ever talks to Supabase from server-side Next.js
-- code using the service role key, which bypasses RLS by design.

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Dinner',
  servings integer not null default 4,
  ingredients jsonb not null default '[]'::jsonb,
  instructions text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists meal_plan (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id uuid references recipes(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (date, slot)
);

create table if not exists shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quantity numeric not null default 0,
  unit text not null default '',
  recipe_names text[] not null default '{}',
  checked boolean not null default false,
  created_at timestamptz not null default now()
);

-- "recipe" items are wiped and regenerated every time the list is rebuilt
-- from the meal plan; "manual" items (quick-added by hand) are left alone
-- by a rebuild so they don't get silently deleted.
alter table shopping_list_items add column if not exists source text not null default 'recipe';
alter table shopping_list_items drop constraint if exists shopping_list_items_source_check;
alter table shopping_list_items add constraint shopping_list_items_source_check check (source in ('recipe', 'manual'));

-- Shared ingredient library, canonical in grams. "grams" base_unit
-- ingredients (produce, flour, oil, spices — anything commonly measured by
-- weight OR volume) store rates PER GRAM; "count" base_unit ingredients
-- (eggs, cans, cloves — discrete items with no natural weight) store rates
-- PER ITEM. Grams is the one unit every weight/volume unit converts to via
-- a fixed ratio (see lib/constants.ts) — storing rates any other way would
-- mean the same ingredient could get saved multiple times under different
-- units. Each recipe's own ingredient line (still stored in
-- recipes.ingredients jsonb, unchanged) can optionally carry a "libraryId"
-- pointing here, but always keeps its own quantity/unit/calories as a
-- permanent, independently-editable snapshot rather than something derived
-- live from this table.
create table if not exists ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_unit text not null default 'grams' check (base_unit in ('grams', 'count')),
  calories_per_base_unit numeric not null default 0,
  protein_per_base_unit numeric not null default 0,
  fiber_per_base_unit numeric not null default 0,
  -- Only meaningful when base_unit = 'grams' and this ingredient is
  -- commonly measured by volume — its density, as "N grams per one
  -- reference_unit" (e.g. 8 grams per tbsp for cornstarch). Lets a recipe
  -- enter a volume unit and still get accurate grams/macros without a
  -- second, duplicate library entry for "the volume version".
  reference_unit text check (reference_unit in ('tsp', 'tbsp', 'cup', 'ml', 'l')),
  grams_per_reference_unit numeric,
  pantry_staple boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists ingredients_name_lower_idx on ingredients (lower(name));

-- Rebuilt to the grams-canonical model above. The old shape (a single
-- arbitrary unit + a rate for that one unit) predates this and doesn't map
-- cleanly onto it, so existing rows are wiped intentionally rather than
-- migrated — recipes are unaffected, since their ingredient lines are
-- independent snapshots, not live-linked to this table (see comment
-- above); a stale libraryId just means no match, same as any ingredient
-- line that was never linked. Guarded so this only ever runs once, against
-- a database still on the old shape.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'ingredients' and column_name = 'unit'
  ) then
    truncate table ingredients;
    alter table ingredients drop column unit;
    alter table ingredients drop column calories_per_unit;
    alter table ingredients drop column protein_per_unit;
    alter table ingredients drop column fiber_per_unit;
    alter table ingredients add column if not exists base_unit text not null default 'grams' check (base_unit in ('grams', 'count'));
    alter table ingredients add column if not exists calories_per_base_unit numeric not null default 0;
    alter table ingredients add column if not exists protein_per_base_unit numeric not null default 0;
    alter table ingredients add column if not exists fiber_per_base_unit numeric not null default 0;
    alter table ingredients add column if not exists reference_unit text check (reference_unit in ('tsp', 'tbsp', 'cup', 'ml', 'l'));
    alter table ingredients add column if not exists grams_per_reference_unit numeric;
  end if;
end $$;

-- A slot's meal is either a real recipe (recipe_id) or a one-off custom
-- meal (custom_meal) typed in on the spot — never both. Custom meals are
-- intentionally NOT saved to the recipes table; they only ever live here.
alter table meal_plan add column if not exists custom_meal jsonb;

-- When recipe_id points to a recipe with flexible ingredients (swappable
-- options like "pick your vegetables" in a curry), this holds the ids of
-- the ingredient lines that are toggled ON for THIS specific occurrence —
-- independent of any other date/slot using the same recipe. Null means
-- "use the recipe's own defaults" (recipes without flex ingredients, or
-- rows saved before this feature existed).
alter table meal_plan add column if not exists flex_selection jsonb;

-- Whether this planned meal has actually been eaten — toggled from Home's
-- today card, independent of the slot's own date/time. Resets to false
-- whenever a slot is (re)assigned a new recipe or custom meal.
alter table meal_plan add column if not exists eaten boolean not null default false;

-- Extra items eaten on a given day outside any planned meal slot. Simpler
-- than a recipe ingredient on purpose — just a label and a calorie count,
-- no protein/fiber tracking, no link back to the ingredient library (the
-- library is only used client-side as a convenience to look up calories
-- when adding one of these).
create table if not exists daily_extras (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null,
  calories numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table recipes enable row level security;
alter table meal_plan enable row level security;
alter table shopping_list_items enable row level security;
alter table ingredients enable row level security;
alter table daily_extras enable row level security;

-- RLS blocks row access without a matching policy, but table-level access is a
-- separate Postgres GRANT layer underneath it. New Supabase projects usually
-- set this up automatically for service_role, but it's not guaranteed —
-- without it, even the service role key gets "permission denied for table".
grant usage on schema public to service_role;
grant all on public.recipes, public.meal_plan, public.shopping_list_items, public.ingredients, public.daily_extras to service_role;

-- Migration: existing recipes predate the per-line "whole recipe" vs
-- "per serving" toggle, so their ingredient objects have no servingMode key.
-- Backfill it to "whole" (today's only behavior) so nothing changes for
-- recipes saved before this feature existed. Idempotent — only touches
-- ingredient objects that don't already have the key, so re-running this
-- whole file is still safe.
update recipes
set ingredients = (
  select jsonb_agg(
    case
      when elem ? 'servingMode' then elem
      else elem || jsonb_build_object('servingMode', 'whole')
    end
  )
  from jsonb_array_elements(ingredients) as elem
)
where jsonb_array_length(ingredients) > 0
  and exists (
    select 1 from jsonb_array_elements(ingredients) as elem
    where not (elem ? 'servingMode')
  );

-- Per-recipe notes for the weekly prep hand-off: where the recipe came
-- from, and what gets done ahead on prep day. Both optional.
alter table recipes add column if not exists source_url text;
alter table recipes add column if not exists prep_steps text not null default '';

-- "This week": recipes chosen for the current week, grouped into buckets
-- (what Kristine makes on prep day, what she preps ahead, other dinners,
-- lunches, snacks) instead of calendar days. One row per (bucket, recipe);
-- "Start new week" clears the table. The shopping list builds from these.
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
