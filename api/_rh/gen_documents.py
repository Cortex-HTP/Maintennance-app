# -*- coding: utf-8 -*-
# ═══ Documents RH Wallis-Label autres que le contrat (serverless) ═══════
# Meme charte que gen_contrat.py (logo, en-tete, pied, signature pre-apposee).
# Textes VERROUILLES : l'agent IA ne fournit que les champs variables.
#  - avenant_cdd          : texte du kit RH (gen_avenant_cdd.py), mot pour mot
#  - autorisation_conduite: conditions et validite du kit (gen_autorisation_conduite.py)
#  - avenant_cdi          : structure du modele d'avenant CDI (preambule +
#                           articles), article final « Autres dispositions » fixe
#  - attestation_travail, certificat_travail, promesse_embauche : trames sobres
#  - courrier             : courrier libre (corps redige par l'agent, relu par Tom)
#
# ⚠️ Documents a faire signer : le bloc « Le Salarié* » puis le nom puis la
# mention « … lu et approuvé … » sert d'ANCRE a la signature tablette de
# l'APP Employes (api/rh-doc-sign.js) : ne pas en changer libelles ni ordre.
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    KeepTogether, NextPageTemplate, HRFlowable,
)
from reportlab.lib.utils import ImageReader
import io
from xml.sax.saxutils import escape as _escape_xml  # titre remis en texte sur (entites decodees)

import gen_contrat as G

BODY, BODY_C, SMALL, ART = G.BODY, G.BODY_C, G.SMALL, G.ART
BOXTITLE, BOXNAME = G.BOXTITLE, G.BOXNAME
P = G.P

SOUS_TITRE = ParagraphStyle("SOUS_TITRE", parent=BOXNAME, fontName=G.F_REG, fontSize=9.5, leading=13,
                            textColor=G.GRIS)
RETRAIT = ParagraphStyle("RETRAIT", parent=BODY, leftIndent=12 * mm)
PUCE = ParagraphStyle("PUCE", parent=BODY, leftIndent=6 * mm, firstLineIndent=-4 * mm, spaceAfter=3)
DROITE = ParagraphStyle("DROITE", parent=BODY, alignment=TA_RIGHT, spaceAfter=1)
GAUCHE = ParagraphStyle("GAUCHE", parent=BODY, alignment=TA_LEFT)
CELLULE = ParagraphStyle("CELLULE", parent=BODY, alignment=TA_LEFT, spaceAfter=0)

SOCIETE_PARTIE = ("La Société <b>WALLIS LABEL %s</b> au capital de 1 000 000 XPF, dont le siège social est "
                  "situé 15 rue de Papeete à Ducos, RIDET n° 747 220.001, code APE 43.13Z, affiliée à la CAFAT "
                  "sous le n° 58645/001, représentée par Monsieur Tom PICOT, Gérant, ayant qualité à cet "
                  "effet," % G.FORME_SOCIALE)
JE_SOUSSIGNE = ("Je soussigné, Monsieur Tom PICOT, agissant en qualité de Gérant de la société <b>WALLIS LABEL "
                "%s</b>, dont le siège social est situé 15 rue de Papeete – 98803 Ducos Cedex, RIDET "
                "n° 747 220.001," % G.FORME_SOCIALE)


# ---------------------------------------------------------------- outils communs
def _fem(s):
    return str(s.get("civilite") or "").strip().lower().startswith("mad")


def _civ(s):
    return "Madame" if _fem(s) else "Monsieur"


def _e(s):
    return "e" if _fem(s) else ""


def _txt(s, k, defaut="[[à compléter]]"):
    v = s.get(k)
    return v if (isinstance(v, str) and v.strip()) else defaut


