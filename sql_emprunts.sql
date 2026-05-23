-- ═══════════════════════════════════════════════════════════════════
-- SETUP UNIQUE (a executer une seule fois) : fonction exec_sql pour
-- permettre l'execution de SQL DDL via l'API REST avec service_role.
-- Cette fonction permet aux outils tiers (Claude) de gerer les migrations
-- sans passer par le Studio manuellement.
-- SECURITE : reservee a service_role (revoquee de tout autre role).
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE query;
  RETURN jsonb_build_object('status', 'ok');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM, 'state', SQLSTATE);
END;
$$;

REVOKE ALL ON FUNCTION public.exec_sql(text) FROM public;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM anon;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════
-- Table emprunts : suivi des prets bancaires sur les machines/equipements
-- ═══════════════════════════════════════════════════════════════════
--
-- Les emprunts sont mutualises au prorata sur toutes les machines actives
-- du mois (peu importe l'emprunt initial). L'imputation se fait par jour
-- ouvre Lun-Jeu (meme logique que les salaires).
--
-- mensualite : calculee automatiquement cote app (montant + taux + duree),
--              ou saisie manuellement.
-- statut     : 'actif' (impute au cout) | 'rembourse' (termine) | 'suspendu'

CREATE TABLE IF NOT EXISTS public.emprunts (
  id BIGSERIAL PRIMARY KEY,
  libelle TEXT NOT NULL,
  montant_total NUMERIC NOT NULL DEFAULT 0,
  taux_interet NUMERIC NOT NULL DEFAULT 0,         -- en % annuel
  duree_mois INTEGER NOT NULL DEFAULT 0,
  mensualite NUMERIC NOT NULL DEFAULT 0,           -- XPF/mois
  date_debut DATE,
  date_fin DATE,
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'rembourse', 'suspendu')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emprunts_statut ON public.emprunts(statut);
CREATE INDEX IF NOT EXISTS idx_emprunts_periode ON public.emprunts(date_debut, date_fin);

ALTER TABLE public.emprunts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.emprunts;
DROP POLICY IF EXISTS "Allow all for anon" ON public.emprunts;
CREATE POLICY "Allow all for authenticated" ON public.emprunts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON public.emprunts FOR ALL TO anon USING (true) WITH CHECK (true);

-- Trigger updated_at automatique
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emprunts_updated_at ON public.emprunts;
CREATE TRIGGER trg_emprunts_updated_at BEFORE UPDATE ON public.emprunts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
