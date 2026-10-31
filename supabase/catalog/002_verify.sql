-- Run as administrator after 001; this verification always rolls back.
-- Exercises database roles, independently of the separate live HTTP checks.
begin;
do $$
begin
 if not (select relrowsecurity from pg_class where oid='public.local_lab_model_catalog'::regclass) then
  raise exception 'RLS disabled';
 end if;
 if (select count(distinct version) from public.local_lab_model_catalog) <> 1 then
  raise exception 'Mixed/empty release';
 end if;
end $$;
set local role anon;
do $$
begin
 if (select count(*) from public.local_lab_model_catalog) <> 2 then raise exception 'Seed read failed'; end if;
 begin
  insert into public.local_lab_model_catalog values ('catalog-permission-probe',repeat('0',64),'probe',false);
  raise exception 'Anonymous INSERT unexpectedly allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.local_lab_model_catalog set enabled=false where id='qwen3:4b';
  raise exception 'Anonymous UPDATE unexpectedly allowed';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.local_lab_model_catalog where id='qwen3:4b';
  raise exception 'Anonymous DELETE unexpectedly allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$
begin
 if (select count(*) from public.local_lab_model_catalog) <> 2 then raise exception 'Authenticated read failed'; end if;
 if has_table_privilege(current_user,'public.local_lab_model_catalog','INSERT')
 or has_table_privilege(current_user,'public.local_lab_model_catalog','UPDATE')
 or has_table_privilege(current_user,'public.local_lab_model_catalog','DELETE')
 or has_table_privilege(current_user,'public.local_lab_model_catalog','TRUNCATE') then
  raise exception 'Authenticated client has write privileges';
 end if;
end $$;
reset role;
rollback;