def _doc(path, titre_pdf, rappel):
    doc = BaseDocTemplate(path, pagesize=A4, leftMargin=G.MARGE_LAT, rightMargin=G.MARGE_LAT,
                          topMargin=G.MARGE_HAUT_P1, bottomMargin=G.MARGE_BAS,
                          title=G._texte_brut(titre_pdf), author="WALLIS LABEL %s" % G.FORME_SOCIALE)
    sans_marge = dict(leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    frame1 = Frame(G.MARGE_LAT, G.MARGE_BAS, doc.width, A4[1] - G.MARGE_BAS - G.MARGE_HAUT_P1, id="p1", **sans_marge)
    frame_n = Frame(G.MARGE_LAT, G.MARGE_BAS, doc.width, A4[1] - G.MARGE_BAS - G.MARGE_HAUT_SUITE, id="pn", **sans_marge)
    logo = ImageReader(io.BytesIO(G._LOGO_OCTETS)) if G._LOGO_OCTETS else None
    doc.addPageTemplates([
        PageTemplate(id="first", frames=[frame1], onPage=G._dessiner_pied),
        PageTemplate(id="later", frames=[frame_n], onPage=G._faire_entete_suite(G._texte_brut(rappel), logo)),
    ])
    return doc


def _tete(doc, titre, sous_titre=None, nom_box=None):
    S = [NextPageTemplate("later"), G._entete_premiere_page(doc.width),
         HRFlowable(width="100%", thickness=0.9, color=G.BLEU, spaceBefore=3 * mm, spaceAfter=5 * mm)]
    lignes = [Paragraph(titre, BOXTITLE)]
    if sous_titre:
        lignes.append(Paragraph(sous_titre, SOUS_TITRE))
    if nom_box:
        lignes.append(Paragraph(nom_box, BOXNAME))
    box = Table([[lignes]], colWidths=[doc.width])
    box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.9, G.BLEU),
        ("BACKGROUND", (0, 0), (-1, -1), G.FOND_TITRE),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    S += [box, Spacer(1, 5 * mm)]
    return S


def _parties(S, s):
    S.append(Paragraph("<b>Entre les soussignés :</b>", BODY))
    S.append(P(SOCIETE_PARTIE))
    S.append(Paragraph("Ci-après dénommée la Société, d’une part,", BODY_C))
    S.append(Paragraph("<b>Et :</b>", BODY))
    S.append(P(_txt(s, "parties", "[[identité du salarié]],")))
    S.append(Paragraph("Ci-après dénommé%s Le Salarié, d’autre part," % _e(s), BODY_C))
    S.append(Spacer(1, 1 * mm))


def _article(i, titre):
    return Paragraph('<font color="%s">ARTICLE&nbsp;%02d</font>&nbsp;&nbsp;&nbsp;&nbsp;%s' % (G.BLEU_HEX, i, titre), ART)


def _articles(S, arts):
    """Ajoute les articles ; renvoie le DERNIER (titre + paragraphes) pour qu'il
    voyage avec le bloc de signature (jamais de page de signatures isolee)."""
    dernier = []
    for i, (titre, paras) in enumerate(arts, start=1):
        head = _article(i, titre)
        paras = [p for p in paras if p] or ["[[à compléter]]"]
        if i == len(arts):
            dernier = [head] + [P(x) for x in paras]
            break
        S.append(KeepTogether([head, P(paras[0])]))
        for extra in paras[1:]:
            S.append(P(extra))
    return dernier


def _bloc_societe():
    return [
        Paragraph("<b>Pour la Société</b>", BODY),
        Spacer(1, 2 * mm),
        G.signature_flowable(45, signer=True),
        Spacer(1, 1 * mm),
        Paragraph("Monsieur Tom PICOT – Gérant", SMALL),
        Paragraph("15 rue de Papeete – 98803 Ducos Cedex", SMALL),
        Paragraph("Ridet : 747 220.001", SMALL),
        Paragraph("Tél. &amp; Fax : (687) 28 89 49", SMALL),
    ]


