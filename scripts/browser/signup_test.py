"""Lot 1d : inscription par email, assistant de demarrage, connexion, mot de passe oublie.

Cree un compte neuf a chaque passage (adresse horodatee) dans l'emulateur :
jamais sur la production.
"""
from playwright.sync_api import sync_playwright
from settings_ui import open_settings
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
    # Bouton actif ; un clic dit ce qui manque (QA du 02/10/2026)
    create.click(); p.wait_for_timeout(400)
    txt = onb.inner_text()
    check("Clic sans rien : « Indiquez le nom » et « Choisissez votre convention »",
          "Indiquez le nom du restaurant." in txt and "Choisissez votre convention collective." in txt, txt[:300])
    onb.get_by_label("Nom du restaurant").fill("Chez Nina")
    create.click(); p.wait_for_timeout(400)
    check("... nom rempli : il ne manque plus que la convention",
          "Indiquez le nom" not in onb.inner_text() and "Choisissez votre convention" in onb.inner_text())
    onb.get_by_role("radio", name="Hôtels, cafés, restaurants (HCR) — IDCC 1979").click()
    check("Mention de l'essai de 14 jours sans carte", "14 jours" in onb.inner_text())
    create.click(); p.wait_for_timeout(6000)
    body = p.locator("body").inner_text()
    check("Restaurant cree : le planning s'ouvre, nom dans l'en-tete", "Chez Nina" in body and onb.count() == 0, body[:200])
    # La visite guidee s'ouvre sur un compte neuf (testee en detail dans tour_test) : on la passe.
    tour = p.get_by_test_id("tour")
    check("La visite guidee s'ouvre a la premiere connexion", tour.count() == 1)
    if tour.count():
        tour.get_by_role("button", name="Passer").click(); p.wait_for_timeout(400)
    open_settings(p); p.wait_for_timeout(500)
    check("La convention choisie est enregistree (HCR)",
          p.get_by_role("radio", name="Hôtels, cafés, restaurants (HCR) — IDCC 1979").get_attribute("aria-checked") == "true")
    p.keyboard.press("Escape"); p.wait_for_timeout(300)
    # Le createur est admin, pas equipier (decision du 21/09/2026) : equipe vide,
    # message au centre du planning, et une ligne « Vous gerez ce restaurant ».
    empty = p.get_by_test_id("empty-team")
    check("Equipe vide a la creation : le planning dit « Votre équipe est vide »",
          empty.count() >= 1 and "Votre équipe est vide" in empty.first.inner_text())
    p.get_by_role("button", name="Gérer l'équipe").first.click(); p.wait_for_timeout(700)
    me = p.get_by_test_id("self-admin")
    check("La fondatrice est presentee comme admin, sans fiche d'equipier",
          me.count() == 1 and "Vous n'êtes pas sur le planning." in me.inner_text(), me.inner_text() if me.count() else "")
    me.get_by_role("button", name="M'ajouter comme équipier").click(); p.wait_for_timeout(400)
    # L'app demande s'il y a un contrat de travail (decision de Serge, 02/10/2026)
    check("« M'ajouter » : l'app demande s'il y a un contrat", "contrat de travail" in me.inner_text(), me.inner_text())
    me.get_by_role("button", name="Oui, je suis salarié").click(); p.wait_for_timeout(300)
    me.get_by_role("button", name="M'ajouter", exact=True).click(); p.wait_for_timeout(400)
    check("Salariée sans date d'entrée : message clair", "La date d'arrivée est obligatoire" in me.inner_text(), me.inner_text())
    me.get_by_label("Date d'entrée").fill("2025-03-01")
    me.get_by_role("button", name="M'ajouter", exact=True).click(); p.wait_for_timeout(1500)
    row = p.locator("div.cursor-pointer").filter(has_text="Nina Test").first
    check("Sa fiche apparait dans l'equipe, avec « Ajouté »",
          row.count() == 1 and "Ajouté" in row.inner_text(), row.inner_text() if row.count() else p.locator("body").inner_text()[:300])
    check("Pas de bouton « Inviter dans l'app » sur sa propre ligne", row.get_by_test_id("access-invite").count() == 0)
    check("... et la ligne « Vous gérez ce restaurant » disparait", p.get_by_test_id("self-admin").count() == 0)
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
