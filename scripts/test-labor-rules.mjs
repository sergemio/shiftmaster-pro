// Regles de duree du travail, sans navigateur.
//
// Meme code que utils/laborRules.ts, recopie ici faute de pouvoir importer un
// .ts sans etape de compilation — meme convention que les autres tests du depot.

import { loadTs } from './load-ts.mjs';
// Le VRAI moteur (utils/laborRules.ts), plus aucune copie : voir load-ts.mjs.
const { violationsForStaff, findViolations } = await loadTs('utils/laborRules.ts');
const { addDaysIso: addDays } = await loadTs('utils/helpers.ts');
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
