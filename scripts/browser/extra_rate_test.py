"""Taux horaire par defaut des extras (Parametres -> Couts horaires).

Seed : Omar 16,5 EUR/h (lun 4,5 h + mar 5 h), Double 15 EUR/h (mer 3 h). On ajoute un shift
d'extra de 5 h sans fiche : non chiffre tant qu'aucun taux par defaut n'existe.
"""
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
    p.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(3800)

    url = p.evaluate("() => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/services/firebaseService.ts'))")
    p.evaluate("""async (url) => {
      const S = await import(url);
      const w = (await S.loadWeeks(['2026-09-13']))['2026-09-13'];
      await S.saveWeekToFirebase('2026-09-13', { ...w, shifts: [...w.shifts,
        { id: 'xs1', staffId: 'xtra1', dayIndex: 3, startTime: 18, endTime: 23, extraName: 'Extra 1', extraPending: true }] });
    }""", url)
    p.wait_for_timeout(1500)
    side = lambda: p.locator("body").inner_text()
    euros = [l for l in side().split("\n") if "€" in l]
    check("Sans taux par defaut : total de la semaine partiel, « ≥ 202 € »", "≥ 202\xa0€" in euros, euros)

    p.get_by_role("button", name="Paramètres", exact=True).first.click(); p.wait_for_timeout(500)
    field = p.get_by_label("Extras — coût horaire chargé par défaut")
    check("Parametres : ligne « Extras (par défaut) »", field.count() == 1)
    field.fill("14"); field.press("Enter"); p.wait_for_timeout(1200)
    p.keyboard.press("Escape"); p.wait_for_timeout(800)
    card = p.locator('div[class*="@container"]').filter(has_text="Extra 1")
    txt = card.first.inner_text() if card.count() else ""
    check("Le shift d'extra (5 h) coute 70 € au taux par defaut", "70" in txt and "€" in txt, txt)
    body = side()
    euros = [l for l in body.splitlines() if "€" in l]
    check("Total de la semaine complet : 9,5 x 16,5 + 3 x 15 + 5 x 14 = 271,75 -> « 272 € »",
          "272 €" in euros and not any("≥" in l for l in euros), euros)

    p.reload(); p.wait_for_timeout(4200)
    p.get_by_role("button", name="Paramètres", exact=True).first.click(); p.wait_for_timeout(500)
    check("Le taux par defaut est enregistre (14 apres rechargement)",
          p.get_by_label("Extras — coût horaire chargé par défaut").input_value() == "14")
    check("Aucune erreur JavaScript", not errors, errors[:2])
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
