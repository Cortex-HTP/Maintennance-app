# -*- coding: utf-8 -*-
# ═══ Generation des contrats RH Wallis-Label (serverless) ═══════════════
# Adapte de RH-kit/generateurs/gen_cdd.py (projet claude.ai RH WL) : MEMES
# textes, MEMES articles — seules la gestion des polices et la sortie en
# memoire changent. Les dicts d'exemple (donnees personnelles) et la version
# Word ont ete retires. Appele par api/rh-pdf.py uniquement.
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_LEFT
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    KeepTogether,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ---------------------------------------------------------------- signature du gérant
# `signature.py` (signature scannée de Tom PICOT en base64) doit se trouver à côté
# de ce script. S'il est absent, on retombe sur un espace vide à signer à la main.
import os as _os
import sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
try:
    from signature import signature_flowable
except ImportError:                                            # pragma: no cover
    from reportlab.platypus import Spacer as _Spacer
    from reportlab.lib.units import mm as _mm

    def signature_flowable(width_mm=45.0, signer=True):
        return _Spacer(1, 20 * _mm)

# ---------------------------------------------------------------- polices
# Carlito = equivalent libre de Calibri (celle des contrats officiels).
# Ordre : 1) fonts_data.py (TTF en base64, bundle Vercel) ecrites dans /tmp ;
# 2) Calibri de Windows (dev local) ; 3) repli Helvetica (jamais en prod).
import io
F_REG, F_BOLD, F_ITAL, F_BOLDITAL = "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"
POLICE_SOURCE = "helvetica"

def _enregistrer(chemins):
    global F_REG, F_BOLD, F_ITAL, F_BOLDITAL
    pdfmetrics.registerFont(TTFont("Carlito", chemins[0]))
    pdfmetrics.registerFont(TTFont("Carlito-Bold", chemins[1]))
    pdfmetrics.registerFont(TTFont("Carlito-Italic", chemins[2]))
    pdfmetrics.registerFont(TTFont("Carlito-BoldItalic", chemins[3]))
    pdfmetrics.registerFontFamily("Carlito", normal="Carlito", bold="Carlito-Bold",
                                  italic="Carlito-Italic", boldItalic="Carlito-BoldItalic")
    F_REG, F_BOLD, F_ITAL, F_BOLDITAL = "Carlito", "Carlito-Bold", "Carlito-Italic", "Carlito-BoldItalic"

try:
    try:
        import fonts_data  # genere depuis les TTF Carlito officielles (SIL OFL)
        import base64 as _b64
        import tempfile as _tmp
        _dossier = _os.path.join(_tmp.gettempdir(), "rh_fonts")
        _os.makedirs(_dossier, exist_ok=True)
        _chemins = []
        for _nomf, _b in [("Carlito-Regular.ttf", fonts_data.REGULAR), ("Carlito-Bold.ttf", fonts_data.BOLD),
                          ("Carlito-Italic.ttf", fonts_data.ITALIC), ("Carlito-BoldItalic.ttf", fonts_data.BOLD_ITALIC)]:
            _p = _os.path.join(_dossier, _nomf)
            if not _os.path.exists(_p):
                # Ecriture ATOMIQUE : un demarrage interrompu ne laisse jamais
                # un TTF tronque que le test exists() reutiliserait
                _part = _p + ".part"
                with open(_part, "wb") as _f:
                    _f.write(_b64.b64decode(_b))
                _os.replace(_part, _p)
            _chemins.append(_p)
        _enregistrer(_chemins)
        POLICE_SOURCE = "carlito"
    except ImportError:
        _win = "C:/Windows/Fonts/"
        _enregistrer([_win + "calibri.ttf", _win + "calibrib.ttf", _win + "calibrii.ttf", _win + "calibriz.ttf"])
        POLICE_SOURCE = "calibri-windows"
except Exception:
    pass  # repli Helvetica : F_* gardent leurs valeurs par defaut

BLACK = colors.black

# Forme sociale : SAS d'après l'avis de situation RIDET (l'ancienne trame indiquait « SARL »).
FORME_SOCIALE = "SAS"

# ---------------------------------------------------------------- styles
styles = getSampleStyleSheet()
BODY = ParagraphStyle("BODY", parent=styles["Normal"], fontName=F_REG, fontSize=10,
                      leading=14, alignment=TA_JUSTIFY, spaceAfter=6, textColor=BLACK)
