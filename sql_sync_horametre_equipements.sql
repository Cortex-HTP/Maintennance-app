-- ═══════════════════════════════════════════════════════════════════
-- Wallis-Label · Synchronisation horametre_actuel / km_actuel des
-- equipements avec le dernier releve (table releves_horametre).
--
-- Contexte : equipements.horametre_actuel n'etait jamais mis a jour
-- quand un releve arrivait (ex FS1 : champ 10100 vs dernier releve 10266).
-- Un trigger de protection (trig_protect_horametre) interdit de modifier
-- horametre_actuel/km_actuel sauf pour un admin -> il bloquait aussi la sync.
--
-- Solution : on autorise la protection a laisser passer les updates
-- AUTOMATIQUES (venant d'un autre trigger : pg_trigger_depth() > 1), on
-- ajoute le trigger de sync, et on rattrape l'existant (protection
-- desactivee le temps du backfill). Les modifs MANUELLES directes restent
-- protegees exactement comme avant.
--
-- >>> A EXECUTER SUR LE PROJET SUPABASE **WALLIS-LABEL** (PAS COSMO) <<<
-- ═══════════════════════════════════════════════════════════════════

-- 1) Protection : laisse passer les updates automatiques (trigger imbrique),
--    garde le blocage pour les edits directs non-admin (inchange).
create or replace function public.protect_horametre_equipement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Mise a jour venant d'un AUTRE trigger (ex: sync depuis un releve) : autorisee.
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if not public.is_admin() then
    if new.horametre_actuel is distinct from old.horametre_actuel then
      raise exception 'Seul un admin peut modifier l''horametre. Utilisez un releve pour enregistrer une lecture.';
    end if;
    if new.km_actuel is distinct from old.km_actuel then
      raise exception 'Seul un admin peut modifier le kilometrage. Utilisez un releve pour enregistrer une lecture.';
    end if;
  end if;
  return new;
end;
$function$;

-- 2) Fonction de sync : au moindre releve, remonte les compteurs au max.
create or replace function public.sync_equipement_compteurs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.equipement_id is not null then
    update public.equipements e
    set horametre_actuel = greatest(coalesce(e.horametre_actuel, 0), coalesce(new.horametre, 0)),
        km_actuel        = greatest(coalesce(e.km_actuel, 0),        coalesce(new.km, 0)),
        updated_at       = now()
    where e.id = new.equipement_id
      and (
        coalesce(new.horametre, 0) > coalesce(e.horametre_actuel, 0)
        or coalesce(new.km, 0)     > coalesce(e.km_actuel, 0)
      );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_equipement_compteurs on public.releves_horametre;
create trigger trg_sync_equipement_compteurs
after insert or update on public.releves_horametre
for each row execute function public.sync_equipement_compteurs();

-- 3) Rattrapage one-shot des machines deja perimees.
--    Protection desactivee juste le temps du backfill (edit direct depth=1).
alter table public.equipements disable trigger trig_protect_horametre;

update public.equipements e
set horametre_actuel = greatest(coalesce(e.horametre_actuel, 0), r.max_h),
    km_actuel        = greatest(coalesce(e.km_actuel, 0),        r.max_km),
    updated_at       = now()
from (
  select equipement_id,
         coalesce(max(horametre), 0) as max_h,
         coalesce(max(km), 0)        as max_km
  from public.releves_horametre
  where equipement_id is not null
  group by equipement_id
) r
where e.id = r.equipement_id
  and (r.max_h > coalesce(e.horametre_actuel, 0) or r.max_km > coalesce(e.km_actuel, 0));

alter table public.equipements enable trigger trig_protect_horametre;

-- (Optionnel) verifier : select immatriculation, horametre_actuel from public.equipements order by immatriculation;
