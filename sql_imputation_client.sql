-- ============================================================
-- Imputation client apres validation du releve mensuel
-- Base : WALLIS-LABEL (tfmnmzyetybaeygughcs) - PAS Cosmo !
-- A executer dans Supabase > SQL Editor
-- ============================================================
-- 1) Drapeau PAR CHANTIER : active l ecran d imputation (numeros de compte,
--    repartition Preex/Planif PAR FAMILLE de forage reellement foree :
--    AIRCORE, MFT, CAROTTE, RC...) montre au client juste apres sa
--    validation du releve. Desactive par defaut. Le BON DE COMMANDE, lui,
--    est demande a TOUTES les validations (colonne bon_commande ci-dessous).
alter table chantiers
  add column if not exists imputation_client boolean not null default false;

-- 2) Imputation saisie par le client, stockee sur la validation :
--    { bc, buckets: [{code, label, volume_m, compte, prix, montant}...],
--      attente: {heures, compte, prix, montant}, par, le }
alter table validations_recap_mensuel
  add column if not exists imputation jsonb;

-- 3) Bon de commande client : demande PAR DEFAUT a toute validation
--    (tous chantiers, optionnel), repris/complete par l'ecran d'imputation.
alter table validations_recap_mensuel
  add column if not exists bon_commande text;

-- Activation (exemple TIEBAGHI) :
-- update chantiers set imputation_client = true where id = 2;
-- Verification :
-- select id, titre, imputation_client from chantiers order by id;
