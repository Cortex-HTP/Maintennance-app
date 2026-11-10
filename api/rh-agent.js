// =====================================================================
// /api/rh-agent - Agent RH conversationnel (contrats) - IA Claude
// =====================================================================
// POST { messages: [{role:'user'|'assistant', content:string}...],
//        fiche: {...fiche employe de l'ecran Personnel...} }
//   -> { ok, reponse, contrat|null, model }
//
// L'agent discute comme le projet claude.ai "RH Wallis-Label" (memes regles,
// meme referentiel) et, des qu'une proposition est possible, appelle l'outil
// proposer_contrat : le JSON renvoye alimente /api/rh-pdf (gabarit verrouille
// gen_contrat.py). L'IA ne redige JAMAIS le PDF : elle remplit des champs.
//
// Acces reserve aux comptes app_users de role Administrateur (meme verif
// que /api/rh-pdf : JWT + role verifies avec le jeton de l'appelant).
// Env : ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, RH_MODEL (opt.).
// =====================================================================

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.RH_MODEL || 'claude-opus-4-8';

// ─── Connaissances embarquees (reprises du kit RH, source : projet RH WL) ───
const SYSTEM = `Tu es l'assistant RH de la societe WALLIS LABEL SAS (forages et sondages, Nouvelle-Caledonie), integre a son application de gestion. Tu prepares les CONTRATS DE TRAVAIL avec le gerant, Tom PICOT, qui te parle depuis la fiche d'un employe.

DROIT APPLICABLE (STRICT)
- Code du travail de Nouvelle-Caledonie (CTNC), Accord Interprofessionnel Territorial (AIT), Convention collective BTP de NC. JAMAIS le Code du travail metropolitain.
- Ne JAMAIS antidater : si un terme est depasse, proposer un contrat de regularisation signe a sa date reelle (option "regularisation" + "preambule" honnete, art. Lp. 123-17).
- Signale toujours delais, articles applicables et risque contentieux quand c'est pertinent.

REGLES CDD (retenues et validees par l'entreprise)
- Motif "usage BTP" : Lp. 123-2 (7) + R. 123-2, emploi par nature temporaire, renfort d'equipe. PAS d'indemnite de fin de contrat.
- Motif "remplacement" : Lp. 123-2 (1), nommer le salarie absent ET sa qualification. Terme imprecis possible (Lp. 123-3) avec duree minimale. Indemnite de fin de contrat de 5 % (Lp. 123-14). Borner au terme du contrat du remplace s'il est lui-meme en CDD.
- Duree maximale : 1 an renouvellements compris (3 ans a titre exceptionnel pour le remplacement).
- Renouvellement : par avenant signe AVANT le terme (Lp. 123-10). Pas de nouvelle periode d'essai.
- Terme depasse sans ecrit -> CDI automatique (Lp. 123-17) : voie retenue = contrat de regularisation.
- Rupture anticipee : accord des parties, faute grave, force majeure, inaptitude, embauche en CDI (Lp. 123-8).
- Periode d'essai CDD : 1 jour par semaine de duree, max 2 semaines (contrat <= 6 mois), 1 mois au-dela ; DOIT etre ecrite ; AUCUNE si la relation se poursuit sans interruption sur le meme poste (essai: null).
- Fin de chantier : ne JAMAIS ecrire qu'un contrat prend fin "a la fin du chantier X" (requalification). Schema valide : CDD court a terme precis, renouvele par avenant tant que le chantier tourne.
- Embauche : DPAE CAFAT avant l'embauche, visite medicale avant la fin de l'essai (AIT art. 37), contrat ecrit remis dans les 2 jours.

REGLES CDI (type "cdi" - trame v1, a faire relire par Tom avant la premiere signature)
- Ni terme, ni motif, ni indemnite de fin de contrat : ne remplis NI fin, NI duree, NI motif, NI remplace, NI regularisation, NI preambule. debut = date d'effet.
- Passage d'un CDD deja propose a un CDI dans la meme discussion : type "cdi", retire fin / duree / motif / remplace / regularisation / preambule, fin_iso vide, et nom_fichier renomme en "CDI_NOM_AAAA-MM-JJ.pdf".
- Periode d'essai (AIT) : 1 mois pour les ouvriers et employes, 3 mois pour les techniciens, agents de maitrise et cadres ; renouvelable UNE fois par accord ecrit avant son terme (le gabarit l'ecrit deja). essai = "un (1) mois" ou "trois (3) mois".
- CDD -> CDI sans interruption, ou salarie deja en poste : poursuite: true + essai: null (aucune periode d'essai, ni nouvelle DPAE ni nouvelle visite d'embauche) + anciennete_depuis = date d'entree reelle dans la societe ("1er juin 2026") si elle est connue, sinon ne pas le renseigner.
- clause_permis : categorie(s) du permis ("B", "B et C") UNIQUEMENT si le poste implique de conduire un vehicule de la societe. Le gabarit ne prevoit AUCUNE rupture automatique en cas de perte du permis (un retrait hors travail releve de la vie privee, le qualifier d'avance de faute grave est un risque contentieux eleve) : ne promets jamais l'inverse.
- chantier : en CDI, null par defaut (mobilite generale sur les chantiers de Nouvelle-Caledonie) sauf site d'affectation demande.
- Rupture d'un CDI : procedure de licenciement + preavis legal ou conventionnel selon classification et anciennete. Ne chiffre un preavis ou une indemnite que si tu es certain du texte applicable ; sinon renvoie a la convention et mets-le dans a_verifier.

REFERENTIEL (01/08/2026 - verifier le SMG sur dtenc.gouv.nc s'il date)
- SMG : 1 000,08 F CFP brut/heure, soit 169 014 F CFP pour 169 h/mois (39 h/semaine).
- Classifications utilisees : Manoeuvre Aide-Sondeur = Niveau I - Echelon 1 - Indice 175 (nouvelle embauche) ou Echelon 2 - Indice 183 (experimente) ; Sondeur = Niveau II - Echelon 2 - Indice 202 ; Sondeur responsable = Niveau III - Echelon 1 (225 694 + prime 30 000) ; Technicien = AM1 ; Responsable d'exploitation = AM3.
- Remuneration SMG, texte type mois complet : "En remuneration de ses services, le Salarie percevra une remuneration etablie sur la base du Salaire Minimum Garanti (SMG) en vigueur en Nouvelle-Caledonie, soit, depuis le 1er aout 2026, un taux horaire de <b>1 000,08 F CFP</b> brut. La remuneration mensuelle brute est ainsi fixee a <b>169 014 F CFP</b> pour un mois complet de travail a 169 heures."
- Variante contrat court : remplacer la derniere phrase par "Compte tenu de la duree du contrat, la remuneration sera calculee au <b>prorata des heures effectivement travaillees</b>, sur la base du taux horaire du SMG ci-dessus (1 000,08 F CFP brut de l'heure)."
- Motif type renfort : "Le salarie interviendra dans le cadre d'un <b>renfort temporaire de l'equipe affectee au chantier de X</b>, dans l'attente de la reaffectation sur ce chantier du personnel permanent de la societe, actuellement mobilise sur le chantier de Ouaco."

OUTIL proposer_contrat - FORMATS EXACTS (gabarit PDF verrouille, tu ne rediges QUE ces champs)
- type : "cdd" ou "cdi". Si la demande ne dit pas lequel, pose la question au lieu de deviner.
- nom : "Monsieur Richard GOA" ; nom_box : "GOA RICHARD".
- parties : paragraphe d'identite complet, ex. "Monsieur <b>GOA Richard</b>, de nationalite francaise, ne le 10 avril 1990 a Kone, demeurant Tribu de Koniambo - BP 437 - 98860 Kone, immatricule a la CAFAT sous le numero 270467," - termine par une virgule. Toute donnee manquante s'ecrit [[entre doubles crochets]] (elle sort en rouge) et se retrouve dans a_verifier.
- debut / fin : dates longues francaises avec jour de semaine ("dimanche 8 novembre 2026") ; duree : en lettres + chiffres ("cinq (5) jours", "un (1) mois") ; verifie le jour de semaine par calcul.
- essai : "un (1) jour", "deux (2) jours"... ("un (1) mois" / "trois (3) mois" en CDI) ou null si aucune periode d'essai (relation qui se poursuit).
- chantier : "Nepoui - Kopeto (client SLN)" ou null (= clause de mobilite generale).
- lieu_texte : a ne remplir QUE si Tom demande une redaction particuliere du lieu de travail (paragraphe complet qui remplace le texte type).
- poursuite / anciennete_depuis / clause_permis : CDI uniquement (voir REGLES CDI).
- remuneration : texte COMPLET (modeles ci-dessus, adapter les montants si salaire au-dessus du SMG : calculer taux horaire = mensuel / 169, arrondi au centieme).
- motif : phrase du motif d'usage (modele renfort ci-dessus) - uniquement pour le CDD d'usage.
- remplace : {nom, qualif, fin_contrat} + duree_min ("une (1) semaine") + fin_min (date longue) - uniquement pour un remplacement ; debut requis, pas de fin/duree.
- regularisation : true + preambule : tableau de 3 paragraphes honnetes (contrat precedent, poursuite du travail, signature a date reelle).
- date_signature : date longue du jour (Pacific/Noumea) sauf indication contraire.
- debut_iso / fin_iso : les memes dates en AAAA-MM-JJ (fin_iso vide pour un remplacement sans terme precis et pour un CDI) - elles servent au classement du document au Coffre RH.
- nom_fichier : "CDD_NOM_AAAA-MM-JJ.pdf" ou "CDI_NOM_AAAA-MM-JJ.pdf" (date de debut).
- a_verifier : liste courte de ce que Tom doit controler (DPAE, visite medicale, champs [[...]], SMG...). Pour un CDI, ajoute toujours : "Trame CDI nouvelle (v1) : a relire integralement avant signature".

CONDUITE
- Reponds court, direct, en francais. Tom connait son entreprise : pas de rappels inutiles.
- Des que tu peux proposer un contrat complet, appelle proposer_contrat (puis a chaque ajustement demande, rappelle-le avec la version corrigee). Accompagne toujours l'appel d'une phrase de synthese + points de vigilance.
- Tu fais les CDD (usage, remplacement, regularisation) et les CDI (embauche, ou poursuite d'un CDD). Les avenants arrivent dans une phase suivante : si on te le demande, dis-le et propose l'equivalent faisable ou rien.
- La fiche employe fournie fait foi pour l'identite ; les instructions de Tom font foi pour les conditions. Ne jamais inventer : [[a completer]] + a_verifier.`;

