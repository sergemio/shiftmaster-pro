/**
 * Jours feries francais calcules (Paques et derives), feries fermes.
 *
 *   node scripts/test-holidays.mjs
 *
 * Code recopie de `utils/helpers.ts` (convention du depot). Reperes : dates de
 * Paques officielles 2024 (31/03), 2025 (20/04), 2026 (05/04), 2027 (28/03),
 * 2038 (25/04, la plus tardive possible).
 */
const addDaysIso = (isoDate, days) => {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const easterSunday = (year) => {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
const frenchPublicHolidays = (year) => {
  const easter = easterSunday(year);
  const fixed = (mmdd) => `${year}-${mmdd}`;
  return [
    { key: 'jan1', date: fixed('01-01') }, { key: 'easterMonday', date: addDaysIso(easter, 1) },
    { key: 'may1', date: fixed('05-01') }, { key: 'may8', date: fixed('05-08') },
    { key: 'ascension', date: addDaysIso(easter, 39) }, { key: 'whitMonday', date: addDaysIso(easter, 50) },
    { key: 'jul14', date: fixed('07-14') }, { key: 'aug15', date: fixed('08-15') },
    { key: 'nov1', date: fixed('11-01') }, { key: 'nov11', date: fixed('11-11') }, { key: 'dec25', date: fixed('12-25') },
  ].sort((x, y) => x.date.localeCompare(y.date));
};
const holidaysBetween = (start, end) => {
  if (!start || !end || end < start) return [];
  const out = [];
  for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
    for (const h of frenchPublicHolidays(y)) if (h.date >= start && h.date <= end) out.push(h);
  }
  return out;
};
const closedHolidayDates = (start, end, closed = []) =>
  holidaysBetween(start, end).filter(h => closed.includes(h.key)).map(h => h.date);

let failed = 0, n = 0;
const check = (label, ok, extra = '') => {
  n++; if (!ok) failed++;
  console.log((ok ? 'OK     ' : 'ECHEC  ') + label + (!ok && extra !== '' ? `  [${extra}]` : ''));
};
const on = (y, key) => frenchPublicHolidays(y).find(h => h.key === key).date;

check('Paques 2024 = 31 mars', easterSunday(2024) === '2024-03-31', easterSunday(2024));
check('Paques 2025 = 20 avril', easterSunday(2025) === '2025-04-20', easterSunday(2025));
check('Paques 2026 = 5 avril', easterSunday(2026) === '2026-04-05', easterSunday(2026));
check('Paques 2027 = 28 mars', easterSunday(2027) === '2027-03-28', easterSunday(2027));
check('Paques 2038 = 25 avril (la plus tardive)', easterSunday(2038) === '2038-04-25', easterSunday(2038));
check('Lundi de Paques 2026 = 6 avril', on(2026, 'easterMonday') === '2026-04-06');
check('Ascension 2026 = jeudi 14 mai', on(2026, 'ascension') === '2026-05-14');
check('Lundi de Pentecote 2026 = 25 mai', on(2026, 'whitMonday') === '2026-05-25');
check('Ascension 2027 = jeudi 6 mai', on(2027, 'ascension') === '2027-05-06', on(2027, 'ascension'));
check('Onze feries par an', frenchPublicHolidays(2026).length === 11);
check('Tries dans l ordre du calendrier',
  frenchPublicHolidays(2026).every((h, i, a) => i === 0 || a[i - 1].date <= h.date));
check('Semaine du 9 au 15 nov 2026 : un ferie, l Armistice',
  JSON.stringify(holidaysBetween('2026-11-09', '2026-11-15')) === JSON.stringify([{ key: 'nov11', date: '2026-11-11' }]));
check('Periode a cheval sur deux annees : Noel et jour de l an',
  holidaysBetween('2026-12-20', '2027-01-03').map(h => h.key).join() === 'dec25,jan1');
check('Aucun ferie ferme par defaut', closedHolidayDates('2026-01-01', '2026-12-31').length === 0);
check('Ferme le 25/12 et le 1/1 : ces deux dates, et seulement elles',
  closedHolidayDates('2026-12-20', '2027-01-03', ['dec25', 'jan1']).join() === '2026-12-25,2027-01-01');
check('Un ferie ferme hors periode n est pas retenu',
  closedHolidayDates('2026-11-09', '2026-11-15', ['dec25']).length === 0);

console.log(failed ? `\n${failed} ECHEC(S) sur ${n}` : `\nTOUT PASSE (${n} cas)`);
process.exit(failed ? 1 : 0);
