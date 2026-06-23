#!/usr/bin/env python3
"""
audit_sql.py - Audit autonome d'un script SQL avant execution.

Usage:
    python audit_sql.py <fichier.sql>
    python audit_sql.py <fichier.sql> --json     # output JSON
    python audit_sql.py <fichier.sql> --strict   # bloque sur warning aussi

Genere un rapport audit_<fichier>.md avec :
  - Verdict (FAIBLE / MOYEN / CRITIQUE)
  - Liste des statements detectes
  - Checks executes + resultats
  - Recommandation d'execution

Aucun appel API externe. Pas d'execution sur la DB - analyse statique pure.
Exit code : 0=faible/OK, 1=moyen, 2=critique.
"""
import sys
import os
import re
import json
from pathlib import Path
from datetime import datetime
from collections import defaultdict

# Tables considerees critiques pour Wallis-Label (perte = catastrophe metier).
# Toute operation DELETE/UPDATE/TRUNCATE/DROP sur ces tables genere un warning.
CRITICAL_TABLES = {
    'ecritures_compta', 'factures_compta', 'rapports_forage',
    'interventions', 'releves_horametre', 'releves_journaliers',
    'personnel_data', 'chantiers', 'equipements', 'pieces',
    'auth.users',
}

# Operations destructrices : refus quasi-systematique (warning critical).
DESTRUCTIVE_OPS = {'DROP', 'TRUNCATE'}


class Check:
    """Resultat d'un check unique."""
    LEVELS = ('pass', 'info', 'warning', 'critical')

    def __init__(self, name, level, message, details=''):
        assert level in self.LEVELS, f"Niveau invalide : {level}"
        self.name = name
        self.level = level
        self.message = message
        self.details = details

    def to_dict(self):
        return {'name': self.name, 'level': self.level,
                'message': self.message, 'details': self.details}


class AuditReport:
    """Aggregation des checks + verdict final."""
    def __init__(self, sql_file):
        self.sql_file = sql_file
        self.checks = []
        self.statements = []
        self.timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    def add(self, check):
        self.checks.append(check)

    def verdict(self):
        """FAIBLE = OK execution, MOYEN = validation manuelle, CRITIQUE = bloque."""
        levels = {c.level for c in self.checks}
        if 'critical' in levels:
            return 'CRITIQUE'
        if 'warning' in levels:
            return 'MOYEN'
        return 'FAIBLE'

    def recommendation(self):
        v = self.verdict()
        if v == 'CRITIQUE':
            return 'BLOQUE - revue manuelle obligatoire avant execution.'
        if v == 'MOYEN':
            return 'VALIDATION MANUELLE - revue rapide recommandee.'
        return 'EXECUTION OK - audit sans alerte. Tu peux lancer ce SQL.'

    def render_markdown(self):
        out = []
        out.append(f"# Audit SQL : {Path(self.sql_file).name}")
        out.append(f"\n*Genere le {self.timestamp}*")
        out.append(f"\n## Verdict : **{self.verdict()}**\n")
        out.append(f"> {self.recommendation()}\n")
        # Statements
        type_counts = defaultdict(int)
        for s in self.statements:
            type_counts[s['type']] += 1
        if type_counts:
            out.append("## Statements detectes")
            for t, n in sorted(type_counts.items(), key=lambda x: -x[1]):
                out.append(f"- {t} : {n}")
            out.append("")
        # Checks par niveau
        labels = {'critical': 'CRITIQUE', 'warning': 'WARN',
                  'info': 'INFO', 'pass': 'OK'}
        for level in ('critical', 'warning', 'info', 'pass'):
            level_checks = [c for c in self.checks if c.level == level]
            if not level_checks:
                continue
            out.append(f"## {labels[level]} ({len(level_checks)})")
            for c in level_checks:
                out.append(f"- **{c.name}** : {c.message}")
                if c.details:
                    out.append(f"  - {c.details}")
            out.append("")
        return '\n'.join(out)

    def to_json(self):
        return json.dumps({
            'sql_file': self.sql_file,
            'timestamp': self.timestamp,
            'verdict': self.verdict(),
            'recommendation': self.recommendation(),
            'checks': [c.to_dict() for c in self.checks],
            'statements_count': len(self.statements),
            'statements_by_type': dict(defaultdict(int, {})),
        }, indent=2, ensure_ascii=False)