def _bloc_salarie(nom, mention, libelle="Le Salarié*"):
    # Libelles et ordre = ancre de la signature tablette (rh-doc-sign.js)
    return [
        Paragraph("<b>%s</b>" % libelle, BODY),
        Spacer(1, 2 * mm),
        G.signature_flowable(45, signer=False),
        Spacer(1, 1 * mm),
        Paragraph("%s" % nom, SMALL),
        Paragraph("* Signature précédée de la mention manuscrite", SMALL),
        Paragraph("<i>%s.</i>" % mention, SMALL),
    ]


def _signatures(doc, bloc_salarie=None):
    if bloc_salarie:
        cellules = [[_bloc_societe(), bloc_salarie]]
    else:
        # Document signe par la seule societe : bloc a droite, comme un courrier
        cellules = [["", _bloc_societe()]]
    t = Table(cellules, colWidths=[doc.width / 2, doc.width / 2])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    return t


def _fin(S, doc, dernier, fait_a, bloc_salarie=None):
    S.append(KeepTogether((dernier or []) + [Spacer(1, 6 * mm), P(fait_a), Spacer(1, 8 * mm),
                                            _signatures(doc, bloc_salarie)]))


def _construire(path, titre_pdf, rappel, corps):
    doc = _doc(path, titre_pdf, rappel)
    S = corps(doc)
    doc.build(S, canvasmaker=G._CanvasPagine)


# ---------------------------------------------------------------- avenant de renouvellement CDD (kit)
def _articles_avenant_cdd(s):
    return [
        ("OBJET DE L’AVENANT", [
            "Le présent avenant a pour objet de <b>prolonger la durée du contrat de travail à durée "
            "déterminée</b> visé au préambule, dont le terme initial était fixé au <b>%s inclus</b>."
            % _txt(s, "fin_initiale"),
            "Il est conclu et signé <b>avant l’arrivée du terme initial du contrat</b>, conformément aux "
            "dispositions du Code du travail de Nouvelle-Calédonie relatives au renouvellement du contrat à "
            "durée déterminée. Les parties reconnaissent expressément que leur accord est intervenu avant "
            "cette échéance.",
        ]),
        ("NOUVEAU TERME DU CONTRAT", [
            "Le terme du contrat est reporté au <b>%s inclus</b>. Le contrat se poursuivra donc sans "
            "interruption du <b>%s</b> au <b>%s inclus</b>, soit une prolongation de <b>%s</b>."
            % (_txt(s, "fin_nouvelle"), _txt(s, "debut_prolongation"), _txt(s, "fin_nouvelle"),
               _txt(s, "duree_prolongation")),
            "La durée totale du contrat, prolongation comprise, est ainsi portée à <b>%s</b>, du <b>%s</b> au "
            "<b>%s inclus</b>, demeurant dans les limites prévues par le Code du travail de "
            "Nouvelle-Calédonie." % (_txt(s, "duree_totale"), _txt(s, "debut_initial"), _txt(s, "fin_nouvelle")),
            "Le contrat prendra fin de plein droit au terme ainsi reporté, sans qu’il soit besoin de "
            "délivrer un quelconque congé ou préavis. Toute poursuite de la relation de travail au-delà de "
            "ce terme ne pourra résulter que d’un nouvel accord écrit entre les parties.",
        ]),
        ("MOTIF DE RECOURS INCHANGÉ", [
            "Le motif de recours au contrat à durée déterminée demeure inchangé : le Salarié reste engagé "
            "en application de l’article Lp. 123-2 (7°) du Code du travail de Nouvelle-Calédonie, pour le "
            "secteur du bâtiment et des travaux publics, secteur dans lequel il est d’usage constant de ne "
            "pas recourir au contrat à durée indéterminée pour certains emplois par nature temporaires, dans "
            "le cadre d’un renfort d’équipe temporaire.",
            _txt(s, "motif_prolongation"),
        ]),
        ("ABSENCE DE NOUVELLE PÉRIODE D’ESSAI", [
            "La relation de travail se poursuivant sans interruption, la période d’essai prévue au contrat "
            "initial n’est pas renouvelée. Aucune nouvelle période d’essai n’est applicable au titre du "
            "présent avenant.",
        ]),
        ("MAINTIEN DES AUTRES STIPULATIONS DU CONTRAT", [
            "Toutes les autres stipulations du contrat de travail initial demeurent inchangées et "
            "continuent de produire leurs effets pendant la période de prolongation, notamment en ce qui "
            "concerne la fonction (<b>%s</b>), la classification conventionnelle (<b>%s</b>), la durée du "
            "travail (169 heures par mois), le lieu de travail et la clause de mobilité, les primes et "
            "indemnités de chantier, ainsi que les obligations d’hygiène, de sécurité, de discrétion et de "
            "restitution du matériel." % (_txt(s, "fonction"), _txt(s, "classif")),
            _txt(s, "remuneration"),
        ]),
        ("RUPTURE ANTICIPÉE ET FIN DE CONTRAT", [
            "Les cas de rupture anticipée prévus par l’article Lp. 123-8 du Code du travail de "
            "Nouvelle-Calédonie (accord des parties, faute grave, force majeure, inaptitude constatée par le "
            "médecin du travail, embauche sous contrat à durée indéterminée justifiée par le Salarié) "
            "demeurent applicables pendant la période de prolongation.",
            "Au terme du contrat, la société remettra au Salarié un certificat de travail, un reçu pour "
            "solde de tout compte, l’attestation destinée aux organismes sociaux, ainsi que l’indemnité "
            "compensatrice de congés payés correspondant aux droits acquis et non pris. Le contrat étant "
            "conclu au titre de l’article Lp. 123-2 (7°) du Code du travail de Nouvelle-Calédonie, il ne "
            "sera pas versé d’indemnité de fin de contrat.",
        ]),
        ("DROIT APPLICABLE ET JURIDICTION COMPÉTENTE", [
            "Le présent avenant fait partie intégrante du contrat de travail initial, avec lequel il forme "
            "un tout indivisible. Il est soumis au Code du travail de Nouvelle-Calédonie et à la Convention "
            "Collective du Bâtiment et des Travaux Publics de Nouvelle-Calédonie. Tout litige relatif à sa "
            "formation, son exécution ou sa rupture relèvera, à défaut de règlement amiable, de la "
            "compétence du Tribunal du travail de Nouméa.",
        ]),
    ]


