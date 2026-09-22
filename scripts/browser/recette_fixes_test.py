"""Corrections de la recette en ligne du 22/09/2026.

1. Le lien de confirmation d'email est traite par l'app (page en francais),
   et ramene a la page d'origine.
2. Un equipier connecte ne voit ni les heures de ses collegues ni les alertes
   qui les concernent ; sur telephone il arrive sur « Ma semaine ».
3. Un equipier s'ajoute sans adresse email.
4. Les alertes disent « 12 h 40 », pas « 12,67 heures ».
Jeu de demo : Sezam (Serge admin, Omar equipier).
"""
import json, time, urllib.request
from playwright.sync_api import sync_playwright
from dates import MON, iso
URL = "http://localhost:3100/shiftmaster-pro/"
OOB = "http://127.0.0.1:9099/emulator/v1/projects/demo-shiftmaster/oobCodes"
res = []
def check(label, ok, extra=""):
    res.append(ok); print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

def login(b, email, vp=(1400, 1000), mobile=False):
    ctx = b.new_context(viewport={"width": vp[0], "height": vp[1]}, is_mobile=mobile, has_touch=mobile)
    p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(URL); p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }"); p.reload()
    p.get_by_label("Email").fill(email); p.get_by_label("Mot de passe").fill("test1234")
    p.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(4500)
    return p, errs

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # --- 1. confirmation d'adresse, traitee par l'app ---------------------------------
    email = f"lina{int(time.time())}@test.fr"
    p = b.new_context(viewport={"width": 1200, "height": 900}).new_page()
    p.goto(URL + "?sandbox=1"); p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }"); p.reload()
    f = p.get_by_test_id("auth-form")
    f.get_by_role("button", name="Pas de compte ? En créer un").click()
    f.get_by_label("Prénom et nom").fill("Lina Test"); f.get_by_label("Email").fill(email); f.get_by_label("Mot de passe").fill("motdepasse8")
    f.get_by_role("button", name="Créer mon compte").click(); p.wait_for_timeout(3500)
    codes = [c for c in json.load(urllib.request.urlopen(OOB))["oobCodes"] if c["email"] == email and c["requestType"] == "VERIFY_EMAIL"]
    # La langue de l'email ne se verifie pas ici : l'emulateur ecrit toujours lang=en.
    check("Email de confirmation avec retour a la page d'origine", bool(codes) and "continueUrl=" in codes[-1]["oobLink"],
          codes[-1]["oobLink"][:200] if codes else "aucun")
    code = codes[-1]["oobCode"]
    p.goto(URL + f"?mode=verifyEmail&oobCode={code}&continueUrl=" + urllib.request.quote(URL + "?org=x&invite=y")); p.wait_for_timeout(2500)
    page = p.get_by_test_id("auth-action")
    check("Lien ouvert dans l'app : « adresse email est confirmée »", page.count() == 1 and "confirmée" in page.inner_text(), p.locator("body").inner_text()[:200])
    check("« Continuer » ramene au lien d'invitation", "invite=y" in (page.get_by_role("link", name="Continuer").get_attribute("href") or ""))
    p.goto(URL + f"?mode=verifyEmail&oobCode={code}"); p.wait_for_timeout(2500)
    check("Lien deja utilise : message clair", "a déjà servi" in p.get_by_test_id("auth-action").inner_text())
    p.context.close()

    # --- 2. un equipier ne voit que ses heures -----------------------------------------
    p, errs = login(b, "omar@test.fr")
    side = p.locator("body").inner_text()
    check("Equipier : sa ligne d'heures, pas celles des collegues", "Omar" in side and "Double" not in side.split("HEURES SEMAINE")[-1][:300],
          side.split("HEURES SEMAINE")[-1][:300])
    check("Equipier : pas de « points de vigilance »", "POINT DE VIGILANCE" not in side.upper() and "POINTS DE VIGILANCE" not in side.upper())
    check("Equipier : aucune erreur JavaScript", not errs, errs[:2])
    p.context.close()
    p, errs = login(b, "omar@test.fr", vp=(390, 844), mobile=True)
    check("Equipier sur telephone : arrive sur « Ma semaine »", "PROCHAIN SHIFT" in p.locator("body").inner_text().upper() or p.get_by_test_id("leave-request-panel").count() == 1,
          p.locator("body").inner_text()[:200])
    p.context.close()

    # --- 3. equipier sans email, 4. alerte en heures et minutes -------------------------
    p, errs = login(b, "serge@test.fr")
    p.get_by_role("button", name="Gérer l'équipe").first.click(); p.wait_for_timeout(700)
    btn = p.get_by_role("button", name="Ajouter une personne").first
    if btn.is_visible(): btn.click(); p.wait_for_timeout(300)
    p.locator("#new-staff-name").fill("Plongeur Sansmail")
    p.get_by_label("Date d'arrivée").last.fill(iso(MON, -30))
    p.get_by_role("button", name="Ajouter à l'équipe").click(); p.wait_for_timeout(1500)
    check("Equipier ajoute sans adresse email", p.locator("div.cursor-pointer").filter(has_text="Plongeur Sansmail").count() == 1)
    p.keyboard.press("Escape"); p.wait_for_timeout(500)
    p.locator("[data-tour]").filter(has_text="Shift").first.click(); p.wait_for_timeout(600)
    f = p.locator("form")
    f.locator("select").first.select_option(label="Plongeur Sansmail")
    sels = f.locator("select"); sels.nth(1).select_option(label="08:00"); sels.nth(2).select_option(label="21:00"); p.wait_for_timeout(400)
    txt = f.inner_text()
    check("Alerte de journee trop longue : « 12 h 40 » (13 h moins 20 min de pause)", "12 h 40" in txt and "12,67" not in txt, txt[-300:])
    check("Admin : aucune erreur JavaScript", not errs, errs[:2])
    b.close()
print("TOUT PASSE" if all(res) else f"{res.count(False)} ECHEC(S)")
