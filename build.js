// ═══ Build Vercel : precompile le <script type="text/babel"> ═══════════
// AVANT : chaque navigateur telechargeait Babel (3 Mo de CDN) et transpilait
// ~3 Mo de code A CHAQUE OUVERTURE (3-6 s sur un bon PC, 30-60 s sur un PC
// modeste - plainte du 09/11). APRES : la transpilation se fait ICI, une
// fois par deploiement ; le navigateur recoit du JavaScript pret a executer.
//
// Usage : node build.js [dossierSource] [dossierSortie]  (defauts : . et dist)
// Sortie : dist/ = index.html transpile + les statiques publics (widget,
// demos). Les api/ restent a la racine (fonctions Vercel, hors outputDirectory).
// Si quoi que ce soit echoue, le process sort en erreur : Vercel garde alors
// l'ancien deploiement en ligne (deploiements atomiques).
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const SRC = process.argv[2] || '.';
const OUT = process.argv[3] || path.join(SRC, 'dist');

const entree = path.join(SRC, 'index.html');
let html = fs.readFileSync(entree, 'utf8');

// ── 1. Extraire le bloc text/babel (unique) ──
const ouverture = html.indexOf('<script type="text/babel">');
if (ouverture < 0) throw new Error('bloc <script type="text/babel"> introuvable');
const debutCode = ouverture + '<script type="text/babel">'.length;
const fermeture = html.indexOf('</script>', debutCode);
if (fermeture < 0) throw new Error('fermeture du bloc babel introuvable');
if (html.indexOf('<script type="text/babel">', fermeture) >= 0) throw new Error('plusieurs blocs text/babel : build non prevu pour ca');
const source = html.substring(debutCode, fermeture);

// ── 2. Transpiler (JSX -> React.createElement, comme Babel standalone 7) ──
console.log('transpilation de', (source.length / 1e6).toFixed(2), 'Mo...');
const resultat = babel.transformSync(source, {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  compact: false,
  babelrc: false,
  configFile: false,
  sourceMaps: false,
  // le code vise deja les navigateurs actuels (pas de ?. ni ??) : on ne
  // transpile QUE le JSX, rien d'autre ne change
});
if (!resultat || !resultat.code || resultat.code.length < source.length * 0.5) {
  throw new Error('transpilation suspecte (sortie vide ou bien trop courte)');
}
// Garde : plus aucun JSX residuel dans la sortie
if (/return\s*\(?\s*<[A-Za-z]/.test(resultat.code)) throw new Error('JSX residuel apres transpilation');

// ── 3. Reconstruire le HTML : script normal + retrait du CDN Babel ──
// Le code est enveloppe comme le faisait Babel standalone : (1) dans sa
// PROPRE PORTEE (sinon les const du bloc deviennent des globales lexicales
// et entrent en collision, ex. "supabase" deja declare par le CDN) et
// (2) execute seulement une fois le DOM pret (standalone attendait
// DOMContentLoaded ; en script classique le bloc partirait avant le <div
// racine> et planterait).
// (concatenation par index, jamais String.replace : le code contient des "$&")
html = html.substring(0, ouverture)
  + '<script>\n/* Precompile au deploiement (build.js) - source : le meme bloc en text/babel du repo */\n'
  + '(function () { function __wallisDemarre() {\n'
  + resultat.code
  + '\n} if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", __wallisDemarre); } else { __wallisDemarre(); } })();\n'
  + html.substring(fermeture);
const reBabelCdn = /[ \t]*<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/babel-standalone\/[^"]+"><\/script>\r?\n?/;
if (!reBabelCdn.test(html)) throw new Error('balise CDN babel-standalone introuvable');
html = html.replace(reBabelCdn, '');

// ── 4. Ecrire dist/ ──
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// Statiques publics conserves tels quels (jamais les sql ni les sources)
const statiques = fs.readdirSync(SRC).filter(function (f) {
  if (f === 'index.html' || f === 'build.js') return false;
  return /^demo_.*\.html$/.test(f) || f === 'widget_wallis_label.js' || f === 'guide_widget_android_kwgt.md';
});
statiques.forEach(function (f) {
  fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
});
console.log('dist/ ecrit :', 1 + statiques.length, 'fichiers ; index.html', (html.length / 1e6).toFixed(2), 'Mo, sans Babel client');