BODY_C = ParagraphStyle("BODY_C", parent=BODY, alignment=TA_CENTER, spaceAfter=5)
SMALL = ParagraphStyle("SMALL", parent=BODY, fontSize=8.5, leading=11, spaceAfter=2)
ART = ParagraphStyle("ART", parent=BODY, fontName=F_BOLD, fontSize=10.5,
                     leading=14, spaceBefore=9, spaceAfter=3, alignment=TA_LEFT)
COMPANY = ParagraphStyle("COMPANY", parent=styles["Normal"], fontName=F_BOLD,
                         fontSize=28, leading=32, alignment=TA_CENTER, textColor=BLACK)
BOXTITLE = ParagraphStyle("BOXTITLE", parent=styles["Normal"], fontName=F_BOLD,
                          fontSize=11, leading=15, alignment=TA_CENTER, textColor=BLACK)


def fill(text):
    import re
    return re.sub(r"\[\[(.*?)\]\]", r'<font color="#b00000"><b>[\1]</b></font>', text)


def P(text, style=BODY):
    return Paragraph(fill(text), style)


def make_footer():
    def _f(c, doc):
        c.saveState()
        w, h = A4
        c.setFont(F_REG, 7.5)
        c.setFillColor(colors.HexColor("#888888"))
        c.drawCentredString(w / 2, 10 * mm, str(doc.page))
        c.restoreState()
    return _f


# ---------------------------------------------------------------- article content
def _lieu_de_travail(s):
    """Article 07 — chantier nommé, ou mobilité générale si aucun chantier fixe."""
    if s.get("chantier"):
        return ["Le Salarié exercera ses fonctions sur le chantier de <b>%s</b>. Compte tenu de la nature de "
                "l’activité de la société, le Salarié accepte expressément que son lieu de travail puisse être "
                "situé sur tout autre chantier de la société en Nouvelle-Calédonie, sans que ce changement ne "
                "constitue une modification de son contrat de travail." % s["chantier"]]
    return ["Compte tenu de la nature itinérante de l’activité de la société, le Salarié exercera ses "
            "fonctions sur les différents chantiers et sites d’intervention de la société en "
            "Nouvelle-Calédonie, selon les affectations décidées par la direction en fonction des "
            "nécessités de l’exploitation.",
            "Le Salarié accepte expressément cette mobilité, qui constitue une condition déterminante de son "
            "engagement : tout changement d’affectation d’un chantier à un autre ne constitue pas une "
            "modification de son contrat de travail. Le siège social de la société, situé 15 rue de Papeete – "
            "98803 Ducos Cedex, constitue son lieu de rattachement administratif."]


# Article 01 en cas de régularisation (relation déjà en cours : pas de nouvelle visite ni de DPAE).
ENGAGEMENT_REGUL = [
    "La société WALLIS LABEL emploie le Salarié, qui l’accepte, aux conditions générales de la Convention "
    "Collective du Bâtiment et des Travaux Publics (B.T.P.) de Nouvelle-Calédonie et aux conditions particulières "
    "énumérées ci-après. Le Salarié déclare formellement n’être lié à aucune autre entreprise et être libre de "
    "tout engagement.",
    "Le Salarié ayant déjà été reconnu apte à l’emploi et étant déjà déclaré auprès de la CAFAT au titre de son "
    "précédent contrat, le présent contrat ne donne lieu ni à une nouvelle visite médicale d’embauche ni à une "
    "nouvelle Déclaration Préalable à l’Embauche.",
]

ESSAI_AUCUN = ("La relation de travail se poursuivant sans interruption avec la société, aucune période d’essai "
               "n’est applicable au titre du présent contrat.")
ESSAI_DEJA_OCCUPE = ("Le Salarié ayant déjà occupé le même emploi au sein de la société, <b>aucune période "
                     "d’essai</b> n’est applicable au titre du présent contrat.")

# Motif type « renfort sur un chantier dans l'attente de la réaffectation de l'équipe permanente de Ouaco »
# (validé avec Tom le 27/10/2026 : CDD d'usage BTP à terme précis court, renouvelé par avenant signé avant le
# terme tant que Ouaco se poursuit ; au terme non renouvelé, le contrat s'éteint de plein droit).
# Ne JAMAIS écrire « le contrat prend fin à la fin du chantier de Ouaco ».
CHANTIER_PERMANENT = "Ouaco"


