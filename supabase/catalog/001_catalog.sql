-- Run ONCE in an existing user-owned project as its database administrator.
-- Intentionally fails if this name already exists; never adopts unrelated objects.
begin;
create table public.local_lab_model_catalog (
 id text primary key check (length(id) between 1 and 100),
 digest text not null check (digest ~ '^[0-9a-f]{64}$'),
 version text not null check (version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
 enabled boolean not null default true
);
comment on table public.local_lab_model_catalog is 'Local Lab intentionally public reviewed model metadata only. No private inputs, telemetry or jobs.';
alter table public.local_lab_model_catalog enable row level security;
revoke all on public.local_lab_model_catalog from public, anon, authenticated;
grant select on public.local_lab_model_catalog to anon, authenticated;
create policy local_lab_catalog_public_read on public.local_lab_model_catalog
 for select to anon, authenticated using (true);
-- No client write grants or write policies. Admin-only releases must update the
-- whole snapshot in a single transaction, using the same version on every row.
insert into public.local_lab_model_catalog (id,digest,version,enabled) values
 ('qwen3:4b','359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7','2026-10-31-v1',true),
 ('qwen2.5-coder:1.5b','d7372fd828518a4d38b1eb196c673c31a85f2ed302b3d1e406c4c2d1b64a0668','2026-10-31-v1',true);
commit;
