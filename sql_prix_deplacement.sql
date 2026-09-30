-- ═══ Prix DEPLACEMENT par chantier (base WALLIS-LABEL) ═══
-- L'activite facturable DEPLACEMENT obtient son PROPRE prix horaire, distinct
-- du prix attente. 0 (defaut) = comportement historique : facturee au prix
-- attente. Le champ apparait dans la fiche chantier (Planning et Avancement).
-- A executer sur le projet Supabase WALLIS-LABEL (tfmnmzyetybaeygughcs).

alter table chantiers
  add column if not exists prix_deplacement numeric not null default 0;

comment on column chantiers.prix_deplacement is
  'Prix horaire XPF de l''activite facturable DEPLACEMENT ; 0 = repli sur prix_attente';

-- Verification
select id, titre, site, prix_attente, prix_deplacement
from chantiers
order by statut, titre;
