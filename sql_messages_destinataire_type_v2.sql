-- =====================================================================
-- Messages : colonnes destinataire_type + destinataire_id (v2 idempotent)
-- =====================================================================
-- Contexte : l'app admin envoie des messages avec :
--   - destinataire_type ('all' / 'sondeurs' / 'mecaniciens' / 'individuel')
--   - destinataire_id (bigint) : uniquement pour les messages 'individuel'
-- v1 supposait que destinataire_id existait deja -> UPDATE echouait si absente.
-- v2 : ADD COLUMN IF NOT EXISTS pour les 2 colonnes, puis backfill.
-- =====================================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS destinataire_type text DEFAULT 'all';

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS destinataire_id bigint;

-- Backfill : messages existants -> 'individuel' si destinataire_id renseigne,
-- sinon 'all' (broadcast retrocompat).
UPDATE public.messages
SET destinataire_type = CASE WHEN destinataire_id IS NOT NULL THEN 'individuel' ELSE 'all' END
WHERE destinataire_type IS NULL;

-- Index sur destinataire_type (filtre broadcast par role)
CREATE INDEX IF NOT EXISTS idx_messages_dest_type ON public.messages(destinataire_type);

-- Index sur destinataire_id (recherche messages individuels)
CREATE INDEX IF NOT EXISTS idx_messages_dest_id ON public.messages(destinataire_id);

-- Verification
SELECT destinataire_type, COUNT(*) AS n
FROM public.messages
GROUP BY destinataire_type
ORDER BY n DESC;