def build_avenant_cdd(path, s):
    titre = "AVENANT N° %s AU CONTRAT DE TRAVAIL À DURÉE DÉTERMINÉE" % _txt(s, "numero", "1")

    def corps(doc):
        S = _tete(doc, titre, "Prolongation du terme", _txt(s, "nom_box"))
        _parties(S, s)
        S.append(Paragraph("<b>Préambule</b>", ART))
        for para in (s.get("preambule") or ["[[préambule]]"]):
            S.append(P(para))
        S.append(Paragraph("<b>Il a été convenu et arrêté ce qui suit :</b>", BODY))
        dernier = _articles(S, _articles_avenant_cdd(s))
        _fin(S, doc, dernier,
             "Fait à Nouméa, le %s, en double exemplaire, avant le terme du contrat initial." % _txt(s, "date_signature", "[[date]]"),
             _bloc_salarie(_txt(s, "nom"), "« Lu et approuvé, bon pour accord »"))
        return S
    _construire(path, titre + " – " + _txt(s, "nom"), "Avenant au contrat de travail – " + _txt(s, "nom_box"), corps)


# ---------------------------------------------------------------- avenant au CDI (modele Word)
def build_avenant_cdi(path, s):
    titre = "AVENANT AU CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE"
    if s.get("numero"):
        titre = "AVENANT N° %s AU CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE" % s["numero"]

    def corps(doc):
        S = _tete(doc, titre, _txt(s, "objet", None) if s.get("objet") else None, _txt(s, "nom_box"))
        _parties(S, s)
        if s.get("preambule"):
            S.append(Paragraph("<b>Préambule</b>", ART))
            for para in s["preambule"]:
                S.append(P(para))
        S.append(Paragraph("<b>Il a été convenu et arrêté ce qui suit :</b>", BODY))
        arts = []
        for a in (s.get("articles") or []):
            if isinstance(a, dict) and str(a.get("titre") or "").strip():
                paras = a.get("paragraphes") if isinstance(a.get("paragraphes"), list) else []
                arts.append((_escape_xml(G._texte_brut(a["titre"]).upper()[:90]), [x for x in paras if isinstance(x, str)]))
        # Article final FIXE (modele d'avenant CDI de la societe)
        arts.append(("AUTRES DISPOSITIONS", [
            "Toutes les autres clauses du contrat de travail de %s et de ses éventuels avenants antérieurs, "
            "non contraires au présent avenant, demeurent inchangées." % _txt(s, "nom")]))
        dernier = _articles(S, arts)
        _fin(S, doc, dernier,
             "Fait à Nouméa, le %s, en double exemplaire." % _txt(s, "date_signature", "[[date]]"),
             _bloc_salarie(_txt(s, "nom"), "« Lu et approuvé, bon pour accord »"))
        return S
    _construire(path, titre + " – " + _txt(s, "nom"), "Avenant au contrat de travail – " + _txt(s, "nom_box"), corps)


