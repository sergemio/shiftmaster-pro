// Fenetre d'attribution des shifts (periode d'emploi), sans navigateur.
//
// Regle fixee par Serge le 09/09/2026 : rien avant la date d'entree ; jusqu'a
// 21 jours apres la date de sortie (shift marque « hors contrat ») ; rien apres.
//
// Meme code que utils/helpers.ts, recopie ici faute de pouvoir importer un .ts
// sans etape de compilation — meme convention que les autres tests du depot.

const POST_CONTRACT_GRACE_DAYS = 21;

const getShiftIsoDate = (weekStart, dayIndex) => {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + dayIndex + 1);
  return d.toISOString().slice(0, 10);
};
const addDaysIso = (iso, days) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const getOrphanReason = (staff, iso) => {
  if (staff.startDate && iso < staff.startDate) return { kind: 'before-start', date: staff.startDate };
  if (staff.endDate && iso > staff.endDate) return { kind: 'after-end', date: staff.endDate };
  return null;
};
const lastAssignableDate = staff => (staff.endDate ? addDaysIso(staff.endDate, POST_CONTRACT_GRACE_DAYS) : null);
const getAssignmentBlock = (staff, iso) => {
  if (staff.startDate && iso < staff.startDate) return { kind: 'before-start', date: staff.startDate };
  const last = lastAssignableDate(staff);
  if (last && iso > last) return { kind: 'after-grace', date: staff.endDate };
  return null;
};
const isStaffAssignableInWeek = (staff, weekStart) => {
  const monday = getShiftIsoDate(weekStart, 0);
  const sunday = getShiftIsoDate(weekStart, 6);
  if (staff.startDate && staff.startDate > sunday) return false;
  const last = lastAssignableDate(staff);
  if (last && last < monday) return false;
  return true;
};

// ---------------------------------------------------------------------------
let ko = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) ko++;
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${label.padEnd(64)} ${JSON.stringify(got)}`);
  if (!ok) console.log(`${''.padEnd(70)} attendu ${JSON.stringify(want)}`);
};
const kind = b => (b ? b.kind : null);

// Stephanie arrive le lundi 14 septembre 2026 (cas reel).
const STEPH = { startDate: '2026-09-14', endDate: null };
check('la veille de l arrivee : bloque', kind(getAssignmentBlock(STEPH, '2026-09-13')), 'before-start');
check('le jour de l arrivee : permis', kind(getAssignmentBlock(STEPH, '2026-09-14')), null);
check('bien apres, sans date de sortie : permis', kind(getAssignmentBlock(STEPH, '2027-06-01')), null);

// Omar est parti le 3 septembre 2026 (cas reel) : 21 jours -> 24 septembre.
const OMAR = { startDate: '2025-01-06', endDate: '2026-09-03' };
check('dernier jour de contrat : permis, pas hors contrat',
  [kind(getAssignmentBlock(OMAR, '2026-09-03')), getOrphanReason(OMAR, '2026-09-03')], [null, null]);
check('lendemain du depart : permis, marque hors contrat',
  [kind(getAssignmentBlock(OMAR, '2026-09-04')), getOrphanReason(OMAR, '2026-09-04')?.kind], [null, 'after-end']);
check('21e jour apres le depart (24 sept) : encore permis', kind(getAssignmentBlock(OMAR, '2026-09-24')), null);
check('22e jour apres le depart (25 sept) : bloque', kind(getAssignmentBlock(OMAR, '2026-09-25')), 'after-grace');
check('bloque apres tolerance cite la date de SORTIE, pas la fin de tolerance',
  getAssignmentBlock(OMAR, '2026-10-15').date, '2026-09-03');
check('la tolerance passe un changement de mois', addDaysIso('2026-09-30', 21), '2026-10-21');
check('la tolerance passe un changement d annee', addDaysIso('2026-12-20', 21), '2027-01-10');

// Sans aucune date : toujours permis (donnees anterieures a la saisie des dates).
check('sans dates : permis', kind(getAssignmentBlock({}, '2030-01-01')), null);

// Liste de la semaine. weekId = dimanche AVANT la semaine.
const W = iso => new Date(iso + 'T00:00:00Z');
check('Stephanie absente de la liste la semaine du 7 sept', isStaffAssignableInWeek(STEPH, W('2026-09-06')), false);
check('Stephanie dans la liste la semaine du 14 sept', isStaffAssignableInWeek(STEPH, W('2026-09-13')), true);
check('arrivee un mercredi : dans la liste de la semaine (le jour est verifie a part)',
  isStaffAssignableInWeek({ startDate: '2026-09-16' }, W('2026-09-13')), true);
check('Omar dans la liste la semaine du 21 sept (tolerance jusqu au 24)', isStaffAssignableInWeek(OMAR, W('2026-09-20')), true);
check('Omar hors liste la semaine du 28 sept', isStaffAssignableInWeek(OMAR, W('2026-09-27')), false);

console.log(ko === 0 ? '\nTOUT PASSE' : `\n${ko} ECHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
