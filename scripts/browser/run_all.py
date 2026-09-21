"""Lance toutes les suites navigateur, avec des donnees de demonstration neuves
entre chacune, et affiche un tableau a la fin.

    python scripts/browser/run_all.py            # tout
    python scripts/browser/run_all.py paie       # celles dont le nom contient « paie »

Pourquoi ce fichier : les suites etaient lancees a la main, une par une. Le
20/09/2026, 32 controles sont tombes sans que personne le voie pendant trois
jours — il n'existait aucune commande qui reponde « tout va bien » ou « voila ce
qui casse ». Prerequis : les emulateurs et le serveur de developpement tournent
(`node scripts/emulators.mjs start`, `npx vite --mode emulator --port 3100`).
"""
import os
import re
import subprocess
import sys
import time

BROWSER = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(BROWSER))
NODE = os.environ.get('NODE_BIN', 'node')
FILTRE = sys.argv[1] if len(sys.argv) > 1 else ''

suites = sorted(f for f in os.listdir(BROWSER) if f.endswith('_test.py') and FILTRE in f)
if not suites:
    print(f"Aucune suite ne correspond a « {FILTRE} ».")
    sys.exit(1)

env = dict(os.environ, PYTHONIOENCODING='utf-8')
resultats = []
for f in suites:
    nom = f[:-3]
    subprocess.run([NODE, 'scripts/seed-emulator.mjs'], cwd=ROOT, capture_output=True)
    t0 = time.time()
    r = subprocess.run([sys.executable, os.path.join(BROWSER, f)], cwd=ROOT,
                       capture_output=True, text=True, env=env, errors='replace')
    sortie = (r.stdout or '') + (r.stderr or '')
    echecs = [l for l in sortie.splitlines() if l.startswith('ECHEC')]
    passes = sum(1 for l in sortie.splitlines() if l.startswith('OK'))
    plante = 'TOUT PASSE' not in sortie and not echecs
    resultats.append((nom, passes, echecs, plante, time.time() - t0))
    etat = 'PLANTE' if plante else (f"{len(echecs)} ECHEC(S)" if echecs else 'ok')
    print(f"{nom:<26} {passes:>3} controles   {etat}")
    if plante:
        print('   ' + '\n   '.join(sortie.strip().splitlines()[-4:]))
    for l in echecs:
        print('   ' + l)

total = sum(p for _, p, _, _, _ in resultats)
casses = [n for n, _, e, pl, _ in resultats if e or pl]
duree = sum(d for *_, d in resultats)
print(f"\n{len(suites)} suites, {total} controles, {duree / 60:.1f} min")
print("TOUT PASSE" if not casses else f"A REPRENDRE : {', '.join(casses)}")
sys.exit(1 if casses else 0)
