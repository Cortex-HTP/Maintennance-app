# -*- coding: utf-8 -*-
# ═══ /api/rh-pdf — Genere le PDF d'un document RH (reportlab) ══════════
# POST { type: "cdd" | "cdi", data: {...champs gen_contrat...} }
#   ou { type: "avenant_cdd" | "avenant_cdi" | "autorisation_conduite" |
#        "attestation_travail" | "certificat_travail" | "promesse_embauche" |
#        "courrier", data: {...champs gen_documents...} }
#   -> { ok, pdf_base64, police, pages }
#
# ⚠️ Cet endpoint produit des documents PRE-SIGNES (signature + cachet du
# gerant embarques) : acces reserve aux comptes app_users de role
# "Administrateur" (JWT Supabase verifie + role verifie avec le jeton de
# l'appelant, comparaison EXACTE en python — jamais de filtre PostgREST sur
# une valeur controlee par l'appelant).
#
# Env (deja presentes sur le projet Vercel admin) : SUPABASE_URL,
# SUPABASE_ANON_KEY. Polices : voir api/_rh/gen_contrat.py (fonts_data.py
# -> Carlito ; repli Helvetica si absent, signale dans la reponse).
import base64
import json
import os
import sys
import urllib.request
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "_rh"))
import gen_contrat  # noqa: E402 (import statique : bundle + erreurs visibles au demarrage)
import gen_documents  # noqa: E402 (attestations, certificat, avenants, autorisation, courrier)

MAX_CORPS = 300000  # ~300 Ko de JSON, tres au-dela d'un contrat normal

# Champs obligatoires (texte non vide) des documents autres que le contrat
CHAMPS_DOCS = {
    "avenant_cdd": ("nom", "nom_box", "parties", "debut_initial", "fin_initiale", "debut_prolongation",
                    "fin_nouvelle", "duree_prolongation", "duree_totale", "motif_prolongation",
                    "fonction", "classif", "remuneration", "date_signature"),
    "avenant_cdi": ("nom", "nom_box", "parties", "date_signature"),
    "autorisation_conduite": ("nom", "nom_box", "beneficiaire", "objet", "date_signature"),
    "attestation_travail": ("nom_complet", "depuis", "fonction", "type_contrat", "date_signature"),
    "certificat_travail": ("nom_complet", "debut", "fin", "date_signature"),
    "promesse_embauche": ("nom_complet", "fonction", "classif", "date_entree", "remuneration",
                          "type_contrat", "date_signature"),
    "courrier": ("nom_complet", "objet", "date_signature"),
}


def _liste_textes(v):
    # une chaine seule vaut une liste d'un element (gen_documents la normalise pareil)
    if isinstance(v, str):
        v = [v]
    return [x for x in v if isinstance(x, str) and x.strip()] if isinstance(v, list) else []


def _valider_document(type_doc, data):
    """Message d'erreur explicite, ou None si le document est generable."""
    for champ in CHAMPS_DOCS[type_doc]:
        if not str(data.get(champ) or "").strip():
            return type_doc + " : champ " + champ + " manquant"
    if type_doc in ("attestation_travail", "promesse_embauche"):
        if str(data.get("type_contrat")).strip().lower() not in ("cdi", "cdd"):
            return type_doc + " : type_contrat doit valoir cdi ou cdd"
    if type_doc == "avenant_cdd" and not _liste_textes(data.get("preambule")):
        return "avenant_cdd : preambule manquant"
    if type_doc == "avenant_cdi":
        arts = data.get("articles") if isinstance(data.get("articles"), list) else []
        if not [a for a in arts if isinstance(a, dict) and str(a.get("titre") or "").strip() and _liste_textes(a.get("paragraphes"))]:
            return "avenant_cdi : au moins un article (titre + paragraphes) requis"
    if type_doc == "certificat_travail":
        emplois = data.get("emplois") if isinstance(data.get("emplois"), list) else []
        if not str(data.get("fonction") or "").strip() and not [e for e in emplois if isinstance(e, dict) and str(e.get("fonction") or "").strip()]:
            return "certificat_travail : fonction ou emplois requis"
    if type_doc == "courrier" and not _liste_textes(data.get("corps")):
        return "courrier : corps manquant"
    return None


