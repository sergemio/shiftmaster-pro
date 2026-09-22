"""Pause d'un shift : saisie, glisser, modification seule, conservation.

Pourquoi (22/09/2026) : changer SEULEMENT la pause — glisser sur le planning ou
dans la fiche — etait perdu au relachement : l'enregistrement comparait l'ancien
et le nouveau shift sans regarder la pause, et concluait « rien n'a change ».
Jeu de demo : Sezam, semaine en cours ; le mardi est libre pour Serge (admin).
"""
from playwright.sync_api import sync_playwright
URL = "http://localhost:3100/shiftmaster-pro/"
CARD = "div.\\@container"
res = []
def check(label, ok, extra=""):
    res.append(ok); print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

with sync_playwright() as pw:
    b = pw.chromium.launch(); p = b.new_page(viewport={"width": 1600, "height": 1100})
    errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(URL); p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }"); p.reload()
    p.get_by_label("Email").fill("serge@test.fr"); p.get_by_label("Mot de passe").fill("test1234")
    p.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(4000)

    # 1. saisie : Double, jeudi 10 h - 18 h, pause de 30 min
    p.locator("[data-tour]").filter(has_text="Shift").first.click(); p.wait_for_timeout(600)
    f = p.locator("form")
    f.locator("select").first.select_option(label="Double")
    f.get_by_role("button", name="Lundi", exact=True).click()
    f.get_by_role("button", name="Jeudi", exact=True).click()
    sels = f.locator("select")
    check("Shift de 6 h (11 h 30 - 17 h 30) : interrupteur de pause eteint, durees cachees",
          not p.locator("#shift-break-toggle").is_checked() and p.locator("#shift-break-minutes").count() == 0)
    sels.nth(1).select_option(label="10:00"); sels.nth(2).select_option(label="18:00"); p.wait_for_timeout(300)
    check("Shift de 8 h : interrupteur allume, 20 min d'office", p.locator("#shift-break-toggle").is_checked() and p.locator("#shift-break-minutes").input_value() == "20",
          p.locator("#shift-break-minutes").input_value())
    p.locator("#shift-break-minutes").select_option("30"); p.wait_for_timeout(300)
    check("Pause proposee au milieu du shift (13 h 45)", p.locator("#shift-break-start option:checked").inner_text() == "13:45",
          p.locator("#shift-break-start option:checked").inner_text())
    f.get_by_role("button", name="Ajouter Shift").click(); p.wait_for_timeout(1800)
    card = lambda: p.locator(CARD).filter(has_text="10:00 - 18:00").first
    def title():
        # Lu dans la fiche du shift : la bulle d'aide de l'app retire l'attribut
        # « title » au survol, il n'est donc pas fiable apres un glisser.
        card().dblclick(force=True, position={"x": 12, "y": 8}); p.wait_for_timeout(700)
        m = p.locator("#shift-break-minutes").input_value() if p.locator("#shift-break-minutes").count() else "0"
        t = p.locator("#shift-break-start option:checked").inner_text() if m != "0" else ""
        p.keyboard.press("Escape"); p.wait_for_timeout(500)
        return f"Pause {t} · {m} min"
    check("Carte : 7,5 h de travail et bande « Pause »", "7 h 30" in card().inner_text() and title() == "Pause 13:45 · 30 min", card().inner_text())

    # 2. glisser la pause d'une heure vers le bas
    hour = card().bounding_box()["height"] / 8
    bb = card().locator("[data-testid=shift-break]").bounding_box(); x, y = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
    p.mouse.move(x, y); p.mouse.down(); p.mouse.move(x, y + hour, steps=8); p.mouse.up(); p.wait_for_timeout(1800)
    check("Pause glissee d'une heure : 14 h 45, enregistree", title() == "Pause 14:45 · 30 min", title())

    # 3. tiree au-dela de la fin : reste dans le shift
    bb = card().locator("[data-testid=shift-break]").bounding_box(); x, y = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
    p.mouse.move(x, y); p.mouse.down(); p.mouse.move(x, y + hour * 8, steps=8); p.mouse.up(); p.wait_for_timeout(1800)
    check("Tiree tout en bas : butee a 17 h 30", title() == "Pause 17:30 · 30 min", title())

    # 4. seule la duree change, dans la fiche
    card().dblclick(force=True, position={"x": 12, "y": 8}); p.wait_for_timeout(800)
    p.locator("#shift-break-minutes").select_option("45"); p.wait_for_timeout(300)
    p.locator("form button[type=submit]").first.click(); p.wait_for_timeout(1800)
    check("Fiche : pause passee a 45 min, 7,25 h", "Pause 45 min" in card().inner_text() and "7 h 15" in card().inner_text(), card().inner_text())

    # 5. double-clic sur la pause : menu des durees, sans ouvrir la fiche
    card().locator("[data-testid=shift-break]").dblclick(); p.wait_for_timeout(500)
    check("Double-clic sur la pause : menu des durees, fiche fermee",
          p.get_by_test_id("break-menu").is_visible() and p.locator("#shift-break-minutes").count() == 0)
    p.get_by_test_id("break-menu").get_by_role("menuitem", name="60 min").click(); p.wait_for_timeout(1800)
    check("Menu : pause passee a 60 min, 7 h de travail", "Pause 60 min" in card().inner_text() and "7 h" in card().inner_text()
          and "7 h 15" not in card().inner_text(), card().inner_text())
    card().locator("[data-testid=shift-break]").dblclick(); p.wait_for_timeout(500)
    p.get_by_test_id("break-menu").get_by_role("menuitem", name="45 min").click(); p.wait_for_timeout(1800)

    # 6. conservee apres rechargement
    p.reload(); p.wait_for_timeout(4500)
    check("Apres rechargement : pause de 45 min conservee", "Pause 45 min" in card().inner_text(), card().inner_text())

    # 7. un shift court : on allume la pause a la main dans la fiche
    p.locator("[data-tour]").filter(has_text="Shift").first.click(); p.wait_for_timeout(600)
    f = p.locator("form")
    f.locator("select").first.select_option(label="Double")
    f.get_by_role("button", name="Lundi", exact=True).click()
    f.get_by_role("button", name="Vendredi", exact=True).click()
    sels = f.locator("select"); sels.nth(1).select_option(label="09:00"); sels.nth(2).select_option(label="14:00")
    f.get_by_role("button", name="Ajouter Shift").click(); p.wait_for_timeout(1800)
    short = lambda: p.locator(CARD).filter(has_text="09:00 - 14:00").first
    check("Shift de 5 h : pas de pause, 5 h", "Pause" not in short().inner_text() and "5 h" in short().inner_text(), short().inner_text())
    short().dblclick(force=True, position={"x": 12, "y": 8}); p.wait_for_timeout(800)
    p.locator("#shift-break-toggle").check(force=True); p.wait_for_timeout(300)
    check("Fiche : interrupteur allume -> 20 min proposees", p.locator("#shift-break-minutes").input_value() == "20")
    p.locator("form button[type=submit]").first.click(); p.wait_for_timeout(1800)
    check("Shift de 5 h avec pause de 20 min : 4 h 40", "Pause 20 min" in short().inner_text() and "4 h 40" in short().inner_text(), short().inner_text())
    short().dblclick(force=True, position={"x": 12, "y": 8}); p.wait_for_timeout(800)
    p.locator("#shift-break-toggle").uncheck(force=True); p.wait_for_timeout(300)
    p.locator("form button[type=submit]").first.click(); p.wait_for_timeout(1800)
    check("Interrupteur eteint : la pause disparait, 5 h", "Pause" not in short().inner_text() and "4 h 40" not in short().inner_text(), short().inner_text())

    check("Aucune erreur JavaScript", not errs, errs[:3])
    b.close()
print("TOUT PASSE" if all(res) else f"{res.count(False)} ECHEC(S)")
