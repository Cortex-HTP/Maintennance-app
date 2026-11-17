// =====================================================================
// Acces Google Workspace (Gmail / Agenda) par DELEGATION AU NIVEAU DU DOMAINE
// =====================================================================
// La cle du compte de service est dans la variable Vercel GOOGLE_SA_KEY
// (contenu JSON complet), posee par l'administrateur. Elle n'est JAMAIS
// renvoyee au client ni ecrite ailleurs.
// Un jeton d'acces est demande POUR UNE BOITE PRECISE (champ "sub") et pour
// des droits en LECTURE SEULE. L'appelant doit toujours deduire cette boite
// de l'identite verifiee de l'utilisateur (jamais d'un parametre libre).
// =====================================================================
const crypto = require('crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE_GMAIL = 'https://www.googleapis.com/auth/gmail.readonly';
const SCOPE_AGENDA = 'https://www.googleapis.com/auth/calendar.readonly';
const DOMAINE = 'wallislabel.nc';

let cle = null;
function erreur(message, etape, code) { const e = new Error(message); e.etape = etape; e.code = code || null; return e; }

function cleCompteService() {
  if (cle) return cle;
  const brut = process.env.GOOGLE_SA_KEY || '';
  if (!brut) throw erreur('Cle Google absente (GOOGLE_SA_KEY)', 'cle_absente');
  let j;
  try { j = JSON.parse(brut); } catch (e) { throw erreur('Cle Google illisible (le contenu doit etre le fichier JSON complet)', 'cle_illisible'); }
  if (!j || !j.client_email || !j.private_key) throw erreur('Cle Google incomplete', 'cle_incomplete');
  cle = { email: j.client_email, pk: String(j.private_key).replace(/\\n/g, '\n') };
  return cle;
}

function adresseDuDomaine(a) {
  const s = String(a || '').trim().toLowerCase();
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+$/.test(s) && s.endsWith('@' + DOMAINE) ? s : null;
}

// Cache des jetons (par boite + droits), reutilise tant que l'instance vit
const cache = new Map();
async function jetonGoogle(sujet, scopes) {
  const boite = adresseDuDomaine(sujet);
  if (!boite) throw erreur('Adresse hors domaine ' + DOMAINE, 'adresse');
  const k = boite + '|' + scopes.join(' ');
  const c = cache.get(k);
  if (c && c.exp > Date.now() + 60000) return c.jeton;
  const sa = cleCompteService();
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const entete = b64({ alg: 'RS256', typ: 'JWT' });
  const charge = b64({ iss: sa.email, sub: boite, scope: scopes.join(' '), aud: TOKEN_URL, iat: now, exp: now + 3600 });
  let signature;
  try { signature = crypto.createSign('RSA-SHA256').update(entete + '.' + charge).sign(sa.pk).toString('base64url'); }
  catch (e) { throw erreur('Cle Google invalide (signature impossible)', 'signature'); }
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: entete + '.' + charge + '.' + signature }).toString()
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw erreur(d.error_description || d.error || ('HTTP ' + r.status), 'jeton', d.error || null);
  cache.set(k, { jeton: d.access_token, exp: Date.now() + (Number(d.expires_in) || 3600) * 1000 });
  return d.access_token;
}

module.exports = { jetonGoogle, cleCompteService, adresseDuDomaine, SCOPE_GMAIL, SCOPE_AGENDA, DOMAINE };
