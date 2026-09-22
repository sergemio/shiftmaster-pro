"""Chantier 3 : visite guidee de la premiere connexion.

Cree deux comptes neufs dans l'emulateur (PC puis telephone) : jamais sur la
production. Les comptes de demonstration ont la visite deja vue
(seed-emulator.mjs) : elle est donc testee ici, sur des comptes neufs.
"""
from playwright.sync_api import sync_playwright
from settings_ui import open_settings
import time
import tempfile
D = tempfile.gettempdir()  # captures d'ecran : hors du depot
URL = "http://localhost:3100/shiftmaster-pro/"
res = []
def check(label, ok, extra=""):
    res.append(ok); print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

def signup(b, w, h, email):
    p = b.new_context(viewport={"width": w, "height": h}).new_page()
    p.goto(URL); p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }"); p.reload(); p.wait_for_timeout(800)
    f = p.get_by_test_id("auth-form")
    f.get_by_role("button", name="Pas de compte ? En créer un").click()
    f.get_by_label("Prénom et nom").fill("Tom Visite"); f.get_by_label("Email").fill(email); f.get_by_label("Mot de passe").fill("motdepasse8")
    f.get_by_role("button", name="Créer mon compte").click(); p.wait_for_timeout(3500)
    o = p.get_by_test_id("onboarding")
    o.get_by_label("Nom du restaurant").fill("Chez Tom"); o.get_by_role("radio").last.click()
    o.get_by_role("button", name="Créer mon restaurant").click(); p.wait_for_timeout(7000)
    return p

def login(b, w, h, email):
    p = b.new_context(viewport={"width": w, "height": h}).new_page()
    p.goto(URL); p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }"); p.reload(); p.wait_for_timeout(800)
    p.get_by_label("Email").fill(email); p.get_by_label("Mot de passe").fill("motdepasse8")
    p.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(5000)
    return p

with sync_playwright() as pw:
    b = pw.chromium.launch()
    errs = []
    TS = int(time.time())
    # ---------------- PC ----------------
    email = f"tom{TS}@test.fr"
    p = signup(b, 1400, 900, email); p.on("pageerror", lambda e: errs.append(str(e)))
    tour = p.get_by_test_id("tour")
    check("Restaurant neuf : la visite s'ouvre seule", tour.count() == 1, p.locator("body").inner_text()[:200])
    titles = []
    for n in range(6):
        pop = tour.get_by_role("dialog")
        titles.append(pop.locator("h2").inner_text())
        box = pop.bounding_box()
        inside = box and box["x"] >= 0 and box["y"] >= 0 and box["x"] + box["width"] <= 1400 and box["y"] + box["height"] <= 900
        check(f"Etape {n+1} « {titles[-1]} » : bulle entierement a l'ecran", bool(inside), box)
        if n in (1, 2):
            p.screenshot(path=f"{D}\\tour-pc-{n+1}.png")
        if n < 5:
            pop.get_by_role("button", name="Suivant").click(); p.wait_for_timeout(450)
    print("  etapes :", titles)
    last = tour.get_by_role("dialog").get_by_role("button", name="Ajouter mon équipe")
    check("Derniere etape : bouton « Ajouter mon équipe » (equipe vide)", last.count() == 1)
    p.screenshot(path=f"{D}\\tour-pc-6.png")
    last.click(); p.wait_for_timeout(900)
    check("… qui ouvre l'equipe, formulaire d'ajout pret", p.locator("#new-staff-name").is_visible())
    p.keyboard.press("Escape"); p.wait_for_timeout(500)
    p.reload(); p.wait_for_timeout(5000)
    check("Rechargement : la visite ne revient pas", p.get_by_test_id("tour").count() == 0)
    p.context.close()
    p = login(b, 1400, 900, email)
    check("Autre appareil (navigateur vierge) : la visite ne revient pas, retenue sur le compte", p.get_by_test_id("tour").count() == 0)
    # relance depuis les parametres
    open_settings(p); p.wait_for_timeout(500)
    p.get_by_role("button", name="Revoir la visite guidée").click(); p.wait_for_timeout(600)
    check("Paramètres > « Revoir la visite guidée » la relance", p.get_by_test_id("tour").count() == 1)
    p.keyboard.press("Escape"); p.wait_for_timeout(400)
    check("Echap ferme la visite", p.get_by_test_id("tour").count() == 0)
    p.context.close()

    # ---------------- telephone ----------------
    email2 = f"tomtel{TS}@test.fr"
    p = signup(b, 390, 844, email2); p.on("pageerror", lambda e: errs.append(str(e)))
    tour = p.get_by_test_id("tour")
    check("Telephone : la visite s'ouvre", tour.count() == 1)
    for n in range(6):
        pop = tour.get_by_role("dialog")
        box = pop.bounding_box()
        inside = box and box["x"] >= 0 and box["y"] >= 0 and box["x"] + box["width"] <= 390 and box["y"] + box["height"] <= 844
        check(f"Telephone, etape {n+1} : bulle a l'ecran", bool(inside), box)
        if n in (1, 3):
            p.screenshot(path=f"{D}\\tour-tel-{n+1}.png")
        if n < 5:
            pop.get_by_role("button", name="Suivant").click(); p.wait_for_timeout(600)
    p.context.close()
    check("Aucune erreur JavaScript", not errs, errs[:3])
    b.close()
print("TOUT PASSE" if all(res) else f"{res.count(False)} ECHEC(S)")
