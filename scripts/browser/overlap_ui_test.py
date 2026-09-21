"""Absences : une seule absence par jour ; un arret interrompt les conges payes.

Jeu de demo : la semaine EN COURS (dates calculees, voir `dates.py`), Omar (35 h) a deux shifts : lun et mar.
"""
import tempfile
from playwright.sync_api import sync_playwright
from dates import MON, iso, fr
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

def fill(p, kind, start, back):
    p.get_by_label("Qui est absent").select_option(label="Omar")
    pick_kind(p, kind)
    p.get_by_label("Premier jour d'absence").fill(start)
    p.get_by_label("Reprise le").fill(back)
    p.wait_for_timeout(1000)

def save(p):
    p.get_by_role("button", name="Enregistrer l'absence").click()
    p.wait_for_timeout(1800)

def listed(p):
    return [t.replace("\n", " ") for t in p.locator("li button").filter(has_text="Omar").all_inner_texts()]

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1400, "height": 1000})
    errors = []
    p.on("pageerror", lambda e: errors.append(str(e)))
    login(p, "serge@test.fr")
    p.get_by_role("button", name="Absences", exact=True).first.click(); p.wait_for_timeout(600)

    # --- 1. conges du lundi 14 au mercredi 16 ------------------------------------
    fill(p, "Congés payés", iso(MON, 0), iso(MON, 3))
    check("Pas de conflit sur une saisie libre", p.get_by_test_id("abs-conflict").count() == 0)
    save(p)
    check("Apres enregistrement, le formulaire reste sur Omar (pas sur le premier de la liste)",
          p.locator("#abs-who option:checked").inner_text() == "Omar", p.locator("#abs-who option:checked").inner_text())
    p.get_by_label("Premier jour d'absence").fill(iso(MON, 0)); p.get_by_label("Reprise le").fill(iso(MON, 1))
    p.wait_for_timeout(500)

    # --- 2. demi-journee de conges le 16 : deja couvert ---------------------------
    fill(p, "Congés payés", iso(MON, 2), iso(MON, 3))
    p.get_by_role("button", name="Matin").click(); p.wait_for_timeout(400)
    box = p.get_by_test_id("abs-conflict")
    check("Demi-conge le 16 : conflit annonce", box.count() == 1 and "déjà une absence" in box.inner_text(), box.all_inner_texts())
    check("... le bouton d enregistrement est bloque", p.get_by_role("button", name="Enregistrer l'absence").is_disabled())
    p.get_by_role("button", name="Modifier cette absence").click(); p.wait_for_timeout(500)
    check("« Modifier cette absence » ouvre le conge en conflit",
          p.get_by_role("heading", name="Modifier l'absence").count() == 1 and p.get_by_label("Premier jour d'absence").input_value() == iso(MON, 0))
    p.get_by_role("button", name="Annuler", exact=True).click(); p.wait_for_timeout(400)
    check("Apres annulation, toujours sur Omar", p.locator("#abs-who option:checked").inner_text() == "Omar")

    # --- 3. un arret du 16 au 17 interrompt les conges -----------------------------
    fill(p, "Arrêt maladie", iso(MON, 2), iso(MON, 4))
    cut = p.get_by_test_id("abs-cut")
    txt = cut.inner_text() if cut.count() else ""
    check("Arret sur les conges : l effet est annonce avant d enregistrer", cut.count() == 1 and "interrompt les congés" in txt, txt)
    check("... le conge du lundi au mercredi devient lundi-mardi",
          f"du {fr(MON, 0)} au {fr(MON, 2)} → désormais du {fr(MON, 0)} au {fr(MON, 1)}" in txt, txt)
    check("... 1 jour rendu", "1 jour rendu" in txt, txt)
    p.screenshot(path=DIR + r"\overlap_cut.png")
    save(p)
    items = listed(p)
    check("Liste : conges 14 -> reprise 16, 2 jours", any("Congés payés" in i and f"reprise {fr(MON, 2)}" in i and "2 jours" in i for i in items), items)
    check("Liste : arret 16 -> reprise 18", any("Arrêt maladie" in i and f"du {fr(MON, 2)}" in i for i in items), items)
    check("Liste : plus aucun doublon (2 absences pour Omar)", len(items) == 2, items)

    # --- 4. conges poses sur l'arret : refuses --------------------------------------
    fill(p, "Congés payés", iso(MON, 3), iso(MON, 5))
    box = p.get_by_test_id("abs-conflict")
    check("Conges pendant l arret : refuses avec la raison", box.count() == 1 and "pendant un arrêt" in box.inner_text(), box.all_inner_texts())

    # --- 5. demi-journee reservee aux conges ---------------------------------------
    fill(p, "Arrêt maladie", iso(MON, 7), iso(MON, 8))
    check("Arret d un jour : pas de choix matin / apres-midi", p.get_by_role("group", name="Demi-journée").count() == 0)
    pick_kind(p, "Congés payés"); p.wait_for_timeout(300)
    check("Conge d un jour : le choix matin / apres-midi est la", p.get_by_role("group", name="Demi-journée").count() == 1)
    p.keyboard.press("Escape"); p.wait_for_timeout(500)

    # --- 6. le planning : un jour, une etiquette -------------------------------------
    bands = p.get_by_test_id("absence-band").all_inner_texts()
    check("Planning : 4 etiquettes pour Omar (lun, mar conges ; mer, jeu absent)", len([x for x in bands if "Omar" in x]) == 4, bands)
    check("... dont 2 « absent » : le motif medical reste prive",
          len([x for x in bands if "Omar" in x and "Absent" in x]) == 2 and not any("maladie" in x.lower() for x in bands), bands)

    # --- 7. supprimer l'arret ---------------------------------------------------------
    p.get_by_role("button", name="Absences", exact=True).first.click(); p.wait_for_timeout(600)
    check("Formulaire vierge sur des dates deja prises : pas d erreur avant la premiere saisie",
          p.get_by_test_id("abs-conflict").count() == 0)
    p.locator("li button").filter(has_text="Arrêt maladie").first.click(); p.wait_for_timeout(400)
    p.get_by_role("button", name="Supprimer cette absence").click(); p.wait_for_timeout(300)
    check("Suppression d un arret : previent que les conges ne sont pas retablis",
          p.get_by_text("ne sont pas rétablis").count() == 1)
    p.get_by_role("button", name="Oui, Supprimer").click(); p.wait_for_timeout(1800)
    check("Apres suppression, toujours sur Omar", p.locator("#abs-who option:checked").inner_text() == "Omar")
    items = listed(p)
    check("Apres suppression : reste le conge 14 -> reprise 16", len(items) == 1 and f"reprise {fr(MON, 2)}" in items[0], items)

    # --- 8. persistance -----------------------------------------------------------------
    p.keyboard.press("Escape"); p.reload(); p.wait_for_timeout(4200)
    p.get_by_role("button", name="Absences", exact=True).first.click(); p.wait_for_timeout(800)
    items = listed(p)
    check("Apres rechargement : toujours le seul conge 14 -> reprise 16", len(items) == 1 and f"reprise {fr(MON, 2)}" in items[0], items)
    check("Aucune erreur JavaScript", not errors, errors[:1])
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
