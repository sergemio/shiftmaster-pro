"""Fermetures decidees par le restaurant (18/09/2026) : saisies dans les parametres,
affichees au planning, shifts bloques, listees dans l'export de paie, sans toucher
aux conges.

La fermeture est posee sur la semaine SUIVANTE (3 jours a partir de son lundi) :
la semaine en cours sert de temoin, elle doit rester sans fermeture. Dates
calculees a partir d'aujourd'hui — voir `dates.py`."""
import re
from playwright.sync_api import sync_playwright
from settings_ui import open_settings
from dates import NEXT_MON, MON, iso, fr, mois, jour_nom
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
    p.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(3800)

def settings(p):
    open_settings(p); p.wait_for_timeout(500)

def next_week(p):
    p.get_by_role("button", name="Semaine suivante").click(); p.wait_for_timeout(1500)

def chips(p):
    return p.get_by_test_id("holiday-chip")

with sync_playwright() as pw:
    b = pw.chromium.launch()
    errors = []
    p = b.new_page(viewport={"width": 1400, "height": 1000}); p.on("pageerror", lambda e: errors.append(str(e)))
    login(p, "serge@test.fr")

    # --- 1. saisie dans les parametres ------------------------------------------------
    settings(p)
    sec = p.get_by_test_id("settings-closures")
    check("Parametres : section « Fermetures du restaurant »", sec.count() == 1 and "FERMETURES DU RESTAURANT" in sec.inner_text().upper())
    check("Bouton d'ajout desactive tant que les dates manquent", sec.get_by_role("button", name="Ajouter cette fermeture").is_disabled())
    sec.get_by_label("Du").fill(iso(NEXT_MON))
    check("Le « au » suit le « du »", sec.get_by_label("Au (inclus)").input_value() == iso(NEXT_MON))
    sec.get_by_label("Au (inclus)").fill(iso(NEXT_MON, 2))
    sec.get_by_label("Motif (facultatif)").fill("vacances d'été")
    sec.get_by_role("button", name="Ajouter cette fermeture").click(); p.wait_for_timeout(1500)
    rows = sec.get_by_test_id("closure-row")
    check("La fermeture est listee avec ses dates et son motif", rows.count() == 1 and f"du {fr(NEXT_MON)} au {fr(NEXT_MON, 2)}" in rows.first.inner_text() and "vacances d'été" in rows.first.inner_text(), rows.all_inner_texts())
    check("Formulaire vide apres ajout", sec.get_by_label("Du").input_value() == "")
    p.keyboard.press("Escape"); p.wait_for_timeout(500)

    # --- 2. planning ----------------------------------------------------------------------
    check("Semaine en cours : aucune fermeture affichee", chips(p).count() == 0, chips(p).all_inner_texts())
    next_week(p)
    texts = chips(p).all_inner_texts()
    check("Semaine de la fermeture : trois jours « Fermé · vacances d'été »", len(texts) == 3 and all(t.upper() == "FERMÉ · VACANCES D'ÉTÉ" for t in texts), texts)

    p.get_by_role("button", name="Ajouter un shift").first.click(); p.wait_for_timeout(500)
    p.locator("select").first.select_option(label="Omar")
    p.get_by_role("button", name=jour_nom(NEXT_MON, 1), exact=True).click(); p.wait_for_timeout(300)
    check("Shift bloque le 2e jour de la fermeture : restaurant ferme",
          p.get_by_text("Le restaurant est fermé ce jour-là (fermeture du restaurant)").count() >= 1)
    check("Le bouton d'ajout est desactive", p.locator("form button[type=submit]").last.is_disabled())
    p.keyboard.press("Escape"); p.wait_for_timeout(300)

    # --- 3. export de paie --------------------------------------------------------------------
    settings(p)
    p.get_by_role("button", name="Éléments variables de paie").click(); p.wait_for_timeout(600)
    p.get_by_label("Mois").fill(mois(NEXT_MON)); p.wait_for_timeout(2500)
    txt = p.get_by_test_id("payroll-text").inner_text()
    check("Export : la fermeture en tete, a voir avec l'employeur",
          "Fermeture décidée par le restaurant (à voir avec l’employeur : congés imposés ou jours payés) :" in txt
          and f"du {fr(NEXT_MON)} au {fr(NEXT_MON, 2)} — vacances d'été" in txt, txt[:300])
    check("Export : aucune absence creee pour les salaries", f"Congés payés du {fr(NEXT_MON)}" not in txt)
    p.get_by_label("Mois").fill(mois(iso(NEXT_MON, -40))); p.wait_for_timeout(2500)
    check("Export du mois d'avant : pas de fermeture", "Fermeture" not in p.get_by_test_id("payroll-text").inner_text())
    p.keyboard.press("Escape"); p.wait_for_timeout(300)

    # --- 4. employe : voit la fermeture, ne peut pas la changer ------------------------------------
    o = b.new_context(viewport={"width": 1400, "height": 1000}).new_page(); o.on("pageerror", lambda e: errors.append(str(e)))
    login(o, "omar@test.fr")
    next_week(o)
    check("Employe : voit les jours fermes au planning", chips(o).count() == 3, chips(o).all_inner_texts())
    settings(o)
    check("Employe : pas de reglage des fermetures", o.get_by_test_id("closures").count() == 0)

    # --- 5. retrait -------------------------------------------------------------------------------
    settings(p)
    p.get_by_test_id("closures").get_by_role("button", name=re.compile("^Retirer")).click(); p.wait_for_timeout(1500)
    check("Retrait : la liste est vide", p.get_by_test_id("closure-row").count() == 0)
    p.keyboard.press("Escape"); p.wait_for_timeout(500)
    check("Retrait : plus de jour ferme au planning", chips(p).count() == 0, chips(p).all_inner_texts())
    o.wait_for_timeout(1500)
    check("Retrait : l'employe ne voit plus la fermeture", chips(o).count() == 0)
    check("Aucune erreur JavaScript", not errors, errors[:3])
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
