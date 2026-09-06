// Regles de duree du travail, sans navigateur.
//
// Meme code que utils/laborRules.ts, recopie ici faute de pouvoir importer un
// .ts sans etape de compilation — meme convention que les autres tests du depot.

const at = (date, hour) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 3600000 + hour;
};
const addDays = (date, n) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const round2 = n => Math.round(n * 100) / 100;

const violationsForStaff = (shifts, c, window) => {
  const out = [];
  const inWindow = date => !window || (date >= window.from && date <= window.to);
  const sorted = [...shifts].sort((a, b) => at(a.date, a.start) - at(b.date, b.start));
  if (sorted.length === 0) return out;

  const byDate = new Map();
  for (const s of sorted) {
    const list = byDate.get(s.date) || [];
    list.push(s);
    byDate.set(s.date, list);
  }
  for (const [date, list] of byDate) {
    if (!inWindow(date)) continue;
    const total = list.reduce((sum, s) => sum + (s.end - s.start), 0);
    if (total > c.maxDailyHours) {
      out.push({ rule: 'maxDaily', staffId: list[0].staffId, shiftId: list[list.length - 1].id,
                 date, actual: round2(total), required: c.maxDailyHours });
    }
  }

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i];
    if (cur.date === prev.date) continue;
    const gap = at(cur.date, cur.start) - at(prev.date, prev.end);
    if (gap < c.dailyRestHours && inWindow(cur.date)) {
      out.push({ rule: 'dailyRest', staffId: cur.staffId, shiftId: cur.id, otherShiftId: prev.id,
                 date: cur.date, actual: round2(gap), required: c.dailyRestHours });
    }
  }

  const dates = [...byDate.keys()].sort();
  let runStart = 0;
  for (let i = 0; i <= dates.length; i++) {
    // `i > 0` d'abord : sans lui, le premier tour lit dates[-1] et plante.
    const broken = i === dates.length || (i > 0 && dates[i] !== addDays(dates[i - 1], 1));
    if (broken && i > runStart) {
      const run = dates.slice(runStart, i);
      if (run.length > c.maxConsecutiveDays) {
        const firstTooMany = run[c.maxConsecutiveDays];
        if (inWindow(firstTooMany)) {
          out.push({ rule: 'maxConsecutiveDays', staffId: sorted[0].staffId,
                     shiftId: byDate.get(firstTooMany)[0].id, date: firstTooMany,
                     actual: run.length, required: c.maxConsecutiveDays });
        }
      }
      runStart = i;
    }
  }

  if (window) {
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(at(sorted[i].date, sorted[i].start) - at(sorted[i - 1].date, sorted[i - 1].end));
    }
    const first = sorted[0], last = sorted[sorted.length - 1];
    gaps.push(at(first.date, first.start) - at(window.from, 0));
    gaps.push(at(addDays(window.to, 1), 0) - at(last.date, last.end));
    const longest = Math.max(...gaps);
    if (longest < c.weeklyRestHours) {
      out.push({ rule: 'weeklyRest', staffId: first.staffId, date: window.from,
                 actual: round2(longest), required: c.weeklyRestHours });
    }
  }
  return out;
};

const findViolations = (shifts, c, window, pooledStaffIds = []) => {
  const pooled = new Set(pooledStaffIds);
  const byStaff = new Map();
  for (const s of shifts) {
    if (pooled.has(s.staffId)) continue;
    const list = byStaff.get(s.staffId) || [];
    list.push(s);
    byStaff.set(s.staffId, list);
  }
  const out = [];
  for (const list of byStaff.values()) out.push(...violationsForStaff(list, c, window));
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.rule.localeCompare(b.rule));
};

// ---------------------------------------------------------------------------
const RAPIDE = { dailyRestHours: 11, weeklyRestHours: 35, maxDailyHours: 10, maxConsecutiveDays: 6 };
// Lundi 31 aout 2026 -> dimanche 6 septembre 2026.
const LUN = '2026-08-31';
const D = n => addDays(LUN, n);
const SEMAINE = { from: LUN, to: D(6) };

