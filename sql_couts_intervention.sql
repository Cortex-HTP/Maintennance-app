-- ═══════════════════════════════════════════════════════════════════
-- AJOUT : 4 montants pour suivre les frais d'intervention
-- A executer dans Supabase Dashboard > SQL Editor
-- IDEMPOTENT : peut etre relance sans casser
-- ═══════════════════════════════════════════════════════════════════
--
-- Permet au mecanicien de declarer les frais engages pendant l'intervention
-- dans 4 categories. Le total des frais sera additionne aux heures pour
-- obtenir le cout reel de l'intervention.

ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS cout_divers       NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS cout_consommable  NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS cout_essence      NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS cout_pieces       NUMERIC(12,2) DEFAULT 0;

-- Verification
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'interventions'
  AND column_name IN ('cout_divers', 'cout_consommable', 'cout_essence', 'cout_pieces')
ORDER BY column_name;
