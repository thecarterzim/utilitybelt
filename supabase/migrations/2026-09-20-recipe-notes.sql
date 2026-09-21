-- Run once in the Supabase SQL editor for databases created before this date.
-- (schema.sql already includes these lines for fresh installs.)
alter table recipes add column if not exists source_url text;
alter table recipes add column if not exists prep_steps text not null default '';
