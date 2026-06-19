-- ═══════════════════════════════════════════════════════════════════
-- Ajout colonne destinataire_type sur public.messages
-- Permet de cibler les broadcasts : 'all' (tous), 'sondeurs' (uniquement les
-- responsables sondeurs), 'mecaniciens' (uniquement les mecaniciens),
-- 'individuel' (destinataire_id renseigne).
--
-- A executer dans Supabase Dashboard > SQL Editor. IDEMPOTENT.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS destinataire_type text DEFAULT 'all';

-- Tous les messages existants sont consideres comme broadcast 'all' (compat retro)
UPDATE public.messages SET destinataire_type = COALESCE(destinataire_type,
  CASE WHEN destinataire_id IS NOT NULL THEN 'individuel' ELSE 'all' END
) WHERE destinataire_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_dest_type ON public.messages(destinataire_type);

-- Verification
SELECT destinataire_type, COUNT(*) AS n FROM public.messages GROUP BY destinataire_type ORDER BY n DESC;
