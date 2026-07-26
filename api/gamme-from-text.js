// =====================================================================
// /api/gamme-from-text - Convertit un commentaire libre en gamme d'operations (IA Claude)
// =====================================================================
// POST { text, machine?, typePanne? }  ->  { etapes: string[], source: 'ia'|'fallback' }
//
// Utilise a la RECEPTION d'une demande d'intervention (app Admin) : l'admin
// transforme le commentaire/description en une liste d'etapes cochables.
// Appel SERVER-SIDE : la cle Anthropic n'est jamais exposee au navigateur.
//
// Variables env (deja presentes cote Vercel pour /api/triage-releve) :
//   - ANTHROPIC_API_KEY            (obligatoire pour l'IA)
//   - SUPABASE_URL + SUPABASE_ANON_KEY (pour valider le JWT admin ; si absentes -> pas de verif)
//   - GAMME_MODEL (optionnel)      : defaut 'claude-opus-4-8' ; 'claude-haiku-4-5' = moins cher/rapide.
//
// Degradation gracieuse : pas de cle OU echec API -> decoupage local (1 ligne = 1 etape).
// =====================================================================

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.GAMME_MODEL || 'claude-opus-4-8';

function fallbackSplit(text) {
  return String(text || '')
    .split(/\r?\n|\s*[;•·▪]\s*/)
    .map(function (s) { return s.replace(/^[\s\-*•·▪\d.)]+/, '').trim(); })
    .filter(function (s) { return s.length > 1; })
    .slice(0, 40);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const text = String(body.text || '').trim();
  const machine = String(body.machine || '').trim();
  const typePanne = String(body.typePanne || '').trim();
  if (!text) return res.status(400).json({ error: 'Texte vide' });
  if (text.length > 6000) return res.status(400).json({ error: 'Texte trop long (max 6000 caracteres)' });

  // Auth : verifie le JWT Supabase si SUPABASE_URL + ANON_KEY configures (sinon on laisse passer).
  let SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/auth\/v1\/?$/, '').replace(/\/$/, '');
  const ANON = process.env.SUPABASE_ANON_KEY || '';
  if (SUPABASE_URL && ANON) {
    const authH = req.headers['authorization'] || '';
    if (!authH.startsWith('Bearer ')) return res.status(401).json({ error: 'Authorization manquant' });
    try {
      const meResp = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: ANON, Authorization: authH } });
      if (!meResp.ok) return res.status(401).json({ error: 'Token invalide ou expire' });
    } catch (e) { return res.status(401).json({ error: 'Verification du token impossible' }); }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) {
    return res.status(200).json({ etapes: fallbackSplit(text), source: 'fallback', reason: 'no_api_key' });
  }

  let contexte = '';
  if (machine) contexte += 'Machine concernee : ' + machine + '. ';
  if (typePanne) contexte += "Type d'intervention : " + typePanne + '. ';

  const systemPrompt =
    "Tu es un assistant pour une entreprise de forage (Wallis-Label, Nouvelle-Caledonie). " +
    "Tu nettoies/reformules la note libre decrivant les travaux d'une intervention en une GAMME D'OPERATIONS : " +
    "une liste d'etapes cochables, FIDELE a ce qui est ecrit.\n" +
    "Regles STRICTES :\n" +
    "- Garde EXACTEMENT le meme nombre d'etapes que d'elements dans la note : UNE etape par ligne / par element de liste / par tache mentionnee. Le nombre de lignes en sortie doit correspondre a ce qui est marque en entree.\n" +
    "- NE DECOUPE PAS une tache en plusieurs etapes. Ne fusionne pas plusieurs elements en une seule etape.\n" +
    "- Reformule juste chaque element en un libelle court et clair, en francais (ex : \"vidange\" -> \"Vidange moteur\"). Reste fidele au contenu ; n'ajoute aucune precision non ecrite.\n" +
    "- N'AJOUTE AUCUNE etape qui n'est pas ecrite (pas de 'test final', 'nettoyage', 'controle' ajoutes d'office).\n" +
    "- Conserve l'ordre de la note. Pas de numerotation, pas de puce, pas de ponctuation finale. Une etape = un libelle brut.";

  const userPrompt = (contexte ? contexte + '\n\n' : '') + 'Note a convertir :\n"""\n' + text + '\n"""';

  const payload = {
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { etapes: { type: 'array', items: { type: 'string' } } },
          required: ['etapes'],
          additionalProperties: false
        }
      }
    }
  };

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(function () { ctrl.abort(); }, 25000);
    let r;
    try {
      r = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(payload)
      });
    } finally { clearTimeout(tid); }

    if (!r || !r.ok) {
      let detail = '';
      try { detail = (await r.text()).substring(0, 300); } catch (_) {}
      return res.status(200).json({ etapes: fallbackSplit(text), source: 'fallback', reason: 'api_' + (r ? r.status : 0), detail: detail });
    }

    const data = await r.json();
    let jsonText = '';
    (Array.isArray(data.content) ? data.content : []).forEach(function (b) {
      if (b && b.type === 'text' && b.text) jsonText += b.text;
    });
    let etapes = [];
    try {
      const parsed = JSON.parse(jsonText);
      if (parsed && Array.isArray(parsed.etapes)) {
        etapes = parsed.etapes.map(function (s) { return String(s || '').trim(); }).filter(function (s) { return s.length > 0; }).slice(0, 40);
      }
    } catch (e) {}

    if (etapes.length === 0) {
      return res.status(200).json({ etapes: fallbackSplit(text), source: 'fallback', reason: 'empty_parse' });
    }
    return res.status(200).json({ etapes: etapes, source: 'ia', model: MODEL });
  } catch (e) {
    return res.status(200).json({ etapes: fallbackSplit(text), source: 'fallback', reason: 'exception', detail: (e && e.message) || '' });
  }
};
