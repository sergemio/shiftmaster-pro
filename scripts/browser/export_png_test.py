"""Image PNG envoyee a l'equipe : ni cout employeur, ni motif medical.

On lit la grille PENDANT la generation (l'app passe en mode export ~0,5 s avant
la capture), puis on verifie qu'un fichier PNG a bien ete produit.
"""
import json, urllib.request
from playwright.sync_api import sync_playwright
URL = "http://localhost:3100/shiftmaster-pro/"
res = []
def check(label, ok, extra=""):
    res.append(ok)
    print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
    errors = []
    p.on("pageerror", lambda e: errors.append(str(e)))
    p.goto(URL)
    p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }")
    p.reload()
    p.get_by_label("Email").fill("serge@test.fr"); p.get_by_label("Mot de passe").fill("test1234")
    p.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(3800)

    # une ancienne etiquette « maladie » (donnees d'avant les periodes) pour Omar, vendredi
    url = p.evaluate("() => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/services/firebaseService.ts'))")
    p.evaluate("""async (url) => {
      const S = await import(url);
      const w = (await S.loadWeeks(['2026-09-13']))['2026-09-13'];
      await S.saveWeekToFirebase('2026-09-13', { ...w, absences: [{ id: 'old-fri', staffId: 's2', dayIndex: 4, kind: 'maladie' }] });
    }""", url)
    p.wait_for_timeout(1500)
    grid = p.locator("#calendar-grid-capture")
    before = grid.inner_text()
    check("A l ecran, l admin voit les couts (€)", "€" in before)
    check("A l ecran, l admin voit le motif « Arrêt maladie »", "Arrêt maladie" in before)

    with p.expect_download() as dl:
        p.get_by_role("button", name="Exporter PNG").click()
        p.wait_for_timeout(250)
        during = grid.inner_text()
    path = dl.value.path()
    check("Pendant l export : aucun montant", "€" not in during, [l for l in during.split("\n") if "€" in l][:3])
    check("Pendant l export : aucune ligne « Coût »", "Coût" not in during)
    check("En-tete : nom du restaurant et semaine en francais, rien de Sezam&Co en dur",
          "SEZAM (DEMO)" in during.upper() and "PLANNING DE LA SEMAINE" in during.upper() and "SEMAINE 38" in during.upper()
          and "lun 14 sept - dim 20 sept 2026" in during and "SEZAM&CO" not in during.upper() and "WEEKLY" not in during.upper(), during[:200])
    check("Pendant l export : le motif devient « Absent »", "Arrêt maladie" not in during and "Omar · Absent" in during)
    check("Un fichier PNG est produit", open(path, "rb").read(8) == b"\x89PNG\r\n\x1a\n")
    p.wait_for_timeout(800)
    check("Apres l export, l ecran de l admin retrouve les couts", "€" in grid.inner_text())
    check("Aucune erreur JavaScript", not errors, errors[:2])
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
