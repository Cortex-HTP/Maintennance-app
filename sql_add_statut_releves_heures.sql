-- ═══════════════════════════════════════════════════════════════════
-- Migration : ajout colonne statut sur releves_heures
-- Objectif : permettre validation admin (en_attente → valide_admin / refuse)
-- ═══════════════════════════════════════════════════════════════════

-- 1) Ajout de la colonne statut (defaut en_attente)
ALTER TABLE releves_heures
  ADD COLUMN IF NOT EXISTS statut text DEFAULT 'en_attente';

-- 2) Ajout du timestamp de validation (pour traceabilite + badge "non vu" cote employes)
ALTER TABLE releves_heures
  ADD COLUMN IF NOT EXISTS valide_at timestamptz;

-- 3) Contrainte CHECK sur les valeurs possibles
ALTER TABLE releves_heures
  DROP CONSTRAINT IF EXISTS releves_heures_statut_check;
ALTER TABLE releves_heures
  ADD CONSTRAINT releves_heures_statut_check
  CHECK (statut IN ('en_attente', 'valide_admin', 'refuse'));

-- 4) Tous les releves DEJA existants sont consideres valides (deja envoyes par email,
--    donc le responsable les a deja vus). Sinon ca demanderait une revalidation manuelle
--    de l'historique complet.
UPDATE releves_heures
  SET statut = 'valide_admin',
      valide_at = COALESCE(envoye_at, created_at, NOW())
  WHERE statut IS NULL OR statut = 'en_attente';

-- Verification
SELECT statut, COUNT(*) FROM releves_heures GROUP BY statut;
