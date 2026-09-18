/**
 * Absences par periode : decompte des conges, heures d'absence, projection.
 *
 *   node scripts/test-absences.mjs
 *
 * Code recopie de `utils/helpers.ts` (convention du depot : les tests ne
 * compilent pas le TypeScript, ils rejouent la meme logique).
 *
 * Reperes de calendrier : lundi 14/09/2026, mercredi 11/11/2026 (ferie).
 */
const addDaysIso = (isoDate, days) => {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const isoDayIndex = (iso) => (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7;
const weekIdOfIso = (iso) => addDaysIso(iso, -(isoDayIndex(iso) + 1));
const periodDays = (start, end) => {
  if (!start || !end || end < start) return [];
  const out = [];
  for (let d = start; d <= end && out.length < 400; d = addDaysIso(d, 1)) out.push(d);
  return out;
};
const countLeaveDays = (start, end, unit = 'ouvrables', closedDates = [], half) => {
  const lastWorkDay = unit === 'ouvres' ? 4 : 5;
  const closed = new Set(closedDates);
  const n = periodDays(start, end).filter(d => isoDayIndex(d) <= lastWorkDay && !closed.has(d)).length;
  return half && n === 1 ? 0.5 : n;
};
const absenceHoursByDate = (start, end, plannedHoursByDate, plannedWeekIds, weeklyHoursOn,
  workDaysPerWeek = 5, closedDates = [], half) => {
  const days = periodDays(start, end);
  const closed = new Set(closedDates);
  const byWeek = new Map();
  for (const d of days) {
    const w = weekIdOfIso(d);
    byWeek.set(w, [...(byWeek.get(w) || []), d]);
  }
  const perDay = Math.max(1, Math.min(6, workDaysPerWeek));
  const factor = half && days.length === 1 ? 0.5 : 1;
  const out = {};
  for (const [weekId, weekDays] of byWeek) {
    if (plannedWeekIds.has(weekId)) {
      for (const d of weekDays) if (plannedHoursByDate[d]) out[d] = plannedHoursByDate[d] * factor;
    } else {
      const workable = weekDays.filter(d => isoDayIndex(d) <= 5 && !closed.has(d));
      if (workable.length === 0) continue;
      const weekTotal = (weeklyHoursOn(weekDays[0]) / perDay) * Math.min(workable.length, perDay);
      for (const d of workable) if (weekTotal > 0) out[d] = (weekTotal / workable.length) * factor;
    }
  }
  return out;
};
const absenceHours = (...args) => {
  const byDate = absenceHoursByDate(...args);
  return Math.round(Object.values(byDate).reduce((a, b) => a + b, 0) * 100) / 100;
};
const spreadAbsenceHours = (byDate, total, start, end) => {
  if (!(total > 0)) return {};
  let weights = Object.entries(byDate).filter(([, h]) => h > 0);
  if (weights.length === 0) {
    const days = periodDays(start, end);
    const workable = days.filter(d => isoDayIndex(d) <= 5);
    weights = (workable.length ? workable : days).map(d => [d, 1]);
  }
  if (weights.length === 0) return {};
  weights.sort(([a], [b]) => a.localeCompare(b));
  const sum = weights.reduce((a, [, h]) => a + h, 0);
  const cents = Math.round(total * 100);
  // Plus forts restes : chaque jour recoit sa part arrondie par defaut, puis
  // les centimes restants vont aux jours les plus proches du centime suivant.
  // Un jour de 4 h reste a 4 h, au lieu d'encaisser tout l'arrondi (4,02 h).
  const exact = weights.map(([d, h]) => ({ d, raw: (h / sum) * cents }));
  const parts = exact.map(e => ({ ...e, c: Math.floor(e.raw + 1e-9) }));
  let left = cents - parts.reduce((a, e) => a + e.c, 0);
  [...parts].sort((a, b) => (b.raw - b.c) - (a.raw - a.c) || a.d.localeCompare(b.d))
    .forEach(e => { if (left > 0) { e.c += 1; left -= 1; } });
  const out = {};
  for (const e of parts) if (e.c > 0) out[e.d] = e.c / 100;
  return out;
};
const absenceHoursToDeduct = (days, weeklyHoursOn, workDaysPerWeek = 5) => {
  const perDay = Math.max(1, Math.min(6, workDaysPerWeek));
  const byWeek = new Map();
  const seen = new Set();
  for (const a of days) {
    if (seen.has(a.iso)) continue;
    seen.add(a.iso);
    const h = typeof a.hours === 'number'
      ? a.hours
      : isoDayIndex(a.iso) <= 5 ? (weeklyHoursOn(a.iso) / perDay) * (a.half ? 0.5 : 1) : 0;
    const w = weekIdOfIso(a.iso);
    byWeek.set(w, (byWeek.get(w) || 0) + h);
  }
  let total = 0;
  for (const [w, h] of byWeek) total += Math.min(h, weeklyHoursOn(addDaysIso(w, 1)));
  return Math.round(total * 100) / 100;
};
const publicAbsenceKind = (kind) => (kind === 'cp' || kind === 'sans_solde' ? 'conge' : 'absent');
const projectAbsencePeriod = (period) => {
  const out = {};
  const days = periodDays(period.start, period.end);
  for (const d of days) {
    const w = weekIdOfIso(d);
    (out[w] ||= []).push({
      id: `${period.id}-${d}`,
      staffId: period.staffId,
      dayIndex: isoDayIndex(d),
      kind: publicAbsenceKind(period.kind),
      periodId: period.id,
      ...(period.half && days.length === 1 ? { half: period.half } : {}),
      ...(period.hoursByDate ? { hours: period.hoursByDate[d] || 0 } : {}),
    });
  }
  return out;
};

const SUSPENDING_KINDS = ['maladie', 'at_mp', 'maternite_paternite'];
const rangesOverlap = (a, b) => {
  if (a.end < b.start || b.end < a.start) return false;
  return !(a.start === a.end && b.start === b.end && a.half && b.half && a.half !== b.half);
};
const planAbsenceChange = (candidate, previous, existing, countDays, now) => {
  const others = existing
    .filter(p => p.staffId === candidate.staffId && p.id !== candidate.id && rangesOverlap(p, candidate))
    .sort((a, b) => a.start.localeCompare(b.start));
  const suspends = SUSPENDING_KINDS.includes(candidate.kind);
  for (const o of others) {
    if (suspends && o.kind === 'cp') continue;
    return {
      ok: false, conflict: o,
      reason: candidate.kind === 'cp' && SUSPENDING_KINDS.includes(o.kind) ? 'leaveDuringSickness' : 'overlap',
    };
  }
  const changes = [{ period: candidate, previous }];
  let daysGivenBack = 0;
  for (const o of others) {
    const piece = (id, start, end) => {
      if (end < start || countDays(start, end) === 0) return null;
      const days = new Set(periodDays(start, end));
      const hoursByDate = o.hoursByDate
        ? Object.fromEntries(Object.entries(o.hoursByDate).filter(([d]) => days.has(d)))
        : undefined;
      const daysCounted = countDays(start, end);
      const hoursLost = hoursByDate
        ? Math.round(Object.values(hoursByDate).reduce((a, b) => a + b, 0) * 100) / 100
        : Math.round((o.hoursLost * daysCounted / (o.daysCounted || 1)) * 100) / 100;
      const { half: _half, ...rest } = o;
      return {
        ...rest, id, start, end, daysCounted, hoursLost,
        ...(hoursByDate ? { hoursByDate } : {}),
        weekIds: [...new Set(periodDays(start, end).map(weekIdOfIso))],
        updatedAt: now,
      };
    };
    const before = piece(o.id, o.start, addDaysIso(candidate.start, -1));
    const afterStart = addDaysIso(candidate.end, 1);
    const after = piece(before ? `${o.id}-${afterStart.replace(/-/g, '')}` : o.id, afterStart, o.end);
    const kept = [before, after].filter(p => p !== null);
    daysGivenBack += o.daysCounted - kept.reduce((a, p) => a + p.daysCounted, 0);
    if (kept.length === 0) changes.push({ period: null, previous: o });
    kept.forEach(p => changes.push({ period: p, previous: p.id === o.id ? o : null }));
  }
  return { ok: true, changes, daysGivenBack: Math.round(daysGivenBack * 10) / 10 };
};
const applyAbsenceChanges = (absences, weekId, changes) => {
  const touched = new Set(changes.map(c => (c.period || c.previous).id));
  const covered = new Set();
  const added = [];
  for (const c of changes) {
    if (!c.period) continue;
    for (const d of periodDays(c.period.start, c.period.end)) covered.add(`${c.period.staffId}|${d}`);
    added.push(...(projectAbsencePeriod(c.period)[weekId] || []));
  }
  return [
    ...absences.filter(a => a.periodId
      ? !touched.has(a.periodId)
      : !covered.has(`${a.staffId}|${addDaysIso(weekId, a.dayIndex + 1)}`)),
    ...added,
  ];
};
const shiftsWithoutAbsence = (shifts, weekId, period) => {
  if (!period || period.half) return shifts;
  const off = new Set(periodDays(period.start, period.end));
  return shifts.filter(sh => !(sh.staffId === period.staffId && !sh.coverageBy && off.has(addDaysIso(weekId, sh.dayIndex + 1))));
};

const daysInMonth = (iso) => { const [y, m] = iso.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const leaveBalanceSummary = (anchor, periods, staff, today, unit, countDays) => {
  const monthly = unit === 'ouvres' ? 25 / 12 : 2.5;
  const factorOf = new Map();
  for (const p of periods) {
    const f = p.kind === 'sans_solde' || p.kind === 'injustifiee' ? 0 : p.kind === 'maladie' ? 0.8 : 1;
    if (f === 1) continue;
    for (const d of periodDays(p.start, p.end)) factorOf.set(d, Math.min(factorOf.get(d) ?? 1, f));
  }
  const from = addDaysIso(anchor.date, 1);
  const until = staff.endDate && staff.endDate < today ? staff.endDate : today;
  let acquired = 0;
  for (const d of periodDays(from, until)) {
    if (staff.startDate && d < staff.startDate) continue;
    acquired += (monthly / daysInMonth(d)) * (factorOf.get(d) ?? 1);
  }
  let taken = 0;
  let upcoming = 0;
  for (const p of periods) {
    if (p.kind !== 'cp' || p.end < from) continue;
    const s = p.start < from ? from : p.start;
    const days = (a, b) => (b < a ? 0 : p.half && p.start === p.end ? 0.5 : countDays(a, b));
    taken += days(s, p.end < today ? p.end : today);
    upcoming += days(s > today ? s : addDaysIso(today, 1), p.end);
  }
  const r = (n) => Math.round(n * 100) / 100;
  const balance = anchor.balance + acquired - taken;
  return { acquired: r(acquired), taken: r(taken), balance: r(balance), upcoming: r(upcoming), afterUpcoming: r(balance - upcoming) };
};

let failed = 0, n = 0;
const check = (label, ok, extra = '') => {
  n++; if (!ok) failed++;
  console.log((ok ? 'OK     ' : 'ECHEC  ') + label + (!ok && extra !== '' ? `  [${extra}]` : ''));
};
const flat = (h) => h; // lisibilite des appels

// --- calendrier --------------------------------------------------------------
check('Le 14/09/2026 est un lundi', isoDayIndex('2026-09-14') === 0);
check('Le 11/11/2026 est un mercredi', isoDayIndex('2026-11-11') === 2);
check('La semaine du lundi 14/09 a pour identifiant le dimanche 13/09', weekIdOfIso('2026-09-14') === '2026-09-13');
check('Le dimanche 20/09 appartient a la meme semaine', weekIdOfIso('2026-09-20') === '2026-09-13');
check('Une fin avant le debut ne donne aucun jour', periodDays('2026-09-20', '2026-09-14').length === 0);
check('Une fin mal saisie (2062) est plafonnee a 400 jours', periodDays('2026-09-14', '2062-09-14').length === 400);

// --- decompte en jours ouvrables (regle du Code du travail) ------------------
// Semaine de conges : depart lundi 14, reprise lundi 21 -> fin = dimanche 20.
const W = ['2026-09-14', '2026-09-20'];
check('Une semaine de conges = 6 jours ouvrables, meme a temps partiel',
  countLeaveDays(...W) === 6, countLeaveDays(...W));
check('Une semaine de conges = 5 jours ouvres dans le decompte en ouvres',
  countLeaveDays(...W, 'ouvres') === 5, countLeaveDays(...W, 'ouvres'));
check('Absent mercredi, reprise vendredi : 2 jours (mer + jeu)',
  countLeaveDays('2026-09-16', '2026-09-17') === 2);
check('Du samedi au lundi : 2 jours ouvrables (le dimanche ne compte pas)',
  countLeaveDays('2026-09-19', '2026-09-21') === 2, countLeaveDays('2026-09-19', '2026-09-21'));
check('Un dimanche seul ne se decompte pas', countLeaveDays('2026-09-20', '2026-09-20') === 0);
check('Un ferie CHOME dans la semaine n est pas decompte (11/11 -> 5 jours)',
  countLeaveDays('2026-11-09', '2026-11-15', 'ouvrables', ['2026-11-11']) === 5);
check('Un ferie TRAVAILLE (non declare ferme) est decompte (11/11 -> 6 jours)',
  countLeaveDays('2026-11-09', '2026-11-15') === 6);
check('Une demi-journee compte 0,5 jour', countLeaveDays('2026-09-16', '2026-09-16', 'ouvrables', [], 'am') === 0.5);
check('Deux semaines de conges = 12 jours ouvrables', countLeaveDays('2026-09-14', '2026-09-27') === 12);

// --- heures d'absence --------------------------------------------------------
const c20 = () => 20;
const noPlan = new Set();
check('Semaine non planifiee, contrat 20 h sur 3 jours, absent toute la semaine : 20 h',
  absenceHours(...W, {}, noPlan, c20, 3) === 20, absenceHours(...W, {}, noPlan, c20, 3));
check('Semaine non planifiee, contrat 20 h sur 5 jours, 2 jours d arret : 8 h',
  absenceHours('2026-09-16', '2026-09-17', {}, noPlan, c20, 5) === 8,
  absenceHours('2026-09-16', '2026-09-17', {}, noPlan, c20, 5));
check('Semaine non planifiee, 3 jours de travail, 4 jours d absence : plafonne a 20 h',
  absenceHours('2026-09-14', '2026-09-17', {}, noPlan, c20, 3) === 20);
const planned = new Set(['2026-09-13']);
check('Semaine planifiee : on retient les heures des shifts tombant sur l absence (mer 6 h)',
  absenceHours('2026-09-16', '2026-09-17', { '2026-09-16': 6, '2026-09-18': 5 }, planned, c20) === 6);
check('Semaine planifiee autour de l absence : rien a retenir',
  absenceHours('2026-09-16', '2026-09-17', { '2026-09-14': 6, '2026-09-18': 5 }, planned, c20) === 0);
check('Periode a cheval : semaine planifiee (6 h) + semaine suivante au contrat (20 h / 5 j x 2 j)',
  absenceHours('2026-09-19', '2026-09-22', { '2026-09-19': 6 }, planned, c20, 5) === 14,
  absenceHours('2026-09-19', '2026-09-22', { '2026-09-19': 6 }, planned, c20, 5));
check('Avenant : le contrat en vigueur au debut de chaque semaine est applique',
  absenceHours('2026-09-14', '2026-09-27', {}, noPlan, (iso) => (iso < '2026-09-21' ? 20 : 18), 3) === 38);
check('Ferie chome non compte dans l estimation (semaine du 11/11, 5 jours de travail)',
  absenceHours('2026-11-09', '2026-11-15', {}, noPlan, () => 35, 5, ['2026-11-11']) === 35);
check('Demi-journee : moitie des heures du jour',
  absenceHours('2026-09-16', '2026-09-16', {}, noPlan, c20, 5, [], 'pm') === 2);

// --- projection pour l equipe ------------------------------------------------
const proj = projectAbsencePeriod({ id: 'p1', staffId: 'omar', kind: 'maladie', start: '2026-09-19', end: '2026-09-22' });
check('Une periode a cheval se range dans deux semaines', Object.keys(proj).sort().join() === '2026-09-13,2026-09-20');
check('Le dimanche est projete (la personne n est pas disponible)',
  proj['2026-09-13'].some(a => a.dayIndex === 6));
check('Un arret maladie apparait « absent » a l equipe, jamais « maladie »',
  Object.values(proj).flat().every(a => a.kind === 'absent'));
check('Un conge paye apparait « conge »',
  Object.values(projectAbsencePeriod({ id: 'p2', staffId: 'x', kind: 'cp', start: '2026-09-14', end: '2026-09-14' })).flat()[0].kind === 'conge');
check('Un evenement familial reste prive (« absent »)', publicAbsenceKind('famille') === 'absent');
check('Chaque jour projete porte l identifiant de sa periode', Object.values(proj).flat().every(a => a.periodId === 'p1'));
const again = projectAbsencePeriod({ id: 'p1', staffId: 'omar', kind: 'maladie', start: '2026-09-19', end: '2026-09-22' });
check('Re-projeter donne les memes identifiants (remplacement sans doublon)',
  JSON.stringify(Object.values(again).flat().map(a => a.id)) === JSON.stringify(Object.values(proj).flat().map(a => a.id)));
check('Une demi-journee garde son indication dans la projection',
  projectAbsencePeriod({ id: 'p3', staffId: 'x', kind: 'cp', start: '2026-09-16', end: '2026-09-16', half: 'am' })['2026-09-13'][0].half === 'am');

// --- Lot 3 : heures jour par jour, attendu du contrat reduit ------------------------
const sum = (o) => Math.round(Object.values(o).reduce((a, b) => a + b, 0) * 100) / 100;
const d2 = absenceHoursByDate('2026-09-16', '2026-09-17', {}, noPlan, c20, 5);
check('Detail au contrat : 20 h / 5 j = 4 h le mercredi et 4 h le jeudi',
  d2['2026-09-16'] === 4 && d2['2026-09-17'] === 4, JSON.stringify(d2));
const dPlan = absenceHoursByDate('2026-09-16', '2026-09-17', { '2026-09-16': 6, '2026-09-18': 5 }, planned, c20);
check('Detail planifie : seuls les jours avec shift portent des heures (mer 6 h)',
  JSON.stringify(dPlan) === '{"2026-09-16":6}', JSON.stringify(dPlan));
const dWeek = absenceHoursByDate(...W, {}, noPlan, c20, 3);
check('Semaine entiere, 3 jours de travail : 20 h reparties sur les 6 jours ouvrables, dimanche exclu',
  sum(dWeek) === 20 && !('2026-09-20' in dWeek), JSON.stringify(dWeek));
const sp = spreadAbsenceHours({ '2026-09-16': 4, '2026-09-17': 4 }, 10, '2026-09-16', '2026-09-17');
check('Total corrige a 10 h : reparti au prorata (5 h + 5 h)', sp['2026-09-16'] === 5 && sp['2026-09-17'] === 5, JSON.stringify(sp));
const sp3 = spreadAbsenceHours({ a: 1, b: 1, c: 1 }, 10, '', '');
check('Arrondi au centieme : la somme vaut exactement le total (3,33 + 3,33 + 3,34)', sum(sp3) === 10, JSON.stringify(sp3));
const spMix = spreadAbsenceHours({ a: 10 / 3, b: 10 / 3, c: 10 / 3, d: 4, e: 4 }, 18, '', '');
check('Arrondi : les jours ronds restent ronds (4 h reste 4 h, pas 4,02 h)', spMix.d === 4 && spMix.e === 4 && sum(spMix) === 18, JSON.stringify(spMix));
const spEmpty = spreadAbsenceHours({}, 7, '2026-09-19', '2026-09-20');
check('Rien de prevu mais 7 h saisies : tout sur le samedi (le dimanche est ecarte)',
  JSON.stringify(spEmpty) === '{"2026-09-19":7}', JSON.stringify(spEmpty));
check('Zero heure retenue : aucun detail', Object.keys(spreadAbsenceHours({ x: 4 }, 0, '', '')).length === 0);
const projH = projectAbsencePeriod({ id: 'p4', staffId: 'x', kind: 'cp', start: '2026-09-16', end: '2026-09-17',
  hoursByDate: { '2026-09-16': 6 } });
check('La projection porte les heures de chaque jour (6 h mer, 0 h jeu)',
  projH['2026-09-13'][0].hours === 6 && projH['2026-09-13'][1].hours === 0);
check('Periode ancienne sans detail : la projection ne porte pas d heures',
  !('hours' in projectAbsencePeriod({ id: 'p5', staffId: 'x', kind: 'cp', start: '2026-09-16', end: '2026-09-16' })['2026-09-13'][0]));
const c24 = () => 24;
check('Attendu : 2 jours de conge portant 8 h chacun retranchent 16 h',
  absenceHoursToDeduct([{ iso: '2026-09-16', hours: 8 }, { iso: '2026-09-17', hours: 8 }], c24) === 16);
check('Attendu : jour planifie autour (0 h) ne retranche rien',
  absenceHoursToDeduct([{ iso: '2026-09-16', hours: 0 }], c24) === 0);
check('Ancienne etiquette sans heures : contrat / jours travailles (24 h / 4 j = 6 h)',
  absenceHoursToDeduct([{ iso: '2026-09-16' }], c24, 4) === 6);
check('Ancienne etiquette le dimanche : rien a retrancher', absenceHoursToDeduct([{ iso: '2026-09-20' }], c24) === 0);
check('Ancienne demi-journee : moitie (24 h / 4 j / 2 = 3 h)', absenceHoursToDeduct([{ iso: '2026-09-16', half: 'am' }], c24, 4) === 3);
check('Semaine entiere en anciennes etiquettes : plafonne au contrat (24 h, jamais plus)',
  absenceHoursToDeduct(periodDays(...W).map(iso => ({ iso })), c24, 4) === 24);
check('Deux etiquettes le meme jour ne retranchent qu une fois',
  absenceHoursToDeduct([{ iso: '2026-09-16', hours: 8 }, { iso: '2026-09-16', hours: 8 }], c24) === 8);
check('Mois a cheval sur deux semaines : chaque semaine plafonnee a son contrat',
  absenceHoursToDeduct([...periodDays('2026-09-14', '2026-09-27').map(iso => ({ iso }))], c24, 4) === 48);

// --- Chevauchements : une absence par jour, l'arret interrompt les conges ----------
const cd = (a, b) => countLeaveDays(a, b);
const mk = (id, kind, start, end, extra = {}) => ({
  id, staffId: 'omar', kind, start, end, daysCounted: countLeaveDays(start, end, 'ouvrables', [], extra.half),
  hoursLost: 0, justificatif: 'none', weekIds: [...new Set(periodDays(start, end).map(weekIdOfIso))],
  createdAt: 'x', createdBy: 'x', updatedAt: 'x', ...extra,
});
const cp1416 = mk('cp1', 'cp', '2026-09-14', '2026-09-16', { hoursLost: 21, hoursByDate: { '2026-09-14': 7, '2026-09-15': 7, '2026-09-16': 7 } });
let r = planAbsenceChange(mk('new', 'cp', '2026-09-16', '2026-09-16', { half: 'am' }), null, [cp1416], cd, 'now');
check('Demi-conge le 16 sur un conge qui couvre deja le 16 : refuse', !r.ok && r.reason === 'overlap' && r.conflict.id === 'cp1');
r = planAbsenceChange(mk('new', 'cp', '2026-09-15', '2026-09-18'), null, [cp1416], cd, 'now');
check('Deux conges qui se recouvrent : refuse', !r.ok && r.reason === 'overlap');
r = planAbsenceChange(mk('new', 'cp', '2026-09-17', '2026-09-18'), null, [cp1416], cd, 'now');
check('Conge qui commence le lendemain : accepte, rien a raccourcir', r.ok && r.changes.length === 1);
r = planAbsenceChange(mk('new', 'cp', '2026-09-14', '2026-09-16'), null, [{ ...cp1416, staffId: 'double' }], cd, 'now');
check('Meme dates pour une autre personne : accepte', r.ok);
r = planAbsenceChange({ ...cp1416, end: '2026-09-18' }, cp1416, [cp1416], cd, 'now');
check('Modifier un conge ne le compare pas a lui-meme', r.ok && r.changes.length === 1);

const sick1617 = mk('sick', 'maladie', '2026-09-16', '2026-09-17');
r = planAbsenceChange(sick1617, null, [cp1416], cd, 'now');
check('Arret 16-17 sur conge 14-16 : accepte, le conge est raccourci au 14-15', r.ok && r.changes.length === 2
  && r.changes[1].period.id === 'cp1' && r.changes[1].period.start === '2026-09-14' && r.changes[1].period.end === '2026-09-15',
  JSON.stringify(r.changes.map(c => c.period && [c.period.id, c.period.start, c.period.end])));
check('Le conge raccourci compte 2 jours et 14 h (heures du 14 et du 15)',
  r.ok && r.changes[1].period.daysCounted === 2 && r.changes[1].period.hoursLost === 14);
check('1 jour rendu au salarie', r.ok && r.daysGivenBack === 1, r.daysGivenBack);
check('Le conge raccourci garde son etat precedent (pour retirer ses jours du planning)', r.ok && r.changes[1].previous === cp1416);

const cp1419 = mk('cp2', 'cp', '2026-09-14', '2026-09-19');
r = planAbsenceChange(mk('sick2', 'maladie', '2026-09-16', '2026-09-16'), null, [cp1419], cd, 'now');
const ids = r.ok ? r.changes.slice(1).map(c => `${c.period.id}:${c.period.start}>${c.period.end}`) : [];
check('Arret au milieu des conges : coupe en deux (14-15 et 17-19)',
  r.ok && ids.join() === 'cp2:2026-09-14>2026-09-15,cp2-20260917:2026-09-17>2026-09-19', ids.join());
check('La seconde moitie est une nouvelle periode', r.ok && r.changes[2].previous === null);
check('Sans detail des heures (ancienne periode) : heures au prorata des jours', (() => {
  const old = mk('cp3', 'cp', '2026-09-14', '2026-09-19', { hoursLost: 30 });
  const q = planAbsenceChange(mk('s3', 'maladie', '2026-09-17', '2026-09-19'), null, [old], cd, 'now');
  return q.ok && q.changes[1].period.hoursLost === 15;
})());
r = planAbsenceChange(mk('sick3', 'at_mp', '2026-09-14', '2026-09-20'), null, [cp1416], cd, 'now');
check('Accident du travail couvrant tout le conge : le conge est annule', r.ok && r.changes[1].period === null && r.changes[1].previous.id === 'cp1');
check('... et ses 3 jours sont rendus', r.ok && r.daysGivenBack === 3);
r = planAbsenceChange(mk('sick4', 'maladie', '2026-09-14', '2026-09-19'), null, [mk('cp4', 'cp', '2026-09-14', '2026-09-20')], cd, 'now');
check('Il ne reste qu un dimanche : pas de conge fantome', r.ok && r.changes[1].period === null);
r = planAbsenceChange(mk('new', 'cp', '2026-09-17', '2026-09-18'), null, [sick1617], cd, 'now');
check('Conge pose sur un arret : refuse (on ne prend pas de conges pendant un arret)', !r.ok && r.reason === 'leaveDuringSickness');
r = planAbsenceChange(mk('new', 'maladie', '2026-09-17', '2026-09-18'), null, [sick1617], cd, 'now');
check('Deux arrets qui se recouvrent : refuse (prolonger l arret existant)', !r.ok && r.reason === 'overlap');
r = planAbsenceChange(mk('new', 'maladie', '2026-09-15', '2026-09-15'), null, [mk('f', 'famille', '2026-09-15', '2026-09-15')], cd, 'now');
check('Arret sur un evenement familial : refuse (seuls les conges payes sont raccourcis)', !r.ok);
r = planAbsenceChange(mk('new', 'famille', '2026-09-15', '2026-09-15'), null, [cp1416], cd, 'now');
check('Evenement familial pendant des conges : refuse', !r.ok && r.reason === 'overlap');
r = planAbsenceChange(mk('new', 'injustifiee', '2026-09-16', '2026-09-16', { half: 'pm' }), null,
  [mk('cpam', 'cp', '2026-09-16', '2026-09-16', { half: 'am' })], cd, 'now');
check('Conge le matin + absence l apres-midi : accepte', r.ok && r.changes.length === 1);
r = planAbsenceChange(mk('new', 'cp', '2026-09-16', '2026-09-16', { half: 'am' }), null,
  [mk('cpam', 'cp', '2026-09-16', '2026-09-16', { half: 'am' })], cd, 'now');
check('Deux fois le meme matin : refuse', !r.ok);

// Application dans les semaines
const legacy = { id: 'old', staffId: 'omar', dayIndex: 2, kind: 'conge' };        // mer 16/09, sans periode
const otherLegacy = { id: 'old2', staffId: 'omar', dayIndex: 4, kind: 'conge' };  // ven 18/09
const r2 = planAbsenceChange(sick1617, null, [cp1416], cd, 'now');
const before = [...(projectAbsencePeriod(cp1416)['2026-09-13']), legacy, otherLegacy];
const after = applyAbsenceChanges(before, '2026-09-13', r2.changes);
const days = (pid) => after.filter(a => a.periodId === pid).map(a => a.dayIndex).join();
check('Semaine : le conge ne couvre plus que lun-mar', days('cp1') === '0,1', days('cp1'));
check('Semaine : l arret couvre mer-jeu', days('sick') === '2,3', days('sick'));
check('Un jour, une seule etiquette : l ancienne etiquette du mercredi est remplacee', !after.some(a => a.id === 'old'));
check('Une ancienne etiquette hors de la periode reste', after.some(a => a.id === 'old2'));
const delAll = applyAbsenceChanges(after, '2026-09-13', [{ period: null, previous: sick1617 }]);
check('Supprimer l arret retire ses jours, rien d autre', delAll.length === after.length - 2);
const sh = [
  { id: 'x1', staffId: 'omar', dayIndex: 2 }, { id: 'x2', staffId: 'omar', dayIndex: 4 },
  { id: 'x3', staffId: 'omar', dayIndex: 3, coverageBy: 'double' }, { id: 'x4', staffId: 'double', dayIndex: 2 },
];
check('Shifts retires : les siens pendant l arret, pas ceux repris par un collegue ni ceux des autres',
  shiftsWithoutAbsence(sh, '2026-09-13', sick1617).map(s => s.id).join() === 'x2,x3,x4');
check('Demi-journee : aucun shift retire', shiftsWithoutAbsence(sh, '2026-09-13', mk('h', 'cp', '2026-09-16', '2026-09-16', { half: 'am' })).length === 4);

// --- Compteur de conges payes (ancre bulletin) -------------------------------------
const A = { date: '2026-08-31', balance: 10 };
const cdo = (a, b) => countLeaveDays(a, b);
let L = leaveBalanceSummary(A, [], {}, '2026-09-30', 'ouvrables', cdo);
check('Un mois complet de presence : +2,5 j (30 j/an en ouvrables)', L.acquired === 2.5 && L.balance === 12.5, JSON.stringify(L));
L = leaveBalanceSummary(A, [], {}, '2026-09-30', 'ouvres', (a, b) => countLeaveDays(a, b, 'ouvres'));
check('En ouvres : +2,08 j par mois (25 j/an)', L.acquired === 2.08, L.acquired);
L = leaveBalanceSummary(A, [{ kind: 'cp', start: '2026-09-14', end: '2026-09-19' }], {}, '2026-09-30', 'ouvrables', cdo);
check('Une semaine de conges prise : -6 j, et elle acquiert quand meme (assimilee)', L.taken === 6 && L.balance === 6.5, JSON.stringify(L));
L = leaveBalanceSummary(A, [{ kind: 'maladie', start: '2026-09-01', end: '2026-09-30' }], {}, '2026-09-30', 'ouvrables', cdo);
check('Un mois d arret maladie : +2 j seulement (loi 2024)', L.acquired === 2, L.acquired);
L = leaveBalanceSummary(A, [{ kind: 'at_mp', start: '2026-09-01', end: '2026-09-30' }], {}, '2026-09-30', 'ouvrables', cdo);
check('Un mois d accident du travail : +2,5 j (assimile)', L.acquired === 2.5, L.acquired);
L = leaveBalanceSummary(A, [{ kind: 'sans_solde', start: '2026-09-01', end: '2026-09-30' }], {}, '2026-09-30', 'ouvrables', cdo);
check('Un mois sans solde : rien d acquis', L.acquired === 0, L.acquired);
L = leaveBalanceSummary(A, [], { startDate: '2026-09-16' }, '2026-09-30', 'ouvrables', cdo);
check('Embauche le 16 : moitie du mois (1,25 j)', L.acquired === 1.25, L.acquired);
L = leaveBalanceSummary(A, [], { endDate: '2026-09-15' }, '2026-09-30', 'ouvrables', cdo);
check('Parti le 15 : acquisition arretee a son depart (1,25 j)', L.acquired === 1.25, L.acquired);
L = leaveBalanceSummary(A, [{ kind: 'cp', start: '2026-09-28', end: '2026-10-03' }], {}, '2026-09-30', 'ouvrables', cdo);
check('Conge a cheval sur aujourd hui : 3 j pris (lun-mer), 3 j a venir (jeu-sam)', L.taken === 3 && L.upcoming === 3, JSON.stringify(L));
check('... solde apres les conges poses = solde - a venir', L.afterUpcoming === L.balance - 3);
L = leaveBalanceSummary(A, [{ kind: 'cp', start: '2026-08-10', end: '2026-08-15' }], {}, '2026-09-30', 'ouvrables', cdo);
check('Un conge d avant le bulletin est deja dans le solde du bulletin : pas decompte', L.taken === 0);
L = leaveBalanceSummary(A, [{ kind: 'cp', start: '2026-09-16', end: '2026-09-16', half: 'am' }], {}, '2026-09-30', 'ouvrables', cdo);
check('Demi-journee de conge : 0,5 j', L.taken === 0.5, L.taken);
L = leaveBalanceSummary(A, [{ kind: 'maladie', start: '2026-09-01', end: '2026-09-30' }], {}, '2026-08-31', 'ouvrables', cdo);
check('Le jour meme du bulletin : rien d acquis, rien de pris', L.acquired === 0 && L.balance === 10);

console.log(failed ? `\n${failed} ECHEC(S) sur ${n}` : `\nTOUT PASSE (${n} cas)`);
process.exit(failed ? 1 : 0);
