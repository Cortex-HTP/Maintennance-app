// =====================================================================
// /api/gmail - Emails Google Workspace (lecture seule)
// =====================================================================
// Etape 1 (mise en service) : action "sante" = verifie la cle du compte de
// service et la delegation au niveau du domaine SANS LIRE AUCUNE DONNEE :
// on demande seulement a Google un jeton d'acces pour une boite du domaine,
// sans appeler Gmail. Le jeton n'est jamais renvoye.
// POST { action: "sante", sujet: "prenom.nom@wallislabel.nc" }
//   -> { ok: true } ou { ok: false, etape, code, error }
// Les actions de lecture (liste, message...) arriveront avec l'identite
// verifiee de l'utilisateur : chacun ne pourra lire QUE sa propre boite.
// =====================================================================
const { jetonGoogle, cleCompteService, adresseDuDomaine, SCOPE_GMAIL, SCOPE_AGENDA, DOMAINE } = require('./_google.js');
const { identiteAdmin } = require('./_identite.js');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST uniquement' });
  const body = req.body || {};
  if (body.action === 'sante') {
    // Reserve aux administrateurs connectes (test des boites de l'equipe)
    const moi = await identiteAdmin(req);
    if (!moi) return res.status(401).json({ ok: false, error: 'Session requise' });
    if (!moi.estAdmin) return res.status(403).json({ ok: false, error: 'Reserve aux administrateurs' });
    const sujet = adresseDuDomaine(body.sujet);
    if (!sujet) return res.status(400).json({ ok: false, error: 'Adresse @' + DOMAINE + ' requise' });
    try {
      cleCompteService();
      await jetonGoogle(sujet, [SCOPE_GMAIL]);
      let agenda = true;
      try { await jetonGoogle(sujet, [SCOPE_AGENDA]); } catch (e) { agenda = false; }
      return res.status(200).json({ ok: true, gmail: true, agenda: agenda });
    } catch (e) {
      return res.status(200).json({ ok: false, etape: e.etape || 'inconnue', code: e.code || null, error: e.message });
    }
  }
  return res.status(400).json({ ok: false, error: 'action invalide' });
};
