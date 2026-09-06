// Effectif par tranche de 30 minutes, sans navigateur.
const staffingPerSlot = (shifts, dayIndex, startHour, endHour, slotMinutes = 30) => {
  const step = slotMinutes / 60;
  const day = shifts.filter(s => s.dayIndex === dayIndex);
  const out = [];
  for (let i = 0; i < Math.round((endHour - startHour) / step); i++) {
    const t = startHour + i * step;
    const present = new Set();
    for (const s of day) if (s.startTime < t + step && s.endTime > t) present.add(s.coverageBy || s.staffId);
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

check('une personne de 11h a 14h',        staffingPerSlot([S('a','1',0,11,14)], 0, 11, 14), [1,1,1,1,1,1]);
check('deux personnes qui se recouvrent', staffingPerSlot([S('a','1',0,11,13), S('b','2',0,12,13)], 0, 11, 13), [1,1,2,2]);
check('trou entre deux services',         staffingPerSlot([S('a','1',0,11,12), S('b','2',0,13,14)], 0, 11, 14), [1,1,0,0,1,1]);
check('demi-heure de creux visible',      staffingPerSlot([S('a','1',0,11,12), S('b','2',0,12.5,13)], 0, 11, 13), [1,1,0,1]);
check('un remplacant compte pour lui',    staffingPerSlot([S('a','1',0,11,12,'9')], 0, 11, 12), [1,1]);
check('meme personne, deux shifts : 1',   staffingPerSlot([S('a','1',0,11,12), S('b','1',0,11.5,12)], 0, 11, 12), [1,1]);
check('autre jour ignore',                staffingPerSlot([S('a','1',1,11,12)], 0, 11, 12), [0,0]);
check('aucun shift',                      staffingPerSlot([], 0, 11, 12), [0,0]);

// Le cas signale par Serge le 2026-09-06, vendredi 28 : a l'heure pleine la
// bande annoncait 3 sur toute la tranche de 17h, en additionnant trois personnes
// qui ne sont jamais ensemble — Yasmine part a 17h30, l'heure ou Sepand et
// Parthavi arrivent. Le maximum reellement simultane est 2.
const VENDREDI = [
  S('o', 'omar',     4, 11.5, 15.5),
  S('y', 'yasmine',  4, 12,   17.5),
  S('s', 'sepand',   4, 17.5, 23),
  S('p', 'parthavi', 4, 17.5, 23.5),
];
check('vendredi 28 : 17h00 -> 1, 17h30 -> 2', staffingPerSlot(VENDREDI, 4, 17, 18), [1, 2]);
check('vendredi 28 : creux de 15h30 a 17h30', staffingPerSlot(VENDREDI, 4, 15, 18), [2,1,1,1,1,2]);

console.log(ko === 0 ? '\nTOUT PASSE' : `\n${ko} ECHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
