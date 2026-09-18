"""Service des absences par periode, joue dans le navigateur contre l'emulateur.

Le module est importe depuis le serveur Vite : c'est la MEME instance que
l'application (meme org courante, meme connexion), donc le vrai code.
"""
from playwright.sync_api import sync_playwright
URL = "http://localhost:3100/shiftmaster-pro/"
res = []
def check(label, ok, extra=""):
    res.append(ok)
    print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if extra and not ok else ""))

def login(p, email):
    p.goto(URL)
    p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }")
    p.reload()
    p.get_by_label("Email").fill(email); p.get_by_label("Mot de passe").fill("test1234")
    p.get_by_role("button", name="Se connecter", exact=True).click()
    p.wait_for_timeout(3800)

# L'app charge le module avec un suffixe ?t=... : l'importer sans lui donnerait
# une DEUXIEME instance, sans org courante. On reprend l'URL exacte de l'app.
SVC = "await import(performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/services/firebaseService.ts')))"

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page()
    errors = []
    p.on("pageerror", lambda e: errors.append(str(e)))
    login(p, "serge@test.fr")

    r = p.evaluate("""async () => {
      const S = %s;
      const before = await S.loadWeeks(['2026-09-13', '2026-09-20']);
      const nShiftsBefore = (before['2026-09-13']?.shifts || []).length;
      const P = {
        id: 'p1', staffId: 's2', staffUid: 'uid-omar', kind: 'maladie',
        start: '2026-09-19', end: '2026-09-22', daysCounted: 2, hoursLost: 14,
        justificatif: 'received', weekIds: ['2026-09-13', '2026-09-20'],
        createdAt: 't', createdBy: 'uid-serge', updatedAt: 't', note: undefined, half: undefined,
      };
      await S.saveAbsenceChanges([{ period: P, previous: null }]);
      const w1 = await S.loadWeeks(['2026-09-13', '2026-09-20']);
      const a13 = w1['2026-09-13'].absences.filter(a => a.periodId === 'p1');
      const a20 = (w1['2026-09-20']?.absences || []).filter(a => a.periodId === 'p1');

      // Modification : la periode raccourcit a un jour -> la semaine suivante se vide.
      const P2 = { ...P, end: '2026-09-19', weekIds: ['2026-09-13'], daysCounted: 1, hoursLost: 6 };
      await S.saveAbsenceChanges([{ period: P2, previous: P }]);
      const w2 = await S.loadWeeks(['2026-09-13', '2026-09-20']);

      // Brouillon ouvert sur la semaine du 20 AVANT une nouvelle saisie.
      await S.saveDraft('2026-09-20', { shifts: [], absences: [], holidays: [], baseUpdatedAt: null });
      const P3 = { ...P, id: 'p3', kind: 'cp', start: '2026-09-21', end: '2026-09-22', weekIds: ['2026-09-20'] };
      await S.saveAbsenceChanges([{ period: P3, previous: null }]);
      // Le premier instantane peut venir du cache local (le brouillon tel que
      // saveDraft l'a ecrit) : on attend la version qui porte la transaction.
      const draft = await new Promise(res => {
        let last = null;
        const off = S.subscribeToDraft('2026-09-20', d => { last = d; if (d && d.baseUpdatedAt) { res(d); setTimeout(off, 0); } });
        setTimeout(() => { res(last); off(); }, 4000);
      });
      const week20 = await S.exportWeeksData(['2026-09-20']);

      // Suppression : plus aucune trace, ni dans la semaine ni dans le brouillon.
      await S.deleteAbsencePeriod(P3);
      const w3 = await S.loadWeeks(['2026-09-20']);
      const draftAfter = await new Promise(res => {
        let last = null;
        const off = S.subscribeToDraft('2026-09-20', d => { last = d; if (d && !d.absences.some(a => a.periodId === 'p3')) { res(d); setTimeout(off, 0); } });
        setTimeout(() => { res(last); off(); }, 4000);
      });

      const periods = await new Promise(res => { const off = S.subscribeToAbsencePeriods(true, ps => { res(ps); setTimeout(off, 0); }); });
      return {
        nShiftsBefore, nShiftsAfter: w2['2026-09-13'].shifts.length,
        a13: a13.map(a => [a.dayIndex, a.kind]), a20: a20.map(a => [a.dayIndex, a.kind]),
        a20AfterShrink: (w2['2026-09-20']?.absences || []).filter(a => a.periodId === 'p1').length,
        a13AfterShrink: w2['2026-09-13'].absences.filter(a => a.periodId === 'p1').map(a => a.dayIndex),
        draftAbs: draft.absences.filter(a => a.periodId === 'p3').map(a => [a.dayIndex, a.kind]),
        draftBase: draft.baseUpdatedAt, weekStamp: week20['2026-09-20'].updatedAt,
        w3: (w3['2026-09-20']?.absences || []).filter(a => a.periodId === 'p3').length,
        draftAfter: draftAfter.absences.filter(a => a.periodId === 'p3').length,
        periodIds: Object.keys(periods).sort(), p1: periods.p1,
      };
    }""" % SVC)

    check("Enregistrer un arret ne touche pas aux shifts de la semaine",
          r["nShiftsBefore"] == r["nShiftsAfter"], f'{r["nShiftsBefore"]} -> {r["nShiftsAfter"]}')
    check("Arret du sam 19 au mar 22 : samedi et dimanche projetes dans la 1re semaine",
          r["a13"] == [[5, "absent"], [6, "absent"]], r["a13"])
    check("... lundi et mardi dans la semaine suivante", r["a20"] == [[0, "absent"], [1, "absent"]], r["a20"])
    check("L equipe voit « absent », jamais « maladie »",
          all(k == "absent" for _, k in r["a13"] + r["a20"]))
    check("Raccourcir la periode retire la projection de la semaine qu elle ne couvre plus",
          r["a20AfterShrink"] == 0, r["a20AfterShrink"])
    check("... et ne garde que le samedi dans la premiere", r["a13AfterShrink"] == [5], r["a13AfterShrink"])
    check("Un brouillon ouvert recoit aussi la projection (sinon sa publication l effacerait)",
          r["draftAbs"] == [[0, "conge"], [1, "conge"]], r["draftAbs"])
    check("Le brouillon reste aligne sur la semaine (pas de faux conflit a la publication)",
          r["draftBase"] == r["weekStamp"], f'{r["draftBase"]} vs {r["weekStamp"]}')
    check("Supprimer la periode l efface de la semaine", r["w3"] == 0, r["w3"])
    check("... et du brouillon", r["draftAfter"] == 0, r["draftAfter"])
    check("La periode enregistree est relue telle quelle", r["periodIds"] == ["p1"], r["periodIds"])
    check("Les champs vides ne sont pas ecrits (ni note ni demi-journee a null)",
          "note" not in r["p1"] and "half" not in r["p1"], list(r["p1"].keys()))
    check("Admin : aucune erreur JavaScript", not errors, errors[:1])

    # --- Omar : ne lit que ses propres periodes -----------------------------
    p2 = b.new_page()
    err2 = []
    p2.on("pageerror", lambda e: err2.append(str(e)))
    login(p2, "omar@test.fr")
    r2 = p2.evaluate("""async () => {
      const S = %s;
      const mine = await new Promise(res => { const off = S.subscribeToAbsencePeriods(false, ps => { res(ps); setTimeout(off, 0); }); });
      const w = await S.loadWeeks(['2026-09-13']);
      return { mine: Object.keys(mine), kinds: w['2026-09-13'].absences.map(a => a.kind) };
    }""" % SVC)
    check("Omar lit sa propre periode d arret", r2["mine"] == ["p1"], r2["mine"])
    check("Dans la semaine, Omar voit « absent »", r2["kinds"] == ["absent"], r2["kinds"])
    check("Omar : aucune erreur JavaScript ni bandeau de refus", not err2, err2[:1])
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
