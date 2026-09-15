// Heures d'ouverture et plage de la grille du planning, sans navigateur.
//
// Meme code que `normalizeOperatingHours`, `gridHourRange` et `halfHourSteps`
// dans utils/helpers.ts, recopie ici faute de pouvoir importer un .ts sans etape
// de compilation — meme convention que les autres tests.

const DEFAULT_OPERATING_HOURS = { start: 8, end: 24 };

const normalizeOperatingHours = (start, end) => {
  const ok = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 24 && Number.isInteger(v * 2);
  return ok(start) && ok(end) && end - start >= 1 ? { start, end } : DEFAULT_OPERATING_HOURS;
};

const gridHourRange = (hours, shifts) => {
  let start = Math.floor(hours.start), end = Math.ceil(hours.end);
  for (const s of shifts) {
    start = Math.min(start, Math.floor(s.startTime));
    end = Math.max(end, Math.ceil(s.endTime));
  }
  return { start: Math.max(0, start), end: Math.min(24, end) };
};

const halfHourSteps = (from, to) => {
  const out = [];
  for (let v = Math.ceil(from * 2) / 2; v <= to; v += 0.5) out.push(v);
  return out;
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cases = [
  ['reglage 9 h -> 23 h 30 garde tel quel', normalizeOperatingHours(9, 23.5), { start: 9, end: 23.5 }],
  ['rien en base -> 8 h -> minuit', normalizeOperatingHours(undefined, undefined), DEFAULT_OPERATING_HOURS],
  ['texte au lieu d un nombre -> defaut', normalizeOperatingHours('9', 23), DEFAULT_OPERATING_HOURS],
  ['quart d heure -> defaut (la grille avance par demi-heure)', normalizeOperatingHours(9.25, 23), DEFAULT_OPERATING_HOURS],
  ['fin avant le debut -> defaut', normalizeOperatingHours(20, 10), DEFAULT_OPERATING_HOURS],
  ['moins d une heure d ecart -> defaut', normalizeOperatingHours(10, 10.5), DEFAULT_OPERATING_HOURS],
  ['au-dela de minuit -> defaut', normalizeOperatingHours(9, 25), DEFAULT_OPERATING_HOURS],
  ['grille : 9 h -> 23 h 30 arrondi a 9 h -> minuit', gridHourRange({ start: 9, end: 23.5 }, []), { start: 9, end: 24 }],
  ['grille : 9 h 30 commence a 9 h', gridHourRange({ start: 9.5, end: 23 }, []), { start: 9, end: 23 }],
  ['grille : un shift a 8 h 30 elargit a 8 h, jamais cache', gridHourRange({ start: 10, end: 22 }, [{ startTime: 8.5, endTime: 12 }]), { start: 8, end: 22 }],
  ['grille : un shift jusqu a 23 h 30 elargit a minuit', gridHourRange({ start: 10, end: 22 }, [{ startTime: 18, endTime: 23.5 }]), { start: 10, end: 24 }],
  ['grille : shifts dans la plage -> plage inchangee', gridHourRange({ start: 9, end: 23 }, [{ startTime: 11.5, endTime: 17 }]), { start: 9, end: 23 }],
  ['menu : 22 h -> 23 h par demi-heure', halfHourSteps(22, 23), [22, 22.5, 23]],
  ['menu : depart a 9 h 15 arrondi a 9 h 30', halfHourSteps(9.25, 10), [9.5, 10]],
];

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = same(got, want);
  if (!ok) failed++;
  console.log(`${ok ? 'OK    ' : 'ECHEC '} ${label}${ok ? '' : `  (obtenu ${JSON.stringify(got)}, attendu ${JSON.stringify(want)})`}`);
}
console.log(failed ? `\n${failed} ECHEC(S)` : `\nTOUT PASSE (${cases.length} cas)`);
process.exit(failed ? 1 : 0);
