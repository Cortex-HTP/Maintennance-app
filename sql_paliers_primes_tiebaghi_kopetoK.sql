-- ══════════════════════════════════════════════════════════════════════
-- Mise a jour des seuils et coefficients pour Tiebaghi et Kopeto K
-- (objectif_mh et moyenne_jour sont conserves depuis les lignes existantes)
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════════════

-- ─── TIEBAGHI ───
DO $$
DECLARE
  v_obj numeric := 0;
  v_moy numeric := 0;
BEGIN
  -- Recupere objectif_mh et moyenne_jour actuels du site (s'il en a)
  SELECT COALESCE(MAX(objectif_mh), 0), COALESCE(MAX(moyenne_jour), 0)
    INTO v_obj, v_moy
    FROM paliers_primes WHERE site = 'Tiebaghi';

  -- Supprime les anciens paliers de Tiebaghi
  DELETE FROM paliers_primes WHERE site = 'Tiebaghi';

  -- Insere les 11 nouveaux paliers
  INSERT INTO paliers_primes (site, seuil_mh, coefficient, objectif_mh, moyenne_jour) VALUES
    ('Tiebaghi', 18.00,  3000, v_obj, v_moy),
    ('Tiebaghi', 19.00,  4000, v_obj, v_moy),
    ('Tiebaghi', 20.00,  5000, v_obj, v_moy),
    ('Tiebaghi', 21.00,  6000, v_obj, v_moy),
    ('Tiebaghi', 22.00,  7000, v_obj, v_moy),
    ('Tiebaghi', 23.00,  8000, v_obj, v_moy),
    ('Tiebaghi', 24.00,  9000, v_obj, v_moy),
    ('Tiebaghi', 25.00, 10000, v_obj, v_moy),
    ('Tiebaghi', 26.00, 11000, v_obj, v_moy),
    ('Tiebaghi', 27.00, 12000, v_obj, v_moy),
    ('Tiebaghi', 28.00, 13000, v_obj, v_moy);
END $$;

-- ─── KOPETO K ───
DO $$
DECLARE
  v_obj numeric := 0;
  v_moy numeric := 0;
BEGIN
  SELECT COALESCE(MAX(objectif_mh), 0), COALESCE(MAX(moyenne_jour), 0)
    INTO v_obj, v_moy
    FROM paliers_primes WHERE site = 'Kopeto K';

  DELETE FROM paliers_primes WHERE site = 'Kopeto K';

  INSERT INTO paliers_primes (site, seuil_mh, coefficient, objectif_mh, moyenne_jour) VALUES
    ('Kopeto K', 2.84,  8000, v_obj, v_moy),
    ('Kopeto K', 3.34,  9000, v_obj, v_moy),
    ('Kopeto K', 3.84, 10000, v_obj, v_moy),
    ('Kopeto K', 4.34, 11000, v_obj, v_moy),
    ('Kopeto K', 4.84, 12000, v_obj, v_moy),
    ('Kopeto K', 5.34, 13000, v_obj, v_moy),
    ('Kopeto K', 5.84, 14000, v_obj, v_moy),
    ('Kopeto K', 6.34, 15000, v_obj, v_moy),
    ('Kopeto K', 6.84, 16000, v_obj, v_moy),
    ('Kopeto K', 7.34, 17000, v_obj, v_moy),
    ('Kopeto K', 7.84, 18000, v_obj, v_moy);
END $$;

-- ─── Verification ───
-- Doit afficher 11 lignes pour Tiebaghi et 11 pour Kopeto K
SELECT site, seuil_mh, coefficient, objectif_mh, moyenne_jour
FROM paliers_primes
WHERE site IN ('Tiebaghi', 'Kopeto K')
ORDER BY site, seuil_mh;
