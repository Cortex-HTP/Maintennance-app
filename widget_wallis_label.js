// ═══════════════════════════════════════════════════════════════════
// Widget Wallis-Label pour Scriptable (iOS)
// ═══════════════════════════════════════════════════════════════════
//
// Installation :
//   1. Installer "Scriptable" sur l'App Store (gratuit)
//   2. Ouvrir Scriptable, creer un nouveau script
//   3. Copier-coller ce fichier integralement
//   4. Sauvegarder (ex: "Wallis Dashboard")
//   5. Sur l'ecran d'accueil iOS : appuie long sur fond -> + (haut gauche)
//      -> Scriptable -> choisir la taille (Small / Medium / Large)
//   6. Apres ajout, appui long sur le widget -> "Modifier le widget"
//      -> selectionner "Wallis Dashboard" dans Script
//
// Refresh : iOS rafraichit automatiquement tous les ~15min (1h max)
// ═══════════════════════════════════════════════════════════════════

const API_URL = "https://employes-psi.vercel.app/api/dashboard-widget";

// ─── Fetch des donnees ───────────────────────────────────────────
let data;
try {
  const req = new Request(API_URL);
  req.timeoutInterval = 8;
  data = await req.loadJSON();
} catch (e) {
  // Widget d'erreur (rouge)
  const w = new ListWidget();
  w.backgroundColor = new Color("#1a0a0e");
  const t = w.addText("⚠ Erreur");
  t.font = Font.boldSystemFont(16); t.textColor = new Color("#fda4af");
  w.addSpacer(4);
  const m = w.addText("Connexion API impossible");
  m.font = Font.systemFont(11); m.textColor = new Color("#a1a1aa");
  Script.setWidget(w);
  Script.complete();
  return;
}

// ─── Couleurs et helpers ─────────────────────────────────────────
const COL = {
  bgGradTop: new Color("#1e2132"),
  bgGradBot: new Color("#0f1018"),
  white: new Color("#fafafa"),
  muted: new Color("#a1a1aa"),
  dim: new Color("#71717a"),
  green: new Color("#86efac"),
  greenBg: new Color("#22c55e", 0.18),
  red: new Color("#fda4af"),
  redBg: new Color("#f43f5e", 0.18),
  amber: new Color("#fde68a"),
  accentGreen: new Color("#22c55e"),
  accentRed: new Color("#f43f5e"),
  border: new Color("#ffffff", 0.08)
};

const seuilOk = !!data.metrage.seuil_depasse;
const accent = seuilOk ? COL.accentGreen : COL.accentRed;
const gainColor = data.cout.gain_metre_reel >= 0 ? COL.green : COL.red;
const gainBg = data.cout.gain_metre_reel >= 0 ? COL.greenBg : COL.redBg;

function fmtNum(n) {
  return Math.round(n).toLocaleString("fr-FR").replace(/,/g, " ");
}
function fmtXPF(n) {
  return fmtNum(n) + " XPF";
}
function pctBarColor(ok) {
  return ok ? new Color("#22c55e") : new Color("#f43f5e");
}

// ─── Widget builder ──────────────────────────────────────────────
const widget = new ListWidget();
const gradient = new LinearGradient();
gradient.colors = [COL.bgGradTop, COL.bgGradBot];
gradient.locations = [0, 1];
widget.backgroundGradient = gradient;
widget.setPadding(14, 14, 14, 14);

// Refresh dans 15 min
widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

// URL d'ouverture quand on tape le widget (ouvre Vercel app)
widget.url = "https://maintennance-app.vercel.app";

const size = config.widgetFamily || "medium";

