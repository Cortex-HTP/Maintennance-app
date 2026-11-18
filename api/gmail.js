// =====================================================================
// /api/gmail - Emails et agenda Google Workspace (LECTURE SEULE)
// =====================================================================
// L'adresse lue est deduite de l'identite VERIFIEE (jamais choisie par le client)
//  - bureau (APP Wallis-Label admin) : session Supabase -> SA boite personnelle
//    (adresse reliee u:<id> dans emails_boites, sinon email de connexion
//    @wallislabel.nc ; l'email de connexion d'un autre compte est refuse)
//  - employe (APP Employes) : jeton PIN (X-Pin-Token) valide par l'APP Employes
//    (/api/pin-identite, acces actif) -> boite de la MACHINE sur laquelle il est
//    connecte (m:<id equipement>, reliee par un administrateur)
// Aucun email n'est stocke : tout est lu en direct, en lecture seule.
//
// POST { action, ... }
//   compte                          -> { nonlus }                (pastille)
//   boite   { onglet, q, page }     -> { messages, suivant, nonlus }
//   message { id }                  -> { texte, pieces, lienGmail, ... }
//   piece   { id, piece }           -> { data (base64) }         (< 3,5 Mo)
//   agenda                          -> { evenements }            (aujourd'hui)
//   tri     { ids }                 -> { tri }  (bureau : categorie + tache proposee par l'IA)
//   sante   { sujet }               -> { ok }   (administrateur : la boite repond ?)
// =====================================================================
const { jetonGoogle, cleCompteService, adresseDuDomaine, SCOPE_GMAIL, SCOPE_AGENDA, DOMAINE } = require('./_google.js');
const { identiteAdmin, urlSupabase } = require('./_identite.js');

const ORIGINES = ['https://employes-psi.vercel.app', 'https://app.wallislabel.nc', 'https://maintennance-app.vercel.app'];
const EMPLOYES_IDENTITE = 'https://employes-psi.vercel.app/api/pin-identite';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const AGENDA = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const MODELE_IA = 'claude-haiku-4-5';
const MAX_PIECE = 3 * 1024 * 1024; // en base64 ~4 Mo : sous la limite de reponse Vercel (4,5 Mo)

function cors(req, res) {
  const o = req.headers.origin || '';
  if (ORIGINES.indexOf(o) >= 0) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Pin-Token');
}
function service() { const k = process.env.SUPABASE_SERVICE_ROLE_KEY; return { apikey: k, Authorization: 'Bearer ' + k }; }

// Adresses reliees (table emails_boites). Table pas encore creee = aucune ;
// toute AUTRE erreur fait echouer la requete (jamais de repli silencieux
// vers une autre adresse pendant une panne).
async function corrections(cles) {
  if (!cles.length) return {};
  const filtre = encodeURIComponent('in.(' + cles.map((c) => '"' + String(c).replace(/["\\]/g, '') + '"').join(',') + ')');
  const r = await fetch(urlSupabase() + '/rest/v1/emails_boites?select=cle,email_societe&cle=' + filtre, { headers: service() });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    if (r.status === 404 || /42P01|does not exist|schema cache/i.test(t)) return {};
    const e = new Error('lecture des boites impossible'); e.indispo = true; throw e;
  }
  const rows = await r.json();
  const m = {}; (rows || []).forEach((x) => { m[x.cle] = x.email_societe; });
  return m;
}
async function membresBureau() {
  const r = await fetch(urlSupabase() + '/rest/v1/parametres?select=valeur&categorie=eq.emails_bureau', { headers: service() });
  if (!r.ok) { const e = new Error('lecture du bureau impossible'); e.indispo = true; throw e; }
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) return null;
  try { const l = JSON.parse(rows[0].valeur || '[]'); return Array.isArray(l) ? l.map(String) : []; } catch (e) { return []; }
}
async function emailsConnexionBureau() {
  const r = await fetch(urlSupabase() + '/rest/v1/app_users?select=id,email', { headers: service() });
  if (!r.ok) { const e = new Error('lecture des comptes impossible'); e.indispo = true; throw e; }
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).map((u) => ({ id: u.id, email: String(u.email || '').toLowerCase() }));
}

