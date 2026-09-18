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
    p.wait_for_timeout(3500)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1400, "height": 950})
    login(p, "serge@test.fr")

    # 1. creer un extra depuis un shift, sans nom -> "Extra 1"
    p.get_by_role("button", name="Ajouter Shift").first.click()
    p.wait_for_timeout(500)
    p.get_by_role("button", name="Extra", exact=True).click()
    p.wait_for_timeout(300)
    p.get_by_label("Qui vient ?").fill("Monique")
    p.locator("form button[type=submit]").last.click()
    p.wait_for_timeout(1500)

    # 2. le bouton Extras existe dans la barre laterale
    btn = p.get_by_role("button", name="Extras", exact=True)
    check("Le bouton Extras est dans la barre laterale", btn.count() >= 1, str(btn.count()))
    btn.last.click()
    p.wait_for_timeout(700)
    check("La fenetre des extras s ouvre", p.get_by_text("Fiches des personnes qui viennent").is_visible())
    check("Monique est listee", p.get_by_role("button", name="Monique", exact=False).count() >= 1)
    check("Sa fiche est marquee a completer", p.get_by_text("À compléter").count() >= 1)

    # 3. ouvrir la fiche, remplir telephone + sécu + taux
    p.get_by_role("button", name="Monique", exact=False).first.click()
    p.wait_for_timeout(400)
    check("Le formulaire annonce que seul le prenom est obligatoire",
          p.get_by_text("Seul le prénom est obligatoire").is_visible())
    check("Le telephone est saisissable", p.get_by_label("Téléphone").is_visible())
    p.get_by_label("Téléphone").fill("0612345678")
    p.get_by_label("Coût horaire chargé (facultatif)").fill("18.5")
    check("La paie est repliee par defaut", p.get_by_label("Numéro de sécurité sociale").count() == 0)
    p.get_by_role("button", name="Pour la paie (facultatif)").click()
    p.wait_for_timeout(300)
    p.get_by_label("Numéro de sécurité sociale").fill("2 88 05 75 116 001")
    p.get_by_label("Nationalité").fill("Française")
    p.screenshot(path=DIR + r"\extra_fiche.png")
    p.get_by_role("button", name="Enregistrer").click()
    p.wait_for_timeout(1500)

    # 4. revenir a la liste : plus d etiquette "a completer", telephone visible
    p.get_by_role("button", name="Fermer", exact=True).first.click()
    p.wait_for_timeout(500)
    check("Le telephone apparait dans la liste", p.get_by_text("0612345678").count() >= 1)
    check("L etiquette a completer a disparu", p.get_by_text("À compléter").count() == 0)

    # 5. les donnees sont bien reparties au serveur (rechargement complet)
    p.reload(); p.wait_for_timeout(4000)
    p.get_by_role("button", name="Extras", exact=True).last.click()
    p.wait_for_timeout(800)
    p.get_by_role("button", name="Monique", exact=False).first.click()
    p.wait_for_timeout(400)
    check("Apres rechargement le telephone est conserve",
          p.get_by_label("Téléphone").input_value() == "0612345678",
          p.get_by_label("Téléphone").input_value())
    check("Apres rechargement le taux est conserve",
          p.get_by_label("Coût horaire chargé (facultatif)").input_value() in ("18.5", "18,5"),
          p.get_by_label("Coût horaire chargé (facultatif)").input_value())
    check("La paie est deja ouverte quand elle est remplie",
          p.get_by_label("Numéro de sécurité sociale").count() == 1)
    check("Apres rechargement le numero de securite sociale est conserve",
          p.get_by_label("Numéro de sécurité sociale").input_value() == "2 88 05 75 116 001",
          p.get_by_label("Numéro de sécurité sociale").input_value())

    # 6. vider le taux l efface vraiment
    p.get_by_label("Coût horaire chargé (facultatif)").fill("")
    p.get_by_role("button", name="Enregistrer").click()
    p.wait_for_timeout(1500)
    p.reload(); p.wait_for_timeout(4000)
    p.get_by_role("button", name="Extras", exact=True).last.click()
    p.wait_for_timeout(800)
    p.get_by_role("button", name="Monique", exact=False).first.click()
    p.wait_for_timeout(400)
    check("Vider le taux horaire l efface pour de bon",
          p.get_by_label("Coût horaire chargé (facultatif)").input_value() == "",
          p.get_by_label("Coût horaire chargé (facultatif)").input_value())

    # 7. un employe n a pas ce bouton
    p2 = b.new_page(viewport={"width": 1400, "height": 950})
    login(p2, "omar@test.fr")
    check("Un employe ne voit pas le bouton Extras",
          p2.get_by_role("button", name="Extras", exact=True).count() == 0)
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
