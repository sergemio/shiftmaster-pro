"""Absences, lot 4 : fiche salarie (jours travailles, compteur de conges, historique),
rappel du solde a la saisie, reglage ouvrables / ouvres.

Aujourd'hui = 18/09/2026 (horloge de la machine). Omar : 35 h, pas de planning la
semaine du 5/10. Bulletin fictif du 31/08/2026 : 10 j restants.
"""
from playwright.sync_api import sync_playwright
URL = "http://localhost:3100/shiftmaster-pro/"
res = []
def check(label, ok, extra=""):
    res.append(ok)
    print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

def login(p, email):
    p.goto(URL)
    p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }")
    p.reload()
    p.get_by_label("Email").fill(email); p.get_by_label("Mot de passe").fill("test1234")
    p.get_by_role("button", name="Se connecter", exact=True).click()
    p.wait_for_timeout(3800)

def open_staff(p, name):
    p.get_by_role("button", name="Gérer l'équipe").first.click(); p.wait_for_timeout(700)
    p.locator("div.cursor-pointer").filter(has_text=name).first.click(); p.wait_for_timeout(500)

def pick_kind(p, name):
    p.get_by_role("button", name="Motif").click()
    p.get_by_role("listbox").get_by_role("option", name=name).click()

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1400, "height": 1000})
    errors = []
    p.on("pageerror", lambda e: errors.append(str(e)))
    login(p, "serge@test.fr")

    # --- 1. fiche : jours travailles par semaine ------------------------------------
    open_staff(p, "Omar")
    sel = p.get_by_label("Jours travaillés / semaine")
    check("Fiche : jours travailles par semaine, 5 par defaut", sel.input_value() == "5", sel.input_value())
    sel.select_option("4")
    p.get_by_role("button", name="Enregistrer", exact=True).click(); p.wait_for_timeout(1500)
    p.locator("div.cursor-pointer").filter(has_text="Omar").first.click(); p.wait_for_timeout(500)
    check("... enregistre : 4", p.get_by_label("Jours travaillés / semaine").input_value() == "4")

    # --- 2. compteur de conges : saisie du bulletin ------------------------------------
    card = p.get_by_test_id("leave-card")
    check("Sans bulletin : la fiche invite a saisir le solde", "dernier bulletin" in card.inner_text(), card.inner_text()[:120])
    card.get_by_label("Date du bulletin").fill("2026-08-31")
    card.get_by_label("Solde (jours)").fill("10")
    card.get_by_role("button", name="Enregistrer le solde").click(); p.wait_for_timeout(1500)
    txt = card.inner_text()
    print("   carte:", txt.replace("\n", " | ")[:300])
    check("Bulletin du 31 aout : 10 j", "Bulletin du 31 août 26" in txt and "10 j" in txt, txt[:200])
    check("Acquis depuis : +1,5 j (18 jours de septembre)", "+ 1,5 j" in txt, txt[:300])
    check("Solde aujourd hui : 11,5 j", p.get_by_test_id("leave-balance").inner_text().endswith("11,5 j"), p.get_by_test_id("leave-balance").inner_text())
    check("Marque provisoire, le bulletin fait foi", "le bulletin fait foi" in txt)
    p.keyboard.press("Escape"); p.wait_for_timeout(500)

    # --- 3. saisie d'un conge : le solde apres est rappele ------------------------------
    p.get_by_role("button", name="Absences", exact=True).first.click(); p.wait_for_timeout(600)
    p.get_by_label("Qui est absent").select_option(label="Omar")
    pick_kind(p, "Congés payés")
    p.get_by_label("Premier jour d'absence").fill("2026-09-21")
    p.get_by_label("Reprise le").fill("2026-09-26"); p.wait_for_timeout(1200)
    after = p.get_by_test_id("abs-balance-after")
    check("Conge 21-25/09 (5 j) : « solde apres : 6,5 j »", after.count() == 1 and "6,5 j" in after.inner_text(), after.all_inner_texts())
    h = p.get_by_label("Heures d'absence").input_value()
    check("Heures estimees avec 4 jours travailles : 35/4 x 4 = 35 h", h == "35", h)
    p.get_by_role("button", name="Enregistrer l'absence").click(); p.wait_for_timeout(1800)
    pick_kind(p, "Arrêt maladie")
    p.get_by_label("Premier jour d'absence").fill("2026-10-05")
    p.get_by_label("Reprise le").fill("2026-10-07"); p.wait_for_timeout(1200)
    check("Arret : pas de rappel de solde (ce n est pas un conge)", p.get_by_test_id("abs-balance-after").count() == 0)
    h = p.get_by_label("Heures d'absence").input_value()
    check("Arret de 2 jours, 4 jours travailles : 2 x 35/4 = 17,5 h", h == "17,5", h)
    p.keyboard.press("Escape"); p.wait_for_timeout(500)

    # --- 4. la fiche montre le conge a venir et l'historique -----------------------------
    open_staff(p, "Omar")
    up = p.get_by_test_id("leave-upcoming")
    check("Fiche : 5 j deja poses a venir, puis 6,5 j", up.count() == 1 and "5 j" in up.inner_text() and "6,5 j" in up.inner_text(), up.all_inner_texts())
    hist = p.get_by_test_id("leave-history").inner_text()
    check("Historique : le conge du 21/09 y figure", "Congés payés" in hist and "21 sept" in hist, hist)
    p.keyboard.press("Escape"); p.wait_for_timeout(400)

    # --- 5. reglage ouvrables / ouvres ------------------------------------------------------
    p.get_by_role("button", name="Paramètres", exact=True).first.click(); p.wait_for_timeout(500)
    rad = p.get_by_role("radio", name="Jours ouvrables (lun–sam, 30 j/an)")
    check("Parametres : jours ouvrables par defaut", rad.get_attribute("aria-checked") == "true")
    p.get_by_role("radio", name="Jours ouvrés (lun–ven, 25 j/an)").click(); p.wait_for_timeout(1200)
    p.keyboard.press("Escape"); p.wait_for_timeout(400)
    p.get_by_role("button", name="Absences", exact=True).first.click(); p.wait_for_timeout(600)
    p.get_by_label("Qui est absent").select_option(label="Omar")
    pick_kind(p, "Congés payés")
    p.get_by_label("Premier jour d'absence").fill("2026-10-12")
    p.get_by_label("Reprise le").fill("2026-10-19"); p.wait_for_timeout(1000)
    d = p.get_by_test_id("abs-days").inner_text()
    check("En ouvres, une semaine de conges = 5 jours", d.startswith("5 jour"), d)
    p.keyboard.press("Escape"); p.wait_for_timeout(300)
    p.reload(); p.wait_for_timeout(4200)
    p.get_by_role("button", name="Paramètres", exact=True).first.click(); p.wait_for_timeout(500)
    check("Le reglage ouvres persiste apres rechargement",
          p.get_by_role("radio", name="Jours ouvrés (lun–ven, 25 j/an)").get_attribute("aria-checked") == "true")
    p.get_by_role("radio", name="Jours ouvrables (lun–sam, 30 j/an)").click(); p.wait_for_timeout(1000)
    p.keyboard.press("Escape")
    check("Admin : aucune erreur JavaScript", not errors, errors[:2])

    # --- 6. un employe ne voit ni les reglages ni les fiches ------------------------------
    p2 = b.new_page(viewport={"width": 1400, "height": 1000})
    err2 = []
    p2.on("pageerror", lambda e: err2.append(str(e)))
    login(p2, "omar@test.fr")
    p2.get_by_role("button", name="Paramètres", exact=True).first.click(); p2.wait_for_timeout(500)
    check("Employe : pas de reglage du decompte des conges", p2.get_by_role("radio", name="Jours ouvrés (lun–ven, 25 j/an)").count() == 0)
    p2.get_by_role("button", name="Ma semaine").first.click(); p2.wait_for_timeout(300)
    p2.keyboard.press("Escape"); p2.wait_for_timeout(1200)
    mb = p2.get_by_test_id("my-leave-balance")
    txt = mb.inner_text() if mb.count() else ""
    check("Employe (Ma semaine) : voit SON solde, 11,5 j aujourd'hui", "11,5 j" in txt, txt)
    check("... et les 5 j deja poses, 6,5 j ensuite", "5 j" in txt and "6,5 j" in txt, txt)
    panel = p2.get_by_test_id("leave-request-panel")
    panel.get_by_role("button", name="Demander un congé").click()
    panel.get_by_label("Premier jour d'absence").fill("2026-11-02")
    panel.get_by_label("Reprise le").fill("2026-11-04"); p2.wait_for_timeout(300)
    ra = panel.get_by_test_id("req-balance-after")
    check("Demande de 2 j : solde apres 4,5 j", ra.count() == 1 and "4,5 j" in ra.inner_text(), ra.all_inner_texts())
    check("Employe : aucune erreur JavaScript", not err2, err2[:2])
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
