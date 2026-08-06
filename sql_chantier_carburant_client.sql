-- ============================================================================
--  Carburant fourni par le CLIENT — drapeau par chantier
--  BASE : WALLIS-LABEL  (tfmnmzyetybaeygughcs)   /!\  PAS la base Cortex
-- ============================================================================
--  Certains chantiers sont conclus « carburant a la charge du client ».
--  Les equipes continuent de saisir les pleins (suivi de consommation, horametres,
--  detection de derives moteur) mais ces litres ne doivent peser dans AUCUN cout :
--    - cout/m par machine (cards de rentabilite, detail par sondeuse)
--    - cout/m global et seuil de rentabilite
--    - marges et point mort des cartes chantier (Avancement)
--    - page Prix de vente
--    - cout consommables et carburant YTD
--
--  Le drapeau vaut pour TOUT l'historique du chantier : cocher la case recalcule
--  aussi les couts passes de ce chantier (ils baisseront).
--
--  Idempotent : reexecutable sans risque.
-- ============================================================================

ALTER TABLE public.chantiers
  ADD COLUMN IF NOT EXISTS carburant_client boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.chantiers.carburant_client IS
  'true = le carburant du chantier est fourni par le client : les pleins restent saisis mais ne sont pas comptes dans les couts.';

-- Verification
SELECT id, titre, client, statut, carburant_client
FROM public.chantiers
ORDER BY
  CASE statut WHEN 'En cours' THEN 0 WHEN 'A venir' THEN 1 ELSE 2 END,
  titre;
