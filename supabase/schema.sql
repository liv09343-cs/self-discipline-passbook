create table if not exists public.passbook_account (
  owner uuid primary key references auth.users (id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  revision integer not null default 0,
  updated_at bigint not null default 0,
  device_id text not null default ''
);

create table if not exists public.passbook_book (
  owner uuid not null references auth.users (id) on delete cascade,
  id text not null,
  book jsonb,
  revision integer not null default 0,
  updated_at bigint not null default 0,
  device_id text not null default '',
  deleted boolean not null default false,
  primary key (owner, id)
);

create index if not exists passbook_book_owner_idx
  on public.passbook_book (owner);

alter table public.passbook_account enable row level security;
alter table public.passbook_book enable row level security;

drop policy if exists passbook_account_owner_all on public.passbook_account;
create policy passbook_account_owner_all on public.passbook_account
  for all
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

drop policy if exists passbook_book_owner_all on public.passbook_book;
create policy passbook_book_owner_all on public.passbook_book
  for all
  using (auth.uid() = owner)
  with check (auth.uid() = owner);
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.passbook_account to authenticated;
grant select, insert, update, delete on public.passbook_book to authenticated;
grant select, insert, update, delete on public.passbook_account to service_role;
grant select, insert, update, delete on public.passbook_book to service_role;