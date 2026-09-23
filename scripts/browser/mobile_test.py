"""Recette mobile (retour de Serge du 23/09/2026, captures iPhone) : moteur Safari
(WebKit), iPhone 13 simule. Defilement, interrupteurs, jours, barre de
selection, champs date, tiroir sans croix.
"""
import time
from playwright.sync_api import sync_playwright
from settings_ui import open_settings
URL = "http://localhost:3100/shiftmaster-pro/"
res = []
def check(label, ok, extra=""):
    res.append(ok); print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

def inside(p, loc):
    bb = loc.bounding_box(); w = p.viewport_size["width"]
    return bb is not None and bb["x"] >= 0 and bb["x"] + bb["width"] <= w + 1, bb

with sync_playwright() as pw:
    b = pw.webkit.launch()
    dev = dict(pw.devices["iPhone 13"])
    # --- creation du restaurant : la page defile ----------------------------------
    p = b.new_context(**dev).new_page(); errs = []
    p.on("pageerror", lambda e: None if "access control checks" in str(e) else errs.append(str(e)))
    p.goto(URL); p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }"); p.reload(); p.wait_for_timeout(1000)
    f = p.get_by_test_id("auth-form")
    f.get_by_role("button", name="Pas de compte ? En créer un").click()
    f.get_by_label("Prénom et nom").fill("Mobile Qa"); f.get_by_label("Email").fill(f"mob{int(time.time())}@test.fr"); f.get_by_label("Mot de passe").fill("motdepasse8")
    f.get_by_role("button", name="Créer mon compte").click(); p.get_by_test_id("onboarding").wait_for(timeout=15000)
    tall = p.evaluate("document.documentElement.scrollHeight > innerHeight")
    check("Creation du restaurant : le fond de page ne bloque pas le defilement",
          p.evaluate("getComputedStyle(document.body).overflowY") != "hidden" and tall, (p.evaluate("getComputedStyle(document.body).overflowY"), tall))
    p.context.close()

    # --- planning -----------------------------------------------------------------
    p = b.new_context(**dev).new_page()
    p.on("pageerror", lambda e: None if "access control checks" in str(e) else errs.append(str(e)))
    p.goto(URL); p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }"); p.reload()
    p.get_by_label("Email").fill("serge@test.fr"); p.get_by_label("Mot de passe").fill("test1234")
    p.get_by_role("button", name="Se connecter", exact=True).click(); p.get_by_test_id("week-nav").wait_for(timeout=15000); p.wait_for_timeout(2500)
    p.keyboard.press("Escape"); p.wait_for_timeout(300)
    check("Planning : l'application a exactement la hauteur visible (pas de haut coupe)",
          p.evaluate("document.documentElement.scrollHeight <= innerHeight + 1"), p.evaluate("[document.documentElement.scrollHeight, innerHeight]"))
    tabs = p.locator("button:visible", has_text="DIM")
    ok, bb = inside(p, tabs.first) if tabs.count() else (False, None)
    check("Les 7 jours tiennent dans l'ecran (dimanche visible)", ok, bb)

    # --- barre de selection -------------------------------------------------------
    pt = p.evaluate(r"() => { const e = [...document.querySelectorAll('*')].find(e => e.childElementCount === 0 && /^\d{2}:\d{2} - \d{2}:\d{2}$/.test(e.textContent.trim()) && e.getBoundingClientRect().x > 0 && e.getBoundingClientRect().x < innerWidth); const r = e.getBoundingClientRect(); return [r.x + 10, r.y + 5]; }")
    p.keyboard.down("Meta"); p.mouse.click(pt[0], pt[1]); p.keyboard.up("Meta"); p.wait_for_timeout(500)
    bar_ok = all(inside(p, p.get_by_role("button", name=n, exact=True))[0] for n in ["−30", "+30", "Déplacer vers", "Supprimer"])
    check("Barre de selection : les boutons restent dans l'ecran", bar_ok,
          [inside(p, p.get_by_role("button", name=n, exact=True))[1] for n in ["−30", "Supprimer"]])
    check("Barre de selection : accents (« sélectionné », « Déplacer »)", "sélectionné" in p.locator("body").inner_text().lower())
    p.keyboard.press("Escape"); p.reload(); p.get_by_test_id("week-nav").wait_for(timeout=15000); p.wait_for_timeout(2000); p.keyboard.press("Escape")

    # --- interrupteurs ------------------------------------------------------------
    open_settings(p)
    sw = p.get_by_role("switch").first
    sw.scroll_into_view_if_needed(); bb = sw.bounding_box()
    check("Interrupteurs : forme de pilule (plus larges que hauts)", bb and bb["width"] > bb["height"] + 10, bb)
    p.reload(); p.get_by_test_id("week-nav").wait_for(timeout=15000); p.wait_for_timeout(2000); p.keyboard.press("Escape")

    # --- equipe : champs date ----------------------------------------------------
    p.locator("header button:visible").first.click(); p.wait_for_timeout(700)
    p.locator("button:visible", has_text="quipe").first.click(); p.wait_for_timeout(800)
    add = p.get_by_role("button", name="Ajouter une personne")
    if add.count(): add.first.click(); p.wait_for_timeout(500)
    dates = p.locator("input[type=date]:visible").all()
    check("Equipe : les champs date restent dans l'ecran", len(dates) >= 2 and all(inside(p, d)[0] for d in dates), [inside(p, d)[1] for d in dates])
    ys = [round(d.bounding_box()["y"]) for d in dates[:2]]
    check("Equipe : les deux champs date sont alignes", len(ys) == 2 and abs(ys[0] - ys[1]) < 3, ys)
    check("Aucune erreur JavaScript", not errs, errs[:2])
    b.close()
print("TOUT PASSE" if all(res) else f"{res.count(False)} ECHEC(S)")
