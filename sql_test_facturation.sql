-- ============================================================
-- BASE : WALLIS-LABEL (tfmnmzyetybaeygughcs) - PAS Cosmo !
-- TEST du module de facturation : chantier "TEST TEST" + rapport
-- du 22/09/2026 avec aircore a 5000 F/m, MFT a 6000 F/m,
-- activites facturables ET non facturables, et un sondage
-- marque NON FACTURABLE (exclu du metrage facturable).
--
-- Resultats attendus dans la validation / facturation :
--   Metrage facturable : 90 m (50 m AIRCORE + 40 m MFT)
--     -> 50 x 5000 = 250 000 F  +  40 x 6000 = 240 000 F = 490 000 F
--   Sondage TEST-NF (10 m, commentaire NON FACTURABLE) : exclu
--   ATTENTE CLIENT 1,5 h x 43 500 F/h = 65 250 F (facturable)
--   FORATION 6 h : activite facturable / TRAJET + MAINTENANCE : non facturables
-- ============================================================

with ch as (
  insert into chantiers
    (titre, site, client, statut, date_debut, date_fin, metrage,
     prix_metre, prix_metre_par_type, prix_attente, jour_cloture_facturation)
  values
    ('TEST TEST', 'TEST TEST', 'TEST', 'En cours', '2026-09-01', '2026-09-30', 0,
     5000, '{"AIRCORE": 5000, "MFT": 6000}'::jsonb, 43500, 25)
  returning id
)
insert into rapports_forage
  (date_rapport, sondeuse_code, chantier_id, client, lieu, quart,
   equipe, horametre, sondages, activites,
   remarques, controles_ok, total_metres, total_heures, personnel_id,
   statut, non_productif)
select
  '2026-09-22', 'TEST', ch.id, 'TEST', 'TEST TEST', 'jour',
  '[{"id": "ptest", "nom": "TEST SONDEUR", "role": "Sondeur", "hours": "09:30", "isSondeur": true}]'::jsonb,
  '[{"debut": "100", "fin": "109"}]'::jsonb,
  '[
     {"num": "TEST-A1", "type": "AIRCORE", "de": 0, "a": 30, "angle": "90", "obs": "", "commentaire": "", "expanded": false},
     {"num": "TEST-A2", "type": "AIRCORE", "de": 0, "a": 20, "angle": "90", "obs": "", "commentaire": "", "expanded": false},
     {"num": "TEST-M1", "type": "MFT",     "de": 0, "a": 40, "angle": "90", "obs": "", "commentaire": "", "expanded": false},
     {"num": "TEST-NF", "type": "AIRCORE", "de": 0, "a": 10, "angle": "90", "obs": "", "commentaire": "NON FACTURABLE - test module facturation", "expanded": false}
   ]'::jsonb,
  '[
     {"libelle": "TRAJET",         "debut": "06:00", "fin": "07:00", "expanded": false},
     {"libelle": "ATTENTE CLIENT", "debut": "07:00", "fin": "08:30", "expanded": false},
     {"libelle": "FORATION",       "debut": "08:30", "fin": "14:30", "expanded": false},
     {"libelle": "MAINTENANCE",    "debut": "14:30", "fin": "15:30", "expanded": false}
   ]'::jsonb,
  'Rapport de TEST du module de facturation - A SUPPRIMER apres le test',
  true, 100, 570, 999999001,
  'valide_admin', false
from ch;

-- Verification : le rapport et le chantier de test
select r.id as rapport_id, r.date_rapport, r.lieu, r.total_metres, c.id as chantier_id, c.prix_metre_par_type
from rapports_forage r join chantiers c on c.id = r.chantier_id
where c.titre = 'TEST TEST';

-- ============================================================
-- NETTOYAGE apres le test (decommenter et executer) :
-- delete from validations_recap_mensuel where chantier_id in (select id from chantiers where titre = 'TEST TEST');
-- delete from rapports_forage where lieu = 'TEST TEST';
-- delete from chantiers where titre = 'TEST TEST';
-- ============================================================
