-- ============================================================================
--  Reparation des total_metres incoherents avec les sondages
--  BASE : WALLIS-LABEL  (tfmnmzyetybaeygughcs)   /!\  PAS la base Cortex
-- ============================================================================
--  Cas constate : rapport 210 (FS1 du 11/08) stocke total_metres = 0 alors que
--  ses sondages somment 50 m (26->56 + 0->20). Le detail affichait "0 m".
--  Ce script recalcule total_metres = SOMME max(0, a - de) des sondages, pour
--  tous les rapports NON non-productifs dont le total stocke devie de plus de
--  0,1 m du total recalcule.
--
--  1) D'abord un APERCU (aucune modification) : controle ce qui va changer.
-- ============================================================================

WITH recalcul AS (
  SELECT r.id,
         r.date_rapport,
         r.sondeuse_code,
         r.total_metres AS total_stocke,
         ROUND(COALESCE((
           SELECT SUM(GREATEST(0, COALESCE((s->>'a')::numeric, 0) - COALESCE((s->>'de')::numeric, 0)))
           FROM jsonb_array_elements(COALESCE(r.sondages, '[]'::jsonb)) AS s
         ), 0)::numeric, 1) AS total_calcule
  FROM rapports_forage r
  WHERE COALESCE(r.non_productif, false) = false
)
SELECT id, date_rapport, sondeuse_code, total_stocke, total_calcule
FROM recalcul
WHERE ABS(COALESCE(total_stocke, 0) - total_calcule) > 0.1
ORDER BY date_rapport DESC;

-- ============================================================================
--  2) La CORRECTION (execute-la apres avoir verifie l'apercu ci-dessus).
--     Idempotente : re-executable sans risque.
-- ============================================================================

WITH recalcul AS (
  SELECT r.id,
         ROUND(COALESCE((
           SELECT SUM(GREATEST(0, COALESCE((s->>'a')::numeric, 0) - COALESCE((s->>'de')::numeric, 0)))
           FROM jsonb_array_elements(COALESCE(r.sondages, '[]'::jsonb)) AS s
         ), 0)::numeric, 1) AS total_calcule
  FROM rapports_forage r
  WHERE COALESCE(r.non_productif, false) = false
)
UPDATE rapports_forage r
SET total_metres = c.total_calcule
FROM recalcul c
WHERE r.id = c.id
  AND ABS(COALESCE(r.total_metres, 0) - c.total_calcule) > 0.1
RETURNING r.id, r.date_rapport, r.sondeuse_code, r.total_metres AS nouveau_total;
