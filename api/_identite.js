// =====================================================================
// Identite d'un utilisateur de l'APP Wallis-Label admin (session Supabase)
// =====================================================================
// Verifie le JWT Supabase (Authorization: Bearer ...) puis relit la fiche
// app_users (comparaison EXACTE de l'email, pas de ilike : "_" y est un joker).
// Renvoie null si la session est invalide ou le compte inconnu / inactif.
// =====================================================================
const ADMIN_EMAIL = 'tom.wallislabel@gmail.com'; // meme constante que l'app

function urlSupabase() {
  return String(process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/auth\/v1\/?$/, '').replace(/\/$/, '');
}

async function identiteAdmin(req) {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return null;
  const URL_SB = urlSupabase(), ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_SB || !ANON || !SERVICE) return null;
  const meResp = await fetch(URL_SB + '/auth/v1/user', { headers: { apikey: ANON, Authorization: auth } });
  if (!meResp.ok) return null;
  const me = await meResp.json().catch(() => ({}));
  const email = String(me.email || '').toLowerCase();
  if (!email) return null;
  const r = await fetch(URL_SB + '/rest/v1/app_users?select=id,email,nom,role,statut', { headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE } });
  const rows = await r.json().catch(() => []);
  const fiche = (Array.isArray(rows) ? rows : []).filter((u) => String(u.email || '').toLowerCase() === email)[0] || null;
  const estAdmin = email === ADMIN_EMAIL || !!(fiche && fiche.role === 'Administrateur' && fiche.statut !== 'Inactif');
  if (!fiche && !estAdmin) return null;
  if (fiche && fiche.statut === 'Inactif') return null;
  return { email, fiche, estAdmin };
}

module.exports = { identiteAdmin, urlSupabase };
