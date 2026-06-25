// /api/debug-env - Liste les variables d'env Supabase/Anthropic vues par Vercel.
// Retourne UNIQUEMENT les noms et un indicateur de presence (pas les valeurs).
// A retirer une fois le debug termine.
module.exports = function handler(req, res) {
  const vars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ANTHROPIC_API_KEY'
  ];
  const status = {};
  vars.forEach(function(name) {
    const val = process.env[name];
    if (val === undefined || val === '') {
      status[name] = 'ABSENTE';
    } else {
      // Renvoie juste les 4 premiers/derniers caracteres pour confirmer la valeur sans la divulguer
      status[name] = 'PRESENTE (longueur ' + val.length + ', commence par "' + val.slice(0, 4) + '...")';
    }
  });
  // Liste aussi TOUTES les vars d'env qui contiennent "SUPABASE" ou "ANTHROPIC" - utile si typo
  const allRelated = Object.keys(process.env)
    .filter(function(k) { return /SUPABASE|ANTHROPIC/i.test(k); })
    .sort();

  res.status(200).json({
    expected_vars: status,
    all_supabase_anthropic_keys_in_env: allRelated,
    hint: 'Si une var "expected" est ABSENTE mais qu une cle similaire apparait dans "all_supabase_anthropic_keys_in_env", c est un probleme de typo.'
  });
};