const TOOL_CONTRAT = {
  name: 'proposer_contrat',
  description: "Proposer (ou mettre a jour) le contrat complet (CDD ou CDI) au format du gabarit PDF. Appeler des qu'une proposition complete est possible, et a chaque modification.",
  input_schema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['cdd', 'cdi'] },
      nom: { type: 'string' },
      nom_box: { type: 'string' },
      parties: { type: 'string' },
      fonction: { type: 'string' },
      classif: { type: 'string' },
      debut: { type: 'string' },
      fin: { type: 'string' },
      debut_iso: { type: 'string', description: 'date de debut AAAA-MM-JJ' },
      fin_iso: { type: 'string', description: 'date de fin AAAA-MM-JJ (vide si sans terme precis)' },
      duree: { type: 'string' },
      essai: { type: ['string', 'null'] },
      chantier: { type: ['string', 'null'] },
      motif: { type: 'string' },
      remuneration: { type: 'string' },
      date_signature: { type: 'string' },
      remplace: {
        type: ['object', 'null'],
        properties: {
          nom: { type: 'string' }, qualif: { type: 'string' }, fin_contrat: { type: 'string' }
        }
      },
      duree_min: { type: 'string' },
      fin_min: { type: 'string' },
      regularisation: { type: 'boolean' },
      preambule: { type: 'array', items: { type: 'string' } },
      lieu_texte: { type: 'string', description: 'redaction particuliere du lieu de travail (rare)' },
      poursuite: { type: 'boolean', description: 'CDI : la relation de travail se poursuit sans interruption (pas de periode d essai)' },
      anciennete_depuis: { type: 'string', description: 'CDI avec poursuite : date de reprise d anciennete, ex. "1er juin 2026"' },
      clause_permis: { type: ['string', 'null'], description: 'CDI : categorie(s) du permis exige, ex. "B" - null si le poste n implique pas de conduire' },
      nom_fichier: { type: 'string' },
      a_verifier: { type: 'array', items: { type: 'string' } }
    },
    required: ['type', 'nom', 'nom_box', 'parties', 'fonction', 'classif', 'essai', 'remuneration', 'date_signature', 'nom_fichier', 'a_verifier']
  }
};

