// Detection des chevauchements pour une meme personne, sans navigateur.
const findOverlappingShiftIds = (shifts) => {
  const clashing = new Set();
  const by = new Map();
  for (const s of shifts) {
    const k = `${s.staffId}#${s.dayIndex}`;
    by.has(k) ? by.get(k).push(s) : by.set(k, [s]);
  }
  for (const list of by.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.startTime - b.startTime);
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = Math.max(...sorted.slice(0, i).map(x => x.endTime));
      if (sorted[i].startTime < prevEnd) {
        clashing.add(sorted[i].id);
        for (const e of sorted.slice(0, i)) if (e.endTime > sorted[i].startTime) clashing.add(e.id);
      }
    }
  }
  return clashing;
};

let ko = 0;
const check = (label, got, want) => {
  const g = [...got].sort().join(','), w = want.sort().join(',');
  const ok = g === w;
  if (!ok) ko++;
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${label.padEnd(56)} [${g}] (attendu [${w}])`);
};
const S = (id, staffId, dayIndex, startTime, endTime) => ({ id, staffId, dayIndex, startTime, endTime });

check('deux shifts qui se chevauchent',        findOverlappingShiftIds([S('a','1',0,11,16), S('b','1',0,14,20)]), ['a','b']);
check('shifts qui se TOUCHENT : pas un chevauchement', findOverlappingShiftIds([S('a','1',0,11,15), S('b','1',0,15,19)]), []);
check('personnes differentes : aucun conflit',  findOverlappingShiftIds([S('a','1',0,11,16), S('b','2',0,11,16)]), []);
check('jours differents : aucun conflit',       findOverlappingShiftIds([S('a','1',0,11,16), S('b','1',1,11,16)]), []);
check('un shift inclus dans un autre',          findOverlappingShiftIds([S('a','1',0,11,20), S('b','1',0,13,15)]), ['a','b']);
check('trois shifts, seuls deux se chevauchent',findOverlappingShiftIds([
  S('a','1',0,9,12), S('b','1',0,14,18), S('c','1',0,16,20)]), ['b','c']);
check('shifts identiques (double saisie)',      findOverlappingShiftIds([S('a','1',0,11,16), S('b','1',0,11,16)]), ['a','b']);
check('liste vide',                             findOverlappingShiftIds([]), []);
check('un seul shift',                          findOverlappingShiftIds([S('a','1',0,11,16)]), []);

console.log(ko === 0 ? '\nTOUT PASSE' : `\n${ko} ECHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
