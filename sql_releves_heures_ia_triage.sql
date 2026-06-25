-- =====================================================================
-- Ajoute une colonne 'ia_triage' (jsonb) sur la table releves_heures
-- pour stocker le verdict de l'analyse IA :
-- {
--   verdict: "ok" | "review" | "alert",
--   confidence: 0.0-1.0,
--   summary: "1 phrase courte",
--   flags: [{type: "pause_longue", description: "..."}],
--   analyzed_at: "2026-06-25T08:00:00Z",
--   model: "claude-haiku-4-5-20251001"
-- }
-- NULL = pas encore analyse (declenche un nouveau appel API)
-- =====================================================================

ALTER TABLE public.releves_heures
  ADD COLUMN IF NOT EXISTS ia_triage jsonb;

-- Index pour requeter rapidement les "a analyser"
CREATE INDEX IF NOT EXISTS idx_releves_heures_ia_triage_null
  ON public.releves_heures ((ia_triage IS NULL));

-- Index pour filtrer rapidement par verdict
CREATE INDEX IF NOT EXISTS idx_releves_heures_ia_verdict
  ON public.releves_heures ((ia_triage->>'verdict'))
  WHERE ia_triage IS NOT NULL;