# ---------------------------------------------------------------- autorisation de conduite (kit)
CONDITIONS_CONDUITE = [
    "Respecter en toutes circonstances le Code de la route et les limitations de vitesse, ainsi que "
    "les consignes de circulation propres aux chantiers.",
    "N’utiliser le véhicule qu’à des fins professionnelles, tout usage personnel étant exclu sauf "
    "accord écrit préalable de la société.",
    "Ne jamais prendre le volant sous l’emprise d’un état alcoolique, de stupéfiants ou de "
    "médicaments incompatibles avec la conduite.",
    "Vérifier avant chaque utilisation l’état général du véhicule et signaler sans délai à la "
    "société toute anomalie, avarie ou sinistre.",
    "Informer immédiatement la société de toute suspension, rétention, retrait ou annulation de son "
    "permis de conduire, la présente autorisation devenant alors caduque de plein droit.",
    "Assumer personnellement les contraventions et amendes résultant d’infractions qui lui sont "
    "imputables.",
]
VALIDITE_CONDUITE = (
    "La présente autorisation est délivrée pour la durée du contrat de travail de l’intéressé. Elle "
    "est strictement personnelle, incessible, et peut être retirée à tout moment par la société, sans "
    "préavis ni indemnité, notamment en cas de manquement aux conditions énoncées ci-dessus.")


def build_autorisation_conduite(path, s):
    def corps(doc):
        S = _tete(doc, "AUTORISATION DE CONDUITE", None, _txt(s, "nom_box"))
        S.append(Paragraph("<b>La société soussignée :</b>", BODY))
        S.append(P(SOCIETE_PARTIE))
        S.append(Paragraph("<b>Autorise :</b>", BODY))
        S.append(P(_txt(s, "beneficiaire", "[[identité du salarié]],")))
        arts = [
            ("OBJET DE L’AUTORISATION", [_txt(s, "objet")]),
            ("CONDITIONS D’UTILISATION", ["•&nbsp;&nbsp;" + c for c in CONDITIONS_CONDUITE]),
            ("VALIDITÉ", [VALIDITE_CONDUITE]),
        ]
        dernier = _articles(S, arts)
        _fin(S, doc, dernier,
             "Fait à Nouméa, le %s, en double exemplaire." % _txt(s, "date_signature", "[[date]]"),
             _bloc_salarie(_txt(s, "nom"), "« Reçu en main propre, lu et approuvé »"))
        return S
    _construire(path, "Autorisation de conduite – " + _txt(s, "nom"), "Autorisation de conduite – " + _txt(s, "nom_box"), corps)


