// Test de contractHoursOn : la regle des avenants, sans navigateur.
const contractHoursOn = (staff, isoDate) => {
  const applicable = (staff.contractChanges || [])
    .filter(c => c.from <= isoDate)
    .sort((a, b) => a.from.localeCompare(b.from));
  if (applicable.length > 0) return applicable[applicable.length - 1].weeklyHours;
  return staff.contractHours ?? staff.targetHours ?? 0;
};

let ko = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) ko++;
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${label.padEnd(58)} ${got} (attendu ${want})`);
};

const legacy   = { targetHours: 24 };
const renamed  = { contractHours: 35 };
const avenants = { contractHours: 24, contractChanges: [
  { from: '2026-09-01', weeklyHours: 30 },
  { from: '2026-01-01', weeklyHours: 24 },
]};
const futur    = { contractHours: 24, contractChanges: [{ from: '2026-12-01', weeklyHours: 35 }] };

check('fiche non migree : ancien champ lu',            contractHoursOn(legacy, '2026-09-06'), 24);
check('fiche migree : nouveau champ lu',               contractHoursOn(renamed, '2026-09-06'), 35);
check('avant tout avenant : contrat courant',          contractHoursOn(avenants, '2025-06-01'), 24);
check('entre deux avenants : le premier',              contractHoursOn(avenants, '2026-05-15'), 24);
check('le jour meme de l avenant : deja applique',     contractHoursOn(avenants, '2026-09-01'), 30);
check('apres l avenant : nouveau chiffre',             contractHoursOn(avenants, '2026-10-20'), 30);
check('mois passe non reecrit par un avenant recent',  contractHoursOn(avenants, '2026-08-31'), 24);
check('avenant futur pas encore applique',             contractHoursOn(futur, '2026-09-06'), 24);
check('avenant futur applique le moment venu',         contractHoursOn(futur, '2027-01-05'), 35);
check('avenants desordonnes : tri correct',            contractHoursOn({contractChanges:[
  {from:'2026-06-01',weeklyHours:20},{from:'2026-02-01',weeklyHours:10},{from:'2026-04-01',weeklyHours:15},
]}, '2026-05-01'), 15);
check('aucune donnee : zero, pas NaN',                 contractHoursOn({}, '2026-09-06'), 0);

console.log(ko === 0 ? '\nTOUT PASSE' : `\n${ko} ECHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
