"""Dates des tests navigateur, calculees a partir d'AUJOURD'HUI.

Pourquoi : les suites ecrivaient « 2026-09-14 » en dur. Le 20/09/2026 le calendrier
a avance d'une semaine et 32 controles sont tombes d'un coup, sans qu'une seule
ligne de l'application ait change. Une suite doit dire « le mardi de cette
semaine », pas « le 15 septembre ».

Reperes : les donnees de demonstration (`scripts/seed-emulator.mjs`) remplissent
la semaine EN COURS ; c'est elle que l'application ouvre au demarrage.

    from dates import MON, iso, fr, JOURS
    iso(MON, 1)          # mardi de cette semaine, « 2026-09-22 »
    fr(iso(MON, 1))      # « 22 sept 26 », comme l'app l'affiche
    JOURS[1]             # « Mardi », le bouton du formulaire

Figer l'heure du navigateur a ete ecarte : la base et les jetons de connexion
gardent la vraie heure, on obtiendrait deux verites dans le meme test.
"""
from datetime import date, timedelta

# Abreviations de mois telles que l'app les affiche : Intl en francais, point retire.
MOIS_COURT = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin',
              'juil', 'août', 'sept', 'oct', 'nov', 'déc']
MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
             'août', 'septembre', 'octobre', 'novembre', 'décembre']
JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

TODAY = date.today()
#: lundi de la semaine en cours — celle que l'app ouvre, et que la demo remplit
MON = TODAY - timedelta(days=TODAY.weekday())
#: lundis des semaines voisines
PREV_MON = MON - timedelta(days=7)
NEXT_MON = MON + timedelta(days=7)


def iso(day, offset=0):
    """« 2026-09-22 » : `day` (date ou ISO) decale de `offset` jours."""
    if isinstance(day, str):
        day = date.fromisoformat(day)
    return (day + timedelta(days=offset)).isoformat()


def fr(day, offset=0):
    """« 22 sept 26 » : la date telle que l'app l'ecrit (formatShortDate)."""
    d = date.fromisoformat(iso(day, offset))
    return f"{d.day} {MOIS_COURT[d.month - 1]} {d.strftime('%y')}"


def mois_long(day, offset=0):
    """« septembre 2026 » : le mois en clair, comme l'export de paie l'ecrit."""
    d = date.fromisoformat(iso(day, offset))
    return f"{MOIS_LONG[d.month - 1]} {d.year}"


def mois(day, offset=0):
    """« 2026-09 » : le mois d'une date, pour le champ Mois de l'export de paie."""
    return iso(day, offset)[:7]


def jour_nom(day, offset=0):
    """« Mardi » : le bouton du jour dans les formulaires."""
    return JOURS[date.fromisoformat(iso(day, offset)).weekday()]


def semaine_a_cheval():
    """Lundi de la premiere semaine qui enjambe deux mois, a partir de cette semaine.

    Sert aux regles qui dependent d'un changement de mois (heures du mois, paie)
    sans dependre du mois ou le test tourne.
    """
    lundi = MON
    for _ in range(8):
        if (lundi + timedelta(days=6)).month != lundi.month:
            return lundi
        lundi += timedelta(days=7)
    return MON


def semaine_entiere(semaines=4):
    """Lundi d'une semaine entierement contenue dans un seul mois.

    Part de `semaines` apres la semaine en cours et avance jusqu'a en trouver une
    dont le lundi et le samedi tombent dans le meme mois : les controles qui
    lisent une ligne de paie (« 6 j, 35 h ») ne supportent pas une semaine
    coupee en deux par un changement de mois.
    """
    lundi = MON + timedelta(days=7 * semaines)
    for _ in range(6):
        if (lundi + timedelta(days=5)).month == lundi.month:
            return lundi
        lundi += timedelta(days=7)
    return lundi
