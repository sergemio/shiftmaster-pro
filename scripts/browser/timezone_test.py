"""Fuseau du restaurant (22/09/2026, demande de Serge : « piloter mon restaurant
de n'importe ou dans le monde »).

1. Un gerant connecte depuis Bali voit « aujourd'hui » a l'heure de Lyon.
2. Le fuseau se regle dans les parametres, s'applique, persiste.
3. A la creation d'un restaurant, le fuseau est demande (pre-rempli avec celui
   de l'appareil, modifiable).
Jeu de demo : Sezam (Paris).
"""
import re
from datetime import datetime
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright
from settings_ui import open_settings
URL = "http://localhost:3100/shiftmaster-pro/"
res = []
def check(label, ok, extra=""):
    res.append(ok); print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

def page(b, tz, vp=(1440, 900)):
    p = b.new_context(viewport={"width": vp[0], "height": vp[1]}, timezone_id=tz).new_page(); errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(URL); p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }"); p.reload()
    return p, errs

def login(p, email="serge@test.fr"):
    p.get_by_label("Email").fill(email); p.get_by_label("Mot de passe").fill("test1234")
    p.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(4500)
    p.keyboard.press("Escape"); p.wait_for_timeout(300)

def hhmm(tz):
    return datetime.now(ZoneInfo(tz)).strftime("%H:%M")

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # --- 1-2. gerant a Bali, restaurant a Paris --------------------------------------
    p, errs = page(b, "Asia/Makassar")
    login(p)
    open_settings(p, expand_all=False)
    p.get_by_role("button", name="Fuseau horaire du restaurant").click(); p.wait_for_timeout(300)
    sel = p.get_by_role("combobox", name="Fuseau horaire du restaurant")
    check("Parametres : fuseau du restaurant = Europe/Paris (pas celui de Bali)", sel.input_value() == "Europe/Paris", sel.input_value())
    now = p.get_by_test_id("tz-now").inner_text()
    check("« Heure au restaurant » = l'heure de Paris", hhmm("Europe/Paris") in now or hhmm("Europe/Paris")[:-1] in now, (now, hhmm("Europe/Paris")))
    paris_day = datetime.now(ZoneInfo("Europe/Paris")).day
    p.keyboard.press("Escape"); p.wait_for_timeout(500)
    circle = p.locator("header ~ * .rounded-full.bg-indigo-600, .rounded-full.bg-indigo-600").filter(has_text=re.compile(r"^\d{1,2}$")).first
    check("Depuis Bali : le jour surligne est aujourd'hui a Paris", circle.count() == 1 and circle.inner_text().strip() == str(paris_day),
          (circle.inner_text() if circle.count() else "absent", paris_day))

    open_settings(p, expand_all=False)
    p.get_by_role("button", name="Fuseau horaire du restaurant").click(); p.wait_for_timeout(300)
    sel.select_option("Asia/Makassar"); p.wait_for_timeout(1200)
    now = p.get_by_test_id("tz-now").inner_text()
    check("Fuseau change pour Bali : l'heure du restaurant suit", hhmm("Asia/Makassar")[:-1] in now, (now, hhmm("Asia/Makassar")))
    p.reload(); p.wait_for_timeout(4500)
    open_settings(p, expand_all=False)
    p.get_by_role("button", name="Fuseau horaire du restaurant").click(); p.wait_for_timeout(300)
    check("Le fuseau choisi persiste apres rechargement", sel.input_value() == "Asia/Makassar", sel.input_value())
    sel.select_option("Europe/Paris"); p.wait_for_timeout(1200)
    check("Gerant : aucune erreur JavaScript", not errs, errs[:2])
    p.context.close()

    # --- employe : pas de reglage ------------------------------------------------------
    p, errs = page(b, "Europe/Paris")
    login(p, "omar@test.fr")
    open_settings(p, expand_all=False)
    check("Employe : pas de reglage du fuseau", p.get_by_role("button", name="Fuseau horaire du restaurant").count() == 0)
    p.context.close()

    # --- 3. creation d'un restaurant -----------------------------------------------------
    p, errs = page(b, "Asia/Beirut")
    p.goto(URL + "?sandbox=1"); p.wait_for_timeout(1500)
    f = p.get_by_test_id("auth-form")
    f.get_by_role("button", name="Pas de compte ? En créer un").click()
    f.get_by_label("Prénom et nom").fill("Gerant Loin"); f.get_by_label("Email").fill(f"loin{datetime.now().timestamp():.0f}@test.fr")
    f.get_by_label("Mot de passe").fill("motdepasse8")
    f.get_by_role("button", name="Créer mon compte").click(); p.wait_for_timeout(4500)
    tz = p.locator("#onb-tz")
    check("Creation : fuseau demande, pre-rempli avec celui de l'appareil (Beyrouth)", tz.count() == 1 and tz.input_value() == "Asia/Beirut",
          tz.input_value() if tz.count() else "absent")
    tz.select_option("Europe/Paris")
    p.locator("#onb-name").fill("Bistrot Lyon")
    p.get_by_role("radio").first.click()
    p.get_by_role("button", name=re.compile("Créer")).last.click(); p.wait_for_timeout(5000)
    p.keyboard.press("Escape"); p.wait_for_timeout(400)
    open_settings(p, expand_all=False)
    p.get_by_role("button", name="Fuseau horaire du restaurant").click(); p.wait_for_timeout(300)
    check("Restaurant cree depuis Beyrouth, regle sur Paris : Paris enregistre",
          p.get_by_role("combobox", name="Fuseau horaire du restaurant").input_value() == "Europe/Paris")
    check("Creation : aucune erreur JavaScript", not errs, errs[:2])
    b.close()
print("TOUT PASSE" if all(res) else f"{res.count(False)} ECHEC(S)")
