-- ============================================================
-- Remboursements anticipes sur les emprunts
-- Base : WALLIS-LABEL (tfmnmzyetybaeygughcs) - PAS Cosmo !
-- A executer dans Supabase > SQL Editor
-- ============================================================
-- Ajoute la colonne jsonb qui stocke la liste des remboursements
-- anticipes d'un emprunt :
--   [{ "date": "2026-09-14", "montant": 1000000, "note": "...", "mode": "duree" | "mensualite" }]
-- L'app admin (ecran Emprunts, bouton avance-rapide) lit/ecrit cette liste.
-- mode "duree" (defaut)  : mensualite constante, le pret se termine plus tot
-- mode "mensualite"      : duree conservee, mensualite recalculee sur le capital restant

alter table emprunts
  add column if not exists remboursements jsonb not null default '[]'::jsonb;

-- ============================================================
-- Recalage sur le tableau d'amortissement de la BANQUE (2026-09-14)
-- ============================================================
-- assurance_mensuelle : part de la traite qui N'AMORTIT PAS le capital
--   (assurance emprunteur, frais). Sans elle l'app amortit trop vite et
--   sous-evalue le capital restant (constate : traite recalculee 439k
--   au lieu de 685k sur le vrai tableau banque).
-- capital_ref + capital_ref_date : capital restant du CONSTATE sur le
--   tableau de la banque a une date -> tous les calculs se recalent dessus
--   (absorbe reports d'echeances, frais, ecarts theorie/realite).
--   Convention : on recopie une LIGNE du tableau banque, la somme restant
--   due est reputee APRES l'echeance et les remboursements de ce jour-la.

alter table emprunts
  add column if not exists assurance_mensuelle numeric not null default 0;
alter table emprunts
  add column if not exists capital_ref numeric;
alter table emprunts
  add column if not exists capital_ref_date date;

-- Verification :
-- select id, libelle, mensualite, assurance_mensuelle, capital_ref, capital_ref_date, remboursements from emprunts order by id;
