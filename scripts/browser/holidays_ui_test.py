"""Jours feries : calcules par l'app, fermes par reglage, effets sur shifts et conges.

Semaine du lundi 9 novembre 2026 : l'Armistice tombe le mercredi 11.
"""
from playwright.sync_api import sync_playwright
URL = "http://localhost:3100/shiftmaster-pro/"
import tempfile
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

def to_november(p):
    for _ in range(8):
        p.get_by_role("button", name="Next week").click()
        p.wait_for_timeout(250)
    p.wait_for_timeout(1200)

def settings(p):
    p.get_by_role("button", name="Paramètres", exact=True).first.click()
    p.wait_for_timeout(500)

def armistice_switch(p):
    return p.get_by_role("switch", name="Armistice — Fermé")

def chip(p):
    return p.get_by_test_id("holiday-chip")

def pick_kind(p, name):
    p.get_by_role("button", name="Motif").click()
    p.get_by_role("listbox").get_by_role("option", name=name).click()

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1400, "height": 1000})
    errors = []
    p.on("pageerror", lambda e: errors.append(str(e)))
    login(p, "serge@test.fr")

    # --- 1. les feries sont connus sans rien saisir ------------------------------
    check("Semaine sans ferie : aucune etiquette", chip(p).count() == 0, chip(p).count())
    to_november(p)
    check("Semaine du 11 novembre : l Armistice apparait tout seul", chip(p).count() == 1 and "Armistice" in chip(p).inner_text(),
          chip(p).all_inner_texts())
    check("Par defaut le restaurant est ouvert ce jour-la", "Fermé" not in chip(p).inner_text())

    # --- 2. la fenetre Absences ne parle plus de feries ------------------------------
    p.get_by_role("button", name="Absences", exact=True).first.click(); p.wait_for_timeout(500)
    check("La fenetre Absences n a plus de section jours feries", p.get_by_text("Jours fériés", exact=True).count() == 0)
    p.get_by_label("Qui est absent").select_option(label="Omar")
    pick_kind(p, "Congés payés")
    p.get_by_label("Premier jour d'absence").fill("2026-11-09")
    p.get_by_label("Reprise le").fill("2026-11-16"); p.wait_for_timeout(900)
    check("Ferie ouvert : la semaine compte 6 jours", p.get_by_test_id("abs-days").inner_text().startswith("6 jour"),
          p.get_by_test_id("abs-days").inner_text())
    p.keyboard.press("Escape"); p.wait_for_timeout(300)

    # --- 3. le reglage dans les parametres ---------------------------------------------
    settings(p)
    check("Les parametres listent les 11 feries", p.get_by_role("switch").count() == 11, p.get_by_role("switch").count())
    check("Tous ouverts par defaut", all(sw.get_attribute("aria-checked") == "false" for sw in p.get_by_role("switch").all()))
    armistice_switch(p).click(); p.wait_for_timeout(1500)
    check("L interrupteur de l Armistice passe a « Fermé »", armistice_switch(p).get_attribute("aria-checked") == "true")
    p.screenshot(path=DIR + r"\holidays_settings.png")
    p.keyboard.press("Escape"); p.wait_for_timeout(500)
    check("Le calendrier affiche « Fermé · Armistice »", "Fermé · Armistice" in chip(p).inner_text(), chip(p).inner_text())

    # --- 4. effets : shifts bloques, decompte des conges -----------------------------
    p.get_by_role("button", name="Ajouter Shift").first.click(); p.wait_for_timeout(500)
    p.locator("select").first.select_option(label="Omar")
    p.get_by_role("button", name="Mercredi", exact=True).click(); p.wait_for_timeout(300)
    check("Poser un shift le 11/11 est bloque : restaurant ferme",
          p.get_by_text("Le restaurant est fermé ce jour-là (Armistice)").count() >= 1)
    check("Le bouton d ajout est desactive", p.locator("form button[type=submit]").last.is_disabled())
    p.keyboard.press("Escape"); p.wait_for_timeout(300)

    p.get_by_role("button", name="Absences", exact=True).first.click(); p.wait_for_timeout(500)
    p.get_by_label("Qui est absent").select_option(label="Omar")
    p.get_by_label("Premier jour d'absence").fill("2026-11-09")
    p.get_by_label("Reprise le").fill("2026-11-16"); p.wait_for_timeout(900)
    check("Ferie ferme : la meme semaine ne compte plus que 5 jours",
          p.get_by_test_id("abs-days").inner_text().startswith("5 jour"), p.get_by_test_id("abs-days").inner_text())
    p.keyboard.press("Escape"); p.wait_for_timeout(300)

    # --- 5. persistance, et vue employe ---------------------------------------------------
    p.reload(); p.wait_for_timeout(4200)
    to_november(p)
    check("Apres rechargement l Armistice reste ferme", "Fermé" in chip(p).inner_text(), chip(p).inner_text())
    check("Admin : aucune erreur JavaScript", not errors, errors[:1])

    p2 = b.new_page(viewport={"width": 1400, "height": 1000})
    err2 = []
    p2.on("pageerror", lambda e: err2.append(str(e)))
    login(p2, "omar@test.fr")
    to_november(p2)
    check("L employe voit aussi « Fermé · Armistice »", chip(p2).count() == 1 and "Fermé" in chip(p2).inner_text())
    settings(p2)
    check("L employe n a pas les interrupteurs des feries", p2.get_by_role("switch").count() == 0)
    check("Employe : aucune erreur JavaScript", not err2, err2[:1])

    # --- 6. rouvrir le ferie ---------------------------------------------------------------
    settings(p)
    armistice_switch(p).click(); p.wait_for_timeout(1500)
    p.keyboard.press("Escape"); p.wait_for_timeout(500)
    check("Rouvert : l etiquette redevient simplement « Armistice »", chip(p).inner_text().strip() == "Armistice", chip(p).inner_text())
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
