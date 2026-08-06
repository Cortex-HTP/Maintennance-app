-- ═══════════════════════════════════════════════════════════════════
-- Wallis-Label · Documents véhicule + Demandes d'accès site
-- Fondation de l'onglet "Demande d'accès site" : stockage des papiers
-- des véhicules (carte grise / assurance / contrôle technique) par machine,
-- + historique des demandes envoyées.
--
-- >>> À EXÉCUTER SUR LE PROJET SUPABASE **WALLIS-LABEL** <<<
--     (ref tfmnmzyetybaeygughcs — PAS Cosmo/Cortex)
--
-- 100% additif : ne touche aucune table existante.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1) Table : un document courant par (véhicule, type) ─────────────
-- Le fichier lui-même vit dans le bucket Storage 'vehicule-documents'
-- (fichier_path = chemin dans le bucket). date_expiration sert aux alertes
-- (assurance / contrôle technique). La carte grise n'a en général pas d'échéance.
create table if not exists public.vehicule_documents (
  id             bigint generated always as identity primary key,
  equipement_id  bigint not null references public.equipements(id) on delete cascade,
  type_doc       text   not null check (type_doc in ('carte_grise','assurance','controle_technique')),
  fichier_path   text,
  nom_fichier    text,
  date_expiration date,
  uploaded_by    text,
  uploaded_at    timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (equipement_id, type_doc)   -- remplace le doc au ré-upload (1 courant par type)
);
create index if not exists idx_vehdoc_equip on public.vehicule_documents(equipement_id);

-- ─── 2) Historique des demandes d'accès envoyées ─────────────────────
create table if not exists public.demandes_acces (
  id                 bigint generated always as identity primary key,
  chantier_id        bigint references public.chantiers(id) on delete set null,
  site               text,
  destinataire_email text,
  destinataire_nom   text,
  personnes          jsonb,   -- [{ "nom": "...", "role": "..." }]
  vehicules          jsonb,   -- [{ "code": "FS1", "nom": "Sondeuse FS1" }]
  docs_manquants     jsonb,   -- [{ "vehicule": "D37", "type": "controle_technique" }]
  statut             text default 'envoyee',
  envoyee_par        text,
  envoyee_at         timestamptz not null default now()
);
create index if not exists idx_demacc_chantier on public.demandes_acces(chantier_id);

-- ─── 3) RLS : réservé aux utilisateurs connectés (aligné sur rh_documents) ─
alter table public.vehicule_documents enable row level security;
alter table public.demandes_acces     enable row level security;

drop policy if exists vehdoc_rw_auth on public.vehicule_documents;
create policy vehdoc_rw_auth on public.vehicule_documents
  for all to authenticated using (true) with check (true);

drop policy if exists demacc_rw_auth on public.demandes_acces;
create policy demacc_rw_auth on public.demandes_acces
  for all to authenticated using (true) with check (true);

-- ─── 4) Bucket Storage privé + policies (fichiers PDF/JPG des papiers) ─
insert into storage.buckets (id, name, public)
values ('vehicule-documents', 'vehicule-documents', false)
on conflict (id) do nothing;

drop policy if exists vehdoc_obj_rw_auth on storage.objects;
create policy vehdoc_obj_rw_auth on storage.objects
  for all to authenticated
  using (bucket_id = 'vehicule-documents')
  with check (bucket_id = 'vehicule-documents');

-- (Optionnel) resserrer plus tard aux rôles admin/secrétaire comme le Coffre RH,
-- une fois la feature validée en usage réel.

-- ─── Vérif : select * from public.vehicule_documents; ────────────────
