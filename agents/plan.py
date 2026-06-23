#!/usr/bin/env python3
"""
plan.py - Agent PLANIFIER : genere un plan de deploiement structure.

Usage:
    python agents/plan.py [--out deploy_plan.md]

Pas d'execution. Le script lit l'etat du repo et produit un document
checklist a valider manuellement avant `deploy.py`.

Sections du plan :
  1. Commits a deployer (ahead de origin/main)
  2. Migrations SQL detectees (nouveaux/modifies vs HEAD)
  3. Actions manuelles requises (Supabase, refresh navigateurs)
  4. Checklist post-deploiement (verifs a faire apres)
  5. Plan de rollback (commit a `git revert` si echec)
"""
import sys
import os
import re
import subprocess
from pathlib import Path
from datetime import datetime


REPO_ROOT = Path(__file__).resolve().parent.parent


def run(cmd, cwd=None):
    p = subprocess.run(cmd, shell=True, cwd=cwd or REPO_ROOT,
                       capture_output=True, text=True, timeout=30)
    return p.stdout.strip(), p.stderr.strip(), p.returncode


def list_commits_ahead():
    """Liste les commits qui seront pushes (ahead de origin/main)."""
    run('git fetch origin')
    out, _, code = run('git log --pretty=format:"%h|%s|%an|%ad" --date=short origin/main..HEAD')
    if code != 0 or not out:
        return []
    commits = []
    for line in out.split('\n'):
        parts = line.split('|', 3)
        if len(parts) == 4:
            commits.append({'hash': parts[0], 'subject': parts[1],
                            'author': parts[2], 'date': parts[3]})
    return commits


def list_sql_changes():
    """Liste les .sql modifies/nouveaux entre origin/main et HEAD."""
    out, _, _ = run('git diff --name-status origin/main..HEAD -- "*.sql"')
    if not out:
        return []
    files = []
    for line in out.split('\n'):
        parts = line.split('\t')
        if len(parts) >= 2:
            status, path = parts[0], parts[-1]
            label = {'A': 'NOUVEAU', 'M': 'MODIFIE', 'D': 'SUPPRIME'}.get(status[0], status)
            files.append({'status': label, 'path': path})
    return files


def list_html_changes():
    """Liste les .html modifies (pour repere actions navigateur)."""
    out, _, _ = run('git diff --name-only origin/main..HEAD -- "*.html"')
    if not out:
        return []
    return [l for l in out.split('\n') if l]


def detect_sw_bump_needed(html_changes):
    """Detecte si un Service Worker doit etre bumpe."""
    for f in html_changes:
        if 'employes' in f.lower() or 'PWA' in f or 'sw.js' in f:
            return True
    return False


def generate_plan():
    now = datetime.now()
    commits = list_commits_ahead()
    sql_files = list_sql_changes()
    html_files = list_html_changes()
    sw_bump = detect_sw_bump_needed(html_files)

    lines = []
    lines.append(f"# Plan de deploiement - {now.strftime('%Y-%m-%d %H:%M')}")
    lines.append(f"\n*Genere automatiquement par `agents/plan.py`*\n")

    # Recap
    lines.append("## Recap")
    lines.append(f"- {len(commits)} commit(s) a deployer")
    lines.append(f"- {len(sql_files)} fichier(s) SQL impacte(s)")
    lines.append(f"- {len(html_files)} fichier(s) HTML modifie(s)")
    lines.append(f"- SW bump requis : {'OUI' if sw_bump else 'non'}")
    lines.append("")

    # 1. Commits
    lines.append("## 1. Commits a deployer")
    if commits:
        lines.append("")
        lines.append("| Hash | Date | Auteur | Sujet |")
        lines.append("|---|---|---|---|")
        for c in commits:
            subject = c['subject'].replace('|', '/')
            lines.append(f"| `{c['hash']}` | {c['date']} | {c['author']} | {subject} |")
    else:
        lines.append("\n*Aucun commit en avance. Tu n'as rien a deployer.*")
    lines.append("")

    # 2. SQL
    lines.append("## 2. Migrations SQL")
    if sql_files:
        lines.append("\nA executer dans **Supabase Dashboard > SQL Editor** :\n")
        for f in sql_files:
            lines.append(f"- [ ] **{f['status']}** : `{f['path']}`")
        lines.append("\nOrdre conseille : suit l'ordre des commits (du plus ancien au plus recent).")
        lines.append("\n> Verifie d'avoir lance `agents/verify.py` avant d'executer ces SQL.")
    else:
        lines.append("\n*Aucune migration SQL.*")
    lines.append("")

    # 3. Actions manuelles
    lines.append("## 3. Actions manuelles post-push")
    actions = []
    if sql_files:
        actions.append("Executer chaque SQL liste section 2 dans Supabase")
    if sw_bump:
        actions.append("Verifier que le Service Worker version a ete bumpee (sinon les utilisateurs auront du cache)")
    if html_files:
        actions.append("Faire un hard-refresh (Ctrl+Shift+R) sur les apps pour valider l'UI")
    if not actions:
        lines.append("\n*Rien de manuel - push uniquement.*")
    else:
        for i, a in enumerate(actions, 1):
            lines.append(f"- [ ] {i}. {a}")
    lines.append("")

    # 4. Verifs post-deploiement
    lines.append("## 4. Verifications post-deploiement")
    lines.append("\nApres le push + execution SQL :\n")
    lines.append("- [ ] Vercel a deploye sans erreur (verifier dashboard Vercel)")
    lines.append("- [ ] L'app charge correctement (pas d'ecran blanc)")
    lines.append("- [ ] Si SQL : les comptes/totaux dans l'app refletent les nouvelles donnees")
    lines.append("- [ ] Tester en navigation privee (Ctrl+Shift+N) pour valider sans cache")
    lines.append("")

    # 5. Rollback
    lines.append("## 5. Plan de rollback (si echec)")
    if commits:
        last_origin, _, _ = run('git rev-parse origin/main')
        lines.append(f"\nEn cas de probleme, revenir a l'etat origin/main actuel :")
        lines.append(f"\n```bash")
        lines.append(f"git reset --hard {last_origin[:8]}")
        lines.append(f"git push --force origin main  # DANGER : ne fais ca que si necessaire")
        lines.append(f"```")
        lines.append(f"\nOu pour annuler un commit specifique sans force-push :")
        lines.append(f"\n```bash")
        for c in reversed(commits):
            lines.append(f"git revert {c['hash']}  # {c['subject'][:60]}")
        lines.append(f"```")
        lines.append(f"\nPour les SQL : prepare le rollback SQL **avant** d'executer (UPDATE/INSERT inverses).")
    else:
        lines.append("\n*Rien a deployer = rien a rollback.*")
    lines.append("")

    # Signature
    lines.append("---")
    lines.append(f"\n*Plan a valider avant `python agents/deploy.py`.*")

    return '\n'.join(lines)


def main():
    out_file = None
    for i, arg in enumerate(sys.argv):
        if arg == '--out' and i + 1 < len(sys.argv):
            out_file = sys.argv[i + 1]
    if not out_file:
        ts = datetime.now().strftime('%Y-%m-%d_%H%M')
        out_file = f"deploy_plan_{ts}.md"

    plan = generate_plan()
    Path(out_file).write_text(plan, encoding='utf-8')
    print(plan)
    print(f"\n---\nPlan ecrit : {out_file}")


if __name__ == '__main__':
    main()
