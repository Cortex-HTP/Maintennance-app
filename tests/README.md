# Tests Wallis-Label admin

Tests unitaires sur les fonctions critiques de l'app admin.
Le dossier `tests/` est totalement isole : Vercel sert `index.html` a la racine et n'execute jamais ce dossier.

## Installation

```bash
cd tests
npm install
```

## Lancer les tests

```bash
npm test           # un coup
npm run test:watch # re-execute a chaque modification
```

## Pourquoi une duplication des fonctions dans `tests/utils/` ?

L'app principale est un mega `index.html` (~17800 lignes) chargee par Babel standalone, sans build, sans modules. Pour tester ces fonctions sans toucher au deploiement actuel, on en garde une copie ici.

Quand tu modifies une fonction cote `index.html`, **copie-la aussi dans `tests/utils/`** et relance `npm test`. Si les tests cassent, tu as un bug.

A terme : extraire les fonctions critiques dans des modules `*.js` partages entre app et tests.

## Fonctions couvertes

- `computeAlertesSaisies` : detection des rapports / releves d'heures manquants

## A ajouter

- `computeTotalPrimesForPeriod` (calcul des primes)
- `computePersonalCost` (charges personnel)
- `computeNextDue` (calcul prochaine maintenance)
