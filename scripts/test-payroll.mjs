/**
 * Elements variables de paie (absences, lot 5).
 *
 *   node scripts/test-payroll.mjs
 *
 * Contrairement aux autres tests du depot, celui-ci compile le VRAI
 * `utils/payroll.ts` avec esbuild (deja installe par Vite) : aucune copie de
 * code a tenir a jour.
 *
 * Reperes : septembre 2026 commence un mardi et finit un mercredi. Les
 * semaines (weekId = dimanche) qui le touchent : 30/08, 06/09, 13/09, 20/09,
 * 27/09. La derniere (lun 28/09 -> dim 04/10) est rattachee a octobre.
 */
import { buildSync } from 'esbuild';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'payroll-')), 'payroll.mjs');
buildSync({ entryPoints: [join(root, 'utils/payroll.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const { payrollVariables, payrollText, payrollCsv } = await import(pathToFileURL(out).href);

let fails = 0;
const check = (label, ok, extra = '') => {
  if (!ok) fails++;
  console.log((ok ? 'OK     ' : 'ECHEC  ') + label + (ok ? '' : `  [${extra}]`));
};

const addDaysIso = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isoDayIndex = (iso) => (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7;
const countDays = (a, b) => { let n = 0; for (let d = a; d <= b; d = addDaysIso(d, 1)) if (isoDayIndex(d) <= 5) n++; return n; };

const sh = (id, staffId, dayIndex, startTime, endTime, extra = {}) => ({ id, staffId, dayIndex, startTime, endTime, ...extra });
const fullWeek = (prefix, staffId, days, h) => days.map(d => sh(`${prefix}${d}`, staffId, d, 10, 10 + h));

const staff = [
  { id: 'omar', name: 'Omar', email: '', color: '', role: 'staff', contractHours: 35, startDate: '2025-01-01' },
  { id: 'double', name: 'Double', email: '', color: '', role: 'staff', contractHours: 20, startDate: '2025-01-01' },
  { id: 'lina', name: 'Lina', email: '', color: '', role: 'staff', contractHours: 24, startDate: '2026-09-15' },
  { id: 'paul', name: 'Paul', email: '', color: '', role: 'staff', contractHours: 35, startDate: '2024-01-01', endDate: '2026-09-20' },
  { id: 'old', name: 'Ancien', email: '', color: '', role: 'staff', contractHours: 35, endDate: '2026-08-15' },
  { id: 'next', name: 'Futur', email: '', color: '', role: 'staff', contractHours: 35, startDate: '2026-10-05' },
  { id: 'boss', name: 'Serge', email: '', color: '', role: 'admin' },
  { id: 'ava', name: 'Ava', email: '', color: '', role: 'staff', contractHours: 24, startDate: '2025-01-01',
    contractChanges: [{ from: '2026-09-16', weeklyHours: 30 }] },
  { id: 'pool', name: 'Extra', email: '', color: '', role: 'staff', isPool: true },
];

const shiftsByWeek = {
  // lun 31/08 -> dim 06/09 : lundi en aout
  '2026-08-30': [
    sh('a1', 'omar', 0, 10, 18),                       // 31/08 : hors mois
    sh('a2', 'omar', 1, 10, 18),                       // 01/09
    sh('d1', 'double', 0, 10, 15),                     // 31/08, compte pour la semaine (dimanche 06/09)
    ...fullWeek('d', 'double', [1, 2, 3, 4], 5),       // 20 h du 01 au 04/09 -> semaine = 25 h pour 20
  ],
  // lun 07/09 -> dim 13/09
  '2026-09-06': [
    ...fullWeek('o', 'omar', [0, 1, 2, 3, 4], 8),       // 40 h -> 5 h supplementaires
    ...fullWeek('dd', 'double', [0, 1, 2, 3, 4], 7),    // 35 h pour 20 : interdit
    sh('x1', 'm1', 5, 12, 16, { extraName: 'Monique' }),
    sh('x2', 'pool', 6, 18, 23),
  ],
  // lun 14/09 -> dim 20/09
  '2026-09-13': [
    sh('c1', 'omar', 0, 10, 14, { coverageBy: 'double' }), // couvert : compte pour Double
    sh('p1', 'paul', 2, 10, 18),
    sh('l1', 'lina', 3, 10, 16),
    sh('av', 'ava', 0, 10, 14),
  ],
  // lun 28/09 -> dim 04/10 : rattachee a octobre
  '2026-09-27': [
    ...fullWeek('oo', 'omar', [0, 1, 2, 3, 4, 5], 8),   // 48 h, mais semaine d'octobre
    sh('x3', 'm1', 2, 12, 16, { extraName: 'Monique' }),// 30/09
    sh('x4', 'm1', 3, 12, 16, { extraName: 'Monique' }),// 01/10 : hors mois
  ],
};

const P = (o) => ({ justificatif: 'none', weekIds: [], createdAt: '', createdBy: '', updatedAt: '', ...o });
const periods = [
  // CP a cheval sur octobre, heures jour par jour
  P({ id: 'cp1', staffId: 'omar', kind: 'cp', start: '2026-09-28', end: '2026-10-03', daysCounted: 6, hoursLost: 35,
      hoursByDate: { '2026-09-28': 7, '2026-09-29': 7, '2026-09-30': 7, '2026-10-01': 7, '2026-10-02': 7 } }),
  // CP a cheval sur aout, sans detail : prorata des jours
  P({ id: 'cp2', staffId: 'double', kind: 'cp', start: '2026-08-31', end: '2026-09-04', daysCounted: 5, hoursLost: 20 }),
  P({ id: 'half', staffId: 'double', kind: 'cp', start: '2026-09-10', end: '2026-09-10', half: 'am', daysCounted: 0.5, hoursLost: 2 }),
  P({ id: 'mal', staffId: 'paul', kind: 'maladie', start: '2026-09-14', end: '2026-09-15', daysCounted: 2, hoursLost: 14 }),
  P({ id: 'fam', staffId: 'lina', kind: 'famille', start: '2026-09-21', end: '2026-09-22', daysCounted: 2, hoursLost: 9.6,
      note: 'Mariage; frère', justificatif: 'received' }),
  P({ id: 'aug', staffId: 'omar', kind: 'cp', start: '2026-08-10', end: '2026-08-15', daysCounted: 6, hoursLost: 35 }),
];

const pm = payrollVariables('2026-09', staff, shiftsByWeek, periods, countDays, { m1: 'Monique Durand' });
const line = (id) => pm.lines.find(l => l.staffId === id);

// --- qui figure ---------------------------------------------------------------
check('Salaries du mois, tries : Ava, Double, Lina, Omar, Paul',
  pm.lines.map(l => l.name).join(',') === 'Ava,Double,Lina,Omar,Paul', pm.lines.map(l => l.name));
check('Parti en aout, arrive en octobre, admin sans contrat : absents', !line('old') && !line('next') && !line('boss'));
check('Ligne partagee et extra : pas dans les salaries', !line('pool') && !line('m1'));

// --- heures travaillees -------------------------------------------------------
check('Omar : 8 (01/09) + 40 + 8 (28/09) + 8 (29/09) + 8 (30/09) = 72 h travaillees en septembre',
  line('omar').worked === 72, line('omar').worked);
check('Double : 20 + 35 + 4 (shift couvert pour Omar) = 59 h', line('double').worked === 59, line('double').worked);

// --- heures au-dela du contrat ----------------------------------------------------
const ow = line('omar').weeks;
check('Omar : une semaine a +5 h supplementaires (07-13/09)',
  ow.length === 1 && ow[0].monday === '2026-09-07' && ow[0].extra === 5 && ow[0].kind === 'supplementaires', JSON.stringify(ow));
check('Omar : la semaine du 28/09 (48 h) est rattachee a octobre, pas ici', !ow.some(w => w.monday === '2026-09-28'));
const dw = line('double').weeks;
const w1 = dw.find(w => w.monday === '2026-08-31');
check('Double : semaine du 31/08 comptee entiere (lundi en aout) : 25 h pour 20 -> +5 complementaires',
  w1 && w1.worked === 25 && w1.extra === 5 && w1.kind === 'complementaires', JSON.stringify(dw));
check('... dont 3 h au-dela du dixieme (2 h)', w1 && w1.beyondTenth === 3, w1 && w1.beyondTenth);
const w2 = dw.find(w => w.monday === '2026-09-07');
check('Double : 35 h sur un contrat de 20 h -> signale comme interdit', w2 && w2.reachesLegal === true, JSON.stringify(w2));
check('Double : semaine du 14/09 a 4 h (couverture) -> rien au-dela', !dw.some(w => w.monday === '2026-09-14'));

// --- absences -------------------------------------------------------------------
const oa = line('omar').absences;
check('Omar : le CP d\'aout n\'apparait pas', !oa.some(a => a.periodId === 'aug'));
const cp1 = oa.find(a => a.periodId === 'cp1');
check('CP a cheval sur octobre : 28-30/09, 3 j, 21 h (detail jour par jour)',
  cp1 && cp1.start === '2026-09-28' && cp1.end === '2026-09-30' && cp1.days === 3 && cp1.hours === 21, JSON.stringify(cp1));
const cp2 = line('double').absences.find(a => a.periodId === 'cp2');
check('CP a cheval sur aout sans detail : 01-04/09, 4 j, 16 h (prorata 4/5 de 20 h)',
  cp2 && cp2.start === '2026-09-01' && cp2.days === 4 && cp2.hours === 16, JSON.stringify(cp2));
const half = line('double').absences.find(a => a.periodId === 'half');
check('Demi-journee : 0,5 j, 2 h', half && half.days === 0.5 && half.hours === 2 && half.half === 'am', JSON.stringify(half));

// --- entrees, sorties, avenants ----------------------------------------------------
check('Lina : entree le 15/09', line('lina').entry === '2026-09-15' && !line('lina').exit);
check('Paul : sortie le 20/09', line('paul').exit === '2026-09-20' && !line('paul').entry);
check('Omar : ni entree ni sortie', !line('omar').entry && !line('omar').exit);
const ava = line('ava');
check('Ava : avenant 30 h au 16/09, contrat affiche 30 h', ava.contractChanges.length === 1 && ava.weeklyHours === 30, JSON.stringify(ava));
check('Ava : base du mois mixte (15 j a 24 h + 15 j a 30 h) = 117 h', ava.monthlyBase === 117, ava.monthlyBase);
check('Omar : base 151,67 h', line('omar').monthlyBase === 151.67, line('omar').monthlyBase);

// --- extras -------------------------------------------------------------------------
const mon = pm.extras.find(e => e.staffId === 'm1');
check('Extra Monique : nom complet de la fiche, 2 jours en septembre, 8 h',
  mon && mon.name === 'Monique Durand' && mon.days.length === 2 && mon.hours === 8, JSON.stringify(pm.extras));
check('Ligne partagee « Extra » : 5 h', pm.extras.some(e => e.staffId === 'pool' && e.hours === 5));

// --- texte et CSV ------------------------------------------------------------------------
const L = {
  title: 'Éléments variables de paie — septembre 2026',
  contract: 'contrat {h} h/semaine (base {base} h/mois)', noContract: 'contrat non renseigné',
  entry: 'Entrée le {date}', exit: 'Sortie le {date}', change: 'Avenant : {h} h/semaine à partir du {date}',
  worked: 'Heures travaillées : {h} h', noAbsence: 'Absences : aucune', absences: 'Absences :',
  absenceLine: '{kind} du {from} au {to} : {days} j, {h} h', halfDay: '(demi-journée)',
  continues: '(période du {from} au {to})', justifReceived: 'justificatif reçu', justifMissing: 'justificatif non reçu',
  weekLine: 'Semaine du {from} au {to} : {worked} h pour {contract} h, soit {extra} h {kind}',
  beyondTenth: 'dont {h} h au-delà du dixième', reachesLegal: '(35 h atteintes)',
  complementaires: 'complémentaires', supplementaires: 'supplémentaires',
  extrasTitle: 'EXTRAS', extraLine: '{name} : {h} h sur {n} jour(s) — {dates}', daysUnit: 'j', footer: 'Fin',
  kindLabel: k => ({ cp: 'Congés payés', maladie: 'Arrêt maladie', famille: 'Événement familial' }[k] || k),
  date: iso => iso.slice(8, 10) + '/' + iso.slice(5, 7), num: n => String(n).replace('.', ','),
  csvHeader: ['Salarié', 'Rubrique', 'Du', 'Au', 'Jours', 'Heures', 'Détail'],
  csvWorked: 'Heures travaillées', csvEntry: 'Entrée', csvExit: 'Sortie', csvChange: 'Avenant', csvExtra: 'Extra',
};
const txt = payrollText(pm, L);
check('Texte : titre, puis OMAR en majuscules avec son contrat', txt.startsWith('Éléments variables') && txt.includes('OMAR — contrat 35 h/semaine (base 151,67 h/mois)'));
check('Texte : CP d\'Omar avec la periode entiere', txt.includes('Congés payés du 28/09 au 30/09 : 3 j, 21 h (période du 28/09 au 03/10)'), txt);
check('Texte : arret de Paul, justificatif non recu', txt.includes('Arrêt maladie du 14/09 au 15/09 : 2 j, 14 h, justificatif non reçu'));
check('Texte : evenement familial sans mention de justificatif, avec sa note', txt.includes('Événement familial du 21/09 au 22/09 : 2 j, 9,6 h — Mariage; frère'));
check('Texte : semaine de Double signalee', txt.includes('soit 15 h complémentaires, dont 13 h au-delà du dixième (35 h atteintes)'), txt);
check('Texte : extras avec leurs dates', txt.includes('Monique Durand : 8 h sur 2 jour(s) — 12/09, 30/09'), txt.split('EXTRAS')[1]);
const csv = payrollCsv(pm, L);
const rows = csv.split('\r\n');
check('CSV : en-tete separe par des points-virgules', rows[0] === 'Salarié;Rubrique;Du;Au;Jours;Heures;Détail', rows[0]);
check('CSV : virgule decimale', rows.some(r => r.startsWith('Lina;Événement familial;2026-09-21;2026-09-22;2;9,6;')), rows.filter(r => r.startsWith('Lina')));
check('CSV : une note contenant « ; » est entre guillemets', rows.some(r => r.endsWith('"Mariage; frère"')), rows.filter(r => r.startsWith('Lina')));
check('CSV : heures supplementaires d\'Omar', rows.includes('Omar;supplémentaires;2026-09-07;2026-09-13;;5;'), rows.filter(r => r.startsWith('Omar')));

console.log(fails ? `\n${fails} ECHEC(S)` : '\nTOUT PASSE');
process.exit(fails ? 1 : 0);
