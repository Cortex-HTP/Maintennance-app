-- ═══ Correction : contrat historique de GUY STUART type CDI -> CDD ═══
-- Base : Supabase WALLIS-LABEL (tfmnmzyetybaeygughcs) - PAS Cosmo/Cortex.
--
-- Contexte (2026-11-03) : le premier contrat archive de Guy Stuart
-- (26/08/2026 -> 25/09/2026, archive dans contratsHistorique lors de la
-- re-embauche) est type "CDI" alors que c'etait un CDD. Consequence : le
-- badge "CDD total" de la liste Personnel ignore ce mois-la.
-- Le personnel est stocke en JSON dans parametres.valeur
-- (categorie = 'personnel_data') : on corrige UNIQUEMENT ce champ,
-- sans toucher au reste du blob.

-- 1) VERIFIER AVANT : doit retourner une ligne avec typeContrat = CDI
SELECT ct->>'typeContrat' AS type_actuel,
       ct->>'dateEmbauche' AS debut,
       ct->>'dateFinContrat' AS fin
FROM parametres,
     jsonb_array_elements(valeur::jsonb) AS emp,
     jsonb_array_elements(emp->'contratsHistorique') AS ct
WHERE categorie = 'personnel_data'
  AND emp->>'nom' = 'STUART' AND emp->>'prenom' = 'GUY'
  AND ct->>'dateEmbauche' = '2026-08-26';

-- 2) CORRIGER : passe ce contrat historique en CDD
UPDATE parametres
SET valeur = (
  SELECT jsonb_agg(
    CASE
      WHEN emp->>'nom' = 'STUART' AND emp->>'prenom' = 'GUY' THEN
        jsonb_set(
          emp,
          '{contratsHistorique}',
          (
            SELECT jsonb_agg(
              CASE WHEN ct->>'dateEmbauche' = '2026-08-26'
                   THEN jsonb_set(ct, '{typeContrat}', '"CDD"')
                   ELSE ct
              END
              ORDER BY ord
            )
            FROM jsonb_array_elements(emp->'contratsHistorique')
                 WITH ORDINALITY AS h(ct, ord)
          )
        )
      ELSE emp
    END
    ORDER BY ord2
  )::text
  FROM jsonb_array_elements(valeur::jsonb) WITH ORDINALITY AS e(emp, ord2)
)
WHERE categorie = 'personnel_data';

-- 3) VERIFIER APRES : type_actuel doit maintenant etre CDD
SELECT ct->>'typeContrat' AS type_actuel,
       ct->>'dateEmbauche' AS debut,
       ct->>'dateFinContrat' AS fin
FROM parametres,
     jsonb_array_elements(valeur::jsonb) AS emp,
     jsonb_array_elements(emp->'contratsHistorique') AS ct
WHERE categorie = 'personnel_data'
  AND emp->>'nom' = 'STUART' AND emp->>'prenom' = 'GUY'
  AND ct->>'dateEmbauche' = '2026-08-26';