def _http_json(url, bearer, anon):
    req = urllib.request.Request(url, headers={
        "apikey": anon,
        "Authorization": bearer,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode("utf-8"))


def _admins_autorises():
    """Liste FIXE d'emails (env RH_ADMIN_EMAILS, separes par des virgules).

    Defense en profondeur exigee par l'audit : meme si quelqu'un parvenait a
    s'ecrire "Administrateur" dans app_users (inscriptions Supabase ouvertes),
    il resterait hors de cette liste. Var ABSENTE = endpoint FERME.
    """
    brut = os.environ.get("RH_ADMIN_EMAILS") or ""
    return [e.strip().lower() for e in brut.split(",") if e.strip()]


def _verifier_admin(bearer):
    """True si le jeton appartient a un compte app_users Administrateur ET
    present dans la liste fixe RH_ADMIN_EMAILS."""
    url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    anon = os.environ.get("SUPABASE_ANON_KEY") or ""
    autorises = _admins_autorises()
    if not url or not anon or not autorises or not bearer.startswith("Bearer "):
        return False
    try:
        moi = _http_json(url + "/auth/v1/user", bearer, anon)
        email = str(moi.get("email") or "").lower()
        if not email or email not in autorises:
            return False
        lignes = _http_json(url + "/rest/v1/app_users?select=email,role", bearer, anon)
        for u in lignes if isinstance(lignes, list) else []:
            if str(u.get("email") or "").lower() == email and u.get("role") == "Administrateur":
                return True
        return False
    except Exception:
        return False


class handler(BaseHTTPRequestHandler):
    def _repondre(self, code, obj):
        corps = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def do_OPTIONS(self):
        self._repondre(200, {"ok": True})

    def do_POST(self):
        try:
            taille = int(self.headers.get("Content-Length") or 0)
            if taille <= 0 or taille > MAX_CORPS:
                return self._repondre(413, {"error": "corps absent ou trop lourd"})
            if not _admins_autorises():
                return self._repondre(503, {"error": "RH_ADMIN_EMAILS non configuree sur Vercel (liste d'emails autorises)"})
            if not _verifier_admin(self.headers.get("Authorization") or ""):
                return self._repondre(401, {"error": "reserve a l'Administrateur"})
            corps = json.loads(self.rfile.read(taille).decode("utf-8"))
            type_doc = str(corps.get("type") or "cdd").strip().lower()
            if type_doc not in ("cdd", "cdi") and type_doc not in gen_documents.BUILDERS:
                return self._repondre(400, {"error": "type de document non gere"})
            data = corps.get("data")
            if not isinstance(data, dict):
                return self._repondre(400, {"error": "data manquant"})
            if type_doc in gen_documents.BUILDERS:
                erreur = _valider_document(type_doc, data)
                if erreur:
                    return self._repondre(400, {"error": erreur})
                octets = gen_documents.build_document_bytes(type_doc, data)
                return self._repondre(200, {
                    "ok": True,
                    "pdf_base64": base64.b64encode(octets).decode("ascii"),
                    "police": gen_contrat.POLICE_SOURCE,
                })
            # Le type du gabarit vient de l'enveloppe, jamais d'un champ de data
            data = dict(data)
            data["type"] = type_doc
            for champ in ("nom", "nom_box", "parties", "classif", "date_signature", "remuneration"):
                if not str(data.get(champ) or "").strip():
                    return self._repondre(400, {"error": "champ obligatoire manquant : " + champ})
            # essai : present en texte, OU explicitement null (aucun essai),
            # OU essai_texte - sinon KeyError dans le gabarit
            poursuite_cdi = type_doc == "cdi" and bool(data.get("poursuite"))
            if poursuite_cdi:
                # relation qui se poursuit : jamais de periode d'essai, quoi
                # qu'ait renvoye l'agent (essai "", "un (1) mois"...)
                data["essai"] = None
            if "essai" not in data and not data.get("essai_texte") and not poursuite_cdi:
                return self._repondre(400, {"error": "champ essai manquant (texte, ou null si aucune periode d'essai)"})
            if data.get("essai") is not None and not str(data.get("essai")).strip() and not data.get("essai_texte"):
                return self._repondre(400, {"error": "champ essai vide (texte, ou null si aucune periode d'essai)"})
            if type_doc == "cdi":
                # CDI : ni terme, ni remplacement, ni regularisation de CDD
                for champ in ("debut", "fonction"):
                    if not str(data.get(champ) or "").strip():
                        return self._repondre(400, {"error": "cdi : champ " + champ + " manquant"})
                for champ in ("remplace", "regularisation", "preambule", "fin", "duree", "duree_min", "fin_min", "motif"):
                    data.pop(champ, None)
            elif data.get("remplace"):
                r = data["remplace"] if isinstance(data["remplace"], dict) else {}
                for champ in ("nom", "qualif"):
                    if not str(r.get(champ) or "").strip():
                        return self._repondre(400, {"error": "remplacement : champ remplace." + champ + " manquant"})
                for champ in ("debut", "duree_min", "fin_min"):
                    if not str(data.get(champ) or "").strip():
                        return self._repondre(400, {"error": "remplacement : champ " + champ + " manquant"})
            else:
                if not (data.get("debut") and data.get("fin") and data.get("duree")):
                    return self._repondre(400, {"error": "debut/fin/duree obligatoires (hors remplacement)"})

            octets = gen_contrat.build_contract_bytes(data)
            return self._repondre(200, {
                "ok": True,
                "pdf_base64": base64.b64encode(octets).decode("ascii"),
                "police": gen_contrat.POLICE_SOURCE,
            })
        except Exception as e:  # detail dans les logs Vercel, jamais au client
            print("rh-pdf erreur:", repr(e))
            return self._repondre(500, {"error": "generation impossible - reessaie ou reformule la demande"})
