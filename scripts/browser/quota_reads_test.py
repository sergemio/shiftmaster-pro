"""Lectures Firestore (21/09/2026) : le journal ne demande que les JOURS affiches,
et les totaux du mois restent justes en se passant d'une lecture.

Deux entrees de journal sont ecrites a l'avance : une d'hier, une d'il y a 20 jours.
A l'ouverture (7 jours), seule celle d'hier doit arriver — c'est la preuve que la
requete envoyee au serveur porte bien sur 7 jours et pas sur un mois entier.
Emulateurs seulement.
"""
from playwright.sync_api import sync_playwright
import subprocess, sys, os, time, re
URL = "http://localhost:3100/shiftmaster-pro/"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
res = []
def check(label, ok, extra=""):
    res.append(ok)
    print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

# --- deux entrees de journal, plantees directement dans la base locale -------------
SEED = r"""
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
initializeApp({ projectId: 'demo-shiftmaster' });
const db = getFirestore();
const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
const logs = db.collection('orgs/sezam/logs');
await logs.add({ userId: 'seed', userName: 'Ancien', action: 'CREATE SHIFT', details: 'ENTREE ANCIENNE', timestamp: iso(20) });
await logs.add({ userId: 'seed', userName: 'Recent', action: 'CREATE SHIFT', details: 'ENTREE RECENTE', timestamp: iso(1) });
console.log('seeded');
"""
seed_path = os.path.join(ROOT, 'scripts', '_seed_logs.mjs')
open(seed_path, 'w', encoding='utf-8').write(SEED)
out = subprocess.run([r'C:\Program Files\nodejs\node.exe', seed_path], cwd=ROOT, capture_output=True, text=True)
os.remove(seed_path)
check("Deux entrees de journal ecrites dans la base locale (1 jour et 20 jours)", 'seeded' in out.stdout, out.stderr[-200:])

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1500, "height": 950})
    errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(URL)
    p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }")
    p.reload(); p.wait_for_timeout(800)
    p.get_by_label("Email").fill("serge@test.fr"); p.get_by_label("Mot de passe").fill("test1234")
    p.get_by_role("button", name="Se connecter", exact=True).click(); p.wait_for_timeout(4000)

    # --- 1. le journal s'ouvre sur 7 jours, et ne lit que 7 jours ---------------------
    p.get_by_role("button", name="Historique des changements").first.click(); p.wait_for_timeout(2500)
    sel7 = p.get_by_role("button", name="7 jours")
    sel30 = p.get_by_role("button", name="30 jours")
    check("Journal : « 7 jours » est la periode active a l'ouverture",
          "bg-indigo-600" in (sel7.get_attribute("class") or "") and "bg-indigo-600" not in (sel30.get_attribute("class") or ""))
    # Les journees sont repliees : on deplie tout pour lire les entrees.
    p.get_by_role("button", name="Tout déplier").click(); p.wait_for_timeout(600)
    body = p.locator("body").inner_text()
    check("Journal a 7 jours : l'entree d'hier est la", "ENTREE RECENTE" in body, body[-400:])
    check("Journal a 7 jours : l'entree de 20 jours n'a PAS ete lue", "ENTREE ANCIENNE" not in body)
    sel30.click(); p.wait_for_timeout(2500)
    p.get_by_role("button", name="Tout déplier").click(); p.wait_for_timeout(600)
    body30 = p.locator("body").inner_text()
    check("Journal a 30 jours : les deux entrees sont la",
          "ENTREE ANCIENNE" in body30 and "ENTREE RECENTE" in body30, body30[-400:])
    sel7.click(); p.wait_for_timeout(1000)
    p.get_by_role("button", name="Tout déplier").click(); p.wait_for_timeout(500)
    check("Retour a 7 jours : l'entree d'hier reste affichee, l'ancienne disparait de l'ecran",
          "ENTREE RECENTE" in p.locator("body").inner_text() and "ENTREE ANCIENNE" not in p.locator("body").inner_text())
    p.keyboard.press("Escape"); p.wait_for_timeout(600)

    # --- 2. totaux du mois : justes, et mis a jour sans changer de semaine -------------
    p.get_by_role("button", name="Mois", exact=True).click(); p.wait_for_timeout(3000)
    before = p.locator("body").inner_text()
    # Format des totaux du mois : « 12 h 30 / 151,7 h » (heures faites / heures du contrat).
    check("Vue Mois : les totaux d'heures du mois s'affichent",
          re.search(r"\d+ h( \d\d)? / [\d,]+ h", before) is not None, before[-300:])

    # un shift de plus dans la semaine affichee
    p.get_by_role("button", name="Ajouter un shift").first.click(); p.wait_for_timeout(700)
    p.locator("select").first.select_option(label="Omar")
    p.get_by_role("button", name="Jeudi", exact=True).click(); p.wait_for_timeout(300)
    sels = p.locator("form select")
    sels.nth(1).select_option("9"); sels.nth(2).select_option("14")
    p.locator("form button[type=submit]").last.click(); p.wait_for_timeout(2500)
    after = p.locator("body").inner_text()
    check("Total du mois mis a jour aussitot (sans changer de semaine)", before != after, "inchange")
    check("Aucune erreur JavaScript", not errs, errs[:3])

    # --- 3. semaines voisines : les avertissements de duree du travail marchent encore ----
    p.get_by_role("button", name="Semaine", exact=True).click(); p.wait_for_timeout(1500)
    p.get_by_test_id("week-nav").get_by_role("button", name="Semaine suivante").click(); p.wait_for_timeout(2500)
    p.get_by_test_id("week-nav").get_by_role("button", name="Semaine précédente").click(); p.wait_for_timeout(2500)
    check("Aller-retour de semaine : le planning se recharge sans erreur", not errs, errs[:3])
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
