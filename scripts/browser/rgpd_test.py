"""Donnees du restaurant (RGPD) : tout telecharger, supprimer le restaurant.

Pourquoi (22/09/2026) : droit d'acces et de portabilite (export complet), droit
a l'effacement (suppression par le proprietaire, en retapant le nom).
Jeu de demo : « Chez Lea », essai termine (lecture seule), proprietaire lea@test.fr.
Omar est equipier de Sezam : la section ne doit pas exister pour lui.
"""
import json
from playwright.sync_api import sync_playwright
from settings_ui import open_settings
URL = "http://localhost:3100/shiftmaster-pro/"
res = []
def check(label, ok, extra=""):
    res.append(ok); print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

def login(b, email):
    ctx = b.new_context(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
    p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(URL); p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }"); p.reload()
    p.get_by_label("Email").fill(email); p.get_by_label("Mot de passe").fill("test1234")
    p.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(4500)
    return p, errs

def settings(p):
    open_settings(p); p.wait_for_timeout(700)

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # 1. un equipier ne voit pas la section
    p, errs = login(b, "omar@test.fr"); settings(p)
    check("Equipier : pas de section « Données du restaurant »", p.get_by_test_id("account-data").count() == 0)
    p.context.close()

    # 2. la proprietaire, essai termine : export complet
    p, errs = login(b, "lea@test.fr"); settings(p)
    sec = p.get_by_test_id("account-data")
    check("Proprietaire : section visible, meme en lecture seule", sec.count() == 1)
    with p.expect_download(timeout=30000) as dl:
        sec.get_by_role("button", name="Télécharger toutes les données").click()
    data = json.loads(open(dl.value.path(), encoding="utf-8").read())
    check("Export : nom du fichier daté", dl.value.suggested_filename.startswith("chez-lea-"), dl.value.suggested_filename)
    check("Export : le restaurant, son equipe et ses semaines",
          data.get("restaurant", {}).get("name") == "Chez Lea" and "settings" in data and "weeks" in data, list(data))
    shifts = [s for w in data["weeks"].values() for s in w.get("shifts", [])]
    check("Export : le shift de 8 h avec sa pause de 20 min", any(s.get("breakMinutes") == 20 for s in shifts), shifts)
    check("Export : membres avec leur role, dates en texte",
          {"email": "lea@test.fr", "role": "admin"} in data.get("members", []) and isinstance(data["restaurant"].get("createdAt"), str),
          (data.get("members"), data["restaurant"].get("createdAt")))

    # 3. suppression : le nom exact est exige
    sec.get_by_role("button", name="Supprimer le restaurant").click(); p.wait_for_timeout(300)
    confirm = sec.get_by_role("button", name="Supprimer définitivement")
    p.locator("#org-delete-confirm").fill("chez lea")
    check("Nom mal tapé : bouton de suppression inactif", confirm.is_disabled())
    p.locator("#org-delete-confirm").fill("Chez Lea")
    check("Nom exact : bouton actif", confirm.is_enabled())
    confirm.click(); p.wait_for_timeout(7000)
    check("Apres suppression : plus de restaurant, l'assistant de creation s'ouvre",
          p.get_by_test_id("onboarding").count() == 1, p.locator("body").inner_text()[:200])
    check("Aucune erreur JavaScript", not errs, errs[:3])
    p.context.close()

    # 4. reconnexion : le restaurant n'existe plus
    p, errs = login(b, "lea@test.fr")
    check("Reconnexion : toujours sans restaurant", p.get_by_test_id("onboarding").count() == 1)
    p.context.close()
    b.close()
print("TOUT PASSE" if all(res) else f"{res.count(False)} ECHEC(S)")
