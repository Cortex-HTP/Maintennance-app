-- ═══════════════════════════════════════════════════════════════════
-- Ajout colonne taux_applique_lignes (jsonb) sur public.interventions
-- Permet aux mecaniciens sous-traitants de detailler leur facturation par
-- prestation (chaque ligne = un taux + heures). Le total facturable reste
-- accessible via duree_heures (somme) et taux_horaire_applique (moyenne
-- ponderee), donc les ecrans actuels continuent de fonctionner.
--
-- Format jsonb : [{ "label": "Diagnostic", "taux": 7000, "heures": 1.5 }, ...]
--
-- A executer dans Supabase Dashboard > SQL Editor. IDEMPOTENT.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.interventions
  ADD COLUMN IF NOT EXISTS taux_applique_lignes jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_interventions_taux_lignes_not_empty
  ON public.interventions (id)
  WHERE jsonb_array_length(COALESCE(taux_applique_lignes, '[]'::jsonb)) > 0;

-- Verification
SELECT
  'Avec breakdown' AS info,
  COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(taux_applique_lignes, '[]'::jsonb)) > 0) AS n_avec,
  COUNT(*) AS n_total
FROM public.interventions;