def motif_renfort(chantier):
    return ("Le salarié interviendra dans le cadre d’un <b>renfort temporaire de l’équipe affectée au chantier "
            "de %s</b>, dans l’attente de la réaffectation sur ce chantier du personnel permanent de la "
            "société, actuellement mobilisé sur le chantier de %s." % (chantier, CHANTIER_PERMANENT))


def preambule_regularisation(nom, contrat_precedent, reprise):
    """Préambule honnête d'un contrat de régularisation (signé à sa date réelle — ne jamais antidater)."""
    return [
        contrat_precedent,
        "À l’arrivée de ce terme, aucun avenant de renouvellement n’a été signé entre les parties. Le Salarié a "
        "néanmoins poursuivi son activité au sein de la société à compter du %s." % reprise,
        "Les parties ont souhaité formaliser par écrit les conditions de cette relation de travail. Le présent "
        "contrat est signé à sa date réelle ; il couvre la période travaillée depuis le %s et ne saurait priver "
        "le Salarié des droits qu’il tient, le cas échéant, des dispositions du Code du travail de "
        "Nouvelle-Calédonie, notamment de son article Lp. 123-17." % reprise,
    ]


def _motif(s):
    """CDD de remplacement d'un salarié absent (Lp. 123-2, 1°) sans terme précis (Lp. 123-3)."""
    r = s["remplace"]
    return [
        "Le présent contrat est conclu pour une durée déterminée, en application des articles Lp. 123-1 et "
        "suivants du Code du travail de Nouvelle-Calédonie.",
        "Il est conclu, conformément à l’article Lp. 123-2 (1°) du Code du travail de Nouvelle-Calédonie, "
        "pour assurer le <b>remplacement de %s</b>, %s, dont le contrat de travail est suspendu en raison "
        "d’un <b>arrêt de travail pour maladie</b>." % (r["nom"], r["qualif"]),
        "Le Salarié est informé que le présent contrat ne peut avoir ni pour objet ni pour effet de "
        "pourvoir durablement un emploi lié à l’activité normale et permanente de la société.",
    ]


def _duree_remplacement(s):
    r = s["remplace"]
    return [
        "Le présent contrat est conclu <b>sans terme précis</b>, en application de l’article Lp. 123-3 du "
        "Code du travail de Nouvelle-Calédonie. Le Salarié est engagé à compter du <b>%s</b>, pour une "
        "<b>durée minimale %s</b>, soit jusqu’au <b>%s inclus</b>." % (
            s["debut"], ("d’" if s["duree_min"][0] in "aeiouyéu" else "de ") + s["duree_min"], s["fin_min"]),
        "Au-delà de cette durée minimale, le terme du contrat est reporté jusqu’au retour de %s. Le contrat "
        "prendra fin de plein droit à la <b>veille du jour de la reprise effective de ses fonctions par "
        "%s</b>, ou à la date à laquelle son contrat de travail viendrait à être définitivement rompu%s. Si "
        "cette reprise intervient avant l’expiration de la durée minimale, le contrat prendra fin au terme de "
        "celle-ci." % (r["nom"], r["nom"],
                       (", et <b>au plus tard le %s</b>, date d’échéance du contrat à durée déterminée de %s"
                        % (r["fin_contrat"], r["nom"])) if r.get("fin_contrat") else ""),
        "La société informera le Salarié de la date de fin du contrat dès qu’elle aura connaissance de la date "
        "de reprise de %s, en respectant, dans la mesure du possible, un délai de prévenance d’un jour par "
        "semaine de travail accomplie. Toute poursuite de la relation de travail au-delà du terme ainsi défini "
        "ne pourra résulter que d’un nouvel accord écrit entre les parties." % r["nom"],
    ]