// Boite lue :
//  - employe (APP Employes) : la boite de la MACHINE sur laquelle il est
//    connecte (cle m:<id equipement>), reliee par un administrateur. Le jeton
//    PIN est verifie (acces actif) ; la boite d'une machine est partagee par
//    son equipe.
//  - bureau : sa boite personnelle = adresse reliee (u:<id>) sinon son email
//    de connexion en @wallislabel.nc. Une adresse reliee qui est l'email de
//    connexion d'un AUTRE compte est refusee (pas de lecture de la boite d'un
//    collegue en se la reliant).
async function identite(req, body) {
  const pin = String(req.headers['x-pin-token'] || '');
  if (pin) {
    const r = await fetch(EMPLOYES_IDENTITE, { method: 'POST', headers: { 'X-Pin-Token': pin } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok || !d.code) return null;
    const machine = String(body.machine || '').trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(machine)) return { type: 'employe', nom: d.nom, boite: null, estAdmin: false };
    const ov = await corrections(['m:' + machine]);
    return { type: 'employe', nom: d.nom, boite: adresseDuDomaine(ov['m:' + machine]), estAdmin: false, machine: machine };
  }
  const a = await identiteAdmin(req);
  if (!a) return null;
  const cleU = 'u:' + (a.fiche ? a.fiche.id : a.email);
  // Seules les personnes du BUREAU (liste choisie dans Administration > Emails)
  // ont une boite personnelle. Liste pas encore choisie = tout le monde.
  const membres = await membresBureau();
  if (membres && membres.indexOf(cleU) < 0) return { type: 'bureau', nom: (a.fiche && a.fiche.nom) || a.email, boite: null, horsBureau: true, estAdmin: a.estAdmin };
  const ov = await corrections([cleU]);
  const reliee = adresseDuDomaine(ov[cleU]);
  if (reliee && reliee !== a.email) {
    const autres = (await emailsConnexionBureau()).filter((u) => u.email === reliee && u.email !== a.email);
    if (autres.length) return { type: 'bureau', nom: (a.fiche && a.fiche.nom) || a.email, boite: null, conflit: true, estAdmin: a.estAdmin };
  }
  return { type: 'bureau', nom: (a.fiche && a.fiche.nom) || a.email, boite: reliee || adresseDuDomaine(a.email), estAdmin: a.estAdmin };
}

