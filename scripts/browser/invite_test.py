"""Lot 1e : invitations. Serge invite une nouvelle personne depuis « Gérer l'équipe » ;
elle ouvre le lien, se trompe d'abord de compte, cree le bon, confirme son adresse,
et arrive dans Sezam (demo), reliee a sa fiche. Emulateurs seulement."""
from playwright.sync_api import sync_playwright
import time, json, urllib.request
URL = "http://localhost:3100/shiftmaster-pro/"
OOB = "http://127.0.0.1:9099/emulator/v1/projects/demo-shiftmaster/oobCodes"
res = []
def check(label, ok, extra=""):
    res.append(ok)
    print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

TS = int(time.time())
NORA = f"nora{TS}@test.fr"
AUTRE = f"autre{TS}@test.fr"

def new_page(b, clip=False):
    ctx = b.new_context(viewport={"width": 1400, "height": 1000})
    if clip: ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin="http://localhost:3100")
    return ctx.new_page()

def login(p, email, pwd="test1234"):
    p.goto(URL)
    p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }")
    p.reload()
    p.get_by_label("Email").fill(email); p.get_by_label("Mot de passe").fill(pwd)
    p.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(3800)

def signup(p, name, email, pwd="motdepasse8"):
    form = p.get_by_test_id("auth-form")
    if form.get_by_label("Prénom et nom").count() == 0:
        form.get_by_role("button", name="Pas de compte ? En créer un").click()
    form.get_by_label("Prénom et nom").fill(name)
    form.get_by_label("Email").fill(email); form.get_by_label("Mot de passe").fill(pwd)
    form.get_by_role("button", name="Créer mon compte").click(); p.wait_for_timeout(4500)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    errors = []

    # --- 1. Serge ajoute Nora et l'invite -------------------------------------------
    s = new_page(b, clip=True); s.on("pageerror", lambda e: errors.append(str(e)))
    login(s, "serge@test.fr")
    s.get_by_role("button", name="Gérer l'équipe").first.click(); s.wait_for_timeout(700)
    omar_row = s.locator("div.cursor-pointer").filter(has_text="Omar").first
    check("Omar (compte deja relie) : « ✓ Compte relié »", omar_row.get_by_test_id("access-linked").count() == 1)
    s.get_by_role("button", name="Ajouter une personne").first.click(); s.wait_for_timeout(400)
    s.get_by_label("Nom", exact=True).fill("Nora Test")
    s.locator('input[type="email"]').last.fill(NORA)
    s.get_by_label("Date d'arrivée").last.fill("2026-09-01")
    s.get_by_role("button", name="Ajouter à l'équipe").click(); s.wait_for_timeout(1500)
    row = s.locator("div.cursor-pointer").filter(has_text="Nora Test").first
    check("Nouvelle fiche : bouton « Inviter dans l'app »", row.get_by_test_id("access-invite").count() == 1)
    row.get_by_test_id("access-invite").click(); s.wait_for_timeout(1500)
    pend = row.get_by_test_id("access-pending")
    check("Invitation creee : « Invitation du … », copier, email, annuler", pend.count() == 1 and "Copier le lien" in pend.inner_text(), row.inner_text())
    mail = pend.get_by_role("link", name="Envoyer par email").get_attribute("href")
    check("Email pre-rempli adresse a Nora, avec le lien", mail.startswith("mailto:" + NORA.replace("@", "%40")) and "invite%3D" in mail, mail[:120])
    pend.get_by_role("button", name="Copier le lien").click(); s.wait_for_timeout(400)
    link = s.evaluate("() => navigator.clipboard.readText()")
    check("Lien copie : ?org=…&invite=…", "?org=" in link and "&invite=" in link, link)

    # --- 2. Nora ouvre le lien, avec le mauvais compte d'abord ----------------------------
    n = new_page(b); n.on("pageerror", lambda e: errors.append(str(e)))
    n.goto(URL); n.evaluate("() => localStorage.setItem('shiftmaster_lang','fr')")
    n.goto(link); n.wait_for_timeout(1200)
    check("Le jeton disparait de la barre d'adresse", "invite=" not in n.url, n.url)
    check("Bandeau d'invitation + formulaire d'inscription d'emblee",
          n.get_by_test_id("invite-banner").count() == 1 and n.get_by_label("Prénom et nom").count() == 1)
    signup(n, "Autre Compte", AUTRE)
    inv = n.get_by_test_id("invite-screen")
    # Adresse non verifiee : la function refuse d'abord pour ca (verification avant l'adresse)
    check("Mauvais compte, non verifie : l'ecran demande de confirmer l'adresse", inv.count() == 1 and "confirmez votre adresse" in inv.inner_text(), inv.inner_text() if inv.count() else "")
    inv.get_by_role("button", name="Utiliser un autre compte").click(); n.wait_for_timeout(1500)
    check("Deconnexion : l'invitation est gardee (bandeau toujours la)", n.get_by_test_id("invite-banner").count() == 1)

    # --- 3. le bon compte : confirmer l'adresse ------------------------------------------------
    signup(n, "Nora Test", NORA)
    inv = n.get_by_test_id("invite-screen")
    check("Bon compte, adresse non confirmee : ecran de confirmation", inv.count() == 1 and NORA in inv.inner_text())
    inv.get_by_role("button", name="J’ai confirmé mon adresse").click(); n.wait_for_timeout(1500)
    check("Clic sans avoir confirme : message clair", "pas encore confirmée" in inv.inner_text(), inv.inner_text())
    codes = json.load(urllib.request.urlopen(OOB))["oobCodes"]
    link_v = [c["oobLink"] for c in codes if c.get("email") == NORA and c.get("requestType") == "VERIFY_EMAIL"][-1]
    urllib.request.urlopen(link_v).read()
    inv.get_by_role("button", name="J’ai confirmé mon adresse").click(); n.wait_for_timeout(6000)
    body = n.locator("body").inner_text()
    check("Adresse confirmee : Nora entre dans Sezam (demo)", "Sezam (demo)" in body and n.get_by_test_id("invite-screen").count() == 0, body[:200])
    check("... en employee : pas de bouton « Gérer l'équipe »", n.get_by_role("button", name="Gérer l'équipe").count() == 0)

    # --- 4. cote Serge : compte relie, invitation consommee --------------------------------------
    s.wait_for_timeout(1500)
    row = s.locator("div.cursor-pointer").filter(has_text="Nora Test").first
    check("Serge voit « ✓ Compte relié » pour Nora", row.get_by_test_id("access-linked").count() == 1, row.inner_text())

    # --- 5. le lien ne resert pas -------------------------------------------------------------
    r = new_page(b); r.on("pageerror", lambda e: errors.append(str(e)))
    r.goto(URL); r.evaluate("() => localStorage.setItem('shiftmaster_lang','fr')")
    r.goto(link); r.wait_for_timeout(1000)
    r.get_by_test_id("auth-form").get_by_role("button", name="Retour à la connexion").click()
    r.get_by_label("Email").fill(NORA); r.get_by_label("Mot de passe").fill("motdepasse8")
    r.get_by_role("button", name="Se connecter", exact=True).click(); r.wait_for_timeout(4500)
    inv = r.get_by_test_id("invite-screen")
    check("Lien deja utilise : « Cette invitation n'existe plus »", inv.count() == 1 and "n’existe plus" in inv.inner_text(), inv.inner_text() if inv.count() else r.locator("body").inner_text()[:200])
    inv.get_by_role("button", name="Ignorer cette invitation").click(); r.wait_for_timeout(1500)
    check("Ignorer : Nora retrouve son restaurant", "Sezam (demo)" in r.locator("body").inner_text())

    # --- 6. annuler une invitation -----------------------------------------------------------
    s.get_by_role("button", name="Ajouter une personne").first.click(); s.wait_for_timeout(400)
    s.get_by_label("Nom", exact=True).fill("Leo Test")
    s.locator('input[type="email"]').last.fill(f"leo{TS}@test.fr")
    s.get_by_label("Date d'arrivée").last.fill("2026-09-01")
    s.get_by_role("button", name="Ajouter à l'équipe").click(); s.wait_for_timeout(1500)
    row = s.locator("div.cursor-pointer").filter(has_text="Leo Test").first
    row.get_by_test_id("access-invite").click(); s.wait_for_timeout(1500)
    row.get_by_test_id("access-pending").get_by_role("button", name="Annuler").click(); s.wait_for_timeout(1500)
    check("Annuler l'invitation : retour au bouton « Inviter »", row.get_by_test_id("access-invite").count() == 1)
    check("Aucune erreur JavaScript", not errors, errors[:3])
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
