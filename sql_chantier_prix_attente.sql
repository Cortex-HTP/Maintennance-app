-- ═══════════════════════════════════════════════════════════════════
-- Wallis-Label · Prix attente par chantier
-- Ajoute une colonne prix_attente (XPF/h) sur les chantiers. Ce prix
-- horaire s'applique aux activités FACTURABLES (attentes, déplacements…)
-- des rapports rattachés au chantier. Remplace l'ancien "Tarifs activités".
--
-- >>> À EXÉCUTER SUR LE PROJET SUPABASE **WALLIS-LABEL** <<<
--     (ref tfmnmzyetybaeygughcs — PAS Cosmo/Cortex)
--
-- ⚠️ À exécuter AVANT/juste après le déploiement : tant que la colonne
--    n'existe pas, l'enregistrement d'un chantier échouera (colonne inconnue).
--
-- 100% additif : aucune donnée existante modifiée. Défaut 0.
-- ═══════════════════════════════════════════════════════════════════

alter table public.chantiers
  add column if not exists prix_attente numeric not null default 0;

-- RLS : la colonne hérite des policies de la table chantiers (déjà en place).
-- Rien à ajouter.

-- Vérif : select id, titre, site, prix_metre, prix_attente from public.chantiers;
