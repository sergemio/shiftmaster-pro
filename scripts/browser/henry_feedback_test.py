"""Retours d'Henry du 02/10/2026, sur un restaurant neuf (emulateur seulement) :
fuseau en liste courte, visite plus courte, main au survol, « Garder ces horaires »,
clic sur une case vide, confirmation dans le style de l'app, cout horaire dans la fiche."""
from playwright.sync_api import sync_playwright
from settings_ui import open_settings
import time
URL = "http://localhost:3100/shiftmaster-pro/"
res = []
def check(label, ok, extra=""):
    res.append(ok); print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

TS = int(time.time())
EMAIL = f"henry{TS}@test.fr"

with sync_playwright() as pw:
    b = pw.chromium.launch()
    errs = []
    p = b.new_context(viewport={"width": 1400, "height": 950}).new_page()
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(URL); p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }"); p.reload(); p.wait_for_timeout(800)
    f = p.get_by_test_id("auth-form")
    f.get_by_role("button", name="Pas de compte ? En créer un").click()
    f.get_by_label("Prénom et nom").fill("Henry Test"); f.get_by_label("Email").fill(EMAIL); f.get_by_label("Mot de passe").fill("motdepasse8")
    f.get_by_role("button", name="Créer mon compte").click(); p.wait_for_timeout(3500)

    # --- 1. fuseau : liste courte ----------------------------------------------------------
    o = p.get_by_test_id("onboarding")
    tz = o.locator("#onb-tz")
    n_short = tz.locator("option").count()
    check("Fuseau : liste courte (moins de 20 choix) avec « Autre fuseau… »",
          n_short < 20 and "Autre fuseau…" in tz.inner_text(), n_short)
    tz.select_option(label="Autre fuseau…"); p.wait_for_timeout(300)
    check("« Autre fuseau… » deplie la liste complete", tz.locator("option").count() > 100, tz.locator("option").count())
    tz.select_option("Europe/Paris")
    o.get_by_label("Nom du restaurant").fill("Chez Henry"); o.get_by_role("radio").last.click()
    o.get_by_role("button", name="Créer mon restaurant").click(); p.wait_for_timeout(7000)

    # --- 2. visite : textes courts ----------------------------------------------------------
    tour = p.get_by_test_id("tour")
    txt = tour.inner_text() if tour.count() else ""
    check("Visite : 3 puces, sans « Trois gestes »", "1. Ajoutez votre équipe" in txt and "Trois gestes" not in txt, txt[:200])
    # Chaque etape, pas seulement la premiere : le 02/10 une cle brute « tourShiftBody »
    # s'affichait a l'etape 3 sans qu'aucun test ne la voie.
    raw = []
    for _ in range(6):
        if tour.count() == 0: break
        t_txt = tour.inner_text()
        raw += [w for w in t_txt.split() if w.startswith("tour") and any(c.isupper() for c in w)]
        nxt = tour.get_by_role("button", name="Suivant")
        if nxt.count() == 0: break
        nxt.click(); p.wait_for_timeout(600)
    check("Visite : aucune cle de traduction brute a l'ecran", not raw, raw)
    if tour.count():
        p.keyboard.press("Escape"); p.wait_for_timeout(400)

    # --- 3. main au survol ------------------------------------------------------------------
    btn = p.get_by_role("button", name="Gérer l'équipe").first
    check("Bouton : la main au survol", btn.evaluate("e => getComputedStyle(e).cursor") == "pointer")

    # --- 4. horaires d'ouverture : garder ceux par defaut ---------------------------------
    open_settings(p, expand_all=False)
    p.get_by_role("button", name="Heures d'ouverture").click(); p.wait_for_timeout(300)
    keep = p.get_by_role("button", name="Garder ces horaires")
    check("Horaires : bouton « Garder ces horaires »", keep.count() == 1)
    keep.click(); p.wait_for_timeout(1200)
    check("Apres le clic, le bouton disparait (etape cochee)", p.get_by_role("button", name="Garder ces horaires").count() == 0)
    p.keyboard.press("Escape"); p.wait_for_timeout(400)

    # --- 5. s'ajouter, puis cout horaire dans la fiche ------------------------------------
    p.get_by_role("button", name="Gérer l'équipe").first.click(); p.wait_for_timeout(700)
    p.get_by_test_id("self-admin").get_by_role("button", name="M'ajouter comme équipier").click(); p.wait_for_timeout(400)
    # Dirigeant sans contrat : ajoute tout de suite, sans date d'entree, placable tous les jours
    p.get_by_test_id("self-admin").get_by_role("button", name="Non, dirigeant ou associé").click(); p.wait_for_timeout(1500)
    row = p.locator("div.cursor-pointer").filter(has_text="Henry Test").first
    row.click(); p.wait_for_timeout(500)
    rate = p.get_by_label("Coût horaire chargé (€/h)")
    check("Fiche : champ « Coût horaire chargé »", rate.count() == 1)
    rate.fill("16,5")
    row.get_by_role("button", name="Enregistrer", exact=True).first.click(); p.wait_for_timeout(1500)
    row.click(); p.wait_for_timeout(500)
    check("Le cout horaire est garde (16,5)", p.get_by_label("Coût horaire chargé (€/h)").input_value() == "16,5",
          p.get_by_label("Coût horaire chargé (€/h)").input_value())
    p.keyboard.press("Escape"); p.wait_for_timeout(500)

    # --- 6. double-clic sur une case vide -------------------------------------------------
    # Mercredi, deja passe : un dirigeant sans contrat n'a pas de date d'entree, donc pas de blocage
    col = p.get_by_test_id("day-column-2")
    box = col.bounding_box()
    wed = p.locator("button[aria-label='Mercredi'][aria-pressed]")
    # Un simple clic n'ouvre plus rien (Serge, 02/10/2026 : ouvertures par megarde).
    p.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 3); p.wait_for_timeout(800)
    check("Simple clic sur une case vide : rien ne s'ouvre", wed.count() == 0, wed.count())
    p.mouse.dblclick(box["x"] + box["width"] / 2, box["y"] + box["height"] / 3); p.wait_for_timeout(800)
    check("Double-clic sur une case vide : « Ajouter un shift » s'ouvre sur mercredi",
          wed.count() >= 1 and wed.first.get_attribute("aria-pressed") == "true",
          wed.first.get_attribute("aria-pressed") if wed.count() else "pas de bouton Mercredi")
    p.get_by_role("button", name="Ajouter un shift", exact=True).last.click(); p.wait_for_timeout(1500)
    cards = p.get_by_test_id("shift-card")
    check("Le shift est cree", cards.count() == 1, cards.count())

    # --- 6 bis. Shift + glisser duplique ---------------------------------------------------
    c = cards.first.bounding_box()
    thu = p.get_by_test_id("day-column-3").bounding_box()
    sx, sy = c["x"] + c["width"] / 2, c["y"] + c["height"] / 2
    p.keyboard.down("Shift")
    p.mouse.move(sx, sy); p.mouse.down()
    p.mouse.move(sx + 40, sy, steps=4)
    p.mouse.move(thu["x"] + thu["width"] / 2, sy, steps=8)
    check("Pendant le glisser, une copie suit la souris", p.get_by_test_id("shift-copy-ghost").count() == 1)
    p.mouse.up(); p.keyboard.up("Shift"); p.wait_for_timeout(1500)
    xs = sorted(cards.nth(i).bounding_box()["x"] for i in range(cards.count()))
    check("Shift + glisser : deux shifts, l'original reste sur mercredi et la copie va sur jeudi",
          len(xs) == 2 and box["x"] <= xs[0] < box["x"] + box["width"] and thu["x"] <= xs[1] < thu["x"] + thu["width"], xs)
    check("Aucune fenetre ouverte apres la duplication", wed.count() == 0, wed.count())
    # Sans Shift, le meme geste deplace : toujours deux shifts
    c = cards.nth(1).bounding_box(); fri = p.get_by_test_id("day-column-4").bounding_box()
    sx, sy = c["x"] + c["width"] / 2, c["y"] + c["height"] / 2
    p.mouse.move(sx, sy); p.mouse.down()
    p.mouse.move(fri["x"] + fri["width"] / 2, sy, steps=8); p.mouse.up(); p.wait_for_timeout(1500)
    xs = sorted(cards.nth(i).bounding_box()["x"] for i in range(cards.count()))
    check("Sans Shift, le glisser deplace la copie sur vendredi (toujours deux shifts)",
          len(xs) == 2 and fri["x"] <= xs[1] < fri["x"] + fri["width"], xs)

    # --- 6 quater. jours deja tenus dans « Modifier le shift » (Serge, 02/10/2026) ------
    # Henry a maintenant un shift mercredi et un vendredi. On ouvre celui de mercredi.
    xs = [cards.nth(i).bounding_box() for i in range(cards.count())]
    wed_card = min(xs, key=lambda b_: b_["x"])
    p.mouse.click(wed_card["x"] + wed_card["width"] / 2, wed_card["y"] + 10); p.wait_for_timeout(700)
    fri_btn = p.locator("button[aria-label='Vendredi'][aria-pressed]")
    thu_btn = p.locator("button[aria-label='Jeudi'][aria-pressed]")
    check("Modifier : vendredi (deja en shift) est appuye et non cliquable",
          fri_btn.count() == 1 and fri_btn.get_attribute("aria-pressed") == "true" and fri_btn.is_disabled(),
          (fri_btn.get_attribute("aria-pressed"), fri_btn.is_disabled()) if fri_btn.count() else "absent")
    check("Modifier : jeudi (libre) n'est pas appuye et reste cliquable",
          thu_btn.count() == 1 and thu_btn.get_attribute("aria-pressed") == "false" and thu_btn.is_enabled())
    p.keyboard.press("Escape"); p.wait_for_timeout(500)

    # --- 6 quinquies. seul aujourd'hui est en couleur dans l'en-tete des jours ----------
    p.get_by_role("button", name="Semaine suivante").first.click(); p.wait_for_timeout(1500)
    filled = p.locator("div.sticky button div.bg-indigo-600")
    check("Semaine suivante : aucun jour en couleur (avant, le lundi l'etait)", filled.count() == 0, filled.count())
    p.get_by_role("button", name="Semaine précédente").first.click(); p.wait_for_timeout(1500)

    # --- 6 ter. en-tete : la pastille seule, un menu au clic (Serge, 02/10/2026) ----------
    head = p.locator("header").first.inner_text()
    check("En-tete : ni le nom ni « Déconnexion » en clair", "Henry Test" not in head and "Déconnexion" not in head, head[-80:])
    p.get_by_test_id("account-button").click(); p.wait_for_timeout(300)
    menu = p.get_by_test_id("account-menu")
    check("Clic sur la pastille : menu avec le nom, Paramètres et Déconnexion",
          menu.count() == 1 and all(x in menu.inner_text() for x in ("Henry Test", "Paramètres", "Déconnexion")),
          menu.inner_text() if menu.count() else "pas de menu")
    p.mouse.click(700, 500); p.wait_for_timeout(300)
    check("Clic ailleurs : le menu se ferme", p.get_by_test_id("account-menu").count() == 0)

    # --- 7. confirmation dans le style de l'app -------------------------------------------
    p.get_by_title("Voulez-vous vraiment supprimer tous les shifts de cette semaine ?").first.click(); p.wait_for_timeout(500)
    dlg = p.get_by_test_id("confirm-dialog")
    check("Supprimer la semaine : fenetre de l'app (pas celle du navigateur)", dlg.count() == 1)
    dlg.get_by_role("button", name="Annuler").click(); p.wait_for_timeout(500)
    check("Annuler : la fenetre se ferme", p.get_by_test_id("confirm-dialog").count() == 0)
    check("Aucune erreur JavaScript", not errs, errs[:3])
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