// ═══ SMALL (155x155) ═══
function buildSmall() {
  // Header
  const header = widget.addStack();
  header.layoutHorizontally();
  const dot = header.addText("● ");
  dot.font = Font.systemFont(9);
  dot.textColor = accent;
  const lbl = header.addText("WALLIS · " + data.periode.mois_label.toUpperCase().split(" ")[0]);
  lbl.font = Font.boldSystemFont(9);
  lbl.textColor = COL.muted;

  widget.addSpacer(10);

  // Big metrage
  const valStack = widget.addStack();
  valStack.layoutHorizontally();
  valStack.bottomAlignContent();
  const val = valStack.addText(fmtNum(data.metrage.total_metres));
  val.font = Font.boldSystemFont(28);
  val.textColor = COL.white;
  const unit = valStack.addText(" m");
  unit.font = Font.semiboldSystemFont(14);
  unit.textColor = COL.dim;

  // Sub seuil
  widget.addSpacer(2);
  const subStack = widget.addStack();
  subStack.layoutHorizontally();
  const sub1 = subStack.addText("/ ");
  sub1.font = Font.systemFont(10);
  sub1.textColor = COL.muted;
  const sub2 = subStack.addText(fmtNum(data.metrage.seuil_mois) + " m");
  sub2.font = Font.boldSystemFont(10);
  sub2.textColor = COL.muted;
  const sub3 = subStack.addText(" seuil");
  sub3.font = Font.systemFont(10);
  sub3.textColor = COL.muted;

  widget.addSpacer(10);

  // Progress bar
  const pct = Math.min(100, data.metrage.pct_seuil);
  const barBg = widget.addStack();
  barBg.layoutHorizontally();
  barBg.backgroundColor = new Color("#ffffff", 0.08);
  barBg.cornerRadius = 3;
  barBg.size = new Size(0, 6);
  const fill = barBg.addStack();
  fill.backgroundColor = pctBarColor(seuilOk);
  fill.cornerRadius = 3;
  fill.size = new Size(Math.max(2, 125 * pct / 100), 6);
  barBg.addSpacer();

  widget.addSpacer(10);

  // Gain en bas
  const gainStack = widget.addStack();
  gainStack.layoutHorizontally();
  gainStack.backgroundColor = gainBg;
  gainStack.cornerRadius = 8;
  gainStack.setPadding(3, 8, 3, 8);
  const gprefix = data.cout.gain_metre_reel >= 0 ? "+" : "";
  const g = gainStack.addText(gprefix + fmtNum(data.cout.gain_metre_reel) + " XPF/m");
  g.font = Font.boldSystemFont(10);
  g.textColor = gainColor;
  widget.addSpacer(3);
  const margePct = data.cout.marge_reel_pct;
  const mPrefix = margePct >= 0 ? "+" : "";
  const mt = widget.addText(mPrefix + margePct.toFixed(1) + "% marge");
  mt.font = Font.systemFont(9);
  mt.textColor = COL.dim;
}

// ═══ MEDIUM (329x155) ═══
function buildMedium() {
  // Header
  const header = widget.addStack();
  header.layoutHorizontally();
  const dot = header.addText("● ");
  dot.font = Font.systemFont(10);
  dot.textColor = accent;
  const lbl = header.addText("WALLIS-LABEL · " + data.periode.mois_label.toUpperCase());
  lbl.font = Font.boldSystemFont(10);
  lbl.textColor = COL.muted;
  header.addSpacer();
  const pill = header.addStack();
  pill.backgroundColor = gainBg;
  pill.cornerRadius = 10;
  pill.setPadding(2, 8, 2, 8);
  const pillText = pill.addText(seuilOk ? "SEUIL OK" : "SOUS SEUIL");
  pillText.font = Font.boldSystemFont(9);
  pillText.textColor = gainColor;

  widget.addSpacer(8);

  // 2 colonnes
  const cols = widget.addStack();
  cols.layoutHorizontally();
  cols.spacing = 14;

  // ── Col gauche : metrage + barre ──
  const left = cols.addStack();
  left.layoutVertically();
  left.size = new Size(160, 0);

  const ml = left.addText("MÉTRAGE");
  ml.font = Font.boldSystemFont(9);
  ml.textColor = COL.dim;

  left.addSpacer(2);

  const valStack = left.addStack();
  valStack.layoutHorizontally();
  valStack.bottomAlignContent();
  const val = valStack.addText(fmtNum(data.metrage.total_metres));
  val.font = Font.boldSystemFont(28);
  val.textColor = COL.white;
  const unit = valStack.addText(" m");
  unit.font = Font.semiboldSystemFont(14);
  unit.textColor = COL.dim;

  left.addSpacer(2);

  const sub = left.addText("/ " + fmtNum(data.metrage.seuil_mois) + " m seuil");
  sub.font = Font.systemFont(10);
  sub.textColor = COL.muted;

  left.addSpacer(6);

  // Barre
  const pct = Math.min(100, data.metrage.pct_seuil);
  const barBg = left.addStack();
  barBg.backgroundColor = new Color("#ffffff", 0.08);
  barBg.cornerRadius = 3;
  barBg.size = new Size(160, 6);
  const fill = barBg.addStack();
  fill.backgroundColor = pctBarColor(seuilOk);
  fill.cornerRadius = 3;
  fill.size = new Size(Math.max(2, 160 * pct / 100), 6);

  left.addSpacer(2);
  const pctTxt = left.addText(data.metrage.pct_seuil.toFixed(1) + "% du seuil");
  pctTxt.font = Font.semiboldSystemFont(9);
  pctTxt.textColor = seuilOk ? COL.green : COL.red;

  // ── Col droite : 2 KPIs ──
  const right = cols.addStack();
  right.layoutVertically();
  right.spacing = 6;

  // Card cout
  const card1 = right.addStack();
  card1.layoutVertically();
  card1.backgroundColor = new Color("#ffffff", 0.04);
  card1.cornerRadius = 8;
  card1.setPadding(6, 9, 6, 9);
  card1.size = new Size(115, 0);
  const l1 = card1.addText("COÛT / M");
  l1.font = Font.boldSystemFont(8);
  l1.textColor = COL.dim;
  const v1 = card1.addText(fmtNum(data.cout.cout_metre_reel) + " XPF");
  v1.font = Font.boldSystemFont(14);
  v1.textColor = data.cout.cout_metre_reel < data.metrage.prix_metre_effectif ? COL.green : COL.red;

  // Card gain
  const card2 = right.addStack();
  card2.layoutVertically();
  card2.backgroundColor = new Color("#ffffff", 0.04);
  card2.cornerRadius = 8;
  card2.setPadding(6, 9, 6, 9);
  card2.size = new Size(115, 0);
  const l2 = card2.addText("GAIN / M");
  l2.font = Font.boldSystemFont(8);
  l2.textColor = COL.dim;
  const gpref = data.cout.gain_metre_reel >= 0 ? "+" : "";
  const v2 = card2.addText(gpref + fmtNum(data.cout.gain_metre_reel) + " XPF");
  v2.font = Font.boldSystemFont(14);
  v2.textColor = gainColor;
}

