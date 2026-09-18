-- ============================================================
-- Periodes de travail d'un chantier (coupures / reprises)
-- Base : WALLIS-LABEL (tfmnmzyetybaeygughcs) - PAS Cosmo !
-- A executer dans Supabase > SQL Editor
-- ============================================================
-- Un chantier peut s'arreter puis reprendre SANS creer deux fiches :
-- la fiche garde sa fenetre globale (date_debut/date_fin = enveloppe,
-- synchronisee automatiquement par l'app) et la colonne periodes liste
-- les phases actives :
--   [{"debut":"2027-01-04","fin":"2027-04-30"},
--    {"debut":"2027-09-01","fin":"2027-12-20"}]
-- NULL ou moins de 2 periodes = chantier en continu (comportement normal).
-- Le previsionnel (tresorerie 2026/2027, cadence des cartes, graphe
-- journalier) ne produit RIEN entre deux periodes.
alter table chantiers
  add column if not exists periodes jsonb;
