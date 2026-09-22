// Cout charge d'un shift, sans navigateur.
//
// Meme code que utils/helpers.ts, recopie ici faute de pouvoir importer un .ts
// sans etape de compilation — meme convention que les autres tests du depot.

import { loadTs } from './load-ts.mjs';
// Le VRAI calcul (utils/worktime.ts) : voir load-ts.mjs. Le cout d'un ensemble
// passe par des shifts dates (un jour par shift, sauf mention).
const { shiftWorkCost: shiftCost, workCost, datedWeek } = await loadTs('utils/worktime.ts');
const totalCost = (shifts, rates) => workCost(datedWeek('2026-09-20', shifts), rates);
// ---------------------------------------------------------------------------
let ko = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) ko++;
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${label.padEnd(60)} ${JSON.stringify(got)}`);
  if (!ok) console.log(`${''.padEnd(66)} attendu ${JSON.stringify(want)}`);
};
const S = (staffId, startTime, endTime, coverageBy = null, dayIndex = 0) => ({ staffId, startTime, endTime, coverageBy, dayIndex });
const RATES = { sinar: 18, sepand: 16.5, parthavi: 15 };

check('6 h a 18 EUR', shiftCost(S('sinar', 11, 17), RATES), 108);
check('demi-heure comptee', shiftCost(S('sepand', 11.5, 17.5), RATES), 99);
check('taux decimal x duree decimale', shiftCost(S('sepand', 18, 23.5), RATES), 90.75);

// Le point qui compte : inconnu n'est pas zero.
check('taux absent -> null, jamais 0', shiftCost(S('inconnu', 11, 17), RATES), null);
check('taux a zero -> null (« pas renseigne », pas « gratuit »)',
  shiftCost(S('x', 11, 17), { x: 0 }), null);
check('taux negatif -> null', shiftCost(S('x', 11, 17), { x: -5 }), null);
check('aucun taux du tout -> null', shiftCost(S('sinar', 11, 17), {}), null);

// Remplacement : c'est CELUI QUI FAIT le service qui coute, comme pour les heures.
check('shift repris : le taux du remplacant, pas du titulaire',
  shiftCost(S('sinar', 11, 17, 'parthavi'), RATES), 90);
check('shift repris par quelqu un sans taux -> null',
  shiftCost(S('sinar', 11, 17, 'inconnu'), RATES), null);

// Totaux
check('total de trois services',
  totalCost([S('sinar', 11, 17), S('sepand', 11.5, 17.5), S('parthavi', 12, 16)], RATES),
  { total: 267, missing: 0 });
check('un taux manquant : total partiel ET compte des manquants',
  totalCost([S('sinar', 11, 17), S('inconnu', 12, 16)], RATES),
  { total: 108, missing: 1 });
check('aucun taux : total nul mais 2 manquants annonces',
  totalCost([S('a', 11, 17), S('b', 12, 16)], {}),
  { total: 0, missing: 2 });
check('liste vide', totalCost([], RATES), { total: 0, missing: 0 });

// Arrondi : 16,5 x 3,5 = 57,75 ; trois fois = 173,25 et non 173,25000000000003
check('pas de bavure de virgule flottante',
  totalCost([S('sepand', 12, 15.5, null, 0), S('sepand', 12, 15.5, null, 1), S('sepand', 12, 15.5, null, 2)], RATES),
  { total: 173.25, missing: 0 });

// Le meme service saisi trois fois le meme jour : presence de 3 h 30, payee une
// fois (decision de Serge du 22/09/2026 : un chevauchement compte une fois).
check('doublon le meme jour : paye une fois',
  totalCost([S('sepand', 12, 15.5), S('sepand', 12, 15.5), S('sepand', 12, 15.5)], RATES),
  { total: 57.75, missing: 0 });

// Pause : 11-17 avec 30 min de pause = 5 h 30 ; 5,5 x 18 = 99.
check('pause retiree du cout', shiftCost({ ...S('sinar', 11, 17), breakStart: 14, breakMinutes: 30 }, RATES), 99);

console.log(ko === 0 ? '\nTOUT PASSE' : `\n${ko} ECHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
