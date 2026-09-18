"""Convention collective par restaurant (lot 1f) : choix dans les Parametres,
seuils des alertes. Seed : Sezam (demo) en IDCC 1501 (journee max 10 h).
Un shift de 10 h 30 est une infraction en 1501 et en « Code du travail »,
pas en HCR (11 h, poste le plus protecteur)."""
from playwright.sync_api import sync_playwright
URL = "http://localhost:3100/shiftmaster-pro/"
res = []
def check(label, ok, extra=""):
    res.append(ok)
    print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

HCR = "Hôtels, cafés, restaurants (HCR) — IDCC 1979"
FAST = "Restauration rapide — IDCC 1501"
CODE = "Code du travail (sans convention)"

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1400, "height": 1000})
    errors = []
    p.on("pageerror", lambda e: errors.append(str(e)))
    p.goto(URL)
    p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }")
    p.reload()
    p.get_by_label("Email").fill("serge@test.fr"); p.get_by_label("Mot de passe").fill("test1234")
    p.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(3800)

    url = p.evaluate("() => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/services/firebaseService.ts'))")
    p.evaluate("""async (url) => {
      const S = await import(url);
      const w = (await S.loadWeeks(['2026-09-13']))['2026-09-13'];
      await S.saveWeekToFirebase('2026-09-13', { ...w, shifts: [...w.shifts,
        { id: 'long1', staffId: 's3', dayIndex: 4, startTime: 10, endTime: 20.5 }] });
    }""", url)
    p.wait_for_timeout(1500)
    body = p.locator("body").inner_text()
    check("IDCC 1501 : le shift de 10 h 30 declenche une alerte, convention nommee", FAST in body, [l for l in body.splitlines() if "IDCC" in l])

    def choose(label):
        p.get_by_role("button", name="Paramètres", exact=True).first.click(); p.wait_for_timeout(500)
        p.get_by_role("radio", name=label).click(); p.wait_for_timeout(1200)
        p.keyboard.press("Escape"); p.wait_for_timeout(800)

    p.get_by_role("button", name="Paramètres", exact=True).first.click(); p.wait_for_timeout(500)
    radios = [p.get_by_role("radio", name=n) for n in (FAST, HCR, CODE)]
    check("Parametres : trois choix de convention", all(r.count() == 1 for r in radios))
    check("... la convention du restaurant est cochee (1501)", radios[0].get_attribute("aria-checked") == "true")
    p.keyboard.press("Escape"); p.wait_for_timeout(300)

    choose(HCR)
    body = p.locator("body").inner_text()
    check("HCR : plus d'alerte pour 10 h 30 (seuil 11 h)", HCR not in body and FAST not in body, [l for l in body.splitlines() if "IDCC" in l])
    p.reload(); p.wait_for_timeout(4200)
    p.get_by_role("button", name="Paramètres", exact=True).first.click(); p.wait_for_timeout(500)
    check("Le choix HCR persiste apres rechargement", p.get_by_role("radio", name=HCR).get_attribute("aria-checked") == "true")
    p.keyboard.press("Escape"); p.wait_for_timeout(300)

    choose(CODE)
    body = p.locator("body").inner_text()
    check("Code du travail : alerte a nouveau (10 h max), nommee sans IDCC", CODE in body, [l for l in body.splitlines() if "travail" in l.lower()][:4])

    # un employe ne voit pas le reglage
    p2 = b.new_context(viewport={"width": 1400, "height": 1000}).new_page()
    p2.goto(URL)
    p2.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }")
    p2.reload()
    p2.get_by_label("Email").fill("omar@test.fr"); p2.get_by_label("Mot de passe").fill("test1234")
    p2.get_by_role("button", name="Se connecter", exact=True).click(); p2.wait_for_timeout(3800)
    p2.get_by_role("button", name="Paramètres", exact=True).first.click(); p2.wait_for_timeout(500)
    check("Employe : pas de reglage de convention", p2.get_by_role("radio", name=HCR).count() == 0)
    check("Aucune erreur JavaScript", not errors, errors[:2])
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
