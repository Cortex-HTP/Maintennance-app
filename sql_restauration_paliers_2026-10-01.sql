-- ══════════════════════════════════════════════════════════════════════
-- RESTAURATION DES GRILLES DE PALIERS — TIEBAGHI et KOPETO K
-- Base : WALLIS-LABEL (tfmnmzyetybaeygughcs) — PAS Cosmo !
-- Incident 2026-10-01 : l'ecran Primes a insere le gabarit par defaut
-- (seuils 240/320/400/480, objectif 50, moyenne 400) par-dessus les
-- vraies grilles quand la table a rate un chargement.
-- Valeurs restaurees = script de construction du 21/09/2026 retrouve
-- dans l'historique de travail + capture d'ecran de Tomy (19 / 170).
-- À executer dans Supabase SQL Editor, en entier.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 0. DIAGNOSTIC (juste pour voir l'etat avant) ───
SELECT site, seuil_mh, coefficient, objectif_mh, moyenne_jour
FROM paliers_primes
ORDER BY site, seuil_mh;

-- ─── 1. NETTOYAGE GLOBAL des lignes du gabarit par defaut ───
-- Signature exacte du gabarit insere par l'incident : seuils aberrants
-- (240/320/400/480 m/h !) avec objectif 50 et moyenne 400.
DELETE FROM paliers_primes
WHERE objectif_mh = 50 AND moyenne_jour = 400
  AND seuil_mh IN (240, 320, 400, 480)
  AND coefficient IN (0, 50, 100, 150);

-- ─── 2. TIEBAGHI : 11 paliers, 18 -> 28 m/h, 3000 -> 13000 XPF ───
-- Objectif 19 m/h, moyenne 170 m/jour (ta capture d'ecran).
DO $$
DECLARE
  v_site text;
BEGIN
  -- Orthographe du site telle que l'app l'utilise (table chantiers)
  SELECT site INTO v_site FROM chantiers WHERE upper(site) = 'TIEBAGHI' LIMIT 1;
  IF v_site IS NULL THEN v_site := 'TIEBAGHI'; END IF;

  DELETE FROM paliers_primes WHERE upper(site) = 'TIEBAGHI';

  INSERT INTO paliers_primes (site, seuil_mh, coefficient, objectif_mh, moyenne_jour) VALUES
    (v_site, 18.00,  3000, 19, 170),
    (v_site, 19.00,  4000, 19, 170),
    (v_site, 20.00,  5000, 19, 170),
    (v_site, 21.00,  6000, 19, 170),
    (v_site, 22.00,  7000, 19, 170),
    (v_site, 23.00,  8000, 19, 170),
    (v_site, 24.00,  9000, 19, 170),
    (v_site, 25.00, 10000, 19, 170),
    (v_site, 26.00, 11000, 19, 170),
    (v_site, 27.00, 12000, 19, 170),
    (v_site, 28.00, 13000, 19, 170);
END $$;

-- ─── 3. KOPETO K : 11 paliers, 2.84 -> 7.84 m/h, 8000 -> 18000 XPF ───
-- Objectif 3.33 m/h, moyenne 30 m/jour (lecture reelle du 21/09/2026).
DO $$
DECLARE
  v_site text;
BEGIN
  SELECT site INTO v_site FROM chantiers WHERE upper(site) IN ('KOPETO K', 'KOPETO') LIMIT 1;
  IF v_site IS NULL THEN v_site := 'KOPETO K'; END IF;

  DELETE FROM paliers_primes WHERE upper(site) IN ('KOPETO K', 'KOPETO');

  INSERT INTO paliers_primes (site, seuil_mh, coefficient, objectif_mh, moyenne_jour) VALUES
    (v_site, 2.84,  8000, 3.33, 30),
    (v_site, 3.34,  9000, 3.33, 30),
    (v_site, 3.84, 10000, 3.33, 30),
    (v_site, 4.34, 11000, 3.33, 30),
    (v_site, 4.84, 12000, 3.33, 30),
    (v_site, 5.34, 13000, 3.33, 30),
    (v_site, 5.84, 14000, 3.33, 30),
    (v_site, 6.34, 15000, 3.33, 30),
    (v_site, 6.84, 16000, 3.33, 30),
    (v_site, 7.34, 17000, 3.33, 30),
    (v_site, 7.84, 18000, 3.33, 30);
END $$;

-- ─── 4. VERIFICATION : 11 lignes Tiebaghi + 11 lignes Kopeto K ───
SELECT site, seuil_mh, coefficient, objectif_mh, moyenne_jour
FROM paliers_primes
WHERE upper(site) IN ('TIEBAGHI', 'KOPETO K', 'KOPETO')
ORDER BY site, seuil_mh;

-- ─── 5. CONTROLE FINAL global : reste-t-il des lignes gabarit ailleurs ? ───
-- (doit renvoyer 0 ligne ; sinon colle-moi le resultat)
SELECT site, seuil_mh, coefficient, objectif_mh, moyenne_jour
FROM paliers_primes
WHERE objectif_mh = 50 AND moyenne_jour = 400
ORDER BY site, seuil_mh;
