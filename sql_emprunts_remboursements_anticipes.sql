-- ============================================================
-- Remboursements anticipes sur les emprunts
-- Base : WALLIS-LABEL (tfmnmzyetybaeygughcs) - PAS Cosmo !
-- A executer dans Supabase > SQL Editor
-- ============================================================
-- Ajoute la colonne jsonb qui stocke la liste des remboursements
-- anticipes d'un emprunt : [{ "date": "2026-09-14", "montant": 1000000, "note": "..." }]
-- L'app admin (ecran Emprunts, bouton avance-rapide) lit/ecrit cette liste.
-- Convention moteur : mensualite constante, duree raccourcie.

alter table emprunts
  add column if not exists remboursements jsonb not null default '[]'::jsonb;

-- Verification :
-- select id, libelle, remboursements from emprunts order by id;
