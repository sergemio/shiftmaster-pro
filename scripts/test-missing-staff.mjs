/**
 * Shifts dont la fiche employe a ete supprimee (recette du 23/09/2026 sur une
 * copie des donnees de Sezam : 93 shifts, 609 h invisibles). Ils doivent
 * rester visibles, comptes, et payes sur une ligne nommee.
 *
 *   node scripts/test-missing-staff.mjs
 */
import { loadTs } from './load-ts.mjs';
const { missingStaffRows, extraStaffRows } = await loadTs('utils/helpers.ts');
const { payrollVariables } = await loadTs('utils/payroll.ts');
let failed = 0, n = 0;
const check = (label, ok, extra = '') => {
  n++; if (!ok) failed++;
  console.log((ok ? 'OK     ' : 'ECHEC  ') + label + (!ok && extra ? `  [${extra}]` : ''));
};

const staff = [{ id: 'a', name: 'Omar', email: '', color: '#000', role: 'staff', contractHours: 20 }];
const sh = (id, staffId, extra = {}) => ({ id, staffId, dayIndex: 0, startTime: 10, endTime: 16, ...extra });

const rows = missingStaffRows([sh('1', 'a'), sh('2', '4'), sh('3', '4'), sh('4', '7')], staff, 'Fiche supprimée');
check('Une ligne par personne inconnue, une seule fois', rows.length === 2 && rows.map(r => r.id).join() === '4,7', JSON.stringify(rows));
check('Nommee « Fiche supprimée · 4 »', rows[0].name === 'Fiche supprimée · 4', rows[0].name);
check('Marquee, sans alerte de duree du travail (isPool)', rows[0].missing === true && rows[0].isPool === true);
check('Une personne connue ne cree pas de ligne', missingStaffRows([sh('1', 'a')], staff, 'x').length === 0);
check('Un extra (prenom sur le shift) ne cree pas de ligne',
  missingStaffRows([sh('1', 'x9', { extraName: 'Monique' })], [...staff, ...extraStaffRows([sh('1', 'x9', { extraName: 'Monique' })])], 'x').length === 0);
check('Un remplacant inconnu cree aussi sa ligne',
  missingStaffRows([sh('1', 'a', { coverageBy: '8' })], staff, 'x').map(r => r.id).join() === '8');

// Paie : les heures d'une fiche supprimee apparaissent, sous son nom de remplacement.
const everyone = [...staff, ...rows];
const r = payrollVariables('2026-09', everyone, { '2026-08-30': [sh('1', 'a', { dayIndex: 1 }), sh('2', '4', { dayIndex: 1 })] }, [], () => 0, {}, []);
const line = JSON.stringify(r);
check('Paie : la ligne « Fiche supprimée · 4 » porte ses 6 h', line.includes('Fiche supprimée · 4'), line.slice(0, 300));

console.log(failed ? `${failed} ECHEC(S) sur ${n}` : `TOUT PASSE (${n})`);
process.exit(failed ? 1 : 0);
