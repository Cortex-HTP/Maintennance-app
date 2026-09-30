-- ═══ Suivi "rapport en cours de remplissage" (base WALLIS-LABEL) ═══
-- Ligne de suivi LEGERE poussee par la tablette pendant le remplissage d'un
-- rapport de forage : l'admin voit qu'un rapport est en cours (machine,
-- chantier, etape, nb de sondages, derniere activite) AVANT son envoi final.
-- Le rapport lui-meme n'est insere dans rapports_forage qu'au bouton Envoyer,
-- comme avant. La ligne de suivi est supprimee a l'envoi ou a l'abandon du
-- brouillon ; une ligne non rafraichie depuis 4 h n'est plus affichee.
-- A executer sur le projet Supabase WALLIS-LABEL (tfmnmzyetybaeygughcs).

create table if not exists rapports_en_cours (
  id uuid primary key default gen_random_uuid(),
  sondeuse_code text,
  chantier_label text,
  sondeur_nom text,
  date_rapport date,
  etape int default 1,
  total_etapes int default 3,
  nb_sondages int default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table rapports_en_cours enable row level security;

-- Metadonnees non sensibles et EPHEMERES (purgees a l'envoi, ignorees apres
-- 4 h), ecrites par la tablette (cle anon) et lues par l'admin. Acces complet
-- anon ASSUME : la tablette n'a pas d'identite par ligne, et les noms des
-- equipiers sont deja lisibles en anon via rapports_forage (meme cle).
drop policy if exists "rapports_en_cours_all" on rapports_en_cours;
create policy "rapports_en_cours_all" on rapports_en_cours
  for all using (true) with check (true);

-- Temps reel : le bandeau admin se met a jour sans recharger
do $$
begin
  alter publication supabase_realtime add table rapports_en_cours;
exception when duplicate_object then null;
end $$;

-- Verification
select * from rapports_en_cours order by last_seen_at desc;
