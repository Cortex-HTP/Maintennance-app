-- ============================================================
-- BASE : WALLIS-LABEL (tfmnmzyetybaeygughcs) - PAS Cosmo !
-- Corrige les affectations du Planning Employes peintes sur un
-- chantier 2027 (ex. Kouaoua id 17) pour des dates 2026.
-- Cause : ancienne palette de pinceaux non filtree par annee
-- (doublons 2026/2027). L'infobulle des cases revele le probleme.
-- ============================================================

-- 1) DIAGNOSTIC : toutes les affectations 2026 pointant sur un chantier 2027
--    (a executer d'abord pour voir l'ampleur)
select a.id, a.personnel_id, a.date_affectation, a.chantier_id, c.titre as chantier, a.type_jour
from affectations a
join chantiers c on c.id = a.chantier_id
where a.date_affectation < '2027-01-01'
  and c.date_debut >= '2027-01-01'
order by a.date_affectation, a.personnel_id;

-- 2) CORRECTION principale : Kouaoua (17, chantier 2027) -> Tiebaghi (2)
--    (l'equipe etait a Tiebaghi ; toutes les dates 2026 concernees)
update affectations
set chantier_id = 2
where chantier_id = 17
  and date_affectation < '2027-01-01';

-- 3) SI le diagnostic (1) montre d'autres chantiers 2027, remaps evidents
--    (decommenter seulement ceux qui apparaissent dans le diagnostic) :
-- update affectations set chantier_id = 2  where chantier_id = 13 and date_affectation < '2027-01-01'; -- Tiebaghi 2027 -> Tiebaghi 2026
-- update affectations set chantier_id = 9  where chantier_id = 14 and date_affectation < '2027-01-01'; -- Nakety 2027  -> Nakety 2026
-- update affectations set chantier_id = 3  where chantier_id = 15 and date_affectation < '2027-01-01'; -- Kopeto 2027  -> Kopeto K 2026
-- update affectations set chantier_id = 12 where chantier_id = 18 and date_affectation < '2027-01-01'; -- KNS 2027     -> KNS 2026

-- 4) VERIFICATION : la requete (1) ne doit plus rien retourner