def parse_sql(text):
    """Parse SQL en statements de haut niveau. Approximation simple sans deps."""
    # Strip line comments (-- ...) - mais PAS dans les strings literales.
    # Simplification : on accepte que ca casse les --  dans des strings rares.
    text = re.sub(r'--[^\n]*', '', text)
    # Strip block comments /* ... */
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
    # Split sur ; en fin de ligne. Cas tordus (; dans une string) pas geres.
    raw_stmts = re.split(r';\s*(?:\n|$)', text)
    statements = []
    for s in raw_stmts:
        s = s.strip()
        if not s:
            continue
        tokens = re.split(r'\s+', s[:80], maxsplit=1)
        first_word = tokens[0].upper() if tokens else ''
        table = None
        if first_word in ('INSERT', 'DELETE', 'UPDATE'):
            m = re.search(r'(?:INTO|FROM|UPDATE)\s+([a-zA-Z0-9_."]+)', s, re.I)
            if m:
                table = m.group(1).replace('public.', '').replace('"', '')
        elif first_word in ('CREATE', 'ALTER', 'DROP', 'TRUNCATE'):
            m = re.search(
                r'(?:TABLE|INDEX|POLICY|VIEW|TYPE)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([a-zA-Z0-9_."]+)',
                s, re.I)
            if m:
                table = m.group(1).replace('public.', '').replace('"', '')
        statements.append({'type': first_word, 'table': table, 'sql': s})
    return statements


def check_destructive_ops(report, statements):
    for s in statements:
        if s['type'] in DESTRUCTIVE_OPS:
            report.add(Check(
                'op_destructrice',
                'critical',
                f"{s['type']} {s['table'] or '?'} - operation destructrice",
                "TRUNCATE/DROP ne peut etre annule. Sauvegarde + revue manuelle."
            ))


def check_delete_without_where(report, statements):
    for s in statements:
        if s['type'] != 'DELETE':
            continue
        if not re.search(r'\bWHERE\b', s['sql'], re.I):
            report.add(Check(
                'delete_sans_where',
                'critical',
                f"DELETE FROM {s['table'] or '?'} sans WHERE - vide la table",
                "Probable erreur. Ajoute WHERE ou utilise TRUNCATE si voulu."
            ))


def check_critical_tables(report, statements):
    for s in statements:
        if s['table'] in CRITICAL_TABLES and s['type'] in ('DELETE', 'UPDATE', 'TRUNCATE', 'DROP'):
            report.add(Check(
                'table_critique',
                'warning',
                f"{s['type']} sur table critique '{s['table']}'",
                "Revue manuelle recommandee. Sauvegarde Supabase recente ?"
            ))


def count_insert_values(report, statements):
    """Compte le nombre de tuples a inserer (approximation : parens ouvrantes apres VALUES)."""
    total = 0
    by_table = defaultdict(int)
    for s in statements:
        if s['type'] != 'INSERT':
            continue
        m = re.search(r'\bVALUES\b(.*)', s['sql'], re.I | re.DOTALL)
        if not m:
            continue
        body = m.group(1)
        # Approximation : compte les tuples au top-level (parens ouvrantes)
        # Suppose pas de parens dans les valeurs - simplification MVP.
        # Plus precis : tracker la profondeur des parens.
        depth = 0
        n_tuples = 0
        for ch in body:
            if ch == '(':
                if depth == 0:
                    n_tuples += 1
                depth += 1
            elif ch == ')':
                depth -= 1
        by_table[s['table']] += n_tuples
        total += n_tuples
    if total == 0:
        return
    if total < 100:
        level = 'pass'
    elif total < 10000:
        level = 'info'
    else:
        level = 'warning'
    details = ' / '.join(f"{t}={n}" for t, n in sorted(by_table.items()))
    report.add(Check('volume_insert', level,
                     f"{total} ligne{'s' if total > 1 else ''} a inserer",
                     details))


def check_balance_ecritures(report, statements):
    """Pour les INSERTs dans ecritures_compta : verifie equilibre debit = credit."""
    total_d = 0.0
    total_c = 0.0
    nb = 0
    for s in statements:
        if s['type'] != 'INSERT' or s['table'] != 'ecritures_compta':
            continue
        m_cols = re.search(r'INSERT\s+INTO\s+\S+\s*\(([^)]+)\)\s*VALUES',
                           s['sql'], re.I)
        if not m_cols:
            continue
        cols = [c.strip().lower().strip('"') for c in m_cols.group(1).split(',')]
        try:
            idx_d = cols.index('debit')
            idx_c = cols.index('credit')
        except ValueError:
            continue
        body_match = re.search(r'VALUES\s+(.*)', s['sql'], re.I | re.DOTALL)
        if not body_match:
            continue
        body = body_match.group(1)
        # Extrait chaque tuple top-level
        tuples = []
        depth = 0
        current = []
        for ch in body:
            if ch == '(' and depth == 0:
                depth = 1
                current = []
            elif ch == ')' and depth == 1:
                tuples.append(''.join(current))
                depth = 0
            elif depth > 0:
                if ch == '(':
                    depth += 1
                elif ch == ')':
                    depth -= 1
                current.append(ch)
        for tup in tuples:
            # Split par ',' en preservant les strings quotees
            vals = []
            cur = []
            in_str = False
            for ch in tup:
                if ch == "'" and (not cur or cur[-1] != '\\'):
                    in_str = not in_str
                    cur.append(ch)
                elif ch == ',' and not in_str:
                    vals.append(''.join(cur).strip())
                    cur = []
                else:
                    cur.append(ch)
            if cur:
                vals.append(''.join(cur).strip())
            if len(vals) > max(idx_d, idx_c):
                try:
                    d = float(vals[idx_d].strip("'"))
                    c = float(vals[idx_c].strip("'"))
                    total_d += d
                    total_c += c
                    nb += 1
                except (ValueError, IndexError):
                    pass
    if nb == 0:
        return
    ecart = total_d - total_c
    if abs(ecart) < 1:
        report.add(Check(
            'equilibre_compta', 'pass',
            f"Comptabilite equilibree sur {nb} ecritures",
            f"Debit = Credit = {total_d:,.0f} XPF"
        ))
    else:
        level = 'critical' if abs(ecart) > 1_000_000 else 'warning'
        report.add(Check(
            'equilibre_compta', level,
            f"Ecart Debit-Credit = {ecart:+,.0f} XPF sur {nb} ecritures",
            f"Debit total = {total_d:,.0f} / Credit total = {total_c:,.0f}. "
            f"En compta, l'ecart total doit etre 0."
        ))


