-- YourQ — Supabase schema.
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> paste -> Run.
--
-- The whole app state ({ services, tokens }) is stored as one JSON document in
-- this table (row id = 'main'). The app's Netlify function reads/writes it using
-- your Supabase SECRET key, which bypasses Row Level Security.

create table if not exists queue_state (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Lock the table so the public (publishable) key can't read or write it.
-- The server-side SECRET key bypasses RLS, so the app still works.
alter table queue_state enable row level security;

-- Subscription status. The admin manages this row DIRECTLY here in Supabase:
--   * To upgrade to Pro:  set plan = 'pro' and expiry_date = a future date.
--   * Downgrade to Free is AUTOMATIC when expiry_date is reached (the app does it).
create table if not exists subscription (
  id          text primary key,
  plan        text not null default 'free',   -- 'free' or 'pro'
  expiry_date date,                            -- when Pro expires
  updated_at  timestamptz not null default now()
);
alter table subscription enable row level security;

-- Start on the Free plan.
insert into subscription (id, plan, expiry_date)
values ('main', 'free', null)
on conflict (id) do nothing;
