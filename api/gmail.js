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
// Aucun email n'est stocke : tout est lu en direct. Seule ecriture possible :
// l'ENVOI d'un email depuis la boite de l'utilisateur (action envoyer, droit
// gmail.send seul : l'app ne peut toujours ni supprimer ni modifier un email).
//
// POST { action, ... }
//   compte                          -> { nonlus }                (pastille)
//   boite   { onglet, q, page }     -> { messages, suivant, nonlus }   (onglet envoyes = in:sent)
//   envoyer { a, cc, objet, texte, repondreA?, photos? } -> { id, threadId }
//            signature au nom de l'employe ajoutee ici, 40 envois / jour / boite,
//            trace dans audit_logs (sans le contenu)
//   message { id }                  -> { texte, pieces, lienGmail, ... }
//   piece   { id, piece }           -> { data (base64) }         (< 3,5 Mo)
//   agenda { jour? AAAA-MM-JJ }     -> { jour, evenements }      (defaut : aujourd'hui)
//   tri     { ids }                 -> { tri }  (bureau : categorie + tache proposee par l'IA)
//   sante   { sujet }               -> { ok }   (administrateur : la boite repond ?)
// =====================================================================
const { jetonGoogle, cleCompteService, adresseDuDomaine, SCOPE_GMAIL, SCOPE_AGENDA, SCOPE_ENVOI, DOMAINE } = require('./_google.js');
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
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(machine)) return { type: 'employe', nom: d.nom, code: d.code, boite: null, estAdmin: false };
    const ov = await corrections(['m:' + machine]);
    return { type: 'employe', nom: d.nom, code: d.code, boite: adresseDuDomaine(ov['m:' + machine]), estAdmin: false, machine: machine };
  }
  const a = await identiteAdmin(req);
  if (!a) return null;
  const cleU = 'u:' + (a.fiche ? a.fiche.id : a.email);
  // Seules les personnes du BUREAU (liste choisie dans Administration > Emails)
  // ont une boite personnelle. Liste pas encore choisie = tout le monde.
  const membres = await membresBureau();
  if (membres && membres.indexOf(cleU) < 0) return { type: 'bureau', nom: (a.fiche && a.fiche.nom) || a.email, email: a.email, boite: null, horsBureau: true, estAdmin: a.estAdmin };
  const ov = await corrections([cleU]);
  const reliee = adresseDuDomaine(ov[cleU]);
  if (reliee && reliee !== a.email) {
    const autres = (await emailsConnexionBureau()).filter((u) => u.email === reliee && u.email !== a.email);
    if (autres.length) return { type: 'bureau', nom: (a.fiche && a.fiche.nom) || a.email, email: a.email, boite: null, conflit: true, estAdmin: a.estAdmin };
  }
  return { type: 'bureau', nom: (a.fiche && a.fiche.nom) || a.email, email: a.email, boite: reliee || adresseDuDomaine(a.email), estAdmin: a.estAdmin };
}