def check_idempotence_delete_insert(report, statements):
    """DELETE WHERE cree_par='X' + INSERT cree_par='X' -> coherent."""
    for s_del in statements:
        if s_del['type'] != 'DELETE' or not s_del['table']:
            continue
        m = re.search(r"cree_par\s*=\s*'([^']+)'", s_del['sql'], re.I)
        if not m:
            continue
        tag = m.group(1)
        # Cherche les INSERTs suivants sur la meme table avec ce tag
        idx = statements.index(s_del)
        found_match = False
        for s_ins in statements[idx + 1:]:
            if s_ins['type'] == 'INSERT' and s_ins['table'] == s_del['table']:
                if f"'{tag}'" in s_ins['sql']:
                    found_match = True
                    break
        if not found_match:
            report.add(Check(
                'idempotence',
                'warning',
                f"DELETE cree_par='{tag}' sans INSERT correspondant",
                f"Sur table {s_del['table']}. Verifie que l'INSERT taggue bien "
                f"cree_par='{tag}' (sinon les donnees supprimees ne reviennent pas)."
            ))


def check_volume_global(report, statements):
    n = len(statements)
    if n == 0:
        report.add(Check('vide', 'warning', 'Aucun statement SQL detecte',
                         'Fichier vide ou parsing rate ?'))
    elif n < 50:
        report.add(Check('volume_stmts', 'pass', f"{n} statements", 'Volume faible'))
    elif n < 1000:
        report.add(Check('volume_stmts', 'info', f"{n} statements", 'Volume moyen'))
    else:
        report.add(Check('volume_stmts', 'warning', f"{n} statements",
                         "Execution longue probable - prevois quelques minutes."))


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)
    sql_file = sys.argv[1]
    flags = sys.argv[2:]
    output_json = '--json' in flags
    strict = '--strict' in flags

    if not os.path.exists(sql_file):
        print(f"ERREUR : fichier '{sql_file}' introuvable", file=sys.stderr)
        sys.exit(3)
    with open(sql_file, 'r', encoding='utf-8') as f:
        text = f.read()

    statements = parse_sql(text)
    report = AuditReport(sql_file)
    report.statements = statements

    # Run checks
    check_volume_global(report, statements)
    check_destructive_ops(report, statements)
    check_delete_without_where(report, statements)
    check_critical_tables(report, statements)
    count_insert_values(report, statements)
    check_balance_ecritures(report, statements)
    check_idempotence_delete_insert(report, statements)

    # Output
    if output_json:
        # JSON pour pipeline / integration future
        type_counts = defaultdict(int)
        for s in statements:
            type_counts[s['type']] += 1
        out = {
            'sql_file': sql_file,
            'timestamp': report.timestamp,
            'verdict': report.verdict(),
            'recommendation': report.recommendation(),
            'checks': [c.to_dict() for c in report.checks],
            'statements_count': len(statements),
            'statements_by_type': dict(type_counts),
        }
        print(json.dumps(out, indent=2, ensure_ascii=False))
    else:
        md = report.render_markdown()
        out_file = f"audit_{Path(sql_file).stem}.md"
        Path(out_file).write_text(md, encoding='utf-8')
        print(md)
        print(f"\n---\nRapport ecrit : {out_file}")

    # Exit code selon verdict
    v = report.verdict()
    if v == 'CRITIQUE':
        sys.exit(2)
    elif v == 'MOYEN':
        sys.exit(1 if strict else 0)
    else:
        sys.exit(0)


if __name__ == '__main__':
    main()
