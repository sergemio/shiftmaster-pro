"""Absences, lot 4 : fiche salarie (jours travailles, compteur de conges, historique),
rappel du solde a la saisie, reglage ouvrables / ouvres.

Dates calculees a partir d'aujourd'hui (voir `dates.py`). Bulletin fictif au dernier
jour du mois passe : 10 j restants. Les jours acquis depuis ce bulletin sont
recalcules ici avec la meme regle que l'app (2,5 j par mois, au prorata des jours
ecoules), pour ne pas dependre du jour ou le test tourne.
"""
import calendar
from datetime import date, timedelta
from playwright.sync_api import sync_playwright
from settings_ui import open_settings
from dates import MON, NEXT_MON, TODAY, iso, fr
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
    bulletin = (TODAY.replace(day=1) - timedelta(days=1)).isoformat()
    # Acquis depuis le bulletin : 2,5 j par mois, au prorata des jours ecoules.
    jours_mois = calendar.monthrange(TODAY.year, TODAY.month)[1]
    acquis = round(2.5 / jours_mois * TODAY.day, 2)
    def jfr(n):
        return (str(int(n)) if float(n).is_integer() else f"{n:.1f}").replace(".", ",")
    card.get_by_label("Date du bulletin").fill(bulletin)
    card.get_by_label("Solde (jours)").fill("10")
    card.get_by_role("button", name="Enregistrer le solde").click(); p.wait_for_timeout(1500)
    txt = card.inner_text()
    print("   carte:", txt.replace("\n", " | ")[:300])
    check("Bulletin du dernier jour du mois passe : 10 j", f"Bulletin du {fr(bulletin)}" in txt and "10 j" in txt, txt[:200])
    check(f"Acquis depuis le bulletin : + {jfr(acquis)} j ({TODAY.day} jours du mois)", f"+ {jfr(acquis)} j" in txt, txt[:300])
    solde = p.get_by_test_id("leave-balance").inner_text()
    check(f"Solde aujourd hui : 10 + {jfr(acquis)} = {jfr(round(10 + acquis, 2))} j",
          solde.endswith(f"{jfr(round(10 + acquis, 2))} j"), solde)
    check("Marque provisoire, le bulletin fait foi", "le bulletin fait foi" in txt)
    p.keyboard.press("Escape"); p.wait_for_timeout(500)

    # --- 3. saisie d'un conge : le solde apres est rappele ------------------------------
    p.get_by_role("button", name="Absences", exact=True).first.click(); p.wait_for_timeout(600)
    p.get_by_label("Qui est absent").select_option(label="Omar")
    pick_kind(p, "Congés payés")
    p.get_by_label("Premier jour d'absence").fill(iso(NEXT_MON))
    p.get_by_label("Reprise le").fill(iso(NEXT_MON, 5)); p.wait_for_timeout(1200)
    after = p.get_by_test_id("abs-balance-after")
    reste = jfr(round(10 + acquis - 5, 2))
    check(f"Conge du lundi au vendredi (5 j) : « solde apres : {reste} j »",
          after.count() == 1 and f"{reste} j" in after.inner_text(), after.all_inner_texts())
    h = p.get_by_label("Heures d'absence").input_value()
    check("Heures estimees avec 4 jours travailles : 35/4 x 4 = 35 h", h == "35", h)
    p.get_by_role("button", name="Enregistrer l'absence").click(); p.wait_for_timeout(1800)
    pick_kind(p, "Arrêt maladie")
    p.get_by_label("Premier jour d'absence").fill(iso(NEXT_MON, 14))
    p.get_by_label("Reprise le").fill(iso(NEXT_MON, 16)); p.wait_for_timeout(1200)
    check("Arret : pas de rappel de solde (ce n est pas un conge)", p.get_by_test_id("abs-balance-after").count() == 0)
    h = p.get_by_label("Heures d'absence").input_value()
    check("Arret de 2 jours, 4 jours travailles : 2 x 35/4 = 17,5 h", h == "17,5", h)
    p.keyboard.press("Escape"); p.wait_for_timeout(500)

    # --- 4. la fiche montre le conge a venir et l'historique -----------------------------
    open_staff(p, "Omar")
    up = p.get_by_test_id("leave-upcoming")
    check(f"Fiche : 5 j deja poses a venir, puis {reste} j",
          up.count() == 1 and "5 j" in up.inner_text() and f"{reste} j" in up.inner_text(), up.all_inner_texts())
    hist = p.get_by_test_id("leave-history").inner_text()
    check("Historique : le conge pose y figure", "Congés payés" in hist and fr(NEXT_MON) in hist, hist)
    p.keyboard.press("Escape"); p.wait_for_timeout(400)

    # --- 5. reglage ouvrables / ouvres ------------------------------------------------------
    open_settings(p); p.wait_for_timeout(500)
    rad = p.get_by_role("radio", name="Jours ouvrables (lun–sam, 30 j/an)")
    check("Parametres : jours ouvrables par defaut", rad.get_attribute("aria-checked") == "true")
    p.get_by_role("radio", name="Jours ouvrés (lun–ven, 25 j/an)").click(); p.wait_for_timeout(1200)
    p.keyboard.press("Escape"); p.wait_for_timeout(400)
    p.get_by_role("button", name="Absences", exact=True).first.click(); p.wait_for_timeout(600)
    p.get_by_label("Qui est absent").select_option(label="Omar")
    pick_kind(p, "Congés payés")
    p.get_by_label("Premier jour d'absence").fill(iso(NEXT_MON, 21))
    p.get_by_label("Reprise le").fill(iso(NEXT_MON, 28)); p.wait_for_timeout(1000)
    d = p.get_by_test_id("abs-days").inner_text()
    check("En ouvres, une semaine de conges = 5 jours", d.startswith("5 jour"), d)
    p.keyboard.press("Escape"); p.wait_for_timeout(300)
    p.reload(); p.wait_for_timeout(4200)
    open_settings(p); p.wait_for_timeout(500)
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
    open_settings(p2); p2.wait_for_timeout(500)
    check("Employe : pas de reglage du decompte des conges", p2.get_by_role("radio", name="Jours ouvrés (lun–ven, 25 j/an)").count() == 0)
    p2.get_by_role("button", name="Ma semaine").first.click(); p2.wait_for_timeout(300)
    p2.keyboard.press("Escape"); p2.wait_for_timeout(1200)
    mb = p2.get_by_test_id("my-leave-balance")
    txt = mb.inner_text() if mb.count() else ""
    solde_j = jfr(round(10 + acquis, 2))
    check(f"Employe (Ma semaine) : voit SON solde, {solde_j} j aujourd'hui", f"{solde_j} j" in txt, txt)
    check(f"... et les 5 j deja poses, {reste} j ensuite", "5 j" in txt and f"{reste} j" in txt, txt)
    panel = p2.get_by_test_id("leave-request-panel")
    panel.get_by_role("button", name="Demander un congé").click()
    panel.get_by_label("Premier jour d'absence").fill(iso(NEXT_MON, 42))
    panel.get_by_label("Reprise le").fill(iso(NEXT_MON, 44)); p2.wait_for_timeout(300)
    ra = panel.get_by_test_id("req-balance-after")
    apres = jfr(round(10 + acquis - 5 - 2, 2))
    check(f"Demande de 2 j : solde apres {apres} j", ra.count() == 1 and f"{apres} j" in ra.inner_text(), ra.all_inner_texts())
    check("Employe : aucune erreur JavaScript", not err2, err2[:2])
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
