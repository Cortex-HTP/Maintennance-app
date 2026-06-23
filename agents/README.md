# Agents de déploiement sécurisé

Trio d'agents Python autonomes (aucune API externe) pour vérifier, planifier et déployer en sécurité.

Lance-les depuis la racine du repo `APP Compta` :

```bash
cd "C:\Users\tomyp\OneDrive\Documents\CODE GitHub\APP Compta"

python agents/verify.py        # 1. Audite l'état actuel du repo
python agents/plan.py          # 2. Génère un plan de déploiement
python agents/deploy.py        # 3. Exécute le déploiement avec garde-fous
```

## 1. `verify.py` — Vérifier l'état du repo

**À lancer avant de coder** ou **avant tout déploiement**.

Checks effectués :
- Statut git (working tree clean ?)
- Commits en avance vs `origin/main`
- Tous les `.sql` du repo passés à `audit_sql.py` (verdict consolidé)
- Cohérence des `.html` (parenthèses/accolades balanced — détection rapide de syntax error JS)
- Variables d'env Supabase présentes (si applicable)

Verdict : **GO** (rien à faire) / **REVIEW** (warnings) / **STOP** (erreur critique).

Exit code : 0 (GO) / 1 (REVIEW) / 2 (STOP).

## 2. `plan.py` — Planifier le déploiement

**À lancer avant de pusher** pour visualiser ce qui va changer.

Génère un fichier `deploy_plan_YYYY-MM-DD_HHMM.md` avec :
- Liste des commits ahead (titre + diff stats)
- Liste des SQL nouveaux/modifiés à exécuter dans Supabase
- Actions manuelles requises (RLS, bump SW, refresh navigateurs)
- Checklist post-déploiement (vérifs)
- Plan rollback (commit pour `git revert` si besoin)

Pas d'exécution, juste un document à valider.

## 3. `deploy.py` — Déployer en sécurité

**À lancer après validation du plan**.

Étapes :
1. **Pré-check** : appelle `verify.py`, refuse si STOP
2. **Tag de sauvegarde** : `git tag pre-deploy-YYYY-MM-DD_HHMM` (permet rollback `git reset --hard <tag>`)
3. **Push git** : `git push origin main` (avec confirmation explicite)
4. **SQL** : pour chaque `.sql` modifié ou nouveau, ouvre l'URL Supabase Dashboard SQL Editor dans le navigateur (tu copies-colles et exécutes)
5. **Log** : append dans `deployments.log` avec timestamp + commits déployés + résultat

Pas d'exécution automatique de SQL (sécurité : Supabase Dashboard reste le seul point d'exécution, traçable). Le script t'accompagne mais c'est toi qui valides chaque étape.

## Conventions

- Verdict en 3 niveaux : **GO** (vert) / **REVIEW** (jaune) / **STOP** (rouge)
- Exit codes uniformes : 0 / 1 / 2 / 3 (fichier introuvable)
- Logs au format markdown (`audit_*.md`, `deploy_plan_*.md`, `deployments.log`)
- Aucun appel HTTP — tout en local

## Roadmap (Phase 2)

- Intégration Claude API pour analyse sémantique des SQL (détecter anomalies invisibles aux regex)
- Backup automatique Supabase via Management API
- Notification Slack/mail post-déploiement
- Mode CI/CD : agents lancés en hook pre-push git
