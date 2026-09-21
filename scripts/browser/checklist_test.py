"""Chantier 4 : carte « Premiers pas » d'un restaurant neuf.

Cree deux comptes neufs dans l'emulateur : jamais sur la production. Les comptes
de demonstration ont la carte deja terminee (seed-emulator.mjs), c'est pourquoi
elle est testee ici.
"""
from playwright.sync_api import sync_playwright
import time
URL = "http://localhost:3100/shiftmaster-pro/"
res = []
def check(label, ok, extra=""):
    res.append(ok); print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

def signup(b, email, name="Ines Pas"):
    p = b.new_context(viewport={"width": 1400, "height": 950}).new_page()
    p.goto(URL); p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }"); p.reload(); p.wait_for_timeout(800)
    f = p.get_by_test_id("auth-form")
    f.get_by_role("button", name="Pas de compte ? En créer un").click()
    f.get_by_label("Prénom et nom").fill(name); f.get_by_label("Email").fill(email); f.get_by_label("Mot de passe").fill("motdepasse8")
    f.get_by_role("button", name="Créer mon compte").click(); p.wait_for_timeout(3500)
    o = p.get_by_test_id("onboarding")
    o.get_by_label("Nom du restaurant").fill("Chez Ines"); o.get_by_role("radio").last.click()
    o.get_by_role("button", name="Créer mon restaurant").click(); p.wait_for_timeout(7000)
    tour = p.get_by_test_id("tour")
    if tour.count():
        tour.get_by_role("button", name="Passer").click(); p.wait_for_timeout(400)
    return p

def card(p):
    return p.get_by_test_id("checklist")

with sync_playwright() as pw:
    b = pw.chromium.launch()
    errs = []
    TS = int(time.time())
    email = f"ines{TS}@test.fr"
    p = signup(b, email); p.on("pageerror", lambda e: errs.append(str(e)))

    check("Restaurant neuf : la carte « Premiers pas » est affichee, 0 / 3", card(p).count() == 1 and "0 / 3" in card(p).inner_text(),
          card(p).inner_text() if card(p).count() else "")

    # 1. equipier : la ligne ouvre l'equipe, formulaire pret
    card(p).get_by_role("button", name="Ajouter un équipier").click(); p.wait_for_timeout(700)
    check("« Ajouter un équipier » ouvre l'equipe, formulaire d'ajout pret", p.locator("#new-staff-name").is_visible())
    p.locator("#new-staff-name").fill("Karim Pas")
    p.get_by_label("Email").last.fill(f"karim{TS}@test.fr")
    dates = p.locator("input[type=date]")
    if dates.count():
        dates.first.fill("2026-01-01")
    p.get_by_role("button", name="Ajouter à l'équipe").click(); p.wait_for_timeout(1200)
    p.keyboard.press("Escape"); p.wait_for_timeout(900)
    # 2. le formulaire de shift s'est rouvert sur Karim : on pose le shift propose
    sel = p.locator("form select").first
    check("Apres l'ajout, le formulaire de shift s'ouvre sur Karim",
          sel.count() == 1 and sel.evaluate("s => s.options[s.selectedIndex].text") == "Karim Pas")
    p.locator("form").get_by_role("button", name="Ajouter Shift").click(); p.wait_for_timeout(1500)
    txt = card(p).inner_text() if card(p).count() else ""
    check("Equipier et shift faits : 2 / 3", "2 / 3" in txt, txt)

    # 3. horaires : la ligne ouvre les parametres ; un reglage coche la derniere case
    card(p).get_by_role("button", name="Régler les horaires d'ouverture").click(); p.wait_for_timeout(600)
    hours = p.locator("section").filter(has_text="Heures d'ouverture").locator("select")
    hours.first.select_option(index=1); p.wait_for_timeout(800)
    p.keyboard.press("Escape"); p.wait_for_timeout(800)
    check("Les trois pas faits : la carte disparait", card(p).count() == 0)
    p.reload(); p.wait_for_timeout(5000)
    check("Rechargement : la carte ne revient pas", card(p).count() == 0)
    p.context.close()

    # 4. « Masquer », retenu sur le compte (autre navigateur)
    email2 = f"inesbis{TS}@test.fr"
    p = signup(b, email2); p.on("pageerror", lambda e: errs.append(str(e)))
    card(p).get_by_role("button", name="Masquer").click(); p.wait_for_timeout(800)
    check("« Masquer » retire la carte", card(p).count() == 0)
    p.context.close()
    p = b.new_context(viewport={"width": 1400, "height": 950}).new_page()
    p.goto(URL); p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }"); p.reload(); p.wait_for_timeout(800)
    p.get_by_label("Email").fill(email2); p.get_by_label("Mot de passe").fill("motdepasse8")
    p.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(5000)
    check("Autre navigateur : la carte masquee ne revient pas (retenu sur le compte)", card(p).count() == 0)
    p.context.close()

    check("Aucune erreur JavaScript", not errs, errs[:3])
    b.close()
print("TOUT PASSE" if all(res) else f"{res.count(False)} ECHEC(S)")
