-- ============================================================
-- BASE : WALLIS-LABEL (tfmnmzyetybaeygughcs) - PAS Cosmo !
-- TEST facturation, ETAPE 4 (finale) : NETTOYAGE complet du test
-- (validation, rapport et chantier TEST TEST).
-- ============================================================

delete from validations_recap_mensuel
where chantier_id in (select id from chantiers where titre = 'TEST TEST');

delete from rapports_forage where lieu = 'TEST TEST';

delete from chantiers where titre = 'TEST TEST';

-- Verification : les 3 requetes doivent retourner 0 ligne
select 'validations' as t, count(*) from validations_recap_mensuel v
  where v.chantier_id in (select id from chantiers where titre = 'TEST TEST')
union all
select 'rapports', count(*) from rapports_forage where lieu = 'TEST TEST'
union all
select 'chantiers', count(*) from chantiers where titre = 'TEST TEST';

-- NB : si une facture brouillon TEST a ete generee dans l'app
-- Cortex-Facturation, supprime-la depuis l'app elle-meme (bouton
-- poubelle sur la ligne) - elle vit dans l'autre base (Cortex).