// ═══ LARGE (329x345) ═══
function buildLarge() {
  // Header
  const header = widget.addStack();
  header.layoutHorizontally();
  const left = header.addStack();
  left.layoutVertically();
  const dot = left.addText("● WALLIS-LABEL");
  dot.font = Font.boldSystemFont(10);
  dot.textColor = COL.muted;
  const title = left.addText(data.periode.mois_label + " — " + data.periode.jours_travailles + "/" + data.periode.jours_ouvres_mois_complet + " jours");
  title.font = Font.semiboldSystemFont(13);
  title.textColor = COL.white;
  header.addSpacer();
  const pill = header.addStack();
  pill.backgroundColor = gainBg;
  pill.cornerRadius = 12;
  pill.setPadding(3, 10, 3, 10);
  const pillT = pill.addText((data.cout.marge_reel_pct >= 0 ? "+" : "") + data.cout.marge_reel_pct.toFixed(1) + "% marge");
  pillT.font = Font.boldSystemFont(10);
  pillT.textColor = gainColor;

  widget.addSpacer(14);

  // Big metrage
  const valStack = widget.addStack();
  valStack.layoutHorizontally();
  valStack.bottomAlignContent();
  const val = valStack.addText(fmtNum(data.metrage.total_metres));
  val.font = Font.boldSystemFont(38);
  val.textColor = COL.white;
  const unit = valStack.addText(" m");
  unit.font = Font.semiboldSystemFont(16);
  unit.textColor = COL.dim;
  valStack.addSpacer();
  const seuilTxt = valStack.addText("/ " + fmtNum(data.metrage.seuil_mois) + " m seuil");
  seuilTxt.font = Font.systemFont(11);
  seuilTxt.textColor = COL.muted;

  widget.addSpacer(6);

  // Barre
  const pct = Math.min(100, data.metrage.pct_seuil);
  const barBg = widget.addStack();
  barBg.backgroundColor = new Color("#ffffff", 0.08);
  barBg.cornerRadius = 4;
  barBg.size = new Size(0, 8);
  const fill = barBg.addStack();
  fill.backgroundColor = pctBarColor(seuilOk);
  fill.cornerRadius = 4;
  fill.size = new Size(Math.max(2, 290 * pct / 100), 8);
  barBg.addSpacer();

  widget.addSpacer(4);
  const pctRow = widget.addStack();
  pctRow.layoutHorizontally();
  const p1 = pctRow.addText("0 m");
  p1.font = Font.systemFont(9);
  p1.textColor = COL.dim;
  pctRow.addSpacer();
  const p2 = pctRow.addText(data.metrage.pct_seuil.toFixed(1) + "%");
  p2.font = Font.boldSystemFont(9);
  p2.textColor = seuilOk ? COL.green : COL.red;
  pctRow.addSpacer();
  const p3 = pctRow.addText(fmtNum(data.metrage.seuil_mois) + " m");
  p3.font = Font.systemFont(9);
  p3.textColor = COL.dim;

  widget.addSpacer(14);

  // 2 cards KPI
  const cards = widget.addStack();
  cards.layoutHorizontally();
  cards.spacing = 8;

  const c1 = cards.addStack();
  c1.layoutVertically();
  c1.backgroundColor = new Color("#ffffff", 0.04);
  c1.cornerRadius = 10;
  c1.setPadding(8, 10, 8, 10);
  c1.size = new Size(143, 0);
  const c1l = c1.addText("COÛT / M");
  c1l.font = Font.boldSystemFont(9);
  c1l.textColor = COL.dim;
  const c1v = c1.addText(fmtNum(data.cout.cout_metre_reel) + " XPF");
  c1v.font = Font.boldSystemFont(16);
  c1v.textColor = data.cout.cout_metre_reel < data.metrage.prix_metre_effectif ? COL.green : COL.red;
  const c1s = c1.addText("temps réel · " + data.periode.jours_travailles + "j");
  c1s.font = Font.systemFont(9);
  c1s.textColor = COL.dim;

  const c2 = cards.addStack();
  c2.layoutVertically();
  c2.backgroundColor = new Color("#ffffff", 0.04);
  c2.cornerRadius = 10;
  c2.setPadding(8, 10, 8, 10);
  c2.size = new Size(143, 0);
  const c2l = c2.addText("GAIN / M");
  c2l.font = Font.boldSystemFont(9);
  c2l.textColor = COL.dim;
  const gpref = data.cout.gain_metre_reel >= 0 ? "+" : "";
  const c2v = c2.addText(gpref + fmtNum(data.cout.gain_metre_reel) + " XPF");
  c2v.font = Font.boldSystemFont(16);
  c2v.textColor = gainColor;
  const c2s = c2.addText("marge " + (data.cout.marge_reel_pct >= 0 ? "+" : "") + data.cout.marge_reel_pct.toFixed(1) + "%");
  c2s.font = Font.systemFont(9);
  c2s.textColor = COL.dim;

  widget.addSpacer(14);

  // Footer : top sondeur + carburant
  const footer = widget.addStack();
  footer.layoutHorizontally();
  const fL = footer.addStack();
  fL.layoutVertically();
  const fL1 = fL.addText("TOP SONDEUR");
  fL1.font = Font.boldSystemFont(8);
  fL1.textColor = COL.dim;
  const topName = data.top_sondeur ? data.top_sondeur.nom : "—";
  const fL2 = fL.addText(topName);
  fL2.font = Font.boldSystemFont(11);
  fL2.textColor = COL.white;
  fL2.lineLimit = 1;
  const topM = data.top_sondeur ? data.top_sondeur.metres : 0;
  const fL3 = fL.addText(fmtNum(topM) + " m");
  fL3.font = Font.systemFont(9);
  fL3.textColor = COL.dim;
  footer.addSpacer();
  const fR = footer.addStack();
  fR.layoutVertically();
  const fR1 = fR.addText("CARBURANT");
  fR1.font = Font.boldSystemFont(8);
  fR1.textColor = COL.dim;
  fR1.rightAlignText();
  const fR2 = fR.addText(fmtNum(data.carburant.total_litres) + " L");
  fR2.font = Font.boldSystemFont(11);
  fR2.textColor = COL.amber;
  fR2.rightAlignText();
  const fR3 = fR.addText(fmtNum(data.carburant.cout_total) + " XPF");
  fR3.font = Font.systemFont(9);
  fR3.textColor = COL.dim;
  fR3.rightAlignText();
}

// ─── Dispatch selon taille ───────────────────────────────────────
if (size === "small") buildSmall();
else if (size === "large") buildLarge();
else buildMedium();

Script.setWidget(widget);
Script.complete();
