"""Lot 1d : inscription par email, assistant de demarrage, connexion, mot de passe oublie.

Cree un compte neuf a chaque passage (adresse horodatee) dans l'emulateur :
jamais sur la production.
"""
from playwright.sync_api import sync_playwright
import time
URL = "http://localhost:3100/shiftmaster-pro/"
res = []
def check(label, ok, extra=""):
    res.append(ok)
    print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

EMAIL = f"nina{int(time.time())}@test.fr"

def fresh(b):
    p = b.new_context(viewport={"width": 1400, "height": 1000}).new_page()
    p.goto(URL)
    p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }")
    p.reload(); p.wait_for_timeout(800)
    return p

with sync_playwright() as pw:
    b = pw.chromium.launch()
    errors = []

    # --- 1. inscription -------------------------------------------------------------
    p = fresh(b); p.on("pageerror", lambda e: errors.append(str(e)))
    form = p.get_by_test_id("auth-form")
    form.get_by_role("button", name="Pas de compte ? En créer un").click()
    form.get_by_label("Prénom et nom").fill("Nina Test")
    form.get_by_label("Email").fill(EMAIL)
    form.get_by_label("Mot de passe").fill("court")
    form.get_by_role("button", name="Créer mon compte").click(); p.wait_for_timeout(500)
    check("Mot de passe de 5 caracteres refuse, message clair", "au moins 8 caractères" in form.inner_text(), form.inner_text())
    form.get_by_label("Mot de passe").fill("motdepasse8")
    form.get_by_role("button", name="Créer mon compte").click(); p.wait_for_timeout(3500)

    # --- 2. assistant de demarrage -----------------------------------------------------
    onb = p.get_by_test_id("onboarding")
    check("Compte cree sans restaurant : l'assistant s'ouvre", onb.count() == 1)
    create = onb.get_by_role("button", name="Créer mon restaurant")
    check("Bouton inactif tant que nom et convention manquent", create.is_disabled())
    onb.get_by_label("Nom du restaurant").fill("Chez Nina")
    check("... toujours inactif sans convention", create.is_disabled())
    onb.get_by_role("radio", name="Hôtels, cafés, restaurants (HCR) — IDCC 1979").click()
    check("Mention de l'essai de 14 jours sans carte", "14 jours" in onb.inner_text())
    create.click(); p.wait_for_timeout(6000)
    body = p.locator("body").inner_text()
    check("Restaurant cree : le planning s'ouvre, nom dans l'en-tete", "Chez Nina" in body and onb.count() == 0, body[:200])
    p.get_by_role("button", name="Paramètres", exact=True).first.click(); p.wait_for_timeout(500)
    check("La convention choisie est enregistree (HCR)",
          p.get_by_role("radio", name="Hôtels, cafés, restaurants (HCR) — IDCC 1979").get_attribute("aria-checked") == "true")
    p.keyboard.press("Escape"); p.wait_for_timeout(300)
    p.get_by_role("button", name="Gérer l'équipe").first.click(); p.wait_for_timeout(700)
    team = p.locator("body").inner_text()
    check("La fondatrice est dans l'equipe, admin", "Nina Test" in team and "ADMIN" in team.upper(), team[:300])
    p.context.close()

    # --- 3. connexion : mauvais mot de passe, puis le bon ------------------------------------
    p = fresh(b); p.on("pageerror", lambda e: errors.append(str(e)))
    form = p.get_by_test_id("auth-form")
    form.get_by_label("Email").fill(EMAIL); form.get_by_label("Mot de passe").fill("mauvais123")
    form.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(1500)
    check("Mauvais mot de passe : « Email ou mot de passe incorrect. »", "Email ou mot de passe incorrect." in form.inner_text(), form.inner_text())
    form.get_by_label("Mot de passe").fill("motdepasse8")
    form.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(4000)
    check("Bon mot de passe : retour directement dans son restaurant", "Chez Nina" in p.locator("body").inner_text())
    p.context.close()

    # --- 4. adresse deja prise, mot de passe oublie ------------------------------------------
    p = fresh(b); p.on("pageerror", lambda e: errors.append(str(e)))
    form = p.get_by_test_id("auth-form")
    form.get_by_role("button", name="Pas de compte ? En créer un").click()
    form.get_by_label("Email").fill(EMAIL); form.get_by_label("Mot de passe").fill("autrechose9")
    form.get_by_role("button", name="Créer mon compte").click(); p.wait_for_timeout(1500)
    check("Adresse deja utilisee : message clair", "Un compte existe déjà" in form.inner_text(), form.inner_text())
    form.get_by_role("button", name="Retour à la connexion").click()
    form.get_by_role("button", name="Mot de passe oublié ?").click()
    form.get_by_label("Email").fill(EMAIL)
    form.get_by_role("button", name="Recevoir le lien").click(); p.wait_for_timeout(1500)
    check("Mot de passe oublie : lien envoye", "lien de réinitialisation" in form.inner_text(), form.inner_text())
    form.get_by_label("Email").fill("personne-" + EMAIL)
    form.get_by_role("button", name="Recevoir le lien").click(); p.wait_for_timeout(1500)
    check("Adresse inconnue : meme message (on ne revele pas qui a un compte)", "lien de réinitialisation" in form.inner_text(), form.inner_text())
    p.context.close()

    # --- 5. compte existant sans restaurant -----------------------------------------------------
    p = fresh(b); p.on("pageerror", lambda e: errors.append(str(e)))
    form = p.get_by_test_id("auth-form")
    form.get_by_label("Email").fill("perdu@test.fr"); form.get_by_label("Mot de passe").fill("test1234")
    form.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(3500)
    onb = p.get_by_test_id("onboarding")
    check("Compte sans restaurant : assistant + explication pour les invites",
          onb.count() == 1 and "lien d’invitation" in p.locator("body").inner_text())
    check("Aucune erreur JavaScript", not errors, errors[:2])
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
