-- =====================================================================
-- Snapshot des sondages ORIGINAUX avant une demande de modification client
-- =====================================================================
-- Contexte : quand le client demande une modification via sign.html,
-- le tableau sondages est ECRASE avec les nouvelles valeurs. L'admin
-- perd la vue de ce qui a change.
--
-- Solution : on ajoute une colonne sondages_originaux jsonb qui garde
-- une copie du sondages tel qu'il etait avant la demande de modif.
-- Rempli une seule fois, au premier passage en 'demande_modification'.
-- =====================================================================

ALTER TABLE public.rapports_forage
  ADD COLUMN IF NOT EXISTS sondages_originaux jsonb;

COMMENT ON COLUMN public.rapports_forage.sondages_originaux IS
  'Snapshot des sondages tel que soumis par le sondeur, avant la 1re demande de modification du client. NULL si aucune modif demandee.';
