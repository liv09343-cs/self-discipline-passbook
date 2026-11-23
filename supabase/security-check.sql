select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('passbook_account', 'passbook_book')
order by tablename, policyname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('passbook_account', 'passbook_book')
order by table_name, grantee, privilege_type;

select table_name, row_security
from information_schema.tables
where table_schema = 'public'
  and table_name in ('passbook_account', 'passbook_book');