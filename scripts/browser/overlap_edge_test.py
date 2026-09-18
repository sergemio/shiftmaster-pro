"""Absences, cas limites : heures reprises d un conge par un arret, arret au milieu de deux semaines de conges, arret allonge."""
import tempfile, json
from playwright.sync_api import sync_playwright
URL = "http://localhost:3100/shiftmaster-pro/"
DIR = tempfile.gettempdir()
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

def pick_kind(p, name):
    p.get_by_role("button", name="Motif").click()
    p.get_by_role("listbox").get_by_role("option", name=name).click()

def fill(p, who, kind, start, back):
    p.get_by_label("Qui est absent").select_option(label=who)
    pick_kind(p, kind)
    p.get_by_label("Premier jour d'absence").fill(start)
    p.get_by_label("Reprise le").fill(back)
    p.wait_for_timeout(1300)

def hours(p):
    return p.get_by_label("Heures d'absence").input_value()

def save(p):
    p.get_by_role("button", name="Enregistrer l'absence").click()
    p.wait_for_timeout(1800)

def open_modal(p):
    p.get_by_role("button", name="Absences", exact=True).first.click(); p.wait_for_timeout(700)

def listed(p, who):
    return [t.replace("\n", " ") for t in p.locator("li button").filter(has_text=who).all_inner_texts()]

def row(p, name):
    return p.locator("div.space-y-1").filter(has_text=name).first.inner_text().replace("\n", " ")

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1400, "height": 1000})
    errors = []
    p.on("pageerror", lambda e: errors.append(str(e)))
    p.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    login(p, "serge@test.fr")

    # ---- 1. heures : un arret qui remplace un jour de conge dont le shift a ete retire
    open_modal(p)
    fill(p, "Omar", "Congés payés", "2026-09-15", "2026-09-16")   # mardi, shift 18-23 (5 h)
    check("Conge du mardi : 5 h (son shift)", hours(p) in ("5",), hours(p))
    save(p)
    fill(p, "Omar", "Arrêt maladie", "2026-09-15", "2026-09-16")
    h = hours(p)
    check("Arret sur ce mardi : les 5 h du conge passent a l arret (pas 0)", h == "5", h)
    save(p)
    p.keyboard.press("Escape"); p.wait_for_timeout(600)
    print("   sidebar:", row(p, "Omar"))
    check("Barre laterale : l attendu reste reduit de 5 h (30 h)", "/ 30h" in row(p, "Omar"), row(p, "Omar"))

    # ---- 2. deux semaines de conges, arret au milieu (a cheval sur la 2e semaine)
    open_modal(p)
    fill(p, "Double", "Congés payés", "2026-09-21", "2026-10-03")
    save(p)
    fill(p, "Double", "Arrêt maladie", "2026-09-24", "2026-09-26")
    cut = p.get_by_test_id("abs-cut")
    print("   cut:", cut.inner_text().replace("\n", " | ") if cut.count() else None)
    save(p)
    items = listed(p, "Double")
    print("   list:", items)
    check("Double : 3 lignes (conge avant, arret, conge apres)", len(items) == 3, items)

    # ---- 3. modifier l'arret pour l'allonger : il mange encore la suite du conge
    p.locator("li button").filter(has_text="Double").filter(has_text="Arrêt maladie").first.click(); p.wait_for_timeout(500)
    p.get_by_label("Reprise le").fill("2026-09-29"); p.wait_for_timeout(1200)
    cut = p.get_by_test_id("abs-cut")
    print("   cut2:", cut.inner_text().replace("\n", " | ") if cut.count() else None)
    check("Allonger l arret annonce le raccourcissement de la suite", cut.count() == 1)
    p.get_by_role("button", name="Mettre à jour").click() if p.get_by_role("button", name="Mettre à jour").count() else save(p)
    p.wait_for_timeout(1800)
    items = listed(p, "Double")
    print("   list2:", items)
    check("Toujours 3 lignes, la suite commence le 29/09", len(items) == 3 and any("du 29 sept" in i and "Congés" in i for i in items), items)

    # ---- 4. raccourcir l'arret : pas de trou dans le conge ? (documente : non retabli)
    # ---- 5. semaine suivante : bandes
    p.keyboard.press("Escape"); p.wait_for_timeout(500)
    p.get_by_role("button", name="Next week").click(); p.wait_for_timeout(2000)
    bands = [x for x in p.get_by_test_id("absence-band").all_inner_texts() if "Double" in x]
    print("   bands S39:", bands)
    check("Semaine du 21/09 : Double a 7 etiquettes (lun-dim), une par jour", len(bands) == 7, bands)
    p.screenshot(path=DIR + r"\bughunt_week2.png")

    # ---- 6. rechargement : tout persiste
    p.reload(); p.wait_for_timeout(4200)
    open_modal(p)
    items2 = listed(p, "Double")
    check("Apres rechargement, meme liste", sorted(items2) == sorted(items), (items2, items))
    p.keyboard.press("Escape")

    check("Aucune erreur JavaScript / console", not errors, errors[:3])
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