def articles_for(s):
    return [
        ("ENGAGEMENT", ENGAGEMENT_REGUL if s.get("regularisation") else [
            "La société WALLIS LABEL engage le Salarié, qui l’accepte, sous réserve des résultats de la "
            "visite médicale d’embauche, aux conditions générales de la Convention Collective du Bâtiment et "
            "des Travaux Publics (B.T.P.) de Nouvelle-Calédonie et aux conditions particulières énumérées "
            "ci-après. Le Salarié accepte cet engagement et déclare formellement n’être lié à aucune autre "
            "entreprise et être libre de tout engagement.",
            "À défaut de reconnaissance de l’aptitude du Salarié à l’emploi par le service de médecine du "
            "travail, le présent contrat sera considéré comme nul et de nul effet. La société procédera à la "
            "Déclaration Préalable à l’Embauche auprès de la CAFAT préalablement à la prise de fonction.",
        ]),
        ("NATURE ET MOTIF DU CONTRAT", _motif(s) if s.get("remplace") else [
            "Le présent contrat est conclu pour une durée déterminée, en application des articles Lp. 123-1 et "
            "suivants du Code du travail de Nouvelle-Calédonie.",
            "Le salarié est engagé en application de l’article Lp. 123-2 du Code du travail de Nouvelle-"
            "Calédonie (7°) pour le secteur du bâtiment, secteur pour lequel il est d’usage constant de ne pas "
            "recourir au contrat à durée indéterminée pour certains emplois par nature temporaires, tel que "
            "confirmé par les dispositions de l’article R. 123-2 du CTNC. " + s.get(
                "motif", "Le salarié interviendra dans le cadre d’un renfort d’équipe de manière temporaire."),
            "Le contrat comporte un terme fixé avec précision dès sa conclusion (Article 04). Il ne pourra "
            "être renouvelé ou prolongé que par accord exprès et écrit des deux parties, dans les limites et "
            "conditions prévues par le Code du travail de Nouvelle-Calédonie.",
        ]),
        ("FONCTION – CLASSIFICATION", [
            "Le Salarié exercera la fonction de <b>%s</b>, sous l’autorité et dans le cadre "
            "des instructions données par son supérieur hiérarchique. Il aura la classification suivante au "
            "titre de la Convention Collective du B.T.P. : <b>%s</b>." % (s.get("fonction", "Manœuvre Aide-Sondeur"), s["classif"]),
            "Le Salarié s’engage à exécuter les tâches correspondant à sa qualification avec soin, diligence "
            "et conscience professionnelle, et à respecter les directives, consignes et règlement intérieur de "
            "la société.",
        ]),
        ("DURÉE DE L’ENGAGEMENT", _duree_remplacement(s) if s.get("remplace") else [
            "Le présent contrat est conclu à terme précis. Le Salarié est engagé à compter du <b>%s</b> pour se "
            "terminer de plein droit le <b>%s inclus</b>, soit une durée de <b>%s</b>, sans qu’il soit besoin "
            "de délivrer un quelconque congé ou préavis." % (s["debut"], s["fin"], s["duree"]),
            "Le contrat cessant à l’arrivée de son terme, les relations contractuelles prendront fin "
            "automatiquement à cette date. Toute poursuite de la relation de travail au-delà du terme ne pourra "
            "résulter que d’un nouvel accord écrit entre les parties.",
        ]),
        ("PÉRIODE D’ESSAI", [s["essai_texte"]] if s.get("essai_texte") else [ESSAI_AUCUN] if s.get("essai", "x") is None else [
            "Le Salarié aura une période d’essai de <b>%s</b>, calculée conformément aux dispositions du Code "
            "du travail de Nouvelle-Calédonie et de la Convention Collective applicable. Au cours de cette "
            "période, chacune des parties pourra rompre le contrat librement, sans indemnité ni préavis, sous "
            "réserve du respect du délai de prévenance légal." % s["essai"],
        ]),
        ("DURÉE ET HORAIRES DE TRAVAIL", [
            "La durée du travail est fixée à la durée légale, soit 169 heures par mois (39 heures "
            "hebdomadaires). Le Salarié exercera ses fonctions selon les horaires fixés par son supérieur "
            "hiérarchique en fonction des nécessités du chantier.",
            "Le Salarié accepte expressément tout changement d’horaires nécessaire au bon fonctionnement de "
            "l’entreprise, ainsi que l’accomplissement d’heures supplémentaires à la demande de la société, "
            "dans le respect des dispositions légales et conventionnelles relatives à la durée du travail. Les "
            "heures supplémentaires seront rémunérées selon les taux en vigueur.",
        ]),
        ("LIEU DE TRAVAIL", _lieu_de_travail(s)),
        ("RÉMUNÉRATION", [
            s["remuneration"],
            "La rémunération sera versée mensuellement, à terme échu, par virement bancaire, et donnera lieu à "
            "l’établissement d’un bulletin de paie. Elle s’entend sous déduction des cotisations sociales "
            "salariales obligatoires.",
        ]),
        ("PRIMES, INDEMNITÉS ET FRAIS DE DÉPLACEMENT", [
            "Le Salarié bénéficiera, dans les conditions et selon les barèmes prévus par la Convention "
            "Collective du B.T.P. de Nouvelle-Calédonie et les usages de la société, des primes et indemnités "
            "liées aux conditions d’exécution du chantier, notamment de la prime de panier et des indemnités "
            "de trajet et de transport. Ces éléments, liés aux sujétions effectives du chantier, ne "
            "constituent pas un avantage acquis et suivront l’évolution des barèmes applicables.",
        ]),
        ("CONGÉS PAYÉS", [
            "Le Salarié acquiert des droits à congés payés dans les conditions prévues par le Code du travail "
            "de Nouvelle-Calédonie et la Convention Collective applicable (article 66 de l’Accord "
            "Interprofessionnel Territorial). Compte tenu de la durée déterminée "
            "du contrat, les congés payés acquis et non pris donneront lieu, au terme du contrat, au versement "
            "d’une indemnité compensatrice de congés payés.",
        ]),
        ("PROTECTION SOCIALE ET PRÉVOYANCE", [
            "Le Salarié sera affilié, pour la durée du présent contrat, aux organismes de protection sociale "
            "obligatoires (CAFAT), de retraite complémentaire et, le cas échéant, de mutuelle et de prévoyance "
            "dont relève la société, dans les conditions prévues par la réglementation en vigueur et la "
            "Convention Collective du B.T.P.",
        ]),
        ("HYGIÈNE, SÉCURITÉ ET ÉQUIPEMENTS DE PROTECTION", [
            "Le Salarié s’engage à respecter scrupuleusement l’ensemble des règles d’hygiène et de sécurité "
            "en vigueur sur les chantiers, les consignes de son supérieur hiérarchique ainsi que les "
            "prescriptions du plan de prévention. Il s’oblige notamment à porter en permanence les équipements "
            "de protection individuelle (EPI) mis à sa disposition et à utiliser le matériel conformément à sa "
            "destination.",
            "Tout manquement caractérisé aux règles de sécurité, de nature à mettre en danger le Salarié "
            "lui-même ou autrui, pourra constituer une faute grave justifiant la rupture anticipée du contrat.",
        ]),
        ("CLAUSE DE POLYVALENCE", [
            "À la demande expresse de son supérieur hiérarchique et pour une durée temporaire, le Salarié "
            "pourra être tenu d’exécuter des prestations relevant de catégories et échelons inférieurs ou "
            "égaux à sa classification. Pendant l’exécution de ces prestations, le Salarié continuera de "
            "percevoir la rémunération attachée à sa classification.",
        ]),
        ("CLAUSE D’EXCLUSIVITÉ", [
            "Pendant toute la durée du présent contrat, le Salarié réservera à la société l’exclusivité de "
            "ses services. Il ne pourra exercer aucune autre activité professionnelle, même non concurrente, "
            "sauf autorisation écrite et préalable de la société.",
        ]),
        ("OBLIGATION DE DISCRÉTION ET DE CONFIDENTIALITÉ", [
            "Le Salarié s’engage à conserver la discrétion la plus absolue sur l’ensemble des renseignements "
            "dont il pourra avoir connaissance à l’occasion ou du fait de ses fonctions. Cette obligation "
            "demeurera applicable même après la fin du présent contrat, quelle qu’en soit la cause. Le "
            "non-respect de cette obligation constituera une faute grave justifiant la rupture immédiate du "
            "contrat.",
        ]),
        ("RESTITUTION DES BIENS DE LA SOCIÉTÉ", [
            "Le matériel, l’outillage, les équipements et la documentation confiés au Salarié pour "
            "l’exécution de ses fonctions demeurent la propriété exclusive de la société. Le Salarié s’engage "
            "à les restituer en bon état, sur simple demande et, en tout état de cause, le jour même de la "
            "cessation de ses fonctions, sans qu’une mise en demeure préalable soit nécessaire.",
        ]),
        ("RUPTURE ANTICIPÉE DU CONTRAT", [
            "Le présent contrat à durée déterminée cesse de plein droit à l’arrivée de son terme. Il ne "
            "pourra être rompu avant celui-ci que dans les cas limitativement prévus par le Code du travail de "
            "Nouvelle-Calédonie (Titre II, Chapitre III, relatif au Contrat à Durée Déterminée – article "
            "Lp. 123-8), à savoir : accord des parties, faute grave, force majeure, inaptitude constatée par "
            "le médecin du travail, ou justification par le Salarié d’une embauche sous contrat à durée "
            "indéterminée. Toute rupture intervenant en dehors de ces cas ouvrira droit aux dommages et "
            "intérêts prévus par la réglementation.",
        ]),
        ("INDEMNITÉ DE FIN DE CONTRAT", [
            "Conformément à l’article Lp. 123-14 du Code du travail de Nouvelle-Calédonie, le Salarié percevra "
            "au terme du contrat une indemnité de fin de contrat égale à <b>5 % de la rémunération totale brute</b> "
            "perçue pendant la durée du contrat. Cette indemnité n’est pas due si la relation de travail se "
            "poursuit par un contrat à durée indéterminée, en cas de refus par le Salarié d’un contrat à durée "
            "indéterminée pour un emploi similaire, de rupture anticipée à l’initiative du Salarié, de faute "
            "grave ou de force majeure.",
        ] if s.get("remplace") else [
            "Le présent contrat étant conclu au titre de l’article Lp. 123-2 (7°) du Code du travail de "
            "Nouvelle-Calédonie (emploi par nature temporaire du secteur du bâtiment et des travaux publics), "
            "il ne sera pas versé d’indemnité de fin de contrat au terme de celui-ci.",
        ]),
        ("DOCUMENTS DE FIN DE CONTRAT", [
            "À l’expiration du contrat, la société remettra au Salarié un certificat de travail, un reçu pour "
            "solde de tout compte ainsi que l’attestation destinée aux organismes sociaux.",
        ]),
        ("DONNÉES PERSONNELLES", [
            "Les données à caractère personnel du Salarié sont collectées et traitées par la société aux "
            "seules fins de la gestion administrative de la relation de travail et du respect de ses "
            "obligations légales. Le Salarié dispose d’un droit d’accès et de rectification de ces données "
            "auprès de la société.",
        ]),
        ("DROIT APPLICABLE ET JURIDICTION COMPÉTENTE", [
            "Le présent contrat est soumis au Code du travail de Nouvelle-Calédonie et à la Convention "
            "Collective du Bâtiment et des Travaux Publics de Nouvelle-Calédonie. Tout litige relatif à sa "
            "formation, son exécution ou sa rupture, à défaut de règlement amiable, relèvera de la compétence "
            "du Tribunal du travail de Nouméa.",
        ]),
        ("INTÉGRALITÉ ET ÉLECTION DE DOMICILE", [
            "Le présent contrat exprime l’intégralité de l’accord des parties. Toute modification devra faire "
            "l’objet d’un avenant écrit et signé. Pour l’exécution des présentes, la société fait élection de "
            "domicile à son siège social et le Salarié à l’adresse figurant en tête des présentes.",
        ]),
    ]