# ---------------------------------------------------------------- attestation de travail
MENTIONS_ATTESTATION = {
    "hors_essai": "%s n’est pas en période d’essai.",
    "non_demissionnaire": "À ce jour, %s n’est ni démissionnaire, ni en cours de procédure de licenciement.",
}


def build_attestation_travail(path, s):
    il = "elle" if _fem(s) else "il"

    def corps(doc):
        S = _tete(doc, "ATTESTATION DE TRAVAIL")
        S.append(Spacer(1, 3 * mm))
        S.append(P(JE_SOUSSIGNE + " atteste que :"))
        ident = "%s <b>%s</b>" % (_civ(s), _txt(s, "nom_complet"))
        if s.get("naissance"):
            ident += ", né%s %s" % (_e(s), s["naissance"])
        S.append(P(ident + ",", RETRAIT))
        if str(s.get("type_contrat") or "").lower() == "cdi":
            contrat = "contrat à durée indéterminée"
        else:
            contrat = "contrat à durée déterminée"
            if s.get("fin"):
                contrat += " dont le terme est fixé au %s" % s["fin"]
        phrase = "est employé%s au sein de notre société depuis le <b>%s</b>, en qualité de <b>%s</b>" % (
            _e(s), _txt(s, "depuis"), _txt(s, "fonction"))
        if s.get("classif"):
            phrase += " (%s)" % s["classif"]
        phrase += ", dans le cadre d’un <b>%s</b>, à %s." % (contrat, _txt(s, "temps", "temps complet"))
        S.append(P(phrase))
        for m in (s.get("mentions") or []):
            if m in MENTIONS_ATTESTATION:
                S.append(P(MENTIONS_ATTESTATION[m] % (il.capitalize() if m == "hors_essai" else il)))
        if s.get("salaire"):
            S.append(P("Sa rémunération mensuelle brute s’élève à <b>%s</b>." % s["salaire"]))
        motif = (", " + s["motif"]) if s.get("motif") else ""
        S.append(P("La présente attestation est délivrée à l’intéressé%s, à sa demande%s, pour servir et "
                   "valoir ce que de droit." % (_e(s), motif)))
        _fin(S, doc, [], "Fait à Nouméa, le %s." % _txt(s, "date_signature", "[[date]]"))
        return S
    _construire(path, "Attestation de travail – " + _txt(s, "nom_complet"), "Attestation de travail – " + _txt(s, "nom_complet"), corps)


# ---------------------------------------------------------------- certificat de travail
def build_certificat_travail(path, s):
    def corps(doc):
        S = _tete(doc, "CERTIFICAT DE TRAVAIL")
        S.append(Spacer(1, 3 * mm))
        S.append(P(JE_SOUSSIGNE + " certifie que :"))
        ident = "%s <b>%s</b>" % (_civ(s), _txt(s, "nom_complet"))
        if s.get("naissance"):
            ident += ", né%s %s" % (_e(s), s["naissance"])
        S.append(P(ident + ",", RETRAIT))
        emplois = [x for x in (s.get("emplois") or []) if isinstance(x, dict) and str(x.get("fonction") or "").strip()]
        debut_fin = "a été employé%s au sein de notre société du <b>%s</b> au <b>%s</b> inclus" % (
            _e(s), _txt(s, "debut"), _txt(s, "fin"))
        if len(emplois) <= 1:
            e0 = emplois[0] if emplois else {"fonction": _txt(s, "fonction"), "classif": s.get("classif")}
            phrase = debut_fin + ", en qualité de <b>%s</b>" % e0.get("fonction")
            if e0.get("classif"):
                phrase += " (%s)" % e0["classif"]
            S.append(P(phrase + "."))
        else:
            S.append(P(debut_fin + ", et y a occupé successivement les emplois suivants :"))
            for x in emplois:
                ligne = "•&nbsp;&nbsp;<b>%s</b>" % x["fonction"]
                if x.get("classif"):
                    ligne += " (%s)" % x["classif"]
                if x.get("du") or x.get("au"):
                    ligne += ", du %s au %s" % (x.get("du") or "[[date]]", x.get("au") or "[[date]]")
                S.append(P(ligne, PUCE))
        if s.get("libre", True) is not False:
            S.append(P("%s %s quitte la société libre de tout engagement." % (_civ(s), _txt(s, "nom_complet"))))
        S.append(P("Le présent certificat lui est délivré pour servir et valoir ce que de droit."))
        _fin(S, doc, [], "Fait à Nouméa, le %s." % _txt(s, "date_signature", "[[date]]"))
        return S
    _construire(path, "Certificat de travail – " + _txt(s, "nom_complet"), "Certificat de travail – " + _txt(s, "nom_complet"), corps)


