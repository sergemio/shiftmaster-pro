import json, subprocess
from playwright.sync_api import sync_playwright

URL = "http://localhost:3100/shiftmaster-pro/"
REPO = r"C:\Users\serge\Claude\topics\shift-master-saas"
import tempfile
DIR = tempfile.gettempdir()  # captures d'ecran : hors du depot

results = []
def check(label, ok, extra=""):
    results.append(ok)
    print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if extra and not ok else ""))

def emulator(code):
    full = "process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';\n" \
           "const {initializeApp}=await import('firebase-admin/app');const {getFirestore}=await import('firebase-admin/firestore');\n" \
           "initializeApp({projectId:'demo-shiftmaster'});const db=getFirestore();\n" + code
    out = subprocess.run(["node", "--input-type=module", "-e", full], cwd=REPO, capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(out.stderr[-500:])
    return json.loads(out.stdout.strip().splitlines()[-1])

def login(browser, email):
    ctx = browser.new_context(viewport={"width": 1500, "height": 950})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL)
    page.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); localStorage.setItem('shiftmaster_view','day'); }")
    page.reload()
    page.get_by_label("Email").fill(email)
    page.get_by_label("Mot de passe").fill("test1234")
    page.get_by_role("button", name="Connexion emulateur").click()
    page.wait_for_timeout(3500)
    return ctx, page, errors

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # --- admin : cree un shift d'extra nomme, puis un anonyme
    ctx, p, err = login(b, "serge@test.fr")
    p.get_by_role("button", name="Ajouter Shift").first.click()
    p.wait_for_timeout(500)
    check("Le modal propose « Salarié » et « Extra »",
          p.get_by_role("button", name="Extra", exact=True).count() == 1 and p.get_by_role("button", name="Salarié").count() == 1)
    p.get_by_role("button", name="Extra", exact=True).click()
    p.wait_for_timeout(300)
    check("En mode extra, le choix du salarié disparaît", p.get_by_label("Qui vient ?").count() == 1)
    p.get_by_label("Qui vient ?").fill("Monique")
    p.locator("form button[type=submit]").click()
    p.wait_for_timeout(2500)
    t = p.inner_text("body")
    check("Le prénom de l extra apparaît sur le planning", "Monique" in t)

    fiche = emulator("""const s=await db.collection('orgs/sezam/extras').get();
      const out=[];s.forEach(d=>out.push({id:d.id,...d.data()}));
      const w=await db.collection('orgs/sezam/weeks').get();
      const shifts=[];w.forEach(d=>(d.data().shifts||[]).forEach(x=>shifts.push(x)));
      console.log(JSON.stringify({extras:out, extraShifts:shifts.filter(x=>x.extraName)}));""")
    check("Une fiche d extra est créée dans le vivier", len(fiche["extras"]) == 1, json.dumps(fiche["extras"]))
    e0 = fiche["extras"][0] if fiche["extras"] else {}
    check("La fiche porte le prénom saisi", e0.get("firstName") == "Monique", json.dumps(e0))
    check("La fiche est retenue par défaut", e0.get("retained") is True)
    check("La fiche est en attente de remplissage", e0.get("filledAt") is None)
    check("La fiche porte la date de la mission", bool(e0.get("lastMission")), json.dumps(e0))
    check("Le shift porte le prénom et l identifiant de la fiche",
          len(fiche["extraShifts"]) == 1 and fiche["extraShifts"][0]["extraName"] == "Monique"
          and fiche["extraShifts"][0]["staffId"] == e0.get("id"), json.dumps(fiche["extraShifts"]))

    # un extra anonyme : « Extra 1 »
    p.get_by_role("button", name="Ajouter Shift").first.click()
    p.wait_for_timeout(500)
    p.get_by_role("button", name="Extra", exact=True).click()
    p.wait_for_timeout(300)
    p.locator("form button[type=submit]").click()
    p.wait_for_timeout(2500)
    check("Sans prénom, le shift s appelle « Extra 1 »", "Extra 1" in p.inner_text("body"))

    # reprendre quelqu'un du vivier, sans retaper
    p.get_by_role("button", name="Ajouter Shift").first.click()
    p.wait_for_timeout(500)
    p.get_by_role("button", name="Extra", exact=True).click()
    p.wait_for_timeout(300)
    picker = p.get_by_role("button", name="Reprendre un extra déjà connu")
    check("Le bouton « reprendre un extra connu » est proposé", picker.count() == 1)
    if picker.count() == 1:
        picker.click(); p.wait_for_timeout(300)
        p.get_by_role("button", name="Monique").click()
        p.wait_for_timeout(200)
        check("Le prénom est repris du vivier", p.get_by_label("Qui vient ?").input_value() == "Monique")
        p.locator("form button[type=submit]").click()
        p.wait_for_timeout(2500)
        after = emulator("""const s=await db.collection('orgs/sezam/extras').get();console.log(JSON.stringify({n:s.size}));""")
        check("Reprendre quelqu un du vivier ne crée pas de doublon", after["n"] == 2, json.dumps(after))

    check("Admin : aucune erreur JavaScript", not err, "; ".join(err))
    p.screenshot(path=DIR + r"\extras_admin.png")
    ctx.close()

    # --- employe : voit le prenom, pas la fiche
    ctx, p, err = login(b, "omar@test.fr")
    t = p.inner_text("body")
    check("L employé voit le prénom de l extra sur le planning", "Monique" in t)
    check("L employé ne voit aucun coût", "€" not in t)
    check("L employé : aucun bandeau d erreur (lecture du vivier jamais tentée)",
          p.locator(".bg-red-50.border-b-2").count() == 0)
    check("Employé : aucune erreur JavaScript", not err, "; ".join(err))
    ctx.close()
    b.close()

print("\nTOUT PASSE" if all(results) else f"\n{results.count(False)} ECHEC(S)")
