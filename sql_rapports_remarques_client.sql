-- =====================================================================
-- Ajoute la colonne remarques_client sur rapports_forage pour permettre
-- au client de saisir un commentaire libre lors de la signature ou de la
-- demande de modification (sign.html cote APP Employes).
-- =====================================================================

ALTER TABLE public.rapports_forage
  ADD COLUMN IF NOT EXISTS remarques_client text;

COMMENT ON COLUMN public.rapports_forage.remarques_client IS
  'Commentaire libre du client signataire (saisi via sign.html). Optionnel.';
