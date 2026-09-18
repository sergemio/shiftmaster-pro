from playwright.sync_api import sync_playwright
URL = "http://localhost:3100/shiftmaster-pro/"
import tempfile
DIR = tempfile.gettempdir()  # captures d'ecran : hors du depot
res = []
def check(label, ok, extra=""):
    res.append(ok)
    print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if extra and not ok else ""))

def login(p, email):
    p.goto(URL)
    p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }")
    p.reload()
    p.get_by_label("Email").fill(email); p.get_by_label("Mot de passe").fill("test1234")
    p.get_by_role("button", name="Se connecter", exact=True).click()
    p.wait_for_timeout(3800)

def add_extra_shift(p, name):
    p.get_by_role("button", name="Ajouter Shift").first.click()
    p.wait_for_timeout(500)
    p.get_by_role("button", name="Extra", exact=True).click()
    p.wait_for_timeout(300)
    if name:
        p.get_by_label("Qui vient ?").fill(name)
    p.locator("form button[type=submit]").last.click()
    p.wait_for_timeout(1800)

def card(p, label):
    return p.locator('div[class*="@container"]').filter(has_text=label).first

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1400, "height": 950})
    login(p, "serge@test.fr")

    # 1. extra sans nom : « Extra 1 », en attente
    add_extra_shift(p, "")
    c = card(p, "Extra 1")
    check("Le shift sans nom s appelle Extra 1", c.count() == 1)
    style = c.evaluate("e => getComputedStyle(e)")
    check("La carte en attente est hachuree", "repeating-linear-gradient" in style["backgroundImage"], style["backgroundImage"][:60])
    check("Sa bordure est en pointilles", style["borderLeftStyle"] == "dotted", style["borderLeftStyle"])
    check("Le badge A remplir est affiche", c.get_by_text("À remplir").count() == 1)
    p.screenshot(path=DIR + r"\extra_pending_card.png", clip={"x": 250, "y": 150, "width": 700, "height": 500})

    # 2. un shift de salarie n est ni hachure ni pointille
    other = p.locator('div[class*="@container"]').filter(has_text="Omar").first
    if other.count() == 1:
        st = other.evaluate("e => getComputedStyle(e)")
        check("Un shift de salarie reste uni", st["backgroundImage"] == "none" and st["borderLeftStyle"] == "solid",
              f'{st["backgroundImage"][:30]} / {st["borderLeftStyle"]}')

    # 3. remplir la fiche retire les hachures
    p.get_by_role("button", name="Extras", exact=True).last.click()
    p.wait_for_timeout(700)
    p.get_by_role("button", name="Extra 1", exact=False).first.click()
    p.wait_for_timeout(400)
    p.get_by_label("Prénom").fill("Nadia")
    p.get_by_label("Téléphone").fill("0655443322")
    p.get_by_role("button", name="Enregistrer").click()
    p.wait_for_timeout(1500)
    p.get_by_role("button", name="Fermer", exact=True).last.click()
    p.wait_for_timeout(2500)

    c2 = card(p, "Nadia")
    check("Le planning affiche le nouveau prenom", c2.count() == 1)
    st2 = c2.evaluate("e => getComputedStyle(e)")
    check("La carte n est plus hachuree", st2["backgroundImage"] == "none", st2["backgroundImage"][:50])
    check("La bordure est redevenue pleine", st2["borderLeftStyle"] == "solid", st2["borderLeftStyle"])
    check("Le badge A remplir a disparu", p.get_by_text("À remplir").count() == 0)

    # 4. persistance apres rechargement
    p.reload(); p.wait_for_timeout(4200)
    check("Apres rechargement la carte reste confirmee",
          card(p, "Nadia").evaluate("e => getComputedStyle(e).borderLeftStyle") == "solid")
    check("Apres rechargement aucun badge A remplir", p.get_by_text("À remplir").count() == 0)

    # 5. un extra en attente cree maintenant : l employe le voit aussi en attente
    add_extra_shift(p, "")
    check("Un nouvel extra sans nom est de nouveau en attente", p.get_by_text("À remplir").count() >= 1)
    p2 = b.new_page(viewport={"width": 1400, "height": 950})
    login(p2, "omar@test.fr")
    check("L employe voit lui aussi le creneau a remplir", p2.get_by_text("À remplir").count() >= 1)
    errors = []
    p2.on("pageerror", lambda e: errors.append(str(e)))
    p2.wait_for_timeout(500)
    check("Employe : aucune erreur JavaScript", not errors, str(errors[:1]))
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