def build_contract(path, s):
    doc = BaseDocTemplate(
        path, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=18 * mm, bottomMargin=16 * mm,
        title="Contrat de travail à durée déterminée%s – %s" % (" de remplacement" if s.get("remplace") else "", s["nom"]),
        author="WALLIS LABEL %s" % FORME_SOCIALE)
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=make_footer())])

    S = []
    # ---- letterhead
    S.append(Paragraph("WALLIS LABEL", COMPANY))
    S.append(Spacer(1, 4 * mm))

    # ---- boxed title with employee name
    box = Table([[Paragraph("CONTRAT DE TRAVAIL À DURÉE DÉTERMINÉE%s<br/>%s" % (
        " DE REMPLACEMENT" if s.get("remplace") else "", s["nom_box"]), BOXTITLE)]],
                colWidths=[doc.width])
    box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1.0, BLACK),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    S.append(box)
    S.append(Spacer(1, 5 * mm))

    # ---- parties
    S.append(Paragraph("<b>Entre les soussignés :</b>", BODY))
    S.append(P("La Société <b>WALLIS LABEL %s</b> au capital de 1 000 000 XPF, dont le siège social est "
               "situé 15 rue de Papeete à Ducos, RIDET n° 747 220.001, code APE 43.13Z, affiliée à la CAFAT "
               "sous le n° 58645/001, représentée par Monsieur Tom PICOT, Gérant, ayant qualité à cet "
               "effet," % FORME_SOCIALE))
    S.append(Paragraph("Ci-après dénommée la Société, d’une part,", BODY_C))
    S.append(Paragraph("<b>Et :</b>", BODY))
    S.append(P(s["parties"]))
    S.append(Paragraph("Ci-après dénommé Le Salarié, d’autre part,", BODY_C))
    S.append(Spacer(1, 1 * mm))
    if s.get("preambule"):
        S.append(Paragraph("<b>Préambule</b>", ART))
        for para in s["preambule"]:
            S.append(P(para))
    S.append(Paragraph("<b>Il a été convenu et arrêté ce qui suit :</b>", BODY))

    # ---- articles
    for i, (titre, paras) in enumerate(articles_for(s), start=1):
        head = Paragraph("ARTICLE&nbsp;%02d&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;%s" % (i, titre), ART)
        blk = [head, P(paras[0])]
        S.append(KeepTogether(blk))
        for extra in paras[1:]:
            S.append(P(extra))

    # ---- signature
    S.append(Spacer(1, 6 * mm))
    S.append(P("Fait à Nouméa, le %s, en double exemplaire." % s.get("date_signature", "[[date]]")))
    S.append(Spacer(1, 8 * mm))

    left = [
        Paragraph("<b>Pour la Société</b>", BODY),
        Spacer(1, 2 * mm),
        signature_flowable(45, signer=s.get("signee", True)),
        Spacer(1, 1 * mm),
        Paragraph("Monsieur Tom PICOT – Gérant", SMALL),
        Paragraph("15 rue de Papeete – 98803 Ducos Cedex", SMALL),
        Paragraph("Ridet : 747 220.001", SMALL),
        Paragraph("Tél. &amp; Fax : (687) 28 89 49", SMALL),
    ]
    right = [
        Paragraph("<b>Le Salarié*</b>", BODY),
        Spacer(1, 2 * mm),
        signature_flowable(45, signer=False),   # espace vierge, même hauteur
        Spacer(1, 1 * mm),
        Paragraph("%s" % s["nom"], SMALL),
        Paragraph("* Signature précédée de la mention manuscrite", SMALL),
        Paragraph("<i>« Lu et approuvé, bon pour accord ».</i>", SMALL),
    ]
    sig = Table([[left, right]], colWidths=[doc.width / 2, doc.width / 2])
    sig.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                             ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    S.append(KeepTogether([sig]))

    doc.build(S)




