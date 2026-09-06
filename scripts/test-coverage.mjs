// Effectif par heure, sans navigateur.
const staffingPerHour = (shifts, dayIndex, startHour, endHour) => {
  const day = shifts.filter(s => s.dayIndex === dayIndex);
  const out = [];
  for (let h = startHour; h < endHour; h++) {
    const present = new Set();
    for (const s of day) if (s.startTime < h + 1 && s.endTime > h) present.add(s.coverageBy || s.staffId);
    out.push(present.size);
  }
  return out;
};
let ko = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) ko++;
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${label.padEnd(52)} [${got}] (attendu [${want}])`);
};
const S = (id, staffId, dayIndex, startTime, endTime, coverageBy) => ({ id, staffId, dayIndex, startTime, endTime, coverageBy });

check('une personne de 11h a 14h',        staffingPerHour([S('a','1',0,11,14)], 0, 10, 15), [0,1,1,1,0]);
check('deux personnes qui se recouvrent', staffingPerHour([S('a','1',0,11,14), S('b','2',0,12,15)], 0, 10, 15), [0,1,2,2,1]);
check('trou entre deux services',         staffingPerHour([S('a','1',0,11,13), S('b','2',0,18,20)], 0, 11, 20), [1,1,0,0,0,0,0,1,1]);
check('depart a 20h30 : present a 20h',   staffingPerHour([S('a','1',0,18,20.5)], 0, 18, 22), [1,1,1,0]);
check('un remplacant compte pour lui',    staffingPerHour([S('a','1',0,11,14,'9')], 0, 11, 14), [1,1,1]);
check('meme personne, deux shifts : 1',   staffingPerHour([S('a','1',0,11,13), S('b','1',0,12,15)], 0, 11, 15), [1,1,1,1]);
check('autre jour ignore',                staffingPerHour([S('a','1',1,11,14)], 0, 11, 14), [0,0,0]);
check('aucun shift',                      staffingPerHour([], 0, 11, 14), [0,0,0]);

console.log(ko === 0 ? '\nTOUT PASSE' : `\n${ko} ECHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