// Liste FIXE d'emails autorises (env RH_ADMIN_EMAILS, separes par des
// virgules). Defense en profondeur : meme un compte qui se serait ecrit
// "Administrateur" dans app_users reste hors de cette liste. Var absente =
// endpoint ferme (503 explicite).
function adminsAutorises() {
  return String(process.env.RH_ADMIN_EMAILS || '').split(',')
    .map(function (e) { return e.trim().toLowerCase(); })
    .filter(function (e) { return e.length > 0; });
}

async function verifierAdmin(authH) {
  const URL_SB = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const ANON = process.env.SUPABASE_ANON_KEY || '';
  const autorises = adminsAutorises();
  if (!URL_SB || !ANON || !autorises.length || !authH.startsWith('Bearer ')) return false;
  try {
    const meResp = await fetch(URL_SB + '/auth/v1/user', { headers: { apikey: ANON, Authorization: authH } });
    if (!meResp.ok) return false;
    const me = await meResp.json();
    const email = String(me.email || '').toLowerCase();
    if (!email || autorises.indexOf(email) < 0) return false;
    // Role verifie avec le jeton de l'appelant, comparaison EXACTE en JS
    const uResp = await fetch(URL_SB + '/rest/v1/app_users?select=email,role', { headers: { apikey: ANON, Authorization: authH } });
    if (!uResp.ok) return false;
    const users = await uResp.json();
    return (Array.isArray(users) ? users : []).some(function (u) {
      return u && String(u.email || '').toLowerCase() === email && u.role === 'Administrateur';
    });
  } catch (e) { return false; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!adminsAutorises().length) {
    return res.status(503).json({ error: "RH_ADMIN_EMAILS non configuree sur Vercel (liste d'emails autorises)" });
  }
  if (!(await verifierAdmin(req.headers['authorization'] || ''))) {
    return res.status(401).json({ error: "reserve a l'Administrateur" });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY absente cote Vercel' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  // Historique : textes purs, bornes strictes
  const brut = Array.isArray(body.messages) ? body.messages.slice(-24) : [];
  const messages = [];
  for (const m of brut) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const c = String(m.content || '').slice(0, 6000).trim();
    if (c) messages.push({ role: m.role, content: c });
  }
  // Le 1er message doit etre un message utilisateur (le slice(-24) peut
  // laisser un assistant en tete : on l'ecarte au lieu de l'ecraser)
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'dernier message utilisateur manquant' });
  }
  // La fiche employe (ecran Personnel) est injectee en tete de conversation ;
  // si elle depasse la borne, on retire l'historique de contrats plutot que
  // de tronquer en plein JSON
  let ficheTxt = '';
  try {
    const fiche = (body.fiche && typeof body.fiche === 'object') ? body.fiche : {};
    ficheTxt = JSON.stringify(fiche);
    if (ficheTxt.length > 4000) {
      const sans = {};
      for (const k in fiche) { if (Object.prototype.hasOwnProperty.call(fiche, k) && k !== 'contratsHistorique') sans[k] = fiche[k]; }
      ficheTxt = JSON.stringify(sans).slice(0, 4000);
    }
  } catch (e) { ficheTxt = '{}'; }
  // Le contrat ACTUELLEMENT propose (s'il existe) est reinjecte : sans lui,
  // l'agent reconstruirait tous les champs de memoire a chaque ajustement et
  // pourrait en alterer silencieusement (dates, CAFAT) dans un acte signe
  let contratTxt = '';
  try { if (body.contrat && typeof body.contrat === 'object') contratTxt = JSON.stringify(body.contrat).slice(0, 8000); } catch (e) { contratTxt = ''; }
  if (contratTxt) {
    messages[messages.length - 1] = {
      role: 'user',
      content: messages[messages.length - 1].content +
        '\n\n[CONTRAT ACTUELLEMENT PROPOSE - repars de CES valeurs exactes et ne change QUE ce que je demande]\n' + contratTxt
    };
  }
  const dateNC = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Pacific/Noumea', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  messages[0] = {
    role: 'user',
    content: "Nous sommes le " + dateNC + " (Noumea).\nFICHE EMPLOYE (ecran Personnel, fait foi pour l'identite) :\n" + ficheTxt + '\n\nDemande : ' + (messages[0].role === 'user' ? messages[0].content : '')
  };

  const payload = {
    model: MODEL,
    max_tokens: 3000,
    system: SYSTEM,
    tools: [TOOL_CONTRAT],
    messages: messages
  };

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(function () { ctrl.abort(); }, 55000);
    let r;
    try {
      r = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(payload)
      });
    } finally { clearTimeout(tid); }
    if (!r.ok) {
      let detail = '';
      try { detail = (await r.text()).substring(0, 300); } catch (e) {}
      return res.status(502).json({ error: 'API IA indisponible (' + r.status + ')', detail: detail });
    }
    const data = await r.json();
    if (data && data.stop_reason === 'max_tokens') {
      return res.status(502).json({ error: 'reponse tronquee par la limite - reformule en plus court ou en plusieurs etapes' });
    }
    let reponse = '';
    let contrat = null;
    (Array.isArray(data.content) ? data.content : []).forEach(function (b) {
      if (b && b.type === 'text' && b.text) reponse += b.text;
      if (b && b.type === 'tool_use' && b.name === 'proposer_contrat' && b.input) contrat = b.input;
    });
    if (!reponse && contrat) reponse = 'Contrat mis a jour (voir l\'apercu).';
    return res.status(200).json({ ok: true, reponse: reponse.trim(), contrat: contrat, model: MODEL });
  } catch (e) {
    return res.status(502).json({ error: 'echec IA : ' + ((e && e.message) || '').slice(0, 200) });
  }
};
