-- =====================================================================
-- Systeme de tickets support (bugs, demandes, questions)
-- Utilise depuis : APP admin, APP compta, APP employes (via meme table)
-- Admin unique : tom.picot@gmail.com
-- =====================================================================

-- ─── Table principale ───
CREATE TABLE IF NOT EXISTS public.tickets (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_source TEXT NOT NULL CHECK (app_source IN ('admin', 'employes', 'compta')),
  user_email TEXT NOT NULL,
  user_name TEXT,
  type TEXT NOT NULL CHECK (type IN ('bug', 'demande', 'question')),
  title TEXT NOT NULL,
  description TEXT,
  screenshots TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ouvert' CHECK (status IN ('ouvert', 'en_cours', 'resolu', 'ferme')),
  admin_response TEXT,
  admin_responded_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tickets_user_email_idx ON public.tickets(user_email);
CREATE INDEX IF NOT EXISTS tickets_app_source_idx ON public.tickets(app_source);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON public.tickets(status);
CREATE INDEX IF NOT EXISTS tickets_created_at_idx ON public.tickets(created_at DESC);

-- Trigger auto-update de updated_at
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

-- ─── Row Level Security ───
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Politique : chacun voit ses propres tickets
DROP POLICY IF EXISTS tickets_select_own ON public.tickets;
CREATE POLICY tickets_select_own
  ON public.tickets
  FOR SELECT
  USING (
    user_email = (auth.jwt() ->> 'email')
    OR (auth.jwt() ->> 'email') = 'tom.picot@gmail.com'  -- Admin voit tout
  );

-- Politique : chacun peut creer un ticket avec son propre email
DROP POLICY IF EXISTS tickets_insert_own ON public.tickets;
CREATE POLICY tickets_insert_own
  ON public.tickets
  FOR INSERT
  WITH CHECK (
    user_email = (auth.jwt() ->> 'email')
    OR user_email IS NOT NULL  -- Permet aussi les auth anonymes avec email fourni
  );

-- Politique : seul l'admin peut UPDATE (repondre, changer statut)
DROP POLICY IF EXISTS tickets_update_admin ON public.tickets;
CREATE POLICY tickets_update_admin
  ON public.tickets
  FOR UPDATE
  USING ((auth.jwt() ->> 'email') = 'tom.picot@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'tom.picot@gmail.com');

-- Politique : seul l'admin peut DELETE
DROP POLICY IF EXISTS tickets_delete_admin ON public.tickets;
CREATE POLICY tickets_delete_admin
  ON public.tickets
  FOR DELETE
  USING ((auth.jwt() ->> 'email') = 'tom.picot@gmail.com');

-- ─── Bucket Storage pour les screenshots ───
-- (a executer via l'UI Supabase si SQL Storage indisponible :
--  Storage > New bucket > name=tickets_screenshots, public=false)
INSERT INTO storage.buckets (id, name, public)
VALUES ('tickets_screenshots', 'tickets_screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- Policies Storage : lecture publique (bucket public), upload authentifie
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

COMMENT ON TABLE public.tickets IS 'Tickets de support (bugs, demandes, questions) soumis depuis APP admin, employes, compta.';
