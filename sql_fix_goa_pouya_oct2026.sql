-- ═══════════════════════════════════════════════════════════════════
-- CORRECTIF DONNEES : Richard GOA / Jean-Marc POUYA (21-22 octobre 2026)
-- Base : WALLIS-LABEL (tfmnmzyetybaeygughcs) — PAS la base Cortex.
--
-- Vécu : sur les rapports FS1 (Kopeto K) des 21 et 22/10, le membre
-- "RICHARD GOA" portait l'ID de Jean-Marc POUYA (p1779155202238) : le nom
-- avait été modifié dans l'éditeur admin sans changer l'identité.
-- Conséquence : rapports au nom de GOA, mais planning/heures/primes
-- crédités à POUYA. GOA n'avait aucun relevé d'heures.
--
-- Ce script : 1) rend son ID à GOA dans l'équipe des 2 rapports,
--             2) réaffecte les 2 relevés d'heures dérivés (630 + 570 min).
-- IDEMPOTENT. A exécuter dans Supabase Dashboard > SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- ── Vérification AVANT ──
SELECT id, date_rapport, sondeuse_code,
       (SELECT string_agg(m->>'nom' || ' [' || (m->>'id') || ']', ' ; ')
        FROM jsonb_array_elements(equipe) AS m) AS equipe
FROM rapports_forage
WHERE date_rapport IN ('2026-10-21','2026-10-22') AND sondeuse_code = 'FS1';

SELECT id, date_releve, personnel_id, total_minutes, statut
FROM releves_heures
WHERE date_releve IN ('2026-10-21','2026-10-22') AND sondeuse_code = 'FS1'
ORDER BY date_releve;

-- ── 1) Rapports : le membre "GOA" reprend l'ID de SA fiche ──
UPDATE rapports_forage
SET equipe = (
  SELECT jsonb_agg(
    CASE WHEN upper(coalesce(m->>'nom','')) LIKE '%GOA%'
          AND m->>'id' = 'p1779155202238'
         THEN jsonb_set(m, '{id}', '"p1779155202244"')
         ELSE m END)
  FROM jsonb_array_elements(equipe) AS m
)
WHERE date_rapport IN ('2026-10-21','2026-10-22')
  AND sondeuse_code = 'FS1'
  AND equipe::text ILIKE '%GOA%';

-- ── 2) Relevés d'heures : les heures des 21-22/10 étaient celles de GOA ──
-- 791909564 = hash du code POUYA (p1779155202238)
-- 791909591 = hash du code GOA   (p1779155202244)
UPDATE releves_heures
SET personnel_id = 791909591
WHERE id IN (836, 853)
  AND personnel_id = 791909564
  AND sondeuse_code = 'FS1'
  AND date_releve IN ('2026-10-21','2026-10-22');

-- ── Vérification APRES (attendu : GOA [p1779155202244] dans les équipes,
--    et les relevés 836/853 sur personnel_id 791909591) ──
SELECT id, date_rapport,
       (SELECT string_agg(m->>'nom' || ' [' || (m->>'id') || ']', ' ; ')
        FROM jsonb_array_elements(equipe) AS m) AS equipe
FROM rapports_forage
WHERE date_rapport IN ('2026-10-21','2026-10-22') AND sondeuse_code = 'FS1';

SELECT id, date_releve, personnel_id, total_minutes, statut
FROM releves_heures
WHERE id IN (836, 853);