# ---------------------------------------------------------------- promesse d'embauche
def _destinataire(S, s, largeur):
    lignes = ["%s <b>%s</b>" % (_civ(s), _txt(s, "nom_complet"))]
    for l in (s.get("adresse_lignes") or []):
        if isinstance(l, str) and l.strip():
            lignes.append(l)
    t = Table([["", [Paragraph(G.fill(x), GAUCHE) for x in lignes]]], colWidths=[95 * mm, largeur - 95 * mm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    S.append(t)


def build_promesse_embauche(path, s):
    cdi = str(s.get("type_contrat") or "").lower() == "cdi"

    def corps(doc):
        S = _tete(doc, "PROMESSE D’EMBAUCHE", None, _txt(s, "nom_box", None) if s.get("nom_box") else None)
        _destinataire(S, s, doc.width)
        S.append(Spacer(1, 4 * mm))
        S.append(P("%s," % _civ(s)))
        S.append(P("Suite à nos échanges, la société <b>WALLIS LABEL %s</b> a le plaisir de vous confirmer son "
                   "engagement à vous embaucher, dans les conditions suivantes :" % G.FORME_SOCIALE))
        lignes = [
            ("Emploi", "<b>%s</b>" % _txt(s, "fonction")),
            ("Classification", _txt(s, "classif") + " – Convention collective du Bâtiment et des Travaux Publics de Nouvelle-Calédonie"),
            ("Contrat", "<b>Contrat à durée indéterminée</b>" if cdi else "<b>Contrat à durée déterminée</b>" + (" – %s" % s["duree"] if s.get("duree") else "")),
            ("Date d’entrée", "<b>%s</b>" % _txt(s, "date_entree")),
            ("Lieu de travail", _txt(s, "lieu", "Chantiers de la société en Nouvelle-Calédonie (clause de mobilité)")),
            ("Rémunération", _txt(s, "remuneration")),
            ("Période d’essai", s.get("essai") or "Aucune"),
        ]
        t = Table([[Paragraph("<b>%s</b>" % a, CELLULE), Paragraph(G.fill(b), CELLULE)] for a, b in lignes],
                  colWidths=[38 * mm, doc.width - 38 * mm])
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, G.GRIS_CLAIR),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ]))
        S += [t, Spacer(1, 4 * mm)]
        S.append(P("Le contrat de travail écrit reprenant ces conditions vous sera remis au plus tard dans les "
                   "deux jours suivant votre embauche."))
        if s.get("date_reponse"):
            S.append(P("Nous vous remercions de bien vouloir nous retourner un exemplaire de la présente, revêtu "
                       "de votre signature précédée de la mention « Bon pour accord », au plus tard le <b>%s</b>."
                       % s["date_reponse"]))
        S.append(P("Nous vous prions d’agréer, %s, l’expression de nos salutations distinguées." % _civ(s)))
        _fin(S, doc, [], "Fait à Nouméa, le %s, en double exemplaire." % _txt(s, "date_signature", "[[date]]"),
             _bloc_salarie("%s %s" % (_civ(s), _txt(s, "nom_complet")), "« Bon pour accord »", "Le candidat*"))
        return S
    _construire(path, "Promesse d’embauche – " + _txt(s, "nom_complet"), "Promesse d’embauche – " + _txt(s, "nom_complet"), corps)


