-- Hanare schema. Postgres 15+ (gen_random_uuid() is built in).

create type user_role  as enum ('worker', 'employer');
create type job_status as enum ('draft', 'open', 'closed');
create type pay_unit   as enum ('hr', 'article', 'video_minute', 'finished_minute');
create type app_stage  as enum ('sent', 'viewed', 'interview', 'offer', 'rejected');

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,
  role          user_role not null,
  display_name  text not null,
  created_at    timestamptz not null default now()
);

-- One row per worker. bio_raw is what they typed (any language); the rest is what the AI extracted.
create table worker_profiles (
  user_id        uuid primary key references users(id) on delete cascade,
  bio_raw        text not null default '',
  tz             text not null default 'UTC',          -- IANA zone, e.g. America/Sao_Paulo
  currency       char(3) not null default 'USD',
  jp_level       smallint not null default 0 check (jp_level between 0 and 5),  -- 0 none, 1 N5 ... 5 N1
  languages      text[] not null default '{}',
  skills         text[] not null default '{}',
  hours_per_week smallint,
  updated_at     timestamptz not null default now()
);

create table companies (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references users(id) on delete set null,
  name_en     text not null,
  name_ja     text not null,
  verified_at timestamptz,                              -- set by hand after checking registration
  created_at  timestamptz not null default now()
);

create table jobs (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  status           job_status not null default 'draft',
  category         char(1) not null check (category in ('L','T','M','S','Q','C','R')),
  -- the employer writes Japanese; the AI fills the English columns, the employer reviews them
  title_ja         text not null,
  desc_ja          text not null,
  title_en         text not null default '',
  desc_en          text not null default '',
  tasks_en         text[] not null default '{}',
  reqs_en          text[] not null default '{}',
  tags             text[] not null default '{}',
  languages        text[] not null default '{}',
  jp_level         smallint not null default 0 check (jp_level between 0 and 5),
  pay_yen          integer not null check (pay_yen > 0),
  pay_unit         pay_unit not null default 'hr',
  hourly_equiv_yen integer not null check (hourly_equiv_yen > 0),  -- for "highest pay" sorting
  hours_min        smallint not null check (hours_min > 0),
  hours_max        smallint not null,
  -- live hours in JST minutes after midnight; end may pass 1440 for shifts that cross midnight
  live_start_min   smallint check (live_start_min between 0 and 1439),
  live_end_min     smallint,
  live_days        text,
  created_at       timestamptz not null default now(),
  published_at     timestamptz,
  check (hours_max >= hours_min),
  check ((live_start_min is null) = (live_end_min is null)),
  check (live_end_min is null or (live_end_min > live_start_min and live_end_min <= live_start_min + 1440))
);
create index jobs_open_idx on jobs (status, published_at desc);
create index jobs_tags_idx on jobs using gin (tags);

create table applications (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references jobs(id) on delete cascade,
  worker_id  uuid not null references users(id) on delete cascade,
  message_en text not null,
  message_ja text not null,
  stage      app_stage not null default 'sent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, worker_id)
);
create index applications_worker_idx on applications (worker_id, created_at desc);

create table saved_jobs (
  user_id    uuid not null references users(id) on delete cascade,
  job_id     uuid not null references jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

-- One row per model call: lets you watch cost and latency during the demo.
create table ai_calls (
  id            bigint generated always as identity primary key,
  kind          text not null,            -- match | draft | translate_job
  user_id       uuid,
  ok            boolean not null,
  input_tokens  integer,
  output_tokens integer,
  ms            integer not null,
  created_at    timestamptz not null default now()
);