# ---------------------------------------------------------------- serverless
import re as _re
# Whitelist par FORME EXACTE : une balise n'est gardee que si elle est
# litteralement l'une de celles-ci - aucun attribut libre ne passe (pas de
# <b onDraw=...>, pas de <font size=...> pour du texte invisible, pas de
# <img src=...> qui ferait lire un fichier ou une URL a reportlab).
_TOUTE_BALISE = _re.compile(r"<[^>]*>")
_BALISE_OK = _re.compile(r'^(?:</?(?:b|i|super)>|<br ?/?>|<font color="#[0-9a-fA-F]{6}">|</font>)$')
# Esperluette nue -> &amp; (sinon erreur de parse du mini-HTML reportlab)
_ESPERLUETTE_NUE = _re.compile(r"&(?!(?:amp|lt|gt|quot|apos|nbsp|#\d{1,6}|#x[0-9a-fA-F]{1,5});)")

def _assainir_texte(t):
    t = str(t)[:20000]
    t = _ESPERLUETTE_NUE.sub("&amp;", t)
    return _TOUTE_BALISE.sub(lambda m: m.group(0) if _BALISE_OK.match(m.group(0)) else "", t)

def _assainir(x):
    if isinstance(x, str):
        return _assainir_texte(x)
    if isinstance(x, dict):
        return {str(k)[:40]: _assainir(v) for k, v in list(x.items())[:40]}
    if isinstance(x, list):
        return [_assainir(v) for v in x[:40]]
    if isinstance(x, (int, float, bool)) or x is None:
        return x
    return _assainir_texte(x)

def build_contract_bytes(s):
    s = _assainir(dict(s))
    buf = io.BytesIO()
    build_contract(buf, s)
    return buf.getvalue()
