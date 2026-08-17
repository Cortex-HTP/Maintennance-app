-- ============================================================================
--  Synchronisation automatique du statut des demandes d'intervention
--  BASE : WALLIS-LABEL  (tfmnmzyetybaeygughcs)   /!\  PAS la base Cortex
-- ============================================================================
--  Objectif : quand une intervention CREEE DEPUIS une demande d'intervention
--  change de statut, la demande suit automatiquement :
--
--    intervention planifie          -> demande planifiee
--    intervention en_cours          -> demande en_cours
--    intervention pieces_attente    -> demande en_cours
--    intervention termine           -> demande terminee
--    intervention rejetee / annulee -> demande refusee
--    intervention pas_fait / demande_attente -> demande planifiee
--
--  Si l'intervention liee est SUPPRIMEE, la demande repasse en "soumis"
--  (elle redevient a traiter), sauf si elle etait deja refusee.
--
--  Le lien est pose par l'app admin au moment du clic "Planifier" (colonne
--  interventions.demande_id). Le trigger tourne en base : il couvre TOUTES
--  les origines de mise a jour (app admin, endpoints, SQL manuel).
--  Idempotent : re-executable sans risque.
-- ============================================================================

-- 1) Colonne de liaison intervention -> demande
ALTER TABLE interventions
  ADD COLUMN IF NOT EXISTS demande_id bigint REFERENCES demandes_intervention(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_interventions_demande_id
  ON interventions(demande_id) WHERE demande_id IS NOT NULL;

-- 2) Fonction de synchro statut (SECURITY DEFINER : la mise a jour de la
--    demande passe meme si la RLS de demandes_intervention est restrictive
--    pour le role qui modifie l'intervention)
CREATE OR REPLACE FUNCTION sync_statut_demande_intervention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nouveau text;
BEGIN
  IF NEW.demande_id IS NULL THEN
    RETURN NEW;
  END IF;
  nouveau := CASE NEW.statut
    WHEN 'planifie'        THEN 'planifiee'
    WHEN 'en_cours'        THEN 'en_cours'
    WHEN 'pieces_attente'  THEN 'en_cours'
    WHEN 'termine'         THEN 'terminee'
    WHEN 'rejetee'         THEN 'refusee'
    WHEN 'annulee'         THEN 'refusee'
    WHEN 'pas_fait'        THEN 'planifiee'
    WHEN 'demande_attente' THEN 'planifiee'
    ELSE NULL
  END;
  IF nouveau IS NOT NULL THEN
    UPDATE demandes_intervention
    SET statut = nouveau
    WHERE id = NEW.demande_id
      AND statut IS DISTINCT FROM nouveau;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_statut_demande ON interventions;
CREATE TRIGGER trg_sync_statut_demande
AFTER INSERT OR UPDATE OF statut, demande_id ON interventions
FOR EACH ROW
EXECUTE FUNCTION sync_statut_demande_intervention();

-- 3) Suppression de l'intervention liee : la demande redevient "soumis"
CREATE OR REPLACE FUNCTION sync_statut_demande_intervention_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.demande_id IS NOT NULL THEN
    UPDATE demandes_intervention
    SET statut = 'soumis'
    WHERE id = OLD.demande_id
      AND statut <> 'refusee';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_statut_demande_delete ON interventions;
CREATE TRIGGER trg_sync_statut_demande_delete
AFTER DELETE ON interventions
FOR EACH ROW
EXECUTE FUNCTION sync_statut_demande_intervention_delete();

-- 4) Controle : doit renvoyer les 2 triggers
SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'interventions'::regclass
  AND tgname LIKE 'trg_sync_statut_demande%';
