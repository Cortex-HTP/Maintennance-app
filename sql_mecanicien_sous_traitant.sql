-- ═══════════════════════════════════════════════════════════════════
-- Migration : Acces sous-traitant mecanicien
-- A executer dans Supabase Dashboard > SQL Editor
-- IDEMPOTENT : peut etre relance sans casser
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. EXTENSION TABLE interventions ──────────────────────────────
-- Colonnes pour gerer les demandes mecanicien + suivi + facturation

ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS mecanicien_code TEXT;
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS source TEXT;  -- 'admin' ou 'mecanicien'
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS description_probleme TEXT;
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS duree_heures NUMERIC(6,2);
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS pieces_utilisees JSONB;
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS photos JSONB;
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS taux_horaire_applique NUMERIC(10,2);
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS urgence TEXT;  -- 'normale', 'elevee', 'urgente'
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS date_demande TIMESTAMPTZ;
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS valide_par TEXT;  -- email admin qui a valide
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS valide_le TIMESTAMPTZ;
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS rejete_motif TEXT;

-- Index pour requetes frequentes
CREATE INDEX IF NOT EXISTS idx_interventions_mecanicien_code ON public.interventions(mecanicien_code);
CREATE INDEX IF NOT EXISTS idx_interventions_statut ON public.interventions(statut);
CREATE INDEX IF NOT EXISTS idx_interventions_source ON public.interventions(source);

-- ─── 2. AUDIT HISTORIQUE des modifications d'intervention ──────────
-- Permet de tracer qui a fait quoi et quand (validation, rejet, edit)

CREATE TABLE IF NOT EXISTS public.interventions_audit (
  id BIGSERIAL PRIMARY KEY,
  intervention_id UUID REFERENCES public.interventions(id) ON DELETE CASCADE,
  action TEXT NOT NULL,  -- 'creation', 'modification', 'validation', 'rejet', 'soumission_rapport', 'annulation'
  ancien_statut TEXT,
  nouveau_statut TEXT,
  acteur_type TEXT,      -- 'admin', 'mecanicien'
  acteur_id TEXT,        -- email pour admin, code pour mecanicien
  acteur_nom TEXT,
  details JSONB,         -- snapshot des champs modifies / motif
  cree_le TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interventions_audit_intervention ON public.interventions_audit(intervention_id);
CREATE INDEX IF NOT EXISTS idx_interventions_audit_acteur ON public.interventions_audit(acteur_id);
CREATE INDEX IF NOT EXISTS idx_interventions_audit_date ON public.interventions_audit(cree_le DESC);

-- ─── 3. ABONNEMENTS PUSH (notifications web) ───────────────────────
-- Stocke les push subscriptions des navigateurs (admin + mecanicien)

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  acteur_type TEXT NOT NULL,  -- 'admin', 'mecanicien'
  acteur_id TEXT NOT NULL,    -- email pour admin, code pour mecanicien
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  cree_le TIMESTAMPTZ DEFAULT NOW(),
  derniere_utilisation TIMESTAMPTZ DEFAULT NOW(),
  actif BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_push_sub_acteur ON public.push_subscriptions(acteur_type, acteur_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_actif ON public.push_subscriptions(actif);

-- ─── 4. RLS POLICIES ────────────────────────────────────────────────
-- IMPORTANT : ces policies controlent qui voit quoi.
-- A revoir si tu utilises deja d'autres policies sur interventions.

-- Activer RLS si pas deja fait (NO-OP si deja active)
ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interventions_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Admin authentifie : tout est accessible
DROP POLICY IF EXISTS "Admin full access interventions" ON public.interventions;
CREATE POLICY "Admin full access interventions" ON public.interventions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin full access audit" ON public.interventions_audit;
CREATE POLICY "Admin full access audit" ON public.interventions_audit
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin full access push" ON public.push_subscriptions;
CREATE POLICY "Admin full access push" ON public.push_subscriptions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Note : les acces mecanicien se font via endpoint API signe avec PIN token,
-- pas via Supabase auth directe. Le SERVICE_KEY est utilise cote serveur
-- (api/* sur Vercel) pour valider le PIN puis filtrer par mecanicien_code.
-- C'est plus securise que des policies RLS sur un mecanicien anonymous.

-- ─── 5. VALEURS POSSIBLES (documentation) ───────────────────────────
-- Pas de constraint stricte pour rester flexible. Voici les valeurs canoniques :
--
-- interventions.statut :
--   - 'demande_attente'  : Demande creee par mecanicien, en attente validation admin
--   - 'planifie'         : Validee/planifiee par admin (ou directement creee admin)
--   - 'en_cours'         : Demarree par mecanicien
--   - 'pieces_attente'   : Mecanicien attend des pieces
--   - 'terminee'         : Rapport soumis et complete
--   - 'rejetee'          : Demande rejetee par admin
--   - 'annulee'          : Annulee (avant validation)
--
-- interventions.source :
--   - 'admin'      : Cree par admin (intervention assignee a un mecanicien)
--   - 'mecanicien' : Demande creee par le mecanicien lui-meme
--
-- interventions.urgence :
--   - 'normale'  : Sous 7 jours
--   - 'elevee'   : Sous 48h
--   - 'urgente'  : Immediate
--
-- pieces_utilisees JSONB format :
--   [{ "reference": "JV40", "designation": "Joint verin 40mm", "qty": 2 },
--    { "designation": "Huile hydraulique ISO 46", "qty": 5, "unite": "L" }]
--
-- photos JSONB format :
--   [{ "url": "https://...", "type": "avant", "uploaded_at": "..." },
--    { "url": "https://...", "type": "apres", "uploaded_at": "..." }]

-- ─── 6. VERIFICATION ────────────────────────────────────────────────

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'interventions'
  AND column_name IN ('mecanicien_code', 'source', 'description_probleme', 'duree_heures',
                      'pieces_utilisees', 'photos', 'taux_horaire_applique', 'urgence',
                      'date_demande', 'valide_par', 'valide_le', 'rejete_motif')
ORDER BY column_name;

SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('interventions_audit', 'push_subscriptions');

-- Doit retourner :
--   12 lignes de colonnes ajoutees sur interventions
--   2 lignes (interventions_audit + push_subscriptions)