let ko = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) ko++;
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${label.padEnd(58)} ${JSON.stringify(got)}`);
  if (!ok) console.log(`${''.padEnd(64)} attendu ${JSON.stringify(want)}`);
};
const S = (id, day, start, end, staffId = 'p1') => ({ id, staffId, date: D(day), start, end });
/** Un service par jour, assez court pour ne declencher que ce qu'on teste. */
const service = (day, staffId = 'p1') => S(`s${day}${staffId}`, day, 12, 16, staffId);
const rules = v => v.map(x => x.rule);

// ------------------------------------------------------------ repos quotidien
check('11 h de repos pile : conforme',
  rules(violationsForStaff([S('a', 0, 18, 23), S('b', 1, 10, 14)], RAPIDE, SEMAINE)),
  []);

check('9 h de repos : signale',
  violationsForStaff([S('a', 0, 12, 23.5), S('b', 1, 8.5, 12)], RAPIDE, SEMAINE)
    .filter(v => v.rule === 'dailyRest')
    .map(v => [v.actual, v.required, v.shiftId, v.otherShiftId]),
  [[9, 11, 'b', 'a']]);

check('coupure midi/soir le meme jour : pas un repos quotidien',
  rules(violationsForStaff([S('a', 0, 11.5, 15), S('b', 0, 18, 22)], RAPIDE, SEMAINE)),
  []);

// -------------------------------------------------------- duree quotidienne
check('10 h pile : conforme',
  rules(violationsForStaff([S('a', 0, 11, 21)], RAPIDE)),
  []);

check('10 h 30 d un coup : signale',
  violationsForStaff([S('a', 0, 11, 21.5)], RAPIDE).map(v => [v.rule, v.actual, v.required]),
  [['maxDaily', 10.5, 10]]);

check('deux shifts qui totalisent 11 h : signale, badge sur le second',
  violationsForStaff([S('a', 0, 8, 13), S('b', 0, 15, 21)], RAPIDE)
    .map(v => [v.rule, v.actual, v.shiftId]),
  [['maxDaily', 11, 'b']]);

// -------------------------------------------------------- jours consecutifs
check('6 jours d affilee : conforme',
  rules(violationsForStaff([0, 1, 2, 3, 4, 5].map(d => service(d)), RAPIDE, SEMAINE)),
  ['weeklyRest']);   // 6 jours passent, mais il ne reste pas 35 h de repos

check('7 jours d affilee : signale au 7e',
  violationsForStaff([0, 1, 2, 3, 4, 5, 6].map(d => service(d)), RAPIDE, SEMAINE)
    .filter(v => v.rule === 'maxConsecutiveDays')
    .map(v => [v.actual, v.required, v.date]),
  [[7, 6, D(6)]]);

check('serie coupee par un jour off : conforme',
  rules(violationsForStaff([0, 1, 2, 4, 5, 6].map(d => service(d)), RAPIDE, SEMAINE)),
  []);

// ------------------------------------------------------- repos hebdomadaire
// Lundi a jeudi travailles, vendredi soir, samedi off, dimanche matin. Le seul
// repos candidat est donc bien le creux vendredi -> dimanche.
const SEMAINE_PLEINE = [0, 1, 2, 3].map(d => service(d));

check('vendredi 23 h 30 -> dimanche 9 h : 33 h 30, signale malgre le samedi vide',
  violationsForStaff([...SEMAINE_PLEINE, S('a', 4, 18, 23.5), S('b', 6, 9, 14)], RAPIDE, SEMAINE)
    .filter(v => v.rule === 'weeklyRest').map(v => [v.actual, v.required]),
  [[33.5, 35]]);

check('meme cas avec reprise a 11 h : 35 h 30, conforme',
  rules(violationsForStaff([...SEMAINE_PLEINE, S('a', 4, 18, 23.5), S('b', 6, 11, 14)], RAPIDE, SEMAINE)),
  []);

check('semaine sans aucun repos de 35 h : signale',
  violationsForStaff([0, 1, 2, 3, 4, 5].map(d => service(d)), RAPIDE, SEMAINE)
    .filter(v => v.rule === 'weeklyRest').map(v => [v.actual, v.required]),
  [[32, 35]]);

check('un seul jour travaille : conforme (les bords de semaine comptent)',
  rules(violationsForStaff([S('a', 2, 12, 16)], RAPIDE, SEMAINE)),
  []);

check('sans fenetre : le repos hebdomadaire n est pas evalue',
  rules(violationsForStaff([0, 1, 2, 3, 4, 5, 6].map(d => service(d)), RAPIDE)),
  ['maxConsecutiveDays']);

// ------------------------------------------- shifts hors fenetre : calcul oui,
// alerte non. Une semaine voisine sert a voir le repos du lundi matin, elle ne
// doit pas remonter ses propres problemes.
check('le repos du lundi voit le dimanche precedent',
  violationsForStaff([S('x', -1, 18, 23.5), S('a', 0, 8, 12)], RAPIDE, SEMAINE)
    .filter(v => v.rule === 'dailyRest').map(v => [v.actual, v.date]),
  [[8.5, D(0)]]);

check('un depassement hors fenetre ne remonte pas',
  rules(violationsForStaff([S('x', -1, 8, 20)], RAPIDE, SEMAINE)),
  []);

// ------------------------------------------------------------- lignes partagees
const AVEC_EXTRA = [
  S('e1', 0, 12, 23.5, 'extra'),
  S('e2', 1, 8, 12, 'extra'),
  S('n1', 0, 12, 23.5, 'nina'),
  S('n2', 1, 8, 12, 'nina'),
];
check('sans exclusion : les deux lignes remontent',
  findViolations(AVEC_EXTRA, RAPIDE, SEMAINE).filter(v => v.rule === 'dailyRest').map(v => v.staffId).sort(),
  ['extra', 'nina']);

check('ligne partagee exclue : seule la personne reelle remonte',
  findViolations(AVEC_EXTRA, RAPIDE, SEMAINE, ['extra']).filter(v => v.rule === 'dailyRest').map(v => v.staffId),
  ['nina']);

// ------------------------------------------------------------------- divers
check('aucun shift : rien a signaler',
  findViolations([], RAPIDE, SEMAINE), []);

check('deux personnes ne se melangent pas',
  findViolations([S('a', 0, 12, 23.5, 'p1'), S('b', 1, 8, 12, 'p2')], RAPIDE, SEMAINE)
    .filter(v => v.rule === 'dailyRest'),
  []);

console.log(ko === 0 ? '\nTOUT PASSE' : `\n${ko} ECHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
