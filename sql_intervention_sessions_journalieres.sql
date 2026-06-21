-- ═══════════════════════════════════════════════════════════════════
-- Ajout colonne sessions_journalieres (jsonb) sur public.interventions
-- Permet au mecanicien sous-traitant de saisir au fil de l'eau les
-- heures travaillees jour par jour, sans attendre la cloture de
-- l'intervention. Chaque session = une "tranche" de travail datee.
--
-- Format jsonb : [
--   { "date": "2026-06-20", "heures": 4.5, "taux": 7000, "label": "Diagnostic", "note": "Demonte radiateur" },
--   { "date": "2026-06-21", "heures": 6,   "taux": 7000, "label": "Reparation", "note": "Soudure faite" },
--   ...
-- ]
--
-- Le champ duree_heures reste la SOMME (recalcule a chaque session) et
-- taux_horaire_applique la moyenne ponderee - donc les ecrans actuels
-- (KPIs Mecaniciens, total facturable) continuent de fonctionner sans
-- changement.
--
-- Coexistence avec taux_applique_lignes :
--   - sessions_journalieres = decoupage TEMPOREL (par jour)
--   - taux_applique_lignes  = decoupage TYPOLOGIQUE (par prestation, dans la meme session)
--
-- A executer dans Supabase Dashboard > SQL Editor. IDEMPOTENT.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.interventions
  ADD COLUMN IF NOT EXISTS sessions_journalieres jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_interventions_sessions_not_empty
  ON public.interventions (id)
  WHERE jsonb_array_length(COALESCE(sessions_journalieres, '[]'::jsonb)) > 0;

-- Verification
SELECT
  'Avec sessions journalieres' AS info,
  COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(sessions_journalieres, '[]'::jsonb)) > 0) AS n_avec,
  COUNT(*) AS n_total
FROM public.interventions;
