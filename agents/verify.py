#!/usr/bin/env python3
"""
verify.py - Agent VERIFIER : audit complet de l'etat du repo avant deploiement.

Usage:
    python agents/verify.py
    python agents/verify.py --json

Verdict en 3 niveaux :
  GO     (exit 0) : rien a signaler, deploiement possible
  REVIEW (exit 1) : warnings, validation manuelle recommandee
  STOP   (exit 2) : probleme critique, deploiement bloque
"""
import sys
import os
import re
import json
import subprocess
from pathlib import Path
from datetime import datetime


REPO_ROOT = Path(__file__).resolve().parent.parent
CRITICAL_PATTERNS_HTML = [
    # Patterns de regression connus dans le projet
    (r'undefined\.\w+\(', 'Appel sur undefined detecte'),
    (r'console\.log\([^)]*FIXME', 'FIXME oublie en console.log'),
]


def run(cmd, cwd=None):
    """Lance une commande shell, retourne (stdout, stderr, code)."""
    try:
        p = subprocess.run(cmd, shell=True, cwd=cwd or REPO_ROOT,
                           capture_output=True, text=True, timeout=30)
        return p.stdout.strip(), p.stderr.strip(), p.returncode
    except subprocess.TimeoutExpired:
        return '', 'timeout', 1


class Check:
    def __init__(self, name, level, message, details=''):
        self.name = name
        self.level = level  # pass, info, warning, critical
        self.message = message
        self.details = details

    def to_dict(self):
        return {'name': self.name, 'level': self.level,
                'message': self.message, 'details': self.details}


def check_git_status(checks):
    out, _, _ = run('git status --porcelain')
    if not out:
        checks.append(Check('git_clean', 'pass', 'Working tree clean'))
        return
    lines = out.split('\n')
    n_mod = sum(1 for l in lines if l.startswith(' M') or l.startswith('M '))
    n_new = sum(1 for l in lines if l.startswith('??'))
    n_del = sum(1 for l in lines if l.startswith(' D') or l.startswith('D '))
    msg = f"{len(lines)} fichier(s) non commit : {n_mod} modifies, {n_new} nouveaux, {n_del} supprimes"
    checks.append(Check('git_uncommitted', 'warning', msg,
                        '\n'.join(lines[:10]) + ('\n...' if len(lines) > 10 else '')))


def check_git_ahead(checks):
    # Compte les commits ahead de origin/main
    run('git fetch origin', cwd=REPO_ROOT)
    out, _, code = run('git rev-list --count origin/main..HEAD')
    if code != 0 or not out:
        checks.append(Check('git_ahead', 'info', 'Impossible de comparer avec origin/main'))
        return
    n = int(out)
    if n == 0:
        checks.append(Check('git_ahead', 'pass', 'A jour avec origin/main'))
    else:
        # Liste les sujets de commits
        subjects, _, _ = run('git log --oneline origin/main..HEAD')
        checks.append(Check('git_ahead', 'info',
                            f"{n} commit(s) en avance vs origin/main",
                            subjects))


def check_sql_files(checks):
    sql_files = list(REPO_ROOT.glob('**/*.sql'))
    sql_files = [f for f in sql_files if 'node_modules' not in str(f)]
    if not sql_files:
        checks.append(Check('sql_files', 'info', 'Aucun fichier .sql dans le repo'))
        return
    audit_script = REPO_ROOT / 'audit_sql.py'
    if not audit_script.exists():
        checks.append(Check('audit_sql_missing', 'warning',
                            'audit_sql.py absent, skip audit des SQL'))
        return
    results = []
    worst_level = 'pass'
    for sql in sql_files:
        rel = sql.relative_to(REPO_ROOT).as_posix()
        out, err, code = run(f'python audit_sql.py "{sql}" --json')
        try:
            data = json.loads(out)
            verdict = data.get('verdict', 'INCONNU')
            results.append(f"{rel} : {verdict}")
            if verdict == 'CRITIQUE':
                worst_level = 'critical'
            elif verdict == 'MOYEN' and worst_level != 'critical':
                worst_level = 'warning'
        except json.JSONDecodeError:
            results.append(f"{rel} : ERREUR parsing (code {code})")
            worst_level = 'critical' if worst_level != 'critical' else worst_level
    checks.append(Check('audit_sql', worst_level,
                        f"{len(sql_files)} fichier(s) SQL audite(s)",
                        '\n'.join(results)))


