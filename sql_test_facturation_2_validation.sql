-- ============================================================
-- BASE : WALLIS-LABEL (tfmnmzyetybaeygughcs) - PAS Cosmo !
-- TEST facturation, ETAPE 2 : validation client du releve TEST TEST
-- creee DIRECTEMENT au statut 'valide' (comme si le client avait
-- signe), pour que le releve apparaisse dans l'app Facturation
-- sans passer par l'envoi email + signature.
-- Prerequis : sql_test_facturation.sql deja execute (chantier + rapport).
-- ============================================================

insert into validations_recap_mensuel
  (chantier_id, periode_debut, periode_fin, libelle, destinataire_email,
   statut, snapshot, sent_at, validated_at, validataire_nom, validataire_email,
   imputation, bon_commande)
select
  c.id, '2026-08-26', '2026-09-25',
  'Releve TEST TEST - Du 26/08/2026 au 25/09/2026',
  'test@test.nc',
  'valide',
  '{"lignes": [{"date": "2026-09-22", "machines": "TEST", "metrage": 100, "heures": 9.5, "attente": 1.5}],
    "totaux": {"metrage": 100, "heures": 9.5, "attente": 1.5},
    "signataires": [{"email": "test@test.nc", "nom": "TESTEUR CLIENT"}],
    "signatairesSansEmail": []}'::jsonb,
  now(), now(), 'TESTEUR CLIENT', 'test@test.nc',
  '{"bc": "BC-TEST-001", "par": "TESTEUR CLIENT", "le": "2026-09-23",
    "buckets": [
      {"label": "AIRCORE Preex", "volume_m": 50, "compte": "622999", "montant": 250000},
      {"label": "MFT Preex",     "volume_m": 40, "compte": "622998", "montant": 240000}
    ],
    "attente": {"heures": 1.5, "compte": "622997", "montant": 65250}}'::jsonb,
  'BC-TEST-001'
from chantiers c
where c.titre = 'TEST TEST'
  and not exists (
    select 1 from validations_recap_mensuel v
    where v.chantier_id = c.id and v.periode_debut = '2026-08-26'
  );

-- Verification : la validation doit sortir en statut 'valide'
select id, chantier_id, periode_debut, periode_fin, statut, bon_commande, validated_at
from validations_recap_mensuel v
where v.chantier_id in (select id from chantiers where titre = 'TEST TEST');

-- ============================================================
-- NETTOYAGE apres le test : le bloc de sql_test_facturation.sql
-- supprime aussi cette validation (delete from validations_recap_mensuel...).
-- ============================================================