async function google(jeton, url) {
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + jeton } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((d.error && d.error.message) || ('Google HTTP ' + r.status)); e.statut = r.status; throw e; }
  return d;
}
function entete(headers, nom) {
  const h = (headers || []).filter((x) => String(x.name || '').toLowerCase() === nom.toLowerCase())[0];
  return h ? String(h.value || '') : '';
}
function expediteur(v) {
  const m = String(v || '').match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { nom: m[1].trim() || m[2].trim(), email: m[2].trim().toLowerCase() };
  return { nom: String(v || '').trim(), email: String(v || '').trim().toLowerCase() };
}
function resumeMessage(m) {
  const h = (m.payload && m.payload.headers) || [];
  const de = expediteur(entete(h, 'From'));
  const labels = m.labelIds || [];
  return {
    id: m.id, threadId: m.threadId, de: de.nom, deEmail: de.email, objet: entete(h, 'Subject') || '(sans objet)',
    extrait: decoderEntites(m.snippet || ''), date: Number(m.internalDate) || null,
    nonlu: labels.indexOf('UNREAD') >= 0, pj: !!(m.payload && /multipart\/mixed/i.test(m.payload.mimeType || ''))
  };
}
function decoderEntites(s) {
  return String(s || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (x, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (x, n) => String.fromCodePoint(parseInt(n, 16)));
}
function htmlVersTexte(html) {
  let s = String(html || '');
  s = s.replace(/<(script|style|head|title)[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|h[1-6]|table|blockquote)>/gi, '\n').replace(/<li[^>]*>/gi, '\n- ');
  s = s.replace(/<a [^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (x, href, txt) => { const t = txt.replace(/<[^>]+>/g, '').trim(); return t && t !== href ? t + ' (' + href + ')' : href; });
  s = s.replace(/<[^>]+>/g, '');
  s = decoderEntites(s);
  return s.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function decoderPartie(part) {
  const buf = Buffer.from(String(part.body.data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const ct = entete(part.headers, 'Content-Type');
  return /charset="?(iso-8859-1|windows-1252|latin1)/i.test(ct) ? buf.toString('latin1') : buf.toString('utf8');
}
function parcourir(part, acc) {
  if (!part) return;
  const mt = String(part.mimeType || '').toLowerCase();
  if (part.filename && part.body && part.body.attachmentId) acc.pieces.push({ id: part.body.attachmentId, nom: part.filename, type: mt || 'application/octet-stream', taille: part.body.size || 0 });
  else if (mt === 'text/plain' && part.body && part.body.data && !acc.texte) acc.texte = decoderPartie(part);
  else if (mt === 'text/html' && part.body && part.body.data && !acc.html) acc.html = decoderPartie(part);
  (part.parts || []).forEach((p) => parcourir(p, acc));
}
function heureNC(dt) { const d = new Date(Date.parse(dt) + 11 * 3600e3); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); }
const RE_ID = /^[A-Za-z0-9_-]{6,200}$/;

module.exports = async function handler(req, res) {
  cors(req, res);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST uniquement' });
  const body = req.body || {};
  const action = body.action;
  let moi;
  try { moi = await identite(req, body); }
  catch (e) { return res.status(503).json({ ok: false, code: 'indisponible', error: 'Service momentanément indisponible, réessaie dans un instant' }); }
  if (!moi) return res.status(401).json({ ok: false, error: 'Connexion requise' });

  // ── Test d'une boite de l'equipe (administrateur) : jeton seulement, aucune lecture ──
  if (action === 'sante') {
    if (!moi.estAdmin) return res.status(403).json({ ok: false, error: 'Reserve aux administrateurs' });
    const sujet = adresseDuDomaine(body.sujet);
    if (!sujet) return res.status(400).json({ ok: false, error: 'Adresse @' + DOMAINE + ' requise' });
    try { cleCompteService(); await jetonGoogle(sujet, [SCOPE_GMAIL]); return res.status(200).json({ ok: true }); }
    catch (e) { return res.status(200).json({ ok: false, etape: e.etape || 'inconnue', code: e.code || null, error: e.code === 'invalid_grant' ? 'Boite introuvable chez Google' : e.message }); }
  }

  if (moi.horsBureau) return res.status(409).json({ ok: false, code: 'hors_bureau', error: 'Boîte mail réservée aux personnes du bureau (Administration › Emails)' });
  if (moi.conflit) return res.status(409).json({ ok: false, code: 'conflit', error: 'L\'adresse reliée à ton compte est celle d\'un autre compte : corrige-la dans Administration › Emails' });
  if (!moi.boite) return res.status(409).json({ ok: false, code: 'sans_boite', error: moi.type === 'employe' ? 'La boîte mail de cette machine n\'est pas encore renseignée' : 'Ton adresse @' + DOMAINE + ' n\'est pas encore renseignée' });
  let jeton;
  try { jeton = await jetonGoogle(moi.boite, [action === 'agenda' ? SCOPE_AGENDA : SCOPE_GMAIL]); }
  catch (e) {
    if (e.code === 'invalid_grant') return res.status(409).json({ ok: false, code: 'boite_inconnue', error: 'La boite ' + moi.boite + ' est introuvable chez Google' });
    return res.status(502).json({ ok: false, code: 'google', error: 'Connexion Google impossible : ' + e.message });
  }

  try {
    if (action === 'compte') {
      const l = await google(jeton, GMAIL + '/labels/INBOX');
      return res.status(200).json({ ok: true, boite: moi.boite, nonlus: l.messagesUnread || 0 });
    }
    if (action === 'boite') {
      let q = 'in:inbox';
      if (body.onglet === 'nonlus') q += ' is:unread';
      if (body.onglet === 'pj') q += ' has:attachment';
      const rech = String(body.q || '').replace(/[\r\n]/g, ' ').trim().slice(0, 120);
      if (rech) q += ' ' + rech;
      const n = Math.min(Math.max(parseInt(body.max, 10) || 25, 1), 40);
      let url = GMAIL + '/messages?maxResults=' + n + '&q=' + encodeURIComponent(q);
      if (body.page && RE_ID.test(String(body.page))) url += '&pageToken=' + encodeURIComponent(body.page);
      const [liste, inbox] = await Promise.all([google(jeton, url), google(jeton, GMAIL + '/labels/INBOX')]);
      const ids = (liste.messages || []).map((m) => m.id);
      const metas = await Promise.all(ids.map((id) => google(jeton, GMAIL + '/messages/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date').catch(() => null)));
      return res.status(200).json({ ok: true, boite: moi.boite, nonlus: inbox.messagesUnread || 0, messages: metas.filter(Boolean).map(resumeMessage), suivant: liste.nextPageToken || null });
    }
    if (action === 'message') {
      if (!RE_ID.test(String(body.id || ''))) return res.status(400).json({ ok: false, error: 'id invalide' });
      const m = await google(jeton, GMAIL + '/messages/' + body.id + '?format=full');
      const acc = { texte: '', html: '', pieces: [] };
      parcourir(m.payload, acc);
      const h = (m.payload && m.payload.headers) || [];
      let texte = acc.texte ? acc.texte.replace(/\r\n/g, '\n') : htmlVersTexte(acc.html);
      if (texte.length > 60000) texte = texte.slice(0, 60000) + '\n\n[... message tronque : la suite est dans Gmail]';
      const r = resumeMessage(m);
      return res.status(200).json(Object.assign({ ok: true }, r, {
        a: entete(h, 'To'), cc: entete(h, 'Cc'), texte: texte, pieces: acc.pieces,
        lienGmail: 'https://mail.google.com/mail/u/' + encodeURIComponent(moi.boite) + '/#all/' + m.threadId
      }));
    }
    if (action === 'piece') {
      if (!RE_ID.test(String(body.id || '')) || !/^[A-Za-z0-9_-]{10,2000}$/.test(String(body.piece || ''))) return res.status(400).json({ ok: false, error: 'pièce invalide' });
      const p = await google(jeton, GMAIL + '/messages/' + body.id + '/attachments/' + body.piece);
      if ((p.size || 0) > MAX_PIECE) return res.status(413).json({ ok: false, error: 'Pièce jointe trop lourde pour l\'app : ouvre-la dans Gmail' });
      return res.status(200).json({ ok: true, data: String(p.data || '').replace(/-/g, '+').replace(/_/g, '/') });
    }
    if (action === 'agenda') {
      const jour = new Date(Date.now() + 11 * 3600e3).toISOString().slice(0, 10); // date calendaire de Noumea (UTC+11, sans heure d'ete)
      const url = AGENDA + '?singleEvents=true&orderBy=startTime&maxResults=25&timeMin=' + encodeURIComponent(jour + 'T00:00:00+11:00') + '&timeMax=' + encodeURIComponent(jour + 'T23:59:59+11:00');
      const d = await google(jeton, url);
      const ev = (d.items || []).filter((e) => e.status !== 'cancelled').map((e) => ({
        titre: e.summary || '(sans titre)', lieu: e.location || '', journee: !!(e.start && e.start.date),
        debut: e.start && e.start.dateTime ? heureNC(e.start.dateTime) : null, fin: e.end && e.end.dateTime ? heureNC(e.end.dateTime) : null
      }));
      return res.status(200).json({ ok: true, jour: jour, evenements: ev });
    }
    if (action === 'tri') {
      if (moi.type !== 'bureau') return res.status(403).json({ ok: false, error: 'Réservé au tableau de bord du bureau' });
      const KEY = process.env.ANTHROPIC_API_KEY;
      if (!KEY) return res.status(500).json({ ok: false, error: 'IA non configurée' });
      const ids = (Array.isArray(body.ids) ? body.ids : []).filter((id) => RE_ID.test(String(id))).slice(0, 12);
      if (!ids.length) return res.status(200).json({ ok: true, tri: [] });
      const metas = (await Promise.all(ids.map((id) => google(jeton, GMAIL + '/messages/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject').catch(() => null)))).filter(Boolean);
      const lignes = metas.map((m) => { const r = resumeMessage(m); return 'ID: ' + r.id + '\nDe: ' + r.de + ' <' + r.deEmail + '>\nObjet: ' + r.objet + '\nExtrait: ' + r.extrait; }).join('\n\n');
      const consigne = 'Tu tries les emails professionnels recus par un employe de bureau d\'une entreprise de forage en Nouvelle-Caledonie (sondages miniers, ateliers, chantiers). '
        + 'Pour CHAQUE email, renvoie : cat parmi "client" (demande d\'un client ou prospect), "facture" (facture, paiement, devis fournisseur), "echeance" (date limite, contrat, declaration, rendez-vous administratif), "livraison" (expedition, reception), "rh" (personnel, paie, conges, recrutement), "info" (pour information, newsletter, notification automatique) ; '
        + 'resume : une phrase en francais (140 caracteres maximum) ; tache : null si rien a faire (newsletter, information, notification), sinon { "titre": action concrete commencant par un verbe (70 caracteres maximum), "ech": nombre de jours pour le faire (0 a 30), "prio": "normale", "haute" ou "urgente" }. '
        + 'Les NOTIFICATIONS AUTOMATIQUES sont toujours cat "info" et tache null : expediteur noreply / no-reply / ne-pas-repondre, Mail Delivery Subsystem, avis de non-remise, alertes Google ou de securite, accuses de reception, rapports ou documents signes envoyes par une application, newsletters. '
        + 'Reponds UNIQUEMENT avec un objet JSON valide de la forme {"emails":[{"id":"...","cat":"...","resume":"...","tache":null}]} sans aucun autre texte.';
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODELE_IA, max_tokens: 2000, temperature: 0, system: consigne, messages: [{ role: 'user', content: lignes }] })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(502).json({ ok: false, error: 'IA indisponible' });
      const brut = ((d.content || []).filter((c) => c.type === 'text')[0] || {}).text || '';
      let sortie = [];
      try { const i = brut.indexOf('{'), j = brut.lastIndexOf('}'); sortie = (JSON.parse(brut.slice(i, j + 1)).emails || []); } catch (e) { sortie = []; }
      const CATS = ['client', 'facture', 'echeance', 'livraison', 'rh', 'info'];
      const PRIOS = ['normale', 'haute', 'urgente'];
      const propre = sortie.filter((x) => x && ids.indexOf(String(x.id)) >= 0).map((x) => ({
        id: String(x.id), cat: CATS.indexOf(x.cat) >= 0 ? x.cat : 'info', resume: String(x.resume || '').slice(0, 200),
        tache: x.tache && x.tache.titre ? { titre: String(x.tache.titre).slice(0, 90), ech: Math.min(Math.max(parseInt(x.tache.ech, 10) || 0, 0), 60), prio: PRIOS.indexOf(x.tache.prio) >= 0 ? x.tache.prio : 'normale' } : null
      }));
      return res.status(200).json({ ok: true, tri: propre });
    }
    return res.status(400).json({ ok: false, error: 'action invalide' });
  } catch (e) {
    return res.status(502).json({ ok: false, code: 'google', error: 'Lecture impossible : ' + e.message });
  }
};
