-- =====================================================================
-- Tickets support v2 (idempotent) : ADD COLUMN IF NOT EXISTS pour chaque
-- colonne, au cas ou la table tickets existe deja avec un schema partiel.
-- =====================================================================

-- ─── 1) Table (creee si absente, structure de base minimale) ───
CREATE TABLE IF NOT EXISTS public.tickets (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2) Ajout des colonnes manquantes (idempotent) ───
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS app_source TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS screenshots TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ouvert';
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS admin_response TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS admin_responded_at TIMESTAMPTZ;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- ─── 3) Contraintes CHECK (drop + recreate pour rester idempotent) ───
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_app_source_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_app_source_check CHECK (app_source IN ('admin', 'employes', 'compta'));
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_type_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_type_check CHECK (type IN ('bug', 'demande', 'question'));
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check CHECK (status IN ('ouvert', 'en_cours', 'resolu', 'ferme'));

-- ─── 4) Indexes ───
CREATE INDEX IF NOT EXISTS tickets_user_email_idx ON public.tickets(user_email);
CREATE INDEX IF NOT EXISTS tickets_app_source_idx ON public.tickets(app_source);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON public.tickets(status);
CREATE INDEX IF NOT EXISTS tickets_created_at_idx ON public.tickets(created_at DESC);

-- ─── 5) Trigger updated_at ───
CREATE OR REPLACE FUNCTION public.tickets_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tickets_updated_at ON public.tickets;
CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.tickets_set_updated_at();

-- ─── 6) RLS ───
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tickets_select_own ON public.tickets;
CREATE POLICY tickets_select_own
  ON public.tickets
  FOR SELECT
  USING (
    user_email = (auth.jwt() ->> 'email')
    OR (auth.jwt() ->> 'email') = 'tom.wallislabel@gmail.com'
  );

DROP POLICY IF EXISTS tickets_insert_own ON public.tickets;
CREATE POLICY tickets_insert_own
  ON public.tickets
  FOR INSERT
  WITH CHECK (
    user_email = (auth.jwt() ->> 'email')
    OR user_email IS NOT NULL
  );

DROP POLICY IF EXISTS tickets_update_admin ON public.tickets;
CREATE POLICY tickets_update_admin
  ON public.tickets
  FOR UPDATE
  USING ((auth.jwt() ->> 'email') = 'tom.wallislabel@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'tom.wallislabel@gmail.com');

DROP POLICY IF EXISTS tickets_delete_admin ON public.tickets;
CREATE POLICY tickets_delete_admin
  ON public.tickets
  FOR DELETE
  USING ((auth.jwt() ->> 'email') = 'tom.wallislabel@gmail.com');

-- ─── 7) Bucket Storage screenshots ───
INSERT INTO storage.buckets (id, name, public)
VALUES ('tickets_screenshots', 'tickets_screenshots', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS tickets_screenshots_upload ON storage.objects;
CREATE POLICY tickets_screenshots_upload
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'tickets_screenshots');

DROP POLICY IF EXISTS tickets_screenshots_read ON storage.objects;
CREATE POLICY tickets_screenshots_read
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'tickets_screenshots');

-- ─── 8) Verification ───
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'tickets'
ORDER BY ordinal_position;
