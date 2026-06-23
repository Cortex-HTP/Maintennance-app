#!/usr/bin/env python3
"""
deploy.py - Agent DEPLOYER : execute le deploiement avec garde-fous.

Usage:
    python agents/deploy.py          # mode interactif, confirme chaque etape
    python agents/deploy.py --yes    # mode auto pour les confirmations triviales
    python agents/deploy.py --dry    # simule sans rien faire

Pipeline :
  1. Pre-check : appelle verify.py, refuse si STOP
  2. Tag de sauvegarde local : `pre-deploy-YYYY-MM-DD_HHMM`
  3. Confirmation push (sauf --yes)
  4. git push origin main
  5. Pour chaque .sql nouveau/modifie : ouvre Supabase SQL Editor dans le navigateur
  6. Log dans deployments.log

Aucune execution SQL automatique : Supabase Dashboard reste le point
de validation unique (tracable, RLS respecte, etc.).
"""
import sys
import os
import re
import subprocess
import webbrowser
from pathlib import Path
from datetime import datetime


REPO_ROOT = Path(__file__).resolve().parent.parent
LOG_FILE = REPO_ROOT / 'deployments.log'
# URL Supabase SQL Editor - le user a juste a coller son SQL
SUPABASE_SQL_URL = 'https://supabase.com/dashboard/project/_/sql/new'


def run(cmd, cwd=None, capture=True):
    """Lance une commande. Si capture=False, affiche en direct."""
    if capture:
        p = subprocess.run(cmd, shell=True, cwd=cwd or REPO_ROOT,
                           capture_output=True, text=True, timeout=60)
        return p.stdout.strip(), p.stderr.strip(), p.returncode
    else:
        p = subprocess.run(cmd, shell=True, cwd=cwd or REPO_ROOT)
        return '', '', p.returncode


def confirm(question, auto_yes=False):
    if auto_yes:
        print(f"{question} [auto YES]")
        return True
    answer = input(f"{question} [y/N] ").strip().lower()
    return answer in ('y', 'yes', 'o', 'oui')


def log_deploy(entry):
    """Append une entree dans deployments.log."""
    with LOG_FILE.open('a', encoding='utf-8') as f:
        f.write(entry + '\n')


def step_pre_check():
    print("\n=== ETAPE 1/5 : Pre-check (verify.py) ===")
    verify_script = REPO_ROOT / 'agents' / 'verify.py'
    if not verify_script.exists():
        print(f"verify.py introuvable a {verify_script} - skip pre-check.")
        return True
    out, err, code = run(f'python "{verify_script}"', capture=False)
    if code == 2:
        print("\n=> STOP : verify.py a detecte une erreur critique. Deploiement annule.")
        return False
    elif code == 1:
        print("\n=> REVIEW : verify.py a remonte des warnings.")
        return True  # On continue mais en alerte
    return True


def step_tag_backup(dry=False):
    print("\n=== ETAPE 2/5 : Tag de sauvegarde local ===")
    ts = datetime.now().strftime('%Y-%m-%d_%H%M')
    tag = f"pre-deploy-{ts}"
    if dry:
        print(f"[DRY] git tag {tag}")
        return tag
    out, err, code = run(f'git tag {tag}')
    if code == 0:
        print(f"Tag cree : {tag}")
        print(f"  -> rollback possible avec : git reset --hard {tag}")
        return tag
    else:
        print(f"Erreur tag : {err}")
        return None


def step_push(auto_yes=False, dry=False):
    print("\n=== ETAPE 3/5 : Push git ===")
    out, _, _ = run('git log --oneline origin/main..HEAD')
    if not out:
        print("Rien a pusher - a jour avec origin/main.")
        return True, []
    commits = out.split('\n')
    print(f"\n{len(commits)} commit(s) a pusher :")
    for c in commits:
        print(f"  {c}")
    if not confirm("\nPusher vers origin/main ?", auto_yes):
        print("Push annule.")
        return False, []
    if dry:
        print("[DRY] git push origin main")
        return True, commits
    out, err, code = run('git push origin main', capture=False)
    if code == 0:
        print("Push reussi.")
        return True, commits
    else:
        print(f"Erreur push : {err}")
        return False, commits


def step_sql(dry=False):
    print("\n=== ETAPE 4/5 : Migrations SQL ===")
    out, _, _ = run('git diff --name-status HEAD~5..HEAD -- "*.sql"')
    sql_files = []
    if out:
        for line in out.split('\n'):
            parts = line.split('\t')
            if len(parts) >= 2 and parts[0][0] in ('A', 'M'):
                sql_files.append(parts[-1])
    if not sql_files:
        print("Aucune migration SQL detectee dans les 5 derniers commits.")
        return []
    print(f"\n{len(sql_files)} fichier(s) SQL a executer dans Supabase :")
    for f in sql_files:
        print(f"  - {f}")
    if dry:
        print("[DRY] Supabase SQL Editor non ouvert.")
        return sql_files
    print(f"\nJe vais ouvrir Supabase SQL Editor dans le navigateur.")
    print("Pour chaque fichier, copie-colle son contenu et clique Run.")
    if confirm("Ouvrir Supabase SQL Editor maintenant ?", auto_yes=False):
        try:
            webbrowser.open(SUPABASE_SQL_URL)
            print(f"Ouvert : {SUPABASE_SQL_URL}")
        except Exception as e:
            print(f"Erreur ouverture navigateur : {e}")
            print(f"Ouvre manuellement : {SUPABASE_SQL_URL}")
    print(f"\nFichiers a copier (dans l'ordre) :")
    for f in sql_files:
        full_path = REPO_ROOT / f
        if full_path.exists():
            print(f"  {full_path}")
        else:
            print(f"  {f}  (introuvable - peut-etre gitignore)")
    return sql_files


def step_log(tag, commits, sql_files, success):
    print("\n=== ETAPE 5/5 : Log ===")
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    entry = f"\n[{ts}] DEPLOY {'OK' if success else 'KO'}"
    entry += f"\n  Tag rollback : {tag}"
    entry += f"\n  Commits ({len(commits)}) :"
    for c in commits:
        entry += f"\n    - {c}"
    if sql_files:
        entry += f"\n  SQL ({len(sql_files)}) :"
        for f in sql_files:
            entry += f"\n    - {f}"
    log_deploy(entry)
    print(f"Log mis a jour : {LOG_FILE}")


def main():
    auto_yes = '--yes' in sys.argv
    dry = '--dry' in sys.argv

    print(f"# Deploiement - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if dry:
        print("Mode DRY RUN - aucune action reelle.")

    # 1. Pre-check
    if not step_pre_check():
        sys.exit(2)

    # 2. Tag backup
    tag = step_tag_backup(dry=dry)
    if not tag:
        if not confirm("Continuer sans tag de sauvegarde ?", auto_yes):
            sys.exit(2)
        tag = 'NO_TAG'

    # 3. Push
    push_ok, commits = step_push(auto_yes=auto_yes, dry=dry)
    if not push_ok:
        step_log(tag, commits, [], False)
        sys.exit(2)

    # 4. SQL
    sql_files = step_sql(dry=dry)

    # 5. Log
    step_log(tag, commits, sql_files, True)

    print("\n=== Deploiement termine ===")
    if sql_files:
        print("N'oublie pas d'executer les SQL dans Supabase.")
    print(f"En cas de probleme : git reset --hard {tag}")


if __name__ == '__main__':
    main()