// ── Envoi (MIME construit ici : en-tetes encodes, aucune injection possible) ──
const RE_EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}$/;
const MAX_ENVOIS_JOUR = 40;
const MAX_PHOTOS = 5;
const MAX_PHOTOS_B64 = 3400000; // corps de requete Vercel <= 4,5 Mo
// Mot d'en-tete : ASCII tel quel, sinon RFC 2047 (=?UTF-8?B?...?=)
function motEntete(s) {
  const t = String(s || '').replace(/[\r\n]+/g, ' ').trim();
  return /^[\x20-\x7e]*$/.test(t) ? t : '=?UTF-8?B?' + Buffer.from(t, 'utf8').toString('base64') + '?=';
}
function decoderMots(v) {
  return String(v || '').replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/gi, (x, b) => { try { return Buffer.from(b, 'base64').toString('utf8'); } catch (e) { return x; } });
}
function base64Lignes(buf) { return buf.toString('base64').replace(/(.{76})/g, '$1\r\n'); }
// "a@b.nc, c@d.nc" ou ["a@b.nc"] -> liste validee (max n, sans doublon)
function adresses(v, max, nomChamp) {
  const brut = Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/);
  const out = [];
  brut.forEach((x) => {
    const s = String(x || '').trim();
    if (!s) return;
    if (!RE_EMAIL.test(s)) { const e = new Error('Adresse invalide (' + nomChamp + ') : ' + s.slice(0, 80)); e.statut = 400; throw e; }
    if (out.map((y) => y.toLowerCase()).indexOf(s.toLowerCase()) < 0) out.push(s);
  });
  if (out.length > max) { const e = new Error('Trop de destinataires (' + nomChamp + ', ' + max + ' max)'); e.statut = 400; throw e; }
  return out;
}
function nomFichier(n, i, type) {
  const ext = type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  let s = String(n || '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(0, 60);
  if (!s) s = 'photo-' + (i + 1);
  if (!/\.(jpe?g|png|webp|pdf)$/i.test(s)) s += '.' + ext;
  return s;
}
// Signature ajoutee AU SERVEUR (la boite d'une machine est partagee : le
// destinataire doit savoir qui a ecrit)
function signature(moi) {
  const lib = String(moi.boite || '').split('@')[0].toUpperCase();
  if (moi.type === 'employe') return moi.nom + '\nWallis-Label - équipe ' + lib + '\n' + moi.boite;
  return moi.nom + '\nWallis-Label\n' + moi.boite;
}
function construireMime(o) {
  const frontiere = 'wl_' + require('crypto').randomBytes(12).toString('hex');
  const crlf = (s) => String(s).replace(/\r?\n/g, '\r\n');
  const h = [];
  h.push('From: ' + motEntete(o.nomExpediteur) + ' <' + o.de + '>');
  h.push('To: ' + o.a.join(', '));
  if (o.cc.length) h.push('Cc: ' + o.cc.join(', '));
  h.push('Subject: ' + motEntete(o.objet));
  if (o.inReplyTo) h.push('In-Reply-To: ' + o.inReplyTo);
  if (o.references) h.push('References: ' + o.references);
  h.push('X-Wallis-Employe: ' + motEntete(o.par));
  h.push('MIME-Version: 1.0');
  const corps = base64Lignes(Buffer.from(crlf(o.texte), 'utf8'));
  if (!o.photos.length) {
    h.push('Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64');
    return h.join('\r\n') + '\r\n\r\n' + corps + '\r\n';
  }
  h.push('Content-Type: multipart/mixed; boundary="' + frontiere + '"');
  let m = h.join('\r\n') + '\r\n\r\n';
  m += '--' + frontiere + '\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n' + corps + '\r\n';
  o.photos.forEach((p) => {
    m += '--' + frontiere + '\r\nContent-Type: ' + p.type + '; name="' + p.nom + '"\r\nContent-Disposition: attachment; filename="' + p.nom + '"\r\nContent-Transfer-Encoding: base64\r\n\r\n' + base64Lignes(Buffer.from(p.data, 'base64')) + '\r\n';
  });
  return m + '--' + frontiere + '--\r\n';
}
async function tracerEnvoi(moi, details) {
  try {
    await fetch(urlSupabase() + '/rest/v1/audit_logs', {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, service()),
      body: JSON.stringify({ actor_email: moi.type === 'employe' ? 'employe:' + moi.code : moi.email, actor_role: moi.type, action: 'email_envoye', target_type: 'email', target_id: details.id || null, details: details })
    });
  } catch (e) { /* la trace ne doit jamais bloquer un envoi deja parti */ }
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
  const r = {
    id: m.id, threadId: m.threadId, de: de.nom, deEmail: de.email, objet: entete(h, 'Subject') || '(sans objet)',
    extrait: decoderEntites(m.snippet || ''), date: Number(m.internalDate) || null,
    nonlu: labels.indexOf('UNREAD') >= 0, pj: !!(m.payload && /multipart\/mixed/i.test(m.payload.mimeType || ''))
  };
  const to = entete(h, 'To');
  if (to) r.a = to.split(',').map((x) => expediteur(x).nom).filter(Boolean).join(', ').slice(0, 200);
  const par = entete(h, 'X-Wallis-Employe');
  if (par) r.par = decoderMots(par).slice(0, 80);
  return r;
}
// Entites nommees les plus courantes dans les emails (francais + symboles)
const ENTITES = {
  rarr: '→', larr: '←', harr: '↔', rArr: '⇒', hellip: '…', mdash: '—', ndash: '–', euro: '€', laquo: '«', raquo: '»', deg: '°',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ouml: 'ö', ucirc: 'û', ugrave: 'ù', uuml: 'ü', icirc: 'î', iuml: 'ï',
  Eacute: 'É', Egrave: 'È', Agrave: 'À', Ccedil: 'Ç', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', bull: '•', middot: '·', times: '×', copy: '©', reg: '®', trade: '™',
  check: '✓', checkmark: '✓', sup2: '²', frac12: '½', shy: '', zwnj: '', thinsp: ' ', ensp: ' ', emsp: ' '
};
function decoderEntites(s) {
  return String(s || '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (x, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (x, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([A-Za-z][A-Za-z0-9]{1,10});/g, (x, n) => (Object.prototype.hasOwnProperty.call(ENTITES, n) ? ENTITES[n] : x))
    .replace(/&amp;/g, '&'); // en dernier : "&amp;rarr;" reste "&rarr;" ecrit en clair
}
// HTML -> texte lisible. Les TABLEAUX gardent leur structure : une ligne par
// ligne de tableau, cellules separees par " · " (avant, les cellules etaient
// collees : "NomRoleHeuresBRYAN STUARTSondeur11:30...").
const SEP_CELLULE = '\u0001';
function htmlVersTexte(html) {
  let s = String(html || '');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|head|title)[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/[\r\n]+/g, ' '); // les retours a la ligne du code HTML ne comptent pas
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<hr[^>]*>/gi, '\n');
  s = s.replace(/<tr[^>]*>/gi, '\n').replace(/<\/t[dh]>/gi, SEP_CELLULE);
  // (pas </tr> : le <tr> suivant ouvre deja une ligne -> pas de ligne vide entre deux lignes du tableau)
  s = s.replace(/<\/(p|div|h[1-6]|table|blockquote|section|article|header|footer|ul|ol|li|center)>/gi, '\n').replace(/<li[^>]*>/gi, '\n- ');
  s = s.replace(/<h[1-6][^>]*>/gi, '\n\n');
  s = s.replace(/<a [^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (x, href, txt) => { const t = txt.replace(/<[^>]+>/g, '').trim(); return t && t !== href ? t + ' (' + href + ')' : href; });
  s = s.replace(/<[^>]+>/g, '');
  s = decoderEntites(s);
  return s.split('\n').map((l) => {
    if (l.indexOf(SEP_CELLULE) < 0) return l.replace(/[ \t ]+/g, ' ').trim();
    return l.split(SEP_CELLULE).map((c) => c.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean).join('  ·  ');
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
      const envoyes = body.onglet === 'envoyes';
      let q = envoyes ? 'in:sent' : 'in:inbox';
      if (body.onglet === 'nonlus') q += ' is:unread';
      if (body.onglet === 'pj') q += ' has:attachment';
      const rech = String(body.q || '').replace(/[\r\n]/g, ' ').trim().slice(0, 120);
      if (rech) q += ' ' + rech;
      const n = Math.min(Math.max(parseInt(body.max, 10) || 25, 1), 40);
      let url = GMAIL + '/messages?maxResults=' + n + '&q=' + encodeURIComponent(q);
      if (body.page && RE_ID.test(String(body.page))) url += '&pageToken=' + encodeURIComponent(body.page);
      const [liste, inbox] = await Promise.all([google(jeton, url), google(jeton, GMAIL + '/labels/INBOX')]);
      const ids = (liste.messages || []).map((m) => m.id);
      const entetes = '&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date' + (envoyes ? '&metadataHeaders=To&metadataHeaders=X-Wallis-Employe' : '');
      const metas = await Promise.all(ids.map((id) => google(jeton, GMAIL + '/messages/' + id + '?format=metadata' + entetes).catch(() => null)));
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
    if (action === 'envoyer') {
      // 1. Contenu valide (rien d'invalide ne part)
      let a, cc;
      try { a = adresses(body.a, 10, 'À'); cc = adresses(body.cc, 10, 'Cc'); }
      catch (e) { return res.status(400).json({ ok: false, code: 'adresse', error: e.message }); }
      if (!a.length) return res.status(400).json({ ok: false, code: 'adresse', error: 'Indique au moins un destinataire' });
      const objet = String(body.objet || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
      if (!objet) return res.status(400).json({ ok: false, error: 'Ajoute un objet' });
      const texte = String(body.texte || '').slice(0, 30000);
      const photosBrutes = Array.isArray(body.photos) ? body.photos : [];
      if (photosBrutes.length > MAX_PHOTOS) return res.status(400).json({ ok: false, error: MAX_PHOTOS + ' pièces jointes maximum' });
      let poids = 0;
      const photos = [];
      for (let i = 0; i < photosBrutes.length; i++) {
        const p = photosBrutes[i] || {};
        const type = /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(String(p.type || '')) ? p.type : null; // photos ou PDF
        const data = String(p.data || '');
        if (!type || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return res.status(400).json({ ok: false, error: 'Pièce jointe ' + (i + 1) + ' illisible (photo ou PDF uniquement)' });
        poids += data.length;
        photos.push({ type: type, data: data, nom: nomFichier(p.nom, i, type) });
      }
      if (poids > MAX_PHOTOS_B64) return res.status(413).json({ ok: false, error: 'Pièces jointes trop lourdes (2,5 Mo au total) : retire-en une' });
      if (!texte.trim() && !photos.length) return res.status(400).json({ ok: false, error: 'Le message est vide' });
      // 2. Limite d'envois du jour (boite partagee par une equipe : pas d'envoi en boucle)
      const recents = await google(jeton, GMAIL + '/messages?maxResults=' + (MAX_ENVOIS_JOUR + 1) + '&q=' + encodeURIComponent('in:sent newer_than:1d'));
      if ((recents.messages || []).length >= MAX_ENVOIS_JOUR) return res.status(429).json({ ok: false, code: 'limite', error: 'Limite de ' + MAX_ENVOIS_JOUR + ' emails par jour atteinte pour cette boîte' });
      // 3. Reponse : meme conversation (threadId + In-Reply-To / References)
      let threadId = null, inReplyTo = null, references = null;
      if (body.repondreA) {
        if (!RE_ID.test(String(body.repondreA))) return res.status(400).json({ ok: false, error: 'Email d\'origine invalide' });
        const o = await google(jeton, GMAIL + '/messages/' + body.repondreA + '?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References');
        const hh = (o.payload && o.payload.headers) || [];
        const mid = entete(hh, 'Message-ID').replace(/[\r\n]/g, '').trim();
        threadId = o.threadId || null;
        if (/^<[^<>\s]{3,300}>$/.test(mid)) {
          inReplyTo = mid;
          const refs = entete(hh, 'References').replace(/[\r\n]+/g, ' ').trim().slice(0, 1800);
          references = (refs ? refs + ' ' : '') + mid;
        }
      }
      // 4. Message : texte + signature, photos en pieces jointes
      const corps = (texte.replace(/\s+$/, '') + '\n\n-- \n' + signature(moi)).replace(/^\n+/, '');
      // nom affiche : sans les caracteres speciaux d'une adresse (guillemets, virgules...)
      const nomPropre = String(moi.nom || '').replace(/["<>(),;:\\@[\]]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Wallis-Label';
      const nomExp = moi.type === 'employe' ? nomPropre + ' - Wallis-Label ' + String(moi.boite).split('@')[0].toUpperCase() : nomPropre + ' - Wallis-Label';
      const mime = construireMime({ de: moi.boite, nomExpediteur: nomExp, a: a, cc: cc, objet: objet, texte: corps, photos: photos, inReplyTo: inReplyTo, references: references, par: moi.nom });
      // 5. Envoi avec le SEUL droit d'envoi
      let jetonEnvoi;
      try { jetonEnvoi = await jetonGoogle(moi.boite, [SCOPE_ENVOI]); }
      catch (e) {
        if (e.code === 'unauthorized_client' || e.code === 'access_denied') return res.status(409).json({ ok: false, code: 'envoi_non_autorise', error: 'L\'envoi d\'emails n\'est pas encore autorisé chez Google : le bureau doit l\'activer (console Google Admin)' });
        return res.status(502).json({ ok: false, code: 'google', error: 'Connexion Google impossible : ' + e.message });
      }
      const envoi = { raw: Buffer.from(mime, 'utf8').toString('base64url') };
      if (threadId) envoi.threadId = threadId;
      const r = await fetch(GMAIL + '/messages/send', { method: 'POST', headers: { Authorization: 'Bearer ' + jetonEnvoi, 'Content-Type': 'application/json' }, body: JSON.stringify(envoi) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(502).json({ ok: false, code: 'google', error: 'Envoi refusé par Google : ' + ((d.error && d.error.message) || ('HTTP ' + r.status)) });
      await tracerEnvoi(moi, { id: d.id || null, boite: moi.boite, par: moi.nom, a: a, cc: cc, objet: objet, photos: photos.length, reponse: !!threadId });
      return res.status(200).json({ ok: true, id: d.id || null, threadId: d.threadId || null });
    }
    if (action === 'piece') {
      if (!RE_ID.test(String(body.id || '')) || !/^[A-Za-z0-9_-]{10,2000}$/.test(String(body.piece || ''))) return res.status(400).json({ ok: false, error: 'pièce invalide' });
      const p = await google(jeton, GMAIL + '/messages/' + body.id + '/attachments/' + body.piece);
      if ((p.size || 0) > MAX_PIECE) return res.status(413).json({ ok: false, error: 'Pièce jointe trop lourde pour l\'app : ouvre-la dans Gmail' });
      return res.status(200).json({ ok: true, data: String(p.data || '').replace(/-/g, '+').replace(/_/g, '/') });
    }
    if (action === 'agenda') {
      // Jour affiche : celui demande (fleches de la carte), sinon aujourd'hui a
      // Noumea (UTC+11, sans heure d'ete). Borne a +/- 1 an.
      const aujNC = new Date(Date.now() + 11 * 3600e3).toISOString().slice(0, 10);
      let jour = aujNC;
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(body.jour || ''))) {
        const ecart = Math.abs(Date.parse(body.jour + 'T00:00:00Z') - Date.parse(aujNC + 'T00:00:00Z')) / 86400e3;
        if (ecart <= 366) jour = body.jour;
      }
      // TOUS les agendas affiches (coches) dans Google Agenda, pas seulement le
      // principal : un rendez-vous cree dans « Travail » ou un agenda partage
      // apparait aussi. Max 10 agendas ; si la liste echoue, agenda principal.
      let agendas = ['primary'];
      try {
        const l = await google(jeton, 'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=50');
        const ids = (l.items || []).filter((c) => c.selected === true && !c.hidden && !c.deleted).map((c) => c.id).slice(0, 10);
        if (ids.length) agendas = ids;
      } catch (e) { /* repli : agenda principal */ }
      const plage = '?singleEvents=true&orderBy=startTime&maxResults=25&timeMin=' + encodeURIComponent(jour + 'T00:00:00+11:00') + '&timeMax=' + encodeURIComponent(jour + 'T23:59:59+11:00');
      const listes = await Promise.all(agendas.map((id) => google(jeton, (id === 'primary' ? AGENDA : 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(id) + '/events') + plage)
        .then((d) => d.items || []).catch(() => (id === 'primary' ? null : []))));
      if (listes.every((x) => x === null)) throw new Error('agenda illisible');
      const vus = {};
      const items = [].concat.apply([], listes.map((x) => x || [])).filter((e) => {
        const cle = (e.iCalUID || e.id) + '|' + ((e.start && (e.start.dateTime || e.start.date)) || '');
        if (vus[cle]) return false; vus[cle] = true; return true;
      }).sort((a, b) => String((a.start && (a.start.dateTime || a.start.date)) || '').localeCompare(String((b.start && (b.start.dateTime || b.start.date)) || '')));
      const ev = items.filter((e) => e.status !== 'cancelled').map((e) => ({
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
