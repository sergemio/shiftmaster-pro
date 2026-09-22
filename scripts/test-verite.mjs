/**
 * JEU DE VERITE — des plannings dont la bonne reponse est calculee A LA MAIN,
 * confrontes au VRAI code de l'application (compile a la volee par esbuild).
 *
 * Pourquoi (audit du 22/09/2026, docs/audit-calculs.md) : « combien d'heures a
 * travaille cette personne » avait huit definitions, et quinze tests sur dix-huit
 * testaient une COPIE de la formule : ils passaient quoi que fasse l'app. Ici,
 * chaque attendu est ecrit en toutes lettres, avec son calcul en commentaire ;
 * si l'app donne un autre chiffre, le test echoue.
 *
 * Regles appliquees (decisions de Serge du 22/09/2026) : chevauchement compte
 * une fois ; pause retiree ; remplacant credite ; fin possible jusqu'a 6 h,
 * rattachee au jour de debut ; contrat mensuel = hebdo x 52 / 12.
 *
 *   node scripts/test-verite.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'verite-'));
const load = async (entry) => {
  const out = join(dir, entry.replace(/\W/g, '_') + '.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
};
const W = await load('utils/worktime.ts');
const { payrollVariables } = await load('utils/payroll.ts');
const { violationsForStaff, CONVENTIONS } = await load('utils/laborRules.ts');
const { monthlyContractHours, findOverlappingShiftIds } = await load('utils/helpers.ts');
const { violationText } = await load('utils/violationText.ts');
rmSync(dir, { recursive: true, force: true });

let ko = 0, n = 0;
const near = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : JSON.stringify(a) === JSON.stringify(b);
const check = (label, got, want) => {
  n++;
  const ok = near(got, want);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${ok ? '' : `  -> obtenu ${JSON.stringify(got)}, attendu ${JSON.stringify(want)}`}`);
};

// Semaine de reference : lundi 21 -> dimanche 27 septembre 2026. weekId = dimanche 20.
const WEEK = '2026-09-20';
const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4;
let seq = 0;
const sh = (staffId, dayIndex, startTime, endTime, extra = {}) => ({ id: 's' + (++seq), staffId, dayIndex, startTime, endTime, ...extra });
const week = (shifts) => W.datedWeek(WEEK, shifts);
const hours = (shifts, who) => W.hoursByWorker(week(shifts))[who] || 0;
const staff = [
  { id: 'omar', name: 'Omar', contractHours: 35 },
  { id: 'julie', name: 'Julie', contractHours: 24 },
  { id: 'alice', name: 'Alice', contractHours: 35 },
  { id: 'bob', name: 'Bob', contractHours: 35 },
];
const pay = (shifts) => payrollVariables('2026-09', staff, { [WEEK]: shifts }, [], () => 0);
const line = (pm, id) => pm.lines.find(l => l.staffId === id);
const rules = (shifts, conv = '1501') => {
  const dated = week(shifts).map(({ shift: s, date }) => ({
    id: s.id, staffId: W.workerOf(s), date, start: s.startTime, end: s.endTime,
    ...(s.breakMinutes ? { breakStart: s.breakStart, breakMinutes: s.breakMinutes } : {}),
  }));
  return violationsForStaff(dated, CONVENTIONS[conv], { from: '2026-09-21', to: '2026-09-27' })
    .map(v => `${v.rule} ${v.actual}`);
};
const both = (label, shifts, who, want) => {
  // Invariant : barre laterale, vue employe, Ma semaine (hoursByWorker) et paie
  // (payrollVariables) donnent le MEME chiffre.
  check(`${label} — ecrans`, hours(shifts, who), want);
  check(`${label} — paie`, line(pay(shifts), who)?.worked ?? 0, Math.round(want * 100) / 100);
};

// --- V1 Semaine simple --------------------------------------------------------
// 5 x (17 - 10) = 35 h ; 35 h x 15 EUR = 525 EUR ; contrat 35 h : 0 h sup.
const v1 = [MON, TUE, WED, THU, FRI].map(d => sh('omar', d, 10, 17));
both('V1 lun-ven 10-17', v1, 'omar', 35);
check('V1 cout a 15 EUR/h', W.workCost(week(v1), { omar: 15 }).total, 525);
check('V1 aucune heure sup', line(pay(v1), 'omar').weeks, []);
// 7 h d'un seul tenant, sans pause : au-dela de 6 h continues, la pause de
// 20 min manque (L3121-16), chaque jour. Rien d'autre.
check('V1 seule alerte : pause manquante, 5 jours', rules(v1), Array(5).fill('breakRequired 7'));

// --- V2 Pause de 30 min -------------------------------------------------------
// 10-18 = 8 h, moins 30 min = 7,5 h ; x 5 = 37,5 h ; 37,5 - 35 = 2,5 h sup.
// Cout : 37,5 x 15 = 562,50 EUR.
const v2 = [MON, TUE, WED, THU, FRI].map(d => sh('omar', d, 10, 18, { breakStart: 14, breakMinutes: 30 }));
both('V2 lun-ven 10-18 pause 30 min', v2, 'omar', 37.5);
check('V2 carte : 7,5 h par shift', W.shiftWorkHours(v2[0]), 7.5);
check('V2 cout', W.workCost(week(v2), { omar: 15 }).total, 562.5);
check('V2 heures sup', line(pay(v2), 'omar').weeks.map(w => [w.extra, w.kind]), [[2.5, 'supplementaires']]);

// --- V3 Doublon ---------------------------------------------------------------
// 10 h 30 - 16 h 30 et 11 h 30 - 17 h 30 : presence de 10 h 30 a 17 h 30 = 7 h.
// Cout : 7 x 15 = 105 EUR (et non 12 x 15 = 180).
const v3 = [sh('omar', MON, 10.5, 16.5), sh('omar', MON, 11.5, 17.5)];
both('V3 doublon le meme lundi', v3, 'omar', 7);
check('V3 cout', W.workCost(week(v3), { omar: 15 }).total, 105);
// 7 h de presence d'un seul tenant (10 h 30 - 17 h 30) : pas de depassement
// de journee (le doublon ne fait pas 12 h), mais pas de pause.
check('V3 pas de journee de 12 h ; pause manquante', rules(v3), ['breakRequired 7']);

// --- V4 Coupure puis reprise matinale ----------------------------------------
// Lundi 11-15 + 18-23 = 4 + 5 = 9 h ; mardi 9-14 = 5 h ; total 14 h.
// Repos : 23 h -> 9 h = 10 h < 11 h : alerte repos quotidien 10.
const v4 = [sh('omar', MON, 11, 15), sh('omar', MON, 18, 23), sh('omar', TUE, 9, 14)];
both('V4 coupure + reprise', v4, 'omar', 14);
check('V4 alerte repos 10 h', rules(v4), ['dailyRest 10']);

// --- V5 Fin apres minuit ------------------------------------------------------
// Lundi 18 h -> 1 h (stocke 25) = 7 h, comptees le lundi ; mardi 10-15 = 5 h.
// Repos : 1 h -> 10 h = 9 h < 11 h : alerte 9.
const v5 = [sh('omar', MON, 18, 25), sh('omar', TUE, 10, 15)];
both('V5 18 h - 1 h + mardi', v5, 'omar', 12);
check('V5 les 7 h comptent le lundi', W.hoursByWorkerDate(week(v5)).get('omar').get('2026-09-21'), 7);
// 18 h - 1 h d'un seul tenant (7 h) : pause manquante ; repos 1 h -> 10 h = 9 h.
check('V5 alertes : pause, repos 9 h', rules(v5), ['breakRequired 7', 'dailyRest 9']);
check('V5 cout', W.workCost(week(v5), { omar: 15 }).total, 180);

// --- V6 Remplacement ----------------------------------------------------------
// Alice mer 9-13 (4 h) + reprend le shift de Bob 14-20 (6 h) = 10 h. Bob : 0 h.
// Cout au taux de celle qui travaille : 10 x 20 = 200 EUR.
const v6 = [sh('alice', WED, 9, 13), sh('bob', WED, 14, 20, { coverageBy: 'alice' })];
both('V6 Alice remplace Bob', v6, 'alice', 10);
check('V6 Bob : 0 h', hours(v6, 'bob'), 0);
check('V6 cout', W.workCost(week(v6), { alice: 20, bob: 12 }).total, 200);

// --- V7 Remplacant qui chevauche son propre shift ----------------------------
// Alice 10-16 + reprend Bob 14-20 : presente de 10 h a 20 h = 10 h (pas 12).
const v7 = [sh('alice', WED, 10, 16), sh('bob', WED, 14, 20, { coverageBy: 'alice' })];
both('V7 remplacement chevauchant', v7, 'alice', 10);

// --- V8 Pause de 20 minutes ---------------------------------------------------
// 9-17 = 480 min, moins 20 = 460 min = 7 h 40 = 7,666... h ; paie : 7,67.
// Cout : 460 x 15 / 60 = 115 EUR.
const v8 = [sh('omar', MON, 9, 17, { breakStart: 12.5, breakMinutes: 20 })];
both('V8 pause 20 min', v8, 'omar', 460 / 60);
check('V8 cout', W.workCost(week(v8), { omar: 15 }).total, 115);

// --- V9 Temps partiel ---------------------------------------------------------
// Julie, 24 h : lun-jeu 10-17 = 28 h -> 4 h complementaires ; dixieme = 2,4 h ;
// au-dela du dixieme : 1,6 h ; 35 h non atteintes.
const v9 = [MON, TUE, WED, THU].map(d => sh('julie', d, 10, 17));
both('V9 temps partiel 28 h', v9, 'julie', 28);
check('V9 complementaires', line(pay(v9), 'julie').weeks.map(w => [w.extra, w.kind, w.beyondTenth, w.reachesLegal]),
  [[4, 'complementaires', 1.6, false]]);

// --- V10 Contrat mensuel ------------------------------------------------------
// 35 x 52 / 12 = 151,666... -> paie 151,67, ecran 151,7. 24 x 52 / 12 = 104.
check('V10 base mensuelle 35 h (paie)', line(pay(v1), 'omar').monthlyBase, 151.67);
check('V10 base mensuelle 35 h (ecran)', W.roundTenth(monthlyContractHours(staff[0], '2026-09-01')), 151.7);
check('V10 base mensuelle 24 h', W.roundTenth(monthlyContractHours(staff[1], '2026-09-01')), 104);

// --- V11 Attendu apres absence ------------------------------------------------
// 35 h de contrat, 7 h de conge : 28 h attendues. 7 h d'absence sur 5 h : 0, jamais negatif.
check('V11 attendu 35 - 7', W.expectedHours(35, 7), 28);
check('V11 jamais negatif', W.expectedHours(5, 7), 0);
check('V11 mois : 151,7 - 7', W.expectedHours(W.roundTenth(151.6666666), 7), 144.7);

// --- V12 Extra -----------------------------------------------------------------
// Monique, extra : 12-15 et 14-18 le meme lundi = presence 12 h -> 18 h = 6 h.
const v12 = [sh('xmon', MON, 12, 15, { extraName: 'Monique' }), sh('xmon', MON, 14, 18, { extraName: 'Monique' })];
const pm12 = pay(v12);
check('V12 extra : 6 h en paie', pm12.extras.map(e => [e.name, e.hours, e.days.length]), [['Monique', 6, 1]]);
check('V12 extra : 6 h a l ecran', hours(v12, 'xmon'), 6);

// --- V13 HCR, journee de 11 h -------------------------------------------------
// 8-20 avec 1 h de pause = 11 h : pas au-dessus de 11 h, pas d'alerte.
// 8-20 sans pause = 12 h : alerte journee 12.
check('V13 HCR 8-20 pause 1 h', rules([sh('omar', MON, 8, 20, { breakStart: 13, breakMinutes: 60 })], '1979'), []);
check('V13 HCR 8-20 sans pause', rules([sh('omar', MON, 8, 20)], '1979'), ['maxDaily 12', 'breakRequired 12']);

// --- V14 La pause reste dans le shift -----------------------------------------
// 10-18, pause 30 min placee a 17 h 45 : ramenee a 17 h 30. Shift de 30 min avec
// 60 min de pause : la pause disparait.
check('V14 pause ramenee dans le shift', W.clampBreak(sh('omar', MON, 10, 18, { breakStart: 17.75, breakMinutes: 30 })).breakStart, 17.5);
check('V14 pause plus longue que le shift', 'breakMinutes' in W.clampBreak(sh('omar', MON, 10, 10.5, { breakStart: 10, breakMinutes: 60 })), false);

// --- V15 Deux lundis dans le meme mois ----------------------------------------
// Lundi 14 et lundi 21 septembre, 10-17 chacun : 14 h, pas 7 (deux jours distincts).
const two = [...W.datedWeek('2026-09-13', [sh('omar', MON, 10, 17)]), ...W.datedWeek(WEEK, [sh('omar', MON, 10, 17)])];
check('V15 deux lundis : 14 h', W.hoursByWorker(two).omar, 14);
check('V15 cout du mois', W.workCost(two, { omar: 15 }).total, 210);

// --- V16 Taux inconnu : jamais zero ------------------------------------------
// Omar a 15 EUR (7 h = 105 EUR), Julie sans taux : total 105, 1 shift non chiffre.
check('V16 cout partiel', W.workCost(week([sh('omar', MON, 10, 17), sh('julie', MON, 10, 17)]), { omar: 15 }), { total: 105, missing: 1 });

// =============================================================================
// Chantier 2 (22/09/2026) : repos hebdomadaire, 48 h, pause, remplacant, heure
// d'ete. Chaque attendu est calcule a la main dans le commentaire.
// =============================================================================
const PREV = '2026-09-13', NEXT = '2026-09-27';
const SAT = 5, SUN = 6;
const rulesOf = (work, conv = '1501', win = { from: '2026-09-21', to: '2026-09-27' }) =>
  violationsForStaff(work.map(({ shift: s, date }) => ({
    id: s.id, staffId: W.workerOf(s), date, start: s.startTime, end: s.endTime,
    ...(s.breakMinutes ? { breakStart: s.breakStart, breakMinutes: s.breakMinutes } : {}),
  })), CONVENTIONS[conv], win).map(v => `${v.rule} ${v.actual}`);

// --- V17 Lundi-samedi, dimanche libre, semaine suivante vide ------------------
// 6 x 9-15 (6 h pile : pas au-dela de 6 h, pas de pause due). Repos samedi 15 h
// -> suite inconnue = repos. Avant : fausse alerte « 33 h ». Attendu : rien.
check('V17 lun-sam, dimanche libre, suivante vide : rien',
  rules([MON, TUE, WED, THU, FRI, SAT].map(d => sh('omar', d, 9, 15))), []);

// --- V18 Mardi-dimanche, lundi libre, semaine precedente vide -----------------
check('V18 mar-dim, lundi libre, precedente vide : rien',
  rules([TUE, WED, THU, FRI, SAT, SUN].map(d => sh('omar', d, 9, 15))), []);

// --- V19 Reprise trop tot la semaine suivante (connue) -------------------------
// Lun-ven 10-16, samedi 15-21 (6 h), lundi suivant 6 h - 10 h.
// Repos samedi 21 h -> lundi 6 h = 33 h ; dont 27 h dans la semaine (>= 24 h) :
// il compte pour cette semaine, et 33 < 35 : alerte 33.
check('V19 samedi 21 h -> lundi suivant 6 h : repos 33 h',
  rulesOf([...week([MON, TUE, WED, THU, FRI].map(d => sh('omar', d, 10, 16))),
           ...week([sh('omar', SAT, 15, 21)]),
           ...W.datedWeek(NEXT, [sh('omar', MON, 6, 10)])]),
  ['weeklyRest 33']);

// --- V20 Long repos pris la semaine precedente --------------------------------
// Semaine precedente : lun-ven 10-16, week-end libre. Cette semaine : lun-jeu
// 10-16, vendredi 17-23, samedi libre, dimanche 9-15.
// Repos vendredi 23 h -> dimanche 9 h = 34 h. Le repos vendredi precedent 16 h
// -> lundi 10 h (66 h) n'a que 10 h dans cette semaine : il ne la couvre pas.
// Attendu : alerte 34 (avant : aucune, selon les semaines chargees).
check('V20 repos pris surtout la semaine d avant : 34 h signale',
  rulesOf([...W.datedWeek(PREV, [MON, TUE, WED, THU, FRI].map(d => sh('omar', d, 10, 16))),
           ...week([MON, TUE, WED, THU].map(d => sh('omar', d, 10, 16))),
           ...week([sh('omar', FRI, 17, 23), sh('omar', SUN, 9, 15)])]),
  ['weeklyRest 34']);

// --- V21 48 h dans la semaine --------------------------------------------------
// Lun-sam 9-17, pause 30 min : 7,5 h x 6 = 45 h -> rien.
// Lun-sam 9-18, pause 30 min : 8,5 h x 6 = 51 h -> alerte 51.
check('V21 45 h : rien', rules([MON, TUE, WED, THU, FRI, SAT].map(d => sh('omar', d, 9, 17, { breakStart: 13, breakMinutes: 30 }))), []);
check('V21 51 h : alerte 48 h', rules([MON, TUE, WED, THU, FRI, SAT].map(d => sh('omar', d, 9, 18, { breakStart: 13, breakMinutes: 30 }))), ['maxWeekly 51']);

// --- V22 Pause de 20 minutes ---------------------------------------------------
// 9-15 : 6 h pile -> rien. 9 h - 15 h 30 : 6,5 h -> alerte 6,5.
// 9-13 puis 13 h 15 - 17 : coupure de 15 min, trop courte : 9 h -> 17 h d'affilee = 8 h.
// 9-13 puis 13 h 20 - 17 : coupure de 20 min, elle vaut pause -> rien.
check('V22 6 h pile : rien', rules([sh('omar', MON, 9, 15)]), []);
check('V22 6 h 30 sans pause', rules([sh('omar', MON, 9, 15.5)]), ['breakRequired 6.5']);
check('V22 coupure de 15 min : ne compte pas', rules([sh('omar', MON, 9, 13), sh('omar', MON, 13.25, 17)]), ['breakRequired 8']);
check('V22 coupure de 20 min : vaut pause', rules([sh('omar', MON, 9, 13), sh('omar', MON, 13 + 1 / 3, 17)]), []);
check('V22 pause de 20 min dans le shift', rules([sh('omar', MON, 9, 17, { breakStart: 13, breakMinutes: 20 })]), []);
{
  const v = violationsForStaff([{ id: 'p', staffId: 'omar', date: '2026-09-21', start: 9, end: 15.5 }], CONVENTIONS['1501'],
    { from: '2026-09-21', to: '2026-09-27' })[0];
  check('V22 phrase affichee', violationText(v, 'fr', new Map(), 'Omar', CONVENTIONS['1501']),
    "Omar travaille 6 h 30 d'affilée le lundi 21 sept 26 sans pause d'au moins 20 minutes, or le Code du travail impose cette pause dès 6 heures de travail.");
}

// --- V23 Remplacant a deux endroits a la fois ----------------------------------
// Alice 10-16 et reprend Bob 14-20 le meme mercredi : les deux cartes en rouge.
check('V23 chevauchement du remplacant signale', [...findOverlappingShiftIds(v7)].sort(), [v7[0].id, v7[1].id].sort());

// --- V24 Changement d'heure ----------------------------------------------------
// Nuit du 24 au 25 octobre 2026 (on recule d'une heure) : samedi 23 h -> dimanche
// 10 h = 12 h ecoulees -> rien. Nuit du 28 au 29 mars 2026 (on avance) : 10 h
// ecoulees -> alerte 10.
const dst = (sat, sun) => violationsForStaff([
  { id: 'a', staffId: 'omar', date: sat, start: 18, end: 23 },
  { id: 'b', staffId: 'omar', date: sun, start: 10, end: 14 },
], CONVENTIONS['1501'], { from: sat, to: sun }).filter(v => v.rule === 'dailyRest').map(v => `${v.rule} ${v.actual}`);
check('V24 octobre : 12 h de repos reelles, rien', dst('2026-10-24', '2026-10-25'), []);
check('V24 mars : 10 h de repos reelles, alerte', dst('2026-03-28', '2026-03-29'), ['dailyRest 10']);

// --- Affichage des durees (22/09/2026) : « 7.3H » se lisait 7 h 30 pour 7 h 15 ----
// --- Pause posee d'office sur un nouveau shift (decision du 22/09/2026) ----------
check('Pause d office : 6 h pile -> aucune', W.autoBreak(11.5, 17.5), {});
check('Pause d office : 8 h (10 h - 18 h) -> 20 min au milieu', W.autoBreak(10, 18), { breakMinutes: 20, breakStart: W.defaultBreakStart(10, 18, 20) });
check('Pause d office : 6 h 30 -> 20 min', W.autoBreak(9, 15.5).breakMinutes, 20);

// Allonger un shift au-dela de 6 h : pause d'office au franchissement seulement.
const S = (a, b, p = {}) => ({ staffId: 'o', dayIndex: 0, startTime: a, endTime: b, ...p });
check('Allonge de 6 h a 8 h sans pause -> 20 min', W.withAutoBreak(S(10, 16), S(10, 18)).breakMinutes, 20);
check('Allonge de 5 h a 6 h pile -> rien', W.withAutoBreak(S(10, 15), S(10, 16)).breakMinutes, undefined);
check('Deja 8 h sans pause (retiree expres), allonge a 9 h -> reste sans', W.withAutoBreak(S(10, 18), S(10, 19)).breakMinutes, undefined);
check('Allonge avec une pause de 45 min deja la -> gardee', W.withAutoBreak(S(10, 16), S(10, 18, { breakStart: 13, breakMinutes: 45 })).breakMinutes, 45);
check('Shift de 8 h avec la pause d office : 7 h 40 travaillees', W.shiftWorkHours(W.withAutoBreak(S(10, 16), S(10, 18))), 7 + 40 / 60);

check('Affichage : 7,25 h -> « 7 h 15 »', W.formatDuration(7.25), '7 h 15');
check('Affichage : 7,5 h -> « 7 h 30 »', W.formatDuration(7.5), '7 h 30');
check('Affichage : 35 h -> « 35 h »', W.formatDuration(35), '35 h');
check('Affichage : 23/3 h -> « 7 h 40 »', W.formatDuration(23 / 3), '7 h 40');
check('Affichage : 0,9999 h arrondi a la minute -> « 1 h »', W.formatDuration(0.9999), '1 h');
check('Affichage : contrat 35 x 52 / 12 -> « 151,7 h »', W.formatHoursRef(35 * 52 / 12), '151,7 h');
check('Affichage : attendu 30,5 -> « 30,5 h »', W.formatHoursRef(30.5), '30,5 h');

console.log(ko === 0 ? `\nTOUT PASSE (${n} controles)` : `\n${ko} ECHEC(S) sur ${n}`);
process.exit(ko === 0 ? 0 : 1);