def check_html_balance(checks):
    """Verification rapide : parens/accolades balanced dans les .html."""
    html_files = [f for f in REPO_ROOT.glob('**/*.html')
                  if 'node_modules' not in str(f)]
    if not html_files:
        return
    issues = []
    for html in html_files:
        text = html.read_text(encoding='utf-8', errors='replace')
        # Compte hors strings - approximation simple
        # On vire le contenu des strings JS pour eviter les faux positifs
        stripped = re.sub(r"'(?:[^'\\]|\\.)*'", "''", text)
        stripped = re.sub(r'"(?:[^"\\]|\\.)*"', '""', stripped)
        stripped = re.sub(r'`(?:[^`\\]|\\.)*`', '``', stripped)
        # Compte
        diff_par = stripped.count('(') - stripped.count(')')
        diff_acc = stripped.count('{') - stripped.count('}')
        diff_bra = stripped.count('[') - stripped.count(']')
        if diff_par != 0 or diff_acc != 0 or diff_bra != 0:
            issues.append(f"{html.relative_to(REPO_ROOT).as_posix()} : "
                          f"() diff={diff_par}, {{}} diff={diff_acc}, [] diff={diff_bra}")
    if issues:
        # Warning (pas critical) car heuristique : le strip des strings ne gere
        # pas parfaitement le JSX (ex : `{var}` dans un attribut) - faux positifs
        # possibles. A regarder seulement si l'app a un comportement bizarre.
        checks.append(Check('html_balance', 'warning',
                            f"{len(issues)} fichier(s) HTML avec parens/accolades desequilibrees (heuristique)",
                            '\n'.join(issues) + '\n(faux positifs possibles avec JSX)'))
    else:
        checks.append(Check('html_balance', 'pass',
                            f"{len(html_files)} fichier(s) HTML : parens/accolades OK"))


def check_html_regressions(checks):
    """Detecte des patterns connus de regression dans les .html."""
    html_files = [f for f in REPO_ROOT.glob('**/*.html')
                  if 'node_modules' not in str(f)]
    findings = []
    for html in html_files:
        text = html.read_text(encoding='utf-8', errors='replace')
        for pattern, label in CRITICAL_PATTERNS_HTML:
            matches = re.findall(pattern, text)
            if matches:
                findings.append(f"{html.relative_to(REPO_ROOT).as_posix()} : "
                                f"{label} ({len(matches)}x)")
    if findings:
        checks.append(Check('html_regression', 'warning',
                            f"{len(findings)} pattern(s) suspect(s) dans .html",
                            '\n'.join(findings)))


def main():
    json_out = '--json' in sys.argv
    checks = []
    check_git_status(checks)
    check_git_ahead(checks)
    check_sql_files(checks)
    check_html_balance(checks)
    check_html_regressions(checks)

    # Verdict
    levels = {c.level for c in checks}
    if 'critical' in levels:
        verdict = 'STOP'
    elif 'warning' in levels:
        verdict = 'REVIEW'
    else:
        verdict = 'GO'

    if json_out:
        print(json.dumps({
            'verdict': verdict,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'checks': [c.to_dict() for c in checks]
        }, indent=2, ensure_ascii=False))
    else:
        print(f"# Verify - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"\n## Verdict : **{verdict}**\n")
        if verdict == 'GO':
            print("> Rien a signaler. Tu peux passer a `plan.py` puis `deploy.py`.")
        elif verdict == 'REVIEW':
            print("> Warnings detectes. Revois les points ci-dessous avant deploiement.")
        else:
            print("> BLOQUE. Corrige les points critiques avant tout deploiement.")
        print()
        labels = {'critical': 'CRITIQUE', 'warning': 'WARN',
                  'info': 'INFO', 'pass': 'OK'}
        for level in ('critical', 'warning', 'info', 'pass'):
            level_checks = [c for c in checks if c.level == level]
            if not level_checks:
                continue
            print(f"## {labels[level]} ({len(level_checks)})")
            for c in level_checks:
                print(f"- **{c.name}** : {c.message}")
                if c.details:
                    for line in c.details.split('\n'):
                        print(f"  > {line}")
            print()

    if verdict == 'STOP':
        sys.exit(2)
    elif verdict == 'REVIEW':
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == '__main__':
    main()
