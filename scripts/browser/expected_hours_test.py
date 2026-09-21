import re
"""Absences, lot 3 : l'attendu du contrat baisse des heures d'absence.

Jeu de demo : semaine du lundi 14/09/2026. Omar (35 h) a deux shifts : lun 11h30-16h
(4,5 h) et mar 18h-23h (5 h). La semaine du 21/09 n'est pas planifiee.
Mois : 35 h x 52 / 12 = 151,67 h, affiche 152 h. Dates calculees a partir
d'aujourd'hui (voir `dates.py`).
"""
import tempfile
from datetime import timedelta
from playwright.sync_api import sync_playwright
from dates import MON, iso, fr

# La semaine de l'arret maladie : une semaine voisine NON planifiee dont le
# mercredi ET le jeudi tombent dans le mois de la semaine en cours. Sinon l'arret
# serait coupe par un changement de mois et l'attendu ne serait plus 152 - 4,5 - 14.
DECALAGE = next(
    (d for d in (7, -7, 14, -14)
     if (MON + timedelta(days=d + 2)).month == MON.month
     and (MON + timedelta(days=d + 3)).month == MON.month),
    7,
)
SEMAINES = abs(DECALAGE) // 7               # nombre de sauts de semaine a faire
SENS = 1 if DECALAGE > 0 else -1
ARRET_LUN = MON + timedelta(days=DECALAGE)  # lundi de cette semaine voisine
URL = "http://localhost:3100/shiftmaster-pro/"
DIR = tempfile.gettempdir()  # captures d'ecran : hors du depot
res = []
def check(label, ok, extra=""):
    res.append(ok)
    print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if extra and not ok else ""))

def login(p, email):
    p.goto(URL)
    p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }")
    p.reload()
    p.get_by_label("Email").fill(email); p.get_by_label("Mot de passe").fill("test1234")
    p.get_by_role("button", name="Se connecter", exact=True).click()
    p.wait_for_timeout(3800)

def pick_kind(p, name):
    p.get_by_role("button", name="Motif").click()
    p.get_by_role("listbox").get_by_role("option", name=name).click()

def record(p, who, kind, start, back, remove=True):
    p.get_by_role("button", name="Absences", exact=True).first.click(); p.wait_for_timeout(600)
    p.get_by_label("Qui est absent").select_option(label=who)
    pick_kind(p, kind)
    p.get_by_label("Premier jour d'absence").fill(start)
    p.get_by_label("Reprise le").fill(back)
    p.wait_for_timeout(1200)
    hours = p.get_by_label("Heures d'absence").input_value()
    rm = p.get_by_label("Retirer ses", exact=False)
    if rm.count() and rm.is_checked() != remove:
        rm.click()
    p.get_by_role("button", name="Enregistrer l'absence").click()
    p.wait_for_timeout(1500)
    p.keyboard.press("Escape"); p.wait_for_timeout(400)
    return hours

def row(p, name):
    # Une ligne du bloc « Heures » : le nom, le compteur, la barre, la note.
    return p.locator("div.space-y-1").filter(has_text=name).first

def notes(p):
    return p.get_by_test_id("expected-note").all_inner_texts()

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1400, "height": 1000})
    errors = []
    p.on("pageerror", lambda e: errors.append(str(e)))
    login(p, "serge@test.fr")

    check("Au depart : Omar 9.5 / 35h, sans note", "9.5 / 35h" in row(p, "Omar").inner_text() and not notes(p),
          row(p, "Omar").inner_text())

    # --- 1. un jour de conge sur un jour planifie ---------------------------------
    h = record(p, "Omar", "Congés payés", iso(MON), iso(MON, 1))
    check("Lundi de conge : 4,5 h d absence proposees (son shift)", h in ("4.5", "4,5"), h)
    check("Semaine : l attendu d Omar tombe a 30,5 h", "5.0 / 30.5h" in row(p, "Omar").inner_text(), row(p, "Omar").inner_text())
    check("Semaine : la note dit pourquoi", "30,5 h attendues (1 j de congé)" in notes(p), notes(p))

    # --- 2. deux jours d'arret sur une semaine non planifiee ----------------------
    h = record(p, "Omar", "Arrêt maladie", iso(ARRET_LUN, 2), iso(ARRET_LUN, 4))
    check("Mer + jeu d une semaine non planifiee : 14 h estimees (35 h / 5 j x 2)", h == "14", h)

    # --- 3. vue mois --------------------------------------------------------------
    p.get_by_role("button", name="Mois", exact=True).click(); p.wait_for_timeout(3000)
    txt = row(p, "Omar").inner_text()
    check("Mois : attendu 152 - 4,5 - 14 = 133,5 h", "/ 133.5h" in txt, txt)
    check("Mois : motifs melanges -> « absence », 3 jours, le motif reste prive",
          "133,5 h attendues (3 j d'absence)" in notes(p), notes(p))
    check("Mois : l ecart se calcule sur l attendu reduit (5 - 133,5 = -128,5)", "128.5" in txt, txt)
    p.screenshot(path=DIR + r"\lot3_month.png")
    p.get_by_role("button", name="Semaine", exact=True).click(); p.wait_for_timeout(800)

    # --- 4. semaine du 21/09 : 0 h faite, l'etiquette d'absence remplace la barre -
    bouton = "Semaine suivante" if SENS == 1 else "Semaine précédente"
    for _ in range(SEMAINES):
        p.get_by_test_id("week-nav").get_by_role("button", name=bouton).click(); p.wait_for_timeout(1800)
    txt = row(p, "Omar").inner_text()
    check("Semaine de l arret : Omar 0.0 / 21h (35 - 14)", "0.0 / 21h" in txt, txt)
    check("Semaine de l arret : l etiquette « Absent » reste, sans note en double", "Absent" in txt and not notes(p), (txt, notes(p)))
    check("Admin : aucune erreur JavaScript", not errors, errors[:1])

    # --- 5. vue de l'employe ------------------------------------------------------
    p2 = b.new_page(viewport={"width": 1400, "height": 1000})
    err2 = []
    p2.on("pageerror", lambda e: err2.append(str(e)))
    login(p2, "omar@test.fr")
    p2.wait_for_timeout(1500)
    n2 = notes(p2)
    check("Omar (planning, barre laterale) voit son attendu : 30,5 h (1 j de congé)", "30,5 h attendues (1 j de congé)" in n2, n2)
    p2.get_by_role("button", name="Mois", exact=True).click(); p2.wait_for_timeout(3000)
    n2 = notes(p2)
    check("Omar (barre laterale, mois) voit 133,5 h attendues", any("133,5 h attendues" in x for x in n2), n2)
    p2.get_by_role("button", name="Paramètres", exact=True).first.click(); p2.wait_for_timeout(500)
    p2.get_by_role("button", name="Ma semaine").first.click(); p2.wait_for_timeout(600)
    p2.keyboard.press("Escape"); p2.wait_for_timeout(3000)
    n2 = [x for x in notes(p2)]
    check("« Ma semaine » : attendu de la semaine 30,5 h", "30,5 h attendues (1 j de congé)" in n2, n2)
    check("« Ma semaine » : attendu du mois 133,5 h", "133,5 h attendues (3 j d'absence)" in n2, n2)
    p2.screenshot(path=DIR + r"\lot3_myweek.png")
    check("Employe : aucune erreur JavaScript", not err2, err2[:1])
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
