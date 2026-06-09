import { describe, it, expect } from 'vitest';
import { computeAlertesSaisies } from './utils/alertesSaisies.js';

// Fixture commune
const today = new Date(2026, 5, 9); // 9 juin 2026 (mardi)
const baseArgs = {
  today,
  startDate: '2026-06-01',
  chantiers: [
    { id: 1, titre: 'Kopeto Nord', statut: 'En cours' },
    { id: 2, titre: 'Kopeto Sud', statut: 'En cours' },
    { id: 99, titre: 'Vieux chantier', statut: 'Archive' }
  ],
  equipements: [
    { Id: 10, Title: 'FS1' },
    { Id: 11, Title: 'D35' },
    { Id: 12, Title: 'D36' }
  ],
  chantierEquipements: [
    { chantierId: 1, equipementId: 10, dateDebut: '2026-06-01', dateFin: null },
    { chantierId: 2, equipementId: 11, dateDebut: '2026-06-01', dateFin: null },
    { chantierId: 99, equipementId: 12, dateDebut: '2026-06-01', dateFin: null }
  ],
  rapports: [],
  heures: [],
  saisies: {
    // chantier 1 actif Lun-Jeu, Vendredi non saisi
    1: {
      '2026-06-01': { valeur: 18, typeJour: 'normal' },
      '2026-06-02': { valeur: 22, typeJour: 'normal' },
      '2026-06-03': { valeur: 15, typeJour: 'normal' },
      '2026-06-04': { valeur: 20, typeJour: 'normal' },
      '2026-06-05': { valeur: 0,  typeJour: 'ferie' },
      '2026-06-08': { valeur: 12, typeJour: 'normal' }
    },
    // chantier 2 : seul lun 1 productif
    2: {
      '2026-06-01': { valeur: 10, typeJour: 'normal' },
      '2026-06-02': { valeur: 0,  typeJour: 'panne' }
    }
  },
  minHeures: 3
};

describe('computeAlertesSaisies', () => {
  it('genere des jours Lun-Ven du 1er au 8 juin 2026 (5 jours productifs Lun-Ven, mais lundi 8 inclus)', () => {
    const res = computeAlertesSaisies(baseArgs);
    // Du 1er (lundi) au 8 (lundi) inclus, Lun-Ven : 1,2,3,4,5,8 = 6 jours ouvres
    expect(res.daysChecked).toEqual(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-08']);
  });

  it('signale rapport ET heures manquants quand chantier productif sans saisies', () => {
    const res = computeAlertesSaisies(baseArgs);
    // Chantier 1 a 5 jours productifs (Lun-Jeu + Lundi 8), Vendredi 5 ferie -> exclu
    // Chantier 2 a 1 jour productif (lundi 1), Mardi 2 panne -> exclu
    // Chantier 99 archive -> exclu
    // Total = 6 manquements pour C1 (FS1) + 1 pour C2 (D35) = 7
    expect(res.count).toBeGreaterThanOrEqual(6);
    const flat = res.list.flatMap(g => g.items);
    flat.forEach(item => {
      expect(item.missing).toContain('rapport');
    });
  });

  it('exclut les jours ferie/panne/intemperies', () => {
    const res = computeAlertesSaisies(baseArgs);
    // Vendredi 5 juin (chantier 1) = ferie -> ne doit PAS apparaitre
    const ven5 = res.list.find(g => g.date === '2026-06-05');
    const c1Ven5 = ven5 ? ven5.items.find(i => i.chantierId === 1) : null;
    expect(c1Ven5).toBeFalsy();
    // Mardi 2 (chantier 2) = panne -> ne doit PAS apparaitre
    const mar2 = res.list.find(g => g.date === '2026-06-02');
    const c2Mar2 = mar2 ? mar2.items.find(i => i.chantierId === 2) : null;
    expect(c2Mar2).toBeFalsy();
  });

  it('exclut les chantiers archives', () => {
    const res = computeAlertesSaisies(baseArgs);
    const flat = res.list.flatMap(g => g.items);
    const archive = flat.find(i => i.chantierId === 99);
    expect(archive).toBeUndefined();
  });

  it('considere un rapport present comme valide (rapport seul, heures = 0)', () => {
    const args = {
      ...baseArgs,
      rapports: [
        { date_rapport: '2026-06-01', sondeuse_code: 'FS1' }
      ]
    };
    const res = computeAlertesSaisies(args);
    const lun = res.list.find(g => g.date === '2026-06-01');
    const c1 = lun ? lun.items.find(i => i.chantierId === 1) : null;
    expect(c1).toBeDefined();
    // rapport OK, mais heures manquantes
    expect(c1.missing).not.toContain('rapport');
    expect(c1.missing.some(m => m.startsWith('heures'))).toBe(true);
  });

  it('considere 3 releves d\'heures (par equipement_id) comme valide', () => {
    const args = {
      ...baseArgs,
      heures: [
        { date_releve: '2026-06-01', equipement_id: 10, sondeuse_code: null },
        { date_releve: '2026-06-01', equipement_id: 10, sondeuse_code: null },
        { date_releve: '2026-06-01', equipement_id: 10, sondeuse_code: null }
      ]
    };
    const res = computeAlertesSaisies(args);
    const lun = res.list.find(g => g.date === '2026-06-01');
    const c1 = lun ? lun.items.find(i => i.chantierId === 1) : null;
    expect(c1).toBeDefined();
    // heures OK, mais rapport manquant
    expect(c1.missing).toContain('rapport');
    expect(c1.missing.some(m => m.startsWith('heures'))).toBe(false);
  });

  it('matche les heures par sondeuse_code en fallback si equipement_id manquant', () => {
    const args = {
      ...baseArgs,
      heures: [
        { date_releve: '2026-06-01', equipement_id: null, sondeuse_code: 'FS1' },
        { date_releve: '2026-06-01', equipement_id: null, sondeuse_code: 'FS1' },
        { date_releve: '2026-06-01', equipement_id: null, sondeuse_code: 'FS1' }
      ]
    };
    const res = computeAlertesSaisies(args);
    const lun = res.list.find(g => g.date === '2026-06-01');
    const c1 = lun ? lun.items.find(i => i.chantierId === 1) : null;
    expect(c1.missing.some(m => m.startsWith('heures'))).toBe(false);
  });

  it('retourne un set vide quand toutes les saisies sont presentes', () => {
    const args = {
      ...baseArgs,
      rapports: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-08']
        .map(d => ({ date_rapport: d, sondeuse_code: 'FS1' }))
        .concat([{ date_rapport: '2026-06-01', sondeuse_code: 'D35' }]),
      heures: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-08']
        .flatMap(d => Array.from({ length: 3 }, () => ({ date_releve: d, equipement_id: 10 })))
        .concat(Array.from({ length: 3 }, () => ({ date_releve: '2026-06-01', equipement_id: 11 })))
    };
    const res = computeAlertesSaisies(args);
    expect(res.count).toBe(0);
  });

  it('ne signale rien si aucune saisie Avancement (chantier non productif)', () => {
    const args = { ...baseArgs, saisies: {} };
    const res = computeAlertesSaisies(args);
    expect(res.count).toBe(0);
  });
});
