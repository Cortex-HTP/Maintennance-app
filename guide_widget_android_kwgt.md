# Widget Android Wallis-Label — Guide KWGT

## Pourquoi KWGT ?

Android ne permet PAS d'avoir un widget custom qui affiche des données dynamiques sans
une app dédiée. **KWGT (Kustom Widget Maker)** est l'app de référence : elle fournit
un canevas vierge où tu construis le widget et il peut faire des appels HTTP pour
afficher tes données en temps réel.

- **KWGT Free** sur le Play Store : suffisant pour notre widget
- KWGT Pro (~5€) : déverrouille features avancées (animations, etc.) — pas nécessaire ici

URL : <https://play.google.com/store/apps/details?id=org.kustom.widget>

---

## Étape 1 — Installer KWGT

1. Play Store → installer **"KWGT Kustom Widget Maker"** par Kustom Industries
2. Ouvrir l'app une fois pour valider les permissions

---

## Étape 2 — Ajouter un widget vide sur l'écran d'accueil

1. Appui long sur le fond de ton écran d'accueil
2. Menu → **Widgets**
3. Faire défiler jusqu'à **KWGT** → choisir une taille (recommandé : **4x2**)
4. Le widget apparaît avec écrit "Tap to open KWGT"
5. **Tap dessus** → ça ouvre l'éditeur KWGT

---

## Étape 3 — Éditer le widget dans KWGT

L'éditeur KWGT a un canevas (l'aperçu du widget) et un menu d'items en bas.

### A) Définir le fond

1. Tap sur **Background** (fond gris par défaut) dans la liste à gauche
2. **Color** : `#FF0F1018` (le noir bleuté Wallis)
3. **Corner** : `22`

### B) Définir la taille
1. Onglet **Globals** en haut → **Widget Size**
2. Définir **Width 329** **Height 155** (taille medium iOS-like) ou **329x345** pour large

### C) Ajouter les éléments

Pour CHAQUE élément ci-dessous, dans l'éditeur :
1. Bouton **"+"** en bas → **Text**
2. Sélectionner le texte créé → onglet **Text** → coller la formule
3. Onglet **Position** → placer
4. Onglet **Style** → taille / couleur / police

### Formules à copier-coller

> Toutes les formules vont chercher l'URL `https://employes-psi.vercel.app/api/dashboard-widget`
> et extraient un champ JSON via `$wg(URL, json, "chemin")$`

#### Label "WALLIS-LABEL · JUIN 2026"

```
● WALLIS-LABEL · $wg(https://employes-psi.vercel.app/api/dashboard-widget, json, periode.mois_label)$
```
- Taille : 11px, gras, couleur `#A78BFA`, lettres CAPITALES (espacement : 1.3px)

#### Métrage du mois (gros chiffre)

```
$wg(https://employes-psi.vercel.app/api/dashboard-widget, json, metrage.total_metres)$
```
- Taille : 38px, gras, couleur `#FAFAFA`
- À droite, mettre un autre Text :
```
m
```
Taille 16px, couleur `#71717A`

#### Seuil

```
/ $wg(https://employes-psi.vercel.app/api/dashboard-widget, json, metrage.seuil_mois)$ m seuil
```
- 11px, couleur `#A1A1AA`

#### Barre de progression

1. **"+"** → **Shape**
2. **Type** : Rectangle
3. **Width** : 290 / **Height** : 8
4. **Color** : `#1F202E` (fond gris)
5. **Corner** : 4

Puis ajouter une 2ème Shape par-dessus (la fill colorée) :
- **Width** :
```
$mu(min, 290, 290 * wg(https://employes-psi.vercel.app/api/dashboard-widget, json, metrage.pct_seuil) / 100)$
```
- **Height** : 8
- **Color** :
```
$if(wg(https://employes-psi.vercel.app/api/dashboard-widget, json, metrage.seuil_depasse) = true, #FF22C55E, #FFF43F5E)$
```

#### Coût / m

Label :
```
COÛT / M
```
Valeur (Text) :
```
$wg(https://employes-psi.vercel.app/api/dashboard-widget, json, cout.cout_metre_reel)$ XPF
```
- Couleur conditionnelle :
```
$if(wg(https://employes-psi.vercel.app/api/dashboard-widget, json, cout.cout_metre_reel) < wg(https://employes-psi.vercel.app/api/dashboard-widget, json, metrage.prix_metre_effectif), #FF86EFAC, #FFFDA4AF)$
```

#### Gain / m

Label :
```
GAIN / M
```
Valeur :
```
$wg(https://employes-psi.vercel.app/api/dashboard-widget, json, cout.gain_metre_reel)$ XPF
```
- Couleur :
```
$if(wg(https://employes-psi.vercel.app/api/dashboard-widget, json, cout.gain_metre_reel) >= 0, #FF86EFAC, #FFFDA4AF)$
```

Marge :
```
marge $wg(https://employes-psi.vercel.app/api/dashboard-widget, json, cout.marge_reel_pct)$%
```
- 9px, couleur `#71717A`

#### Top sondeur (optionnel, pour le grand widget)

```
$wg(https://employes-psi.vercel.app/api/dashboard-widget, json, top_sondeur.nom)$
```

```
$wg(https://employes-psi.vercel.app/api/dashboard-widget, json, top_sondeur.metres)$ m ce mois
```

#### Carburant

```
$wg(https://employes-psi.vercel.app/api/dashboard-widget, json, carburant.total_litres)$ L
```
Couleur `#FDE68A` (jaune)

```
$wg(https://employes-psi.vercel.app/api/dashboard-widget, json, carburant.cout_total)$ XPF
```

### D) Refresh rate

1. Onglet **Globals** → **Update Settings**
2. **Update Rate** : `15 minutes` (max pour KWGT free, c'est très bien)

### E) Sauvegarder

Bouton **"Save"** en haut à droite (icône disquette ou check).

---

## Étape 4 — Astuces

### Formatage des nombres

KWGT renvoie les nombres bruts (sans séparateur de milliers). Pour formater "1234" en "1 234" :

```
$tc(reg, wg(https://employes-psi.vercel.app/api/dashboard-widget, json, metrage.total_metres), (\d)(?=(\d{3})+$), $1 )$
```

(formule regex KWGT qui insère un espace tous les 3 chiffres en partant de la droite)

### Badge SEUIL OK / SOUS SEUIL

Sur un Text :
```
$if(wg(https://employes-psi.vercel.app/api/dashboard-widget, json, metrage.seuil_depasse) = true, SEUIL OK, SOUS SEUIL)$
```

Couleur fond conditionnelle sur un Shape derrière :
```
$if(wg(https://employes-psi.vercel.app/api/dashboard-widget, json, metrage.seuil_depasse) = true, #FF22C55E, #FFF43F5E)$
```

### Refresh manuel

Tap long sur le widget Android → "Refresh KWGT" si dispo, ou simplement attendre le cycle (15 min).

---

## Alternative plus rapide : export/import

Si tout ça te semble long, dis-le et je peux te générer un fichier `.kwgt` (preset
complet) à importer dans KWGT directement. Tu auras juste à :

1. Télécharger le fichier
2. Dans KWGT : menu **⋮** → **Restore** → choisir le fichier
3. Le widget apparaît tout fait, tu n'as plus qu'à l'utiliser

Mais ça nécessite que je construise le `.kwgt` (qui est un ZIP avec config JSON
interne). Si tu veux, dis-moi et je le fais.

---

## Aperçu attendu

Une fois fini, ton widget ressemblera à la **demo HTML** que tu as vue
(`demo_widget_telephone.html`), version 329x155 ou 329x345 selon la taille choisie.
