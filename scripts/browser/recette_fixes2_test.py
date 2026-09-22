"""Suite de la recette en ligne du 22/09/2026.

1. Chaque nouvel equipier recoit sa propre couleur (avant : le meme indigo).
2. Le lien d'invitation nomme le restaurant.
3. Un compte dont le restaurant a disparu est prevenu, pas laisse devant
   « Creez votre restaurant » sans explication.
Jeu de demo : Sezam (Serge admin).
"""
import time
from playwright.sync_api import sync_playwright
from dates import MON, iso
URL = "http://localhost:3100/shiftmaster-pro/"
res = []
def check(label, ok, extra=""):
    res.append(ok); print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

def fresh(b, store=None, url=URL):
    p = b.new_context(viewport={"width": 1300, "height": 950}).new_page(); errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(URL)
    p.evaluate("""s => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr');
        for (const [k, v] of Object.entries(s || {})) localStorage.setItem(k, v); }""", store)
    p.goto(url); p.wait_for_timeout(1500)
    return p, errs

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # --- 1. couleurs -----------------------------------------------------------------
    p, errs = fresh(b)
    p.get_by_label("Email").fill("serge@test.fr"); p.get_by_label("Mot de passe").fill("test1234")
    p.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(4500)
    p.get_by_role("button", name="Gérer l'équipe").first.click(); p.wait_for_timeout(700)
    for name in ["Couleur Un", "Couleur Deux"]:
        btn = p.get_by_role("button", name="Ajouter une personne").first
        if btn.is_visible(): btn.click(); p.wait_for_timeout(300)
        p.locator("#new-staff-name").fill(name)
        p.get_by_label("Date d'arrivée").last.fill(iso(MON, -30))
        p.get_by_role("button", name="Ajouter à l'équipe").click(); p.wait_for_timeout(1200)
    colors = [p.locator("div.cursor-pointer").filter(has_text=n).locator("div.rounded-full").first
              .evaluate("e => getComputedStyle(e).backgroundColor") for n in ["Couleur Un", "Couleur Deux"]]
    check("Deux nouveaux equipiers : deux couleurs differentes", colors[0] != colors[1], colors)
    check("Admin : aucune erreur JavaScript", not errs, errs[:2])
    p.context.close()

    # --- 2. invitation nommee ----------------------------------------------------------
    p, errs = fresh(b, url=URL + "?org=sezam&invite=abc&r=Chez%20L%C3%A9a")
    banner = p.get_by_test_id("invite-banner")
    check("Bandeau d'invitation : « Chez Léa vous invite »", banner.count() == 1 and "Chez Léa vous invite" in banner.inner_text(),
          banner.inner_text() if banner.count() else "absent")
    p.context.close()
    p, errs = fresh(b, url=URL + "?org=sezam&invite=abc")
    check("Ancien lien sans nom : texte generique", "planning d’un restaurant" in p.get_by_test_id("invite-banner").inner_text())
    p.context.close()

    # --- 3. restaurant disparu ---------------------------------------------------------
    def signup(store):
        p, errs = fresh(b, store=store, url=URL + "?sandbox=1")
        f = p.get_by_test_id("auth-form")
        f.get_by_role("button", name="Pas de compte ? En créer un").click()
        f.get_by_label("Prénom et nom").fill("Sans Resto"); f.get_by_label("Email").fill(f"perdu{time.time_ns()}@test.fr")
        f.get_by_label("Mot de passe").fill("motdepasse8")
        f.get_by_role("button", name="Créer mon compte").click(); p.wait_for_timeout(4500)
        return p, errs
    p, errs = signup({"shiftmaster_org": "resto-supprime"})
    lost = p.get_by_test_id("lost-org")
    check("Restaurant disparu : message « n’est plus accessible »", lost.count() == 1 and "n’est plus accessible" in lost.inner_text(),
          p.locator("body").inner_text()[:200])
    check("Restaurant disparu : on peut toujours creer le sien", p.get_by_test_id("onboarding").count() == 1)
    p.context.close()
    p, errs = signup(None)
    check("Nouveau compte : pas de message de restaurant disparu",
          p.get_by_test_id("lost-org").count() == 0 and p.get_by_test_id("onboarding").count() == 1)
    check("Aucune erreur JavaScript", not errs, errs[:2])
    b.close()
print("TOUT PASSE" if all(res) else f"{res.count(False)} ECHEC(S)")
