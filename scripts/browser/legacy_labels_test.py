"""une periode remplace les anciennes etiquettes sur ses jours."""
import json, urllib.request
from playwright.sync_api import sync_playwright
URL = "http://localhost:3100/shiftmaster-pro/"
res = []
def check(label, ok, extra=""):
    res.append(ok)
    print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1400, "height": 1000})
    errors = []
    p.on("pageerror", lambda e: errors.append(str(e)))
    p.goto(URL)
    p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }")
    p.reload()
    p.get_by_label("Email").fill("serge@test.fr"); p.get_by_label("Mot de passe").fill("test1234")
    p.get_by_role("button", name="Connexion emulateur").click(); p.wait_for_timeout(3800)
    url = p.evaluate("() => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/services/firebaseService.ts'))")
    p.evaluate("""async (url) => {
      const S = await import(url);
      const w = (await S.loadWeeks(['2026-09-13']))['2026-09-13'];
      await S.saveWeekToFirebase('2026-09-13', { ...w, absences: [
        { id: 'old-wed', staffId: 's2', dayIndex: 2, kind: 'conge' },
        { id: 'old-fri', staffId: 's2', dayIndex: 4, kind: 'maladie' },
      ] });
    }""", url)
    p.wait_for_timeout(1500)
    bands = [x for x in p.get_by_test_id("absence-band").all_inner_texts() if "Omar" in x]
    check("Depart : 2 anciennes etiquettes pour Omar (mer, ven)", len(bands) == 2, bands)
    sidebar = p.locator("div.space-y-1").filter(has_text="Omar").first.inner_text().replace("\n", " ")
    print("   sidebar avant:", sidebar)
    check("Anciennes etiquettes : attendu estime 35 - 2 x 7 = 21 h", "/ 21h" in sidebar, sidebar)

    p.get_by_role("button", name="Absences", exact=True).first.click(); p.wait_for_timeout(600)
    p.get_by_label("Qui est absent").select_option(label="Omar")
    p.get_by_role("button", name="Motif").click()
    p.get_by_role("listbox").get_by_role("option", name="Arrêt maladie").click()
    p.get_by_label("Premier jour d'absence").fill("2026-09-16")
    p.get_by_label("Reprise le").fill("2026-09-18"); p.wait_for_timeout(1200)
    check("Ancienne etiquette : pas de faux conflit (ce n est pas une periode)", p.get_by_test_id("abs-conflict").count() == 0)
    p.get_by_role("button", name="Enregistrer l'absence").click(); p.wait_for_timeout(1800)
    p.keyboard.press("Escape"); p.wait_for_timeout(500)
    bands = [x for x in p.get_by_test_id("absence-band").all_inner_texts() if "Omar" in x]
    print("   bands apres:", bands)
    check("Apres l arret mer-jeu : 3 etiquettes (mer, jeu de l arret + ancienne du ven)", len(bands) == 3, bands)
    check("L ancienne etiquette « Congés payés » du mercredi a disparu", not any("Congés" in x for x in bands), bands)
    p.reload(); p.wait_for_timeout(4200)
    bands2 = [x for x in p.get_by_test_id("absence-band").all_inner_texts() if "Omar" in x]
    check("Apres rechargement : pareil", sorted(bands2) == sorted(bands), bands2)
    check("Admin : l ancienne etiquette du vendredi garde son motif (« Arrêt maladie »)",
          any("Arrêt maladie" in x for x in bands2), bands2)

    # --- l'equipe ne lit jamais le motif medical ----------------------------------
    p2 = b.new_page(viewport={"width": 1400, "height": 1000})
    p2.on("pageerror", lambda e: errors.append(str(e)))
    p2.goto(URL)
    p2.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }")
    p2.reload()
    p2.get_by_label("Email").fill("double@test.fr"); p2.get_by_label("Mot de passe").fill("test1234")
    p2.get_by_role("button", name="Connexion emulateur").click(); p2.wait_for_timeout(3800)
    team = [x for x in p2.get_by_test_id("absence-band").all_inner_texts() if "Omar" in x]
    print("   vue equipe:", team)
    check("Equipe : 3 etiquettes pour Omar, toutes « Absent »", len(team) == 3 and all("Absent" in x for x in team), team)
    side = p2.locator("div.space-y-1").filter(has_text="Omar").first.inner_text()
    check("Equipe : la barre laterale ne dit pas « maladie »", "maladie" not in side.lower(), side)

    # --- le journal (lisible par toute l'equipe) ne porte pas le motif ---------------
    req = urllib.request.Request(
        "http://localhost:8080/v1/projects/demo-shiftmaster/databases/(default)/documents/orgs/sezam/logs?pageSize=200",
        headers={"Authorization": "Bearer owner"})
    logs = [d["fields"]["details"]["stringValue"] for d in json.load(urllib.request.urlopen(req)).get("documents", [])]
    absence_logs = [l for l in logs if "Omar" in l and ("Recorded" in l or "Removed" in l)]
    print("   journal:", absence_logs)
    check("Journal : l arret est note « absent », jamais « maladie »",
          absence_logs and not any("maladie" in l for l in absence_logs), absence_logs)
    check("Aucune erreur JS", not errors, errors[:2])
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
