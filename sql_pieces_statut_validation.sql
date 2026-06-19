-- ═══════════════════════════════════════════════════════════════════
-- Ajout colonne statut_validation sur public.pieces
-- Permet aux mecaniciens (depuis l'APP Employes) d'ajouter une nouvelle
-- piece en saisie libre avec statut 'en_attente'. L'admin valide ou refuse
-- depuis EcranPieces > onglet "En attente".
--
-- A executer dans Supabase Dashboard > SQL Editor.
-- IDEMPOTENT.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.pieces
  ADD COLUMN IF NOT EXISTS statut_validation text DEFAULT 'actif';

-- Toutes les pieces existantes sont considerees comme validees
UPDATE public.pieces SET statut_validation = 'actif' WHERE statut_validation IS NULL;

CREATE INDEX IF NOT EXISTS idx_pieces_statut_validation ON public.pieces(statut_validation);

-- Verification : compte des pieces par statut
SELECT statut_validation, COUNT(*) AS n FROM public.pieces GROUP BY statut_validation ORDER BY n DESC;
