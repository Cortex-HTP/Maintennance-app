-- =====================================================================
-- LIEN PIECES DETACHEES (base WALLIS-LABEL tfmnmzyetybaeygughcs) <-> CORTEX-STOCK
-- A executer sur la base WALLIS-LABEL (PAS sur Cortex !).
-- 1) Colonne d'ancrage pieces.cortex_sku (jointure durable, la reference
--    texte reste libre/fusionnable et ne doit pas servir de cle).
-- 2) Pour les correspondances SURES : stock reel + prix d'achat issus de la
--    reprise Cortex-Stock (cliche legacy du 11/08/2026).
-- Idempotent : re-executable.
-- =====================================================================
begin;

alter table public.pieces add column if not exists cortex_sku text;
comment on column public.pieces.cortex_sku is 'SKU de l''article correspondant dans Cortex-Stock (reprise Wallis Label)';

update public.pieces set cortex_sku = '147009', stock_actuel = 4, prix_unitaire = 6310 where id = '4c848d2d-b0a8-4dd5-8206-eaf7b0d93a17';  -- 147009 (GAS STAY CYLINDER (SERIES 16-4)AMORTISSE)
update public.pieces set cortex_sku = '322329', stock_actuel = 2, prix_unitaire = 252 where id = '82d5ef7f-20c4-48dd-abab-f0fcad28beba';  -- 2050033 (GANTS ANTIDERAPANT POLY/COTON T10 (x10) )
update public.pieces set cortex_sku = '181016', stock_actuel = 11, prix_unitaire = 29765 where id = '0d7f30e4-b456-4cec-abee-013c6a27b6e8';  -- 2250058-441 (ELEMENT-CONTROL AIR FILTER 900/350 PR D0)
update public.pieces set cortex_sku = '191005', stock_actuel = 14, prix_unitaire = 24144 where id = '8f613473-1f49-41c4-b8c5-1b340b4793bd';  -- 250031-850 (ELEMENT-FILTER 80 CN2/ROULEMENT)
update public.pieces set cortex_sku = '404101', stock_actuel = 351, prix_unitaire = 8256 where id = 'c294d1c5-6154-4d23-91d2-f80ef922c624';  -- 404101 (TIGE HC HQ * 600 MAXMA(MANCHON D''USURE) )
-- DOUBLON Wallis : 2 pieces portent la ref 404101 ('Manchon d''usure' et 'Manchon adaptateur').
-- Le meme article Cortex (404101, qte 351) ne doit pas etre compte 2 fois : stock mis sur la 1ere,
-- la 2eme passe a 0 -> a fusionner ensuite via l'outil doublons de l'ecran Pieces detachees.
update public.pieces set cortex_sku = '404101', stock_actuel = 0 where id = 'b7320cb8-0b0d-4f91-bd96-fc78fa048a35';
update public.pieces set cortex_sku = '405102', stock_actuel = 211, prix_unitaire = 12065 where id = 'a419bec7-627b-4eab-91f3-b9f178cf6697';  -- 405102 (TROMPETTES HQ(BARRES CREUSESPR FORAGE)-S)
update public.pieces set cortex_sku = '409005', stock_actuel = 2, prix_unitaire = 205535 where id = '6cfdaf1a-e100-495d-9ca7-f6d7f7db7993';  -- 409005 (UNITE DE  CHARGE HQ(SPEED LOAD UNIT ASSE)
update public.pieces set cortex_sku = '410001', stock_actuel = 151, prix_unitaire = 6886 where id = 'a72778e5-5449-4dab-b156-c26113e37fbc';  -- 410001 (TUYAU ECHANTIILON HQ SAMPLE HOSE(21/2")6)
update public.pieces set cortex_sku = '401402', stock_actuel = 58, prix_unitaire = 7998 where id = '1db615f8-e075-4c58-8e8b-be82f86120c8';  -- 53.233.80 (TIGE NC NQ * 1500 DM850 (x24 TIGES))
update public.pieces set cortex_sku = '440015', stock_actuel = 2, prix_unitaire = 25558 where id = 'ba2530b0-7e7a-464f-8e84-fed5f8a0707d';  -- 65.221.434 (MANCHON VERROUILLAGE NQ LOCKING COUPLING)
update public.pieces set cortex_sku = '440037', stock_actuel = 20, prix_unitaire = 4021 where id = 'eb113ed6-08ae-47d1-bf59-d87b3be604aa';  -- 65.221.633 (EXTRACTEUR PQ STRIE FLUTED TECHNIDRILL)
update public.pieces set cortex_sku = '704211', stock_actuel = 1, prix_unitaire = 25000 where id = '31ff1991-85f5-4420-915f-8a82e831e9a1';  -- A904 200 51 01 (POMPE A EAU CAMION / A9042005101)
update public.pieces set cortex_sku = '193022', stock_actuel = 1, prix_unitaire = 3168 where id = '7dfd0c83-34f9-4cea-bc4a-7584b29c113b';  -- FF5319 (F. GAZOLE  D25-D30-D32)
update public.pieces set cortex_sku = '194008', stock_actuel = 1, prix_unitaire = 97398 where id = '57591687-8c01-4364-893a-a37439c67ae4';  -- KD1275-008P (FILTRE SEPARATEUR(SEPARATOR OIL) KD1275-)
update public.pieces set cortex_sku = '402102', stock_actuel = 303, prix_unitaire = 6742 where id = 'f7062d3b-4a18-4828-af23-efb03f6aa1bd';  -- WLTI2983HQSAI (TUBE INTERIEUR GALVA 3M(MILD STEEL TUBE )
update public.pieces set cortex_sku = '415004', stock_actuel = 7, prix_unitaire = 37926 where id = 'd7b02240-f2c6-4c55-90c7-f4c5f3699980';  -- Z5025 (Z50 THREAD GREASE 25KG PAIL NATDRILL(330)

commit;

-- ---------------------------------------------------------------------
-- CORRESPONDANCES PROBABLES (fautes de frappe presumees) — A VALIDER PAR TOMY
-- avant de decommenter puis executer :
-- piece '121427' (Cales de machoires) -> article Cortex 121417 'C¶LES(JAWS)DE MACHOIRES DE SERRAGE BRUTE' (refer WLRJ01, qte 134, achat 9240)
-- update public.pieces set cortex_sku = '121417', stock_actuel = 134, prix_unitaire = 9240 where id = 'd352d9f3-4467-40f7-96d9-b2413a5baae0';
-- piece '65.222.431' (Porte extracteur) -> article Cortex 440012 'PORTE EXTRACTEUR NQ(CORE LIFTER CASE)Nø5' (refer 65.221.431, qte 80, achat 2543)
-- update public.pieces set cortex_sku = '440012', stock_actuel = 80, prix_unitaire = 2543 where id = 'c50083ea-8c25-468e-8923-60d208ed5a0a';

-- VERIF : select reference, designation, cortex_sku, stock_actuel, prix_unitaire from pieces where cortex_sku is not null order by reference;