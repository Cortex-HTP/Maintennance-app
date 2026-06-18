-- ═══════════════════════════════════════════════════════════════════
-- FIX RLS : permettre a l'APP Employes (anon role) de lire/ecrire
-- les interventions mecanicien
-- A executer dans Supabase Dashboard > SQL Editor
-- IDEMPOTENT : peut etre relance sans casser
-- ═══════════════════════════════════════════════════════════════════
--
-- CONTEXTE :
-- Le fichier sql_mecanicien_sous_traitant.sql avait active RLS sur
-- interventions/interventions_audit/push_subscriptions avec un acces
-- uniquement pour 'authenticated' (admin Supabase Auth).
--
-- Probleme : l'APP Employes (mecanicien terrain) utilise le rôle 'anon'
-- (pas de login Supabase, juste un PIN). Donc le mecanicien ne pouvait
-- pas voir ses interventions ni soumettre de rapport.
--
-- Solution : ouvrir l'acces 'anon' aux 3 tables, en cohérence avec le
-- reste de l'app (les tables saisies/releves/rapports sont deja ouvertes
-- a 'anon' pour les sondeurs).
--
-- La protection se fait au niveau du PIN et de l'API serverless (push
-- endpoints verifient le token).

-- ─── 1. interventions ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin full access interventions" ON public.interventions;
DROP POLICY IF EXISTS interventions_public_all ON public.interventions;

CREATE POLICY interventions_public_all ON public.interventions
  FOR ALL TO public USING (true) WITH CHECK (true);

-- ─── 2. interventions_audit ────────────────────────────────────────
DROP POLICY IF EXISTS "Admin full access audit" ON public.interventions_audit;
DROP POLICY IF EXISTS interventions_audit_public_all ON public.interventions_audit;

CREATE POLICY interventions_audit_public_all ON public.interventions_audit
  FOR ALL TO public USING (true) WITH CHECK (true);

-- ─── 3. push_subscriptions ─────────────────────────────────────────
DROP POLICY IF EXISTS "Admin full access push" ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_public_all ON public.push_subscriptions;

CREATE POLICY push_subscriptions_public_all ON public.push_subscriptions
  FOR ALL TO public USING (true) WITH CHECK (true);

-- ─── 4. VERIFICATION ────────────────────────────────────────────────
-- Doit retourner 3 lignes (une par table)
SELECT tablename, policyname, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('interventions', 'interventions_audit', 'push_subscriptions')
  AND policyname LIKE '%public%'
ORDER BY tablename;
