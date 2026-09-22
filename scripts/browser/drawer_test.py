"""Tiroir des reglages (version B choisie par Serge le 22/09/2026).

Ordinateur : le bouton menu en haut a gauche ouvre un tiroir qui pousse tout
l'ecran vers la droite. Le planning garde sa largeur, la colonne des stats sort
de l'ecran, les reglages du tiroir s'appliquent. Telephone : rien ne change,
la roue dentee ouvre la fenetre Parametres.
Jeu de demo : Sezam (Serge admin).
"""
import os
import re
from playwright.sync_api import sync_playwright
from settings_ui import open_settings
URL = "http://localhost:3100/shiftmaster-pro/"
SHOTS = os.environ.get("SHOTS")
res = []
def check(label, ok, extra=""):
    res.append(ok); print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

def login(b, vp, mobile=False):
    ctx = b.new_context(viewport={"width": vp[0], "height": vp[1]}, is_mobile=mobile, has_touch=mobile)
    p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(URL); p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); localStorage.setItem('shiftmaster_view','week'); }"); p.reload()
    p.get_by_label("Email").fill("serge@test.fr"); p.get_by_label("Mot de passe").fill("test1234")
    p.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(4500)
    p.keyboard.press("Escape"); p.wait_for_timeout(300)
    return p, errs

with sync_playwright() as pw:
    b = pw.chromium.launch()

    p, errs = login(b, (1440, 900))
    drawer = p.get_by_test_id("settings-drawer")
    stats = p.get_by_role("button", name="Équipe").first
    day = p.get_by_text(re.compile(r"^mercredi$", re.I)).first
    w_before = day.bounding_box()["width"]
    shown = lambda: p.get_by_test_id("settings-drawer-slot").bounding_box()["width"] if p.get_by_test_id("settings-drawer-slot").bounding_box() else 0
    check("Tiroir ferme au depart : largeur nulle", shown() == 0, shown())
    check("Roue dentee cachee sur ordinateur", p.locator("header button[title='Paramètres']").filter(has=p.locator("svg path[d^='M10.325']")).is_hidden())
    p.get_by_test_id("settings-menu").click(); p.wait_for_timeout(600)
    if SHOTS: p.screenshot(path=os.path.join(SHOTS, "drawer-open.png"))
    box = drawer.bounding_box()
    check("Menu : le tiroir s'ouvre a gauche", box is not None and abs(box["x"]) < 2 and box["width"] > 300, box)
    heads = drawer.locator("button[aria-controls^='settings-']")
    check("Tiroir : reglages ranges en sections fermees (Affichage, Jours feries, Donnees...)",
          all(s in drawer.inner_text() for s in ["Affichage", "Jours fériés", "Données du restaurant"])
          and all(h.get_attribute("aria-expanded") == "false" for h in heads.all()), drawer.inner_text()[:200])
    drawer.get_by_role("button", name="Jours fériés").click(); p.wait_for_timeout(300)
    check("Section depliee : les interrupteurs des feries apparaissent", drawer.get_by_role("switch").count() >= 10)
    drawer.get_by_role("button", name="Jours fériés").click(); p.wait_for_timeout(300)
    check("Section repliee a nouveau", drawer.get_by_role("switch").count() == 0)
    drawer.get_by_role("button", name="Affichage").click(); p.wait_for_timeout(300)
    check("Le planning garde sa largeur", abs(day.bounding_box()["width"] - w_before) < 2, (w_before, day.bounding_box()["width"]))
    check("La colonne des stats sort de l'ecran", stats.bounding_box()["x"] >= 1440, stats.bounding_box())
    check("Bouton menu : etat ouvert annonce", p.get_by_test_id("settings-menu").get_attribute("aria-expanded") == "true")
    drawer.get_by_role("radio", name="English").click(); p.wait_for_timeout(500)
    check("Reglage applique depuis le tiroir (langue anglaise)", "Display" in drawer.inner_text() and "MONDAY" in p.locator("body").inner_text().upper())
    drawer.get_by_role("radio", name="Français").click(); p.wait_for_timeout(300)
    drawer.get_by_role("button", name="Fermer").click(); p.wait_for_timeout(600)
    check("Fermer : le contenu du tiroir disparait", drawer.count() == 0)
    open_settings(p, expand_all=False); p.keyboard.press("Escape"); p.wait_for_timeout(600)
    check("Echap ferme aussi le tiroir", drawer.count() == 0)
    check("Fermer : le planning et les stats reviennent", shown() == 0 and stats.bounding_box()["x"] < 1440 and abs(day.bounding_box()["width"] - w_before) < 2)
    check("Ordinateur : aucune erreur JavaScript", not errs, errs[:2])
    p.context.close()

    # tablette paysage : en-tete sans chevauchement, semaine entiere, deconnexion dans les reglages
    p, errs = login(b, (1024, 768), mobile=True)
    boxes = [e.bounding_box() for e in p.locator("header > div").all()]
    check("Tablette : les deux blocs de l'en-tete ne se chevauchent pas", boxes[0]["x"] + boxes[0]["width"] <= boxes[1]["x"] + 1, boxes)
    grid = p.get_by_text(re.compile(r"^dimanche$", re.I)).first.bounding_box()
    check("Tablette paysage : dimanche visible sans defiler", grid["x"] + grid["width"] <= 1024 - 300, grid)
    open_settings(p, expand_all=False)
    acc = p.get_by_test_id("settings-account")
    check("Tablette : nom, restaurant et Deconnexion dans les reglages", acc.count() == 1 and "Sezam" in acc.inner_text() and "Déconnexion" in acc.inner_text())
    p.context.close()

    p, errs = login(b, (390, 844), mobile=True)
    check("Telephone : pas de bouton menu des reglages", p.get_by_test_id("settings-menu").is_hidden())
    p.locator("header button[title='Paramètres']").last.click(); p.wait_for_timeout(500)
    check("Telephone : la roue dentee ouvre la fenetre Parametres, en sections", p.get_by_role("button", name="OK").is_visible()
          and p.get_by_role("button", name="Affichage").is_visible())
    check("Telephone : aucune erreur JavaScript", not errs, errs[:2])
    b.close()
print("TOUT PASSE" if all(res) else f"{res.count(False)} ECHEC(S)")
