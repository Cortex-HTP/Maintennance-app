-- ============================================================================
-- Signature des documents RH via l'app Employes (telephone OU tablette du
-- responsable designe)
-- Base : WALLIS-LABEL (tfmnmzyetybaeygughcs) - PAS Cortex
-- ============================================================================
-- rh_documents.remis_via : code personnel du RESPONSABLE dont la tablette
--   recoit le document a faire signer (null = app de l'employe lui-meme)
-- rh_signatures.signer_nom : nom de l'employe qui a signe (l'interesse)
-- rh_signatures.signed_via / signed_via_nom : tracabilite quand la signature
--   a eu lieu sur la tablette d'un responsable
-- ============================================================================

alter table public.rh_documents  add column if not exists remis_via text;
alter table public.rh_signatures add column if not exists signer_nom text;
alter table public.rh_signatures add column if not exists signed_via text;
alter table public.rh_signatures add column if not exists signed_via_nom text;

-- Verification colonnes
select column_name from information_schema.columns
where table_name = 'rh_signatures' order by ordinal_position;

-- ─── Verification securite (lecture seule, rien a modifier) ───
-- Attendu : rowsecurity = true sur les 2 tables, et aucune policy pour anon.
-- (Controle deja fait de l'exterieur : la cle anon ne lit RIEN sur ces tables
-- et le bucket rh-documents n'est pas public — ces requetes confirment.)
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('rh_documents', 'rh_signatures');

select tablename, policyname, roles, cmd from pg_policies
where tablename in ('rh_documents', 'rh_signatures') order by tablename;
