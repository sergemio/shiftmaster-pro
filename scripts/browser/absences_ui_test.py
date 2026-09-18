"""Absences, lot 2 : saisie par periode, planning, blocage, conflit, vue employe.

Jeu de demo : semaine du lundi 14/09/2026. Omar (35 h) a deux shifts : lun 11h30-16h
(4,5 h) et mar 18h-23h (5 h). Double (20 h) a un shift mer 12h-15h.
"""
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
    p.get_by_role("button", name="Connexion emulateur").click()
    p.wait_for_timeout(3800)

def open_modal(p):
    # Par son nom accessible : l'infobulle maison remplace `title` par `aria-label`.
    p.get_by_role("button", name="Absences", exact=True).first.click()
    p.wait_for_timeout(600)

def pick_kind(p, name):
    p.get_by_role("button", name="Motif").click()
    p.get_by_role("listbox").get_by_role("option", name=name).click()

def cards(p, name):
    return p.locator('div[class*="@container"]').filter(has_text=name)

def band(p):
    # Pas par `title` : l'infobulle maison de l'app le retire au survol.
    return p.get_by_test_id("absence-band")

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1400, "height": 1000})
    errors = []
    p.on("pageerror", lambda e: errors.append(str(e)))
    login(p, "serge@test.fr")
    check("Omar a 2 shifts au depart", cards(p, "Omar").count() == 2, cards(p, "Omar").count())

    # --- 1. une semaine de conges pour Omar ------------------------------------
    open_modal(p)
    p.get_by_label("Qui est absent").select_option(label="Omar")
    pick_kind(p, "Congés payés")
    p.get_by_label("Premier jour d'absence").fill("2026-09-14")
    p.get_by_label("Reprise le").fill("2026-09-21")
    p.wait_for_timeout(1200)
    days_txt = p.get_by_test_id("abs-days").inner_text()
    check("Une semaine de conges affiche 6 jours ouvrables", days_txt.startswith("6 jour"), days_txt)
    check("Les heures viennent du planning : 9,5 h (4,5 + 5)",
          p.get_by_label("Heures d'absence").input_value() in ("9.5", "9,5"), p.get_by_label("Heures d'absence").input_value())
    check("La fenetre dit d ou viennent les heures", p.get_by_text("D'après les shifts prévus").count() == 1)
    rm = p.get_by_label("Retirer ses 2 shift(s) prévu(s) pendant l'absence")
    check("Elle propose de retirer ses 2 shifts, coche par defaut", rm.count() == 1 and rm.is_checked())
    p.screenshot(path=DIR + r"\abs_modal.png")
    p.get_by_role("button", name="Enregistrer l'absence").click()
    p.wait_for_timeout(2500)
    check("La periode apparait dans « en cours et a venir »",
          p.get_by_text("du 14 sept 26 → reprise 21 sept 26").count() == 1)
    p.keyboard.press("Escape"); p.wait_for_timeout(400)

    check("Les shifts d Omar ont ete retires du planning", cards(p, "Omar").count() == 0, cards(p, "Omar").count())
    omar_band = band(p).filter(has_text="Omar")
    check("La bande d absence couvre les 7 jours de la semaine", omar_band.count() == 7, omar_band.count())
    check("Le motif affiche est « Congés payés »", "Congés payés" in omar_band.first.inner_text())

    # --- 2. impossible de planifier Omar pendant son conge ---------------------
    p.get_by_role("button", name="Ajouter Shift").first.click(); p.wait_for_timeout(500)
    p.locator("select").first.select_option(label="Omar")
    p.get_by_role("button", name="Mercredi", exact=True).click()
    p.wait_for_timeout(300)
    blocked = p.get_by_text("Omar est absent(e) ce jour-là")
    check("Creer un shift pendant l absence est bloque avec une phrase claire", blocked.count() >= 1)
    check("Le bouton d ajout est desactive", p.locator("form button[type=submit]").last.is_disabled())
    p.keyboard.press("Escape"); p.wait_for_timeout(300)

    # --- 3. modifier la periode depuis la bande du calendrier -------------------
    omar_band.first.click(); p.wait_for_timeout(800)
    check("Un clic sur la bande ouvre la periode en modification", p.get_by_text("Modifier l'absence").count() == 1)
    p.get_by_label("Reprise le").fill("2026-09-17")
    p.wait_for_timeout(900)
    check("Raccourcie (reprise jeudi) : 3 jours", p.get_by_test_id("abs-days").inner_text().startswith("3 jour"),
          p.get_by_test_id("abs-days").inner_text())
    p.get_by_role("button", name="Mettre à jour l'absence").click()
    p.wait_for_timeout(2500)
    p.keyboard.press("Escape"); p.wait_for_timeout(400)
    check("La bande ne couvre plus que lun, mar, mer", band(p).filter(has_text="Omar").count() == 3,
          band(p).filter(has_text="Omar").count())

    # --- 4. arret maladie de Double sans retirer son shift : conflit -----------
    open_modal(p)
    p.get_by_label("Qui est absent").select_option(label="Double")
    pick_kind(p, "Arrêt maladie")
    p.get_by_label("Premier jour d'absence").fill("2026-09-16")
    p.get_by_label("Reprise le").fill("2026-09-17")
    p.wait_for_timeout(1200)
    check("Arret d un jour : 3 h d apres son shift",
          p.get_by_label("Heures d'absence").input_value() == "3", p.get_by_label("Heures d'absence").input_value())
    p.get_by_label("Retirer ses 1 shift(s) prévu(s) pendant l'absence").uncheck()
    check("Case justificatif proposee pour un arret", p.get_by_label("Justificatif reçu").count() == 1)
    p.get_by_role("button", name="Enregistrer l'absence").click()
    p.wait_for_timeout(2500)
    check("Sans justificatif, la liste le signale", p.get_by_text("sans justificatif").count() >= 1)
    p.keyboard.press("Escape"); p.wait_for_timeout(400)
    dcard = cards(p, "Double").first
    check("Le shift garde de Double porte le badge « Absent ce jour »", dcard.get_by_text("Absent ce jour").count() == 1)
    dtxt = band(p).filter(has_text="Double").first.inner_text()
    check("Dans la bande, l arret apparait « Absent », pas « Arrêt maladie »",
          "Absent" in dtxt and "maladie" not in dtxt.lower(), dtxt)
    p.screenshot(path=DIR + r"\abs_planning.png")

    # --- 5. la liste des motifs, et l evenement familial -----------------------
    open_modal(p)
    p.get_by_role("button", name="Motif").click()
    lb = p.get_by_role("listbox")
    check("La liste des motifs propose 7 choix", lb.get_by_role("option").count() == 7, lb.get_by_role("option").count())
    check("Chaque motif porte sa phrase d aide", lb.get_by_text("Décompté du solde de congés payés").count() == 1)
    p.screenshot(path=DIR + r"\abs_kind_list.png")
    check("La fenetre n a plus de section « Jours de repos »", p.get_by_text("Jours de repos cette semaine").count() == 0)
    p.keyboard.press("Escape"); p.wait_for_timeout(200)
    check("Echap ferme la liste sans fermer la fenetre",
          p.get_by_role("listbox").count() == 0 and p.get_by_role("button", name="Motif").count() == 1)
    p.get_by_role("button", name="Motif").focus()
    p.keyboard.press("ArrowDown"); p.keyboard.press("ArrowDown"); p.keyboard.press("Enter")
    check("Au clavier : fleche, fleche, Entree choisit « Arrêt maladie »",
          "Arrêt maladie" in p.get_by_role("button", name="Motif").inner_text())
    pick_kind(p, "Événement familial")
    p.wait_for_timeout(200)
    check("Evenement familial sans note : enregistrement impossible",
          p.get_by_role("button", name="Enregistrer l'absence").is_disabled())
    p.get_by_label("Note").fill("Mariage")
    check("Avec une note : possible", not p.get_by_role("button", name="Enregistrer l'absence").is_disabled())
    p.keyboard.press("Escape"); p.wait_for_timeout(300)

    # --- 6. persistance ------------------------------------------------------------
    p.reload(); p.wait_for_timeout(4500)
    check("Apres rechargement : 3 jours d Omar + 1 de Double dans la bande",
          band(p).filter(has_text="Omar").count() == 3 and band(p).filter(has_text="Double").count() == 1)
    check("Admin : aucune erreur JavaScript", not errors, errors[:1])

    # --- 7. vue employe : Omar ----------------------------------------------------
    p2 = b.new_page(viewport={"width": 1400, "height": 1000})
    err2 = []
    p2.on("pageerror", lambda e: err2.append(str(e)))
    login(p2, "omar@test.fr")
    body = p2.locator("body").inner_text()
    check("L employe ne voit jamais le mot « maladie » pour un collegue", "maladie" not in body.lower())
    check("Employe : aucune erreur JavaScript", not err2, err2[:1])

    # --- 8. suppression ------------------------------------------------------------
    open_modal(p)
    p.get_by_text("du 16 sept 26 → reprise 17 sept 26").click(); p.wait_for_timeout(500)
    p.get_by_role("button", name="Supprimer cette absence").click()
    p.get_by_role("button", name="Oui, Supprimer").click()
    p.wait_for_timeout(2500)
    p.keyboard.press("Escape"); p.wait_for_timeout(400)
    check("Supprimer l arret retire la bande de Double", band(p).filter(has_text="Double").count() == 0)
    check("... et le badge de conflit sur son shift", cards(p, "Double").first.get_by_text("Absent ce jour").count() == 0)
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
