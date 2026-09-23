"""Shifts dont la fiche employe a ete supprimee (recette du 23/09/2026 sur une
copie des donnees de Sezam : 93 shifts, 609 h que le planning ne montrait pas).

On ajoute, dans la semaine en cours de la demo Sezam, un shift rattache a une
fiche qui n'existe pas : il doit apparaitre, etre compte, et etre signale.
"""
import json, urllib.request
from playwright.sync_api import sync_playwright
from dates import MON, iso
URL = "http://localhost:3100/shiftmaster-pro/"
DOC = "http://127.0.0.1:8080/v1/projects/demo-shiftmaster/databases/(default)/documents/orgs/sezam/weeks/" + iso(MON, -1)
res = []
def check(label, ok, extra=""):
    res.append(ok); print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

# --- un shift de 10 h a 16 h, mercredi, pour la fiche « gone » (inexistante) ---------
req = lambda url, data=None, method="GET": urllib.request.urlopen(urllib.request.Request(
    url, data=json.dumps(data).encode() if data else None, method=method,
    headers={"Authorization": "Bearer owner", "Content-Type": "application/json"}))
week = json.load(req(DOC))
shifts = week["fields"]["shifts"]["arrayValue"].get("values", [])
shifts.append({"mapValue": {"fields": {
    "id": {"stringValue": "orphan1"}, "staffId": {"stringValue": "gone"}, "dayIndex": {"integerValue": "2"},
    "startTime": {"integerValue": "10"}, "endTime": {"integerValue": "16"}}}})
req(DOC + "?updateMask.fieldPaths=shifts", {"fields": {"shifts": {"arrayValue": {"values": shifts}}}}, "PATCH")

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(URL); p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); localStorage.setItem('shiftmaster_view','day'); }"); p.reload()
    p.get_by_label("Email").fill("serge@test.fr"); p.get_by_label("Mot de passe").fill("test1234")
    p.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(4500)
    p.keyboard.press("Escape"); p.wait_for_timeout(300)
    banner = p.get_by_test_id("missing-staff-banner")
    check("Bandeau : « 1 shift(s) de cette semaine appartiennent à une fiche supprimée »",
          banner.count() == 1 and "1 shift" in banner.inner_text(), banner.inner_text() if banner.count() else "absent")
    body = p.locator("body").inner_text()
    check("Planning : le shift s'affiche sous « Fiche supprimée · gone »", body.count("Fiche supprimée · gone") >= 2, body.count("Fiche supprimée · gone"))
    check("Planning : ses horaires sont visibles (10:00 - 16:00)", "10:00 - 16:00" in body)
    side = p.locator("aside").last.inner_text()
    check("Heures de la semaine : 6 h comptees sur la ligne de la fiche supprimee",
          "Fiche supprimée · gone" in side and "6 h" in side.split("Fiche supprimée · gone")[1][:30], side[:400])
    check("Aucune erreur JavaScript", not errs, errs[:2])
    p.context.close()

    # un equipier ne voit pas le bandeau
    p = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
    p.goto(URL); p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }"); p.reload()
    p.get_by_label("Email").fill("omar@test.fr"); p.get_by_label("Mot de passe").fill("test1234")
    p.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(4500)
    check("Equipier : pas de bandeau", p.get_by_test_id("missing-staff-banner").count() == 0)
    b.close()
print("TOUT PASSE" if all(res) else f"{res.count(False)} ECHEC(S)")
