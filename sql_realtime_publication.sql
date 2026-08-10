-- ============================================================================
--  Temps reel : publier les tables qui pilotent les chiffres
--  BASE : WALLIS-LABEL  (tfmnmzyetybaeygughcs)   /!\  PAS la base Cortex
-- ============================================================================
--  L'app est abonnee au canal "public:wallis-sync", mais Supabase ne diffuse
--  QUE les tables presentes dans la publication `supabase_realtime`. Une table
--  absente = abonnement silencieux : aucun evenement, aucune erreur, l'ecran
--  reste fige. C'est la cause classique d'un tableau qui "ne bouge pas".
--
--  Objectif : quand un chantier est cree ou modifie (ou un engin affecte, un
--  rapport envoye, une compta importee), la tresorerie previsionnelle, le CA
--  projete et les marges se recalculent SANS rechargement.
--
--  Idempotent : reexecutable sans risque.
-- ============================================================================

-- 1) Etat actuel : quelles tables sont deja diffusees ?
SELECT tablename AS tables_deja_publiees
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- 2) Ajout des tables manquantes, une par une et sans echouer si deja presente
DO $$
DECLARE
  t text;
  tables_cibles text[] := ARRAY[
    'chantiers',              -- nouveau chantier / changement de metrage, prix, dates, statut
    'chantier_equipements',   -- planning machines -> previsionnel de metrage
    'rapports_forage',        -- production reelle du jour
    'saisies',                -- avancement saisi a la main
    'ecritures_compta',       -- import FEC -> frais generaux, marges cash, treso
    'consommations_carburant',
    'affectations',
    'paliers_primes',
    'charges_fixes',
    'emprunts',
    'parametres',
    'interventions',
    'equipements',
    'pieces',
    'plans',
    'releves_horametre',
    'app_users'
  ];
BEGIN
  FOREACH t IN ARRAY tables_cibles LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t)
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                       WHERE pubname = 'supabase_realtime' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Ajoutee a la publication temps reel : %', t;
    END IF;
  END LOOP;
END $$;

-- 3) Verification finale
SELECT tablename AS tables_publiees_apres
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- ============================================================================
--  NOTE : les evenements DELETE ne transportent que la cle primaire, sauf si
--  la table est en REPLICA IDENTITY FULL. L'app se contente de re-lire la table
--  entiere a chaque evenement, donc la cle primaire suffit : rien a changer.
-- ============================================================================
