-- =====================================================================
-- Nettoyage : supprimer les 3 tickets avec type='annotation' et valider
-- la contrainte tickets_type_check (elle etait en NOT VALID depuis v3).
-- =====================================================================

-- 1) Verification avant : combien de lignes vont sauter
SELECT COUNT(*) AS a_supprimer FROM public.tickets WHERE type = 'annotation';

-- 2) Suppression
DELETE FROM public.tickets WHERE type = 'annotation';

-- 3) Re-validation de la contrainte : verifie que TOUTES les lignes respectent
--    maintenant type IN ('bug', 'demande', 'question'). Ideal apres nettoyage.
ALTER TABLE public.tickets VALIDATE CONSTRAINT tickets_type_check;

-- 4) Verification finale
SELECT type, COUNT(*) AS n
FROM public.tickets
GROUP BY type
ORDER BY n DESC;
