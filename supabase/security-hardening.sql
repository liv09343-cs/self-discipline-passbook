create or replace function public.passbook_enforce_book_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  book_count integer;
begin
  if new.book is not null and pg_column_size(new.book) > 524288 then
    raise exception '单个账本数据不能超过 512KB';
  end if;

  if new.deleted = false then
    select count(*) into book_count
    from public.passbook_book
    where owner = new.owner
      and deleted = false
      and id <> new.id;

    if book_count >= 20 then
      raise exception '每用户最多 20 本存折';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists passbook_book_limits on public.passbook_book;
create trigger passbook_book_limits
before insert or update on public.passbook_book
for each row execute function public.passbook_enforce_book_limits();

create or replace function public.passbook_enforce_account_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_column_size(new.profile) > 16384
     or pg_column_size(new.settings) > 16384 then
    raise exception '账户配置数据过大';
  end if;
  return new;
end;
$$;

drop trigger if exists passbook_account_limits on public.passbook_account;
create trigger passbook_account_limits
before insert or update on public.passbook_account
for each row execute function public.passbook_enforce_account_limits();