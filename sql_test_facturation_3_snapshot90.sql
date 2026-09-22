-- ============================================================
-- BASE : WALLIS-LABEL (tfmnmzyetybaeygughcs) - PAS Cosmo !
-- TEST facturation, ETAPE 3 : recale le snapshot FIGE de la
-- validation TEST TEST sur le metrage FACTURABLE (90 m au lieu
-- de 100) + ajoute les ventilations par type et par activite
-- que le vrai serveur fige desormais (base de la facture Cortex).
-- ============================================================

update validations_recap_mensuel
set snapshot = jsonb_set(
                 jsonb_set(snapshot, '{lignes,0,metrage}', '90'),
                 '{totaux}',
                 '{"metrage": 90, "heures": 9.5, "attente": 1.5,
                   "metrage_par_type": {"AIRCORE": 50, "MFT": 40},
                   "activites_facturables": {"ATTENTE CLIENT": 1.5, "FORATION": 6}}'::jsonb
               )
where chantier_id in (select id from chantiers where titre = 'TEST TEST');

-- Verification
select id, statut, snapshot->'totaux' as totaux
from validations_recap_mensuel
where chantier_id in (select id from chantiers where titre = 'TEST TEST');
