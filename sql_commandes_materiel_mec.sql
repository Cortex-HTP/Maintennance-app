-- ═══════════════════════════════════════════════════════════════════
-- TABLE : commandes_materiel_mec
-- Demandes de commande de materiel/pieces par les mecaniciens sous-traitants
-- en lien avec une intervention qui leur est attribuee.
--
-- A executer dans Supabase Dashboard > SQL Editor.
-- IDEMPOTENT : peut etre relance sans casser.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.commandes_materiel_mec (
  id bigserial PRIMARY KEY,
  intervention_id bigint REFERENCES public.interventions(id) ON DELETE SET NULL,
  mecanicien_code text NOT NULL,
  mecanicien_nom text,
  description text NOT NULL,
  urgence text DEFAULT 'normale',         -- normale, elevee, urgente
  photos text[] DEFAULT '{}',
  statut text DEFAULT 'soumise',          -- soumise, validee, refusee, commandee, livree
  notes_admin text,
  date_creation timestamptz DEFAULT now(),
  date_traitement timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cmd_mat_mec_interv ON public.commandes_materiel_mec(intervention_id);
CREATE INDEX IF NOT EXISTS idx_cmd_mat_mec_statut ON public.commandes_materiel_mec(statut);
CREATE INDEX IF NOT EXISTS idx_cmd_mat_mec_mecanicien ON public.commandes_materiel_mec(mecanicien_code);

ALTER TABLE public.commandes_materiel_mec ENABLE ROW LEVEL SECURITY;

-- L'app mecanicien tourne en role anon (PIN, pas de Supabase Auth)
DROP POLICY IF EXISTS cmd_mat_mec_public ON public.commandes_materiel_mec;
CREATE POLICY cmd_mat_mec_public ON public.commandes_materiel_mec
  FOR ALL TO public USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commandes_materiel_mec TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.commandes_materiel_mec_id_seq TO anon, authenticated;

-- Verification
SELECT 'Table commandes_materiel_mec creee.' AS info,
       (SELECT COUNT(*) FROM public.commandes_materiel_mec) AS n_rows;
