"""Absences, lot 5 (elements variables de paie) et lot 7a (demandes de conge).

Donnees : seed-emulator. Omar 35 h (shifts lun 14/09 4,5 h, mar 15/09 5 h),
Double 20 h (mer 16/09 3 h). Lancer `node scripts/seed-emulator.mjs` avant.
"""
from playwright.sync_api import sync_playwright
import tempfile, os
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
    p.get_by_role("button", name="Connexion emulateur").click()
    p.wait_for_timeout(3800)

def my_week(p):
    p.get_by_role("button", name="Paramètres", exact=True).first.click(); p.wait_for_timeout(500)
    p.get_by_role("button", name="Ma semaine").first.click(); p.wait_for_timeout(300)
    p.keyboard.press("Escape"); p.wait_for_timeout(600)

def request_leave(p, kind, start, back, note=""):
    panel = p.get_by_test_id("leave-request-panel")
    panel.get_by_role("button", name="Demander un congé").click()
    panel.get_by_role("button", name=kind, exact=True).click()
    panel.get_by_label("Premier jour d'absence").fill(start)
    panel.get_by_label("Reprise le").fill(back)
    if note: panel.get_by_label("Message (facultatif)").fill(note)
    p.wait_for_timeout(300)
    days = panel.get_by_test_id("req-days").inner_text()
    panel.get_by_role("button", name="Envoyer la demande").click(); p.wait_for_timeout(1500)
    return days

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
    ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin="http://localhost:3100")
    omar = ctx.new_page(); errs = []
    omar.on("pageerror", lambda e: errs.append(str(e)))
    login(omar, "omar@test.fr")
    my_week(omar)

    # --- 1. Omar demande ------------------------------------------------------------
    panel = omar.get_by_test_id("leave-request-panel")
    check("Ma semaine : bouton « Demander un congé »", panel.get_by_role("button", name="Demander un congé").count() == 1)
    d = request_leave(omar, "Congés payés", "2026-10-12", "2026-10-19", "Vacances Liban")
    check("Demande 12-17/10 : 6 jours ouvrables annonces", d.startswith("6 jour"), d)
    lst = panel.get_by_test_id("req-list").inner_text()
    check("Mes demandes : en attente", "Congés payés" in lst and "En attente" in lst, lst)
    request_leave(omar, "Congé sans solde", "2026-11-02", "2026-11-03")
    request_leave(omar, "Congés payés", "2026-12-21", "2026-12-24")
    check("Trois demandes en attente", panel.get_by_test_id("req-list").inner_text().count("En attente") == 3)
    panel.get_by_test_id("req-list").locator("li").filter(has_text="Congé sans solde").get_by_role("button", name="Retirer").click()
    omar.wait_for_timeout(1200)
    check("Retirer une demande en attente", "Congé sans solde" not in panel.get_by_test_id("req-list").inner_text())

    # --- 2. Serge voit, examine, accepte ------------------------------------------------
    # Session separee : les pages d'un meme contexte partagent le compte connecte.
    ctx2 = b.new_context(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
    ctx2.grant_permissions(["clipboard-read", "clipboard-write"], origin="http://localhost:3100")
    serge = ctx2.new_page(); errs2 = []
    serge.on("pageerror", lambda e: errs2.append(str(e)))
    login(serge, "serge@test.fr")
    badge = serge.get_by_test_id("req-badge")
    check("Admin : pastille « 2 » sur le bouton Absences", badge.count() >= 1 and badge.first.inner_text() == "2", badge.all_inner_texts())
    serge.get_by_role("button", name="Absences", exact=True).first.click(); serge.wait_for_timeout(700)
    pend = serge.get_by_test_id("req-pending")
    check("Fenetre Absences : 2 demandes en attente, avec le message", "DEMANDES EN ATTENTE (2)" in pend.inner_text().upper() and "Vacances Liban" in pend.inner_text(), pend.inner_text())
    pend.locator("li").filter(has_text="Vacances Liban").get_by_role("button", name="Examiner").click(); serge.wait_for_timeout(1500)
    check("Examiner : formulaire pre-rempli pour Omar", serge.get_by_label("Qui est absent").input_value() == "s2")
    check("... dates de la demande", serge.get_by_label("Premier jour d'absence").input_value() == "2026-10-12"
          and serge.get_by_label("Reprise le").input_value() == "2026-10-19")
    check("... bandeau « Demande de Omar »", serge.get_by_test_id("req-reviewing").count() == 1)
    h = serge.get_by_label("Heures d'absence").input_value()
    check("... heures proposees au contrat : 35 h", h == "35", h)
    serge.get_by_role("button", name="Accepter la demande").click(); serge.wait_for_timeout(2000)
    check("Accepte : l'absence existe dans la liste", "12 oct" in serge.locator("body").inner_text())
    pt = serge.get_by_test_id("req-pending").all_inner_texts()
    check("Accepte : plus qu'une demande en attente", any("DEMANDES EN ATTENTE (1)" in x.upper() for x in pt), pt)

    # --- 3. Serge refuse la seconde -----------------------------------------------------
    pend.locator("li").filter(has_text="Congés payés").get_by_role("button", name="Refuser").click()
    serge.get_by_placeholder("Motif du refus (facultatif)").fill("Fêtes : restaurant plein")
    serge.get_by_role("button", name="Confirmer le refus").click(); serge.wait_for_timeout(1500)
    check("Refus : plus aucune demande en attente", serge.get_by_test_id("req-pending").count() == 0)
    serge.keyboard.press("Escape"); serge.wait_for_timeout(500)
    check("Refus : la pastille disparait", serge.get_by_test_id("req-badge").count() == 0)

    omar.wait_for_timeout(1000)
    lst = panel.get_by_test_id("req-list").inner_text()
    check("Omar voit « Acceptée » et « Refusée » avec le motif", "Acceptée" in lst and "Refusée" in lst and "restaurant plein" in lst, lst)
    check("Omar : plus de bouton Retirer sur une demande tranchee", panel.get_by_role("button", name="Retirer").count() == 0)

    # --- 4. Un arret pour Double, puis l'export de paie -------------------------------------
    serge.get_by_role("button", name="Absences", exact=True).first.click(); serge.wait_for_timeout(600)
    serge.get_by_label("Qui est absent").select_option(label="Double")
    serge.get_by_role("button", name="Motif").click()
    serge.get_by_role("listbox").get_by_role("option", name="Arrêt maladie").click()
    serge.get_by_label("Premier jour d'absence").fill("2026-09-21")
    serge.get_by_label("Reprise le").fill("2026-09-23"); serge.wait_for_timeout(1200)
    serge.get_by_role("button", name="Enregistrer l'absence").click(); serge.wait_for_timeout(1800)
    serge.keyboard.press("Escape"); serge.wait_for_timeout(400)

    serge.get_by_role("button", name="Paramètres", exact=True).first.click(); serge.wait_for_timeout(500)
    serge.get_by_role("button", name="Éléments variables de paie").click(); serge.wait_for_timeout(600)
    serge.get_by_label("Mois").fill("2026-09"); serge.wait_for_timeout(2500)
    txt = serge.get_by_test_id("payroll-text").inner_text()
    print("   ---\n" + "\n".join("   " + l for l in txt.splitlines()) + "\n   ---")
    check("Export : titre du mois", txt.startswith("Éléments variables de paie — septembre 2026"), txt[:60])
    check("Export : Omar, contrat 35 h, base 151,67 h", "OMAR — contrat 35 h/semaine (base 151,67 h/mois)" in txt)
    check("Export : Omar a travaille 9,5 h", "Heures travaillées : 9,5 h" in txt)
    check("Export : Double, arret du 21 au 22/09, 2 j, 8 h, justificatif NON recu",
          "Arrêt maladie du 21 sept 26 au 22 sept 26 : 2 j décomptés, 8 h d'absence, justificatif NON reçu" in txt)
    check("Export : Serge (admin sans contrat ni heures) absent", "SERGE" not in txt)
    check("Export : mention des donnees de sante", "données de santé" in serge.locator("body").inner_text())
    serge.get_by_role("button", name="Copier le texte").click(); serge.wait_for_timeout(400)
    clip = serge.evaluate("() => navigator.clipboard.readText()")
    flat = lambda x: [l.strip() for l in x.splitlines() if l.strip()]
    check("Copier : le texte est dans le presse-papiers", flat(clip) == flat(txt), (flat(clip)[:3], flat(txt)[:3]))
    with serge.expect_download() as dl:
        serge.get_by_role("button", name="Télécharger le tableur (CSV)").click()
    path = os.path.join(tempfile.gettempdir(), "paie-test.csv")
    dl.value.save_as(path)
    raw = open(path, "rb").read()
    csv = raw.decode("utf-8-sig")
    check("CSV : nom de fichier du mois", dl.value.suggested_filename == "elements-variables-paie-2026-09.csv", dl.value.suggested_filename)
    check("CSV : BOM UTF-8 pour Excel", raw.startswith(b"\xef\xbb\xbf"))
    check("CSV : en-tete francais", csv.splitlines()[0] == "Salarié;Rubrique;Du;Au;Jours;Heures;Détail", csv.splitlines()[0])
    check("CSV : ligne de l'arret de Double", any(l.startswith("Double;Arrêt maladie;2026-09-21;2026-09-22;2;8;") for l in csv.splitlines()), csv)
    serge.get_by_label("Mois").fill("2026-10"); serge.wait_for_timeout(2500)
    txt10 = serge.get_by_test_id("payroll-text").inner_text()
    check("Octobre : le conge accepte d'Omar, 6 j, 35 h",
          "Congés payés du 12 oct 26 au 18 oct 26 : 6 j décomptés, 35 h d'absence — Vacances Liban" in txt10, txt10)
    serge.keyboard.press("Escape"); serge.wait_for_timeout(300)

    # --- 5. Un employe n'a pas l'export -------------------------------------------------------
    omar.get_by_role("button", name="Paramètres", exact=True).first.click(); omar.wait_for_timeout(500)
    check("Employe : pas de bouton d'export de paie", omar.get_by_role("button", name="Éléments variables de paie").count() == 0)
    check("Aucune erreur JavaScript", not errs and not errs2, (errs + errs2)[:2])
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