# ---------------------------------------------------------------- courrier libre
def build_courrier(path, s):
    remise = bool(s.get("remise_main_propre"))

    def corps(doc):
        S = [NextPageTemplate("later"), G._entete_premiere_page(doc.width),
             HRFlowable(width="100%", thickness=0.9, color=G.BLEU, spaceBefore=3 * mm, spaceAfter=6 * mm)]
        S.append(P("Nouméa, le %s" % _txt(s, "date_signature", "[[date]]"), DROITE))
        S.append(Spacer(1, 3 * mm))
        _destinataire(S, s, doc.width)
        S.append(Spacer(1, 6 * mm))
        if remise:
            S.append(P("<i>Remis en main propre contre décharge</i>"))
        S.append(P("<b>Objet : %s</b>" % _txt(s, "objet")))
        S.append(Spacer(1, 2 * mm))
        for para in (s.get("corps") or ["[[corps du courrier]]"]):
            if isinstance(para, str) and para.strip():
                S.append(P(para))
        S.append(Spacer(1, 4 * mm))
        bloc = _bloc_salarie("%s %s" % (_civ(s), _txt(s, "nom_complet")), "« Reçu en main propre, lu et approuvé »") if remise else None
        S.append(KeepTogether([Spacer(1, 4 * mm), _signatures(doc, bloc)]))
        return S
    _construire(path, "Courrier – " + _txt(s, "objet"), "Courrier – " + _txt(s, "nom_complet"), corps)


# ---------------------------------------------------------------- serverless
BUILDERS = {
    "avenant_cdd": build_avenant_cdd,
    "avenant_cdi": build_avenant_cdi,
    "autorisation_conduite": build_autorisation_conduite,
    "attestation_travail": build_attestation_travail,
    "certificat_travail": build_certificat_travail,
    "promesse_embauche": build_promesse_embauche,
    "courrier": build_courrier,
}


# Normalisation AVANT generation : l'IA peut ne pas respecter le schema
# (liste attendue -> chaine ou nombre, texte attendu -> nombre ou None...).
# Sans ca : erreur 500, ou un paragraphe par caractere d'une chaine iteree.
CHAMPS_LISTE_TEXTE = ("preambule", "corps", "adresse_lignes", "mentions", "a_verifier")
CHAMPS_LISTE_OBJETS = ("articles", "emplois")
CHAMPS_BOOLEENS = ("remise_main_propre", "libre")


def _texte(v):
    if v is None or isinstance(v, (dict, list)):
        return ""
    if isinstance(v, bool):
        return ""
    return str(v)


def _liste_textes(v):
    if isinstance(v, str):
        v = [v]
    if not isinstance(v, list):
        return []
    return [_texte(x) for x in v if _texte(x).strip()]


def _normaliser(s):
    out = {}
    for k, v in s.items():
        if k in CHAMPS_LISTE_TEXTE:
            out[k] = _liste_textes(v)
        elif k in CHAMPS_LISTE_OBJETS:
            objets = []
            for o in (v if isinstance(v, list) else []):
                if not isinstance(o, dict):
                    continue
                o2 = {}
                for k2, v2 in o.items():
                    o2[k2] = _liste_textes(v2) if k2 == "paragraphes" else _texte(v2)
                objets.append(o2)
            out[k] = objets
        elif k in CHAMPS_BOOLEENS:
            out[k] = v if isinstance(v, bool) else None
        elif k == "essai":
            out[k] = _texte(v) or None
        else:
            out[k] = _texte(v)
    # libre absent ou invalide = valeur par defaut (libre de tout engagement)
    if out.get("libre") is None:
        out.pop("libre", None)
    return out


def build_document_bytes(type_doc, s):
    s = _normaliser(G._assainir(dict(s)))
    buf = io.BytesIO()
    BUILDERS[type_doc](buf, s)
    return buf.getvalue()
