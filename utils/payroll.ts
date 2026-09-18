import { Staff, Shift, AbsencePeriod, LeaveKind } from '../types';
import { addDaysIso, contractHoursOn, daysInMonth, monthlyContractHours } from './helpers';

// =============================================================================
// ELEMENTS VARIABLES DE PAIE — ce que l'employeur transmet chaque mois
// =============================================================================
//
// L'app ne fait pas la paie : elle donne au comptable ce qu'il ne peut pas
// deviner. Par salarie : entree / sortie, avenants, heures travaillees, absences
// par motif (dates, jours decomptes, heures), heures au-dela du contrat. Les
// taux de majoration, le maintien de salaire, la carence et les IJSS restent
// son affaire : ils dependent de la convention et de l'anciennete.
//
// Heures au-dela du contrat : comptees PAR SEMAINE CIVILE (lundi -> dimanche),
// sur le seul travail effectif — un conge ou un arret n'est pas du travail
// effectif, il ne fait pas naitre d'heures supplementaires (Code du travail,
// L3121-28 ; sauf accord plus favorable). Une semaine a cheval sur deux mois
// est rattachee au mois de son DIMANCHE, pratique courante des cabinets : elle
// n'apparait ainsi qu'une fois.

/** Duree legale du travail, par semaine. Au-dessous : temps partiel. */
export const LEGAL_WEEKLY_HOURS = 35;

export interface PayrollAbsence {
  periodId: string;
  kind: LeaveKind;
  /** Bornes de la periode DANS le mois. */
  start: string;
  end: string;
  /** Bornes de la periode entiere : « suite en octobre ». */
  fullStart: string;
  fullEnd: string;
  half?: 'am' | 'pm';
  /** Jours decomptes tombant dans le mois. */
  days: number;
  /** Heures d'absence tombant dans le mois. */
  hours: number;
  justificatif: 'none' | 'received';
  note?: string;
}

export interface PayrollWeek {
  monday: string;
  sunday: string;
  worked: number;
  contract: number;
  /** Heures au-dela du contrat. */
  extra: number;
  /** Temps partiel : complementaires ; temps plein : supplementaires. */
  kind: 'complementaires' | 'supplementaires';
  /** Temps partiel : part au-dela du dixieme du contrat (majoree a 25 % et non 10 %, L3123-29). */
  beyondTenth: number;
  /** Temps partiel dont la semaine atteint 35 h : interdit (L3123-9). */
  reachesLegal: boolean;
}

export interface PayrollLine {
  staffId: string;
  name: string;
  /** Contrat hebdomadaire au dernier jour du mois (ou d'emploi). 0 = sans contrat saisi. */
  weeklyHours: number;
  /** Base mensualisee : 35 h = 151,67 h (52/12). */
  monthlyBase: number;
  entry?: string;
  exit?: string;
  /** Avenants qui prennent effet dans le mois. */
  contractChanges: { from: string; weeklyHours: number }[];
  worked: number;
  absences: PayrollAbsence[];
  /** Semaines rattachees au mois ou la personne depasse son contrat. */
  weeks: PayrollWeek[];
}

/** Extras et lignes partagees : payes a la mission, hors contrat hebdomadaire. */
export interface PayrollExtraLine {
  staffId: string;
  name: string;
  /** Jours travailles, ISO. */
  days: string[];
  hours: number;
}

export interface PayrollMonth {
  month: string;
  lines: PayrollLine[];
  extras: PayrollExtraLine[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * @param month        'YYYY-MM'
 * @param shiftsByWeek shifts par weekId (dimanche) : toutes les semaines qui
 *                     touchent le mois (`weekIdsForMonth`)
 * @param periods      toutes les absences connues ; on garde celles du mois
 * @param countDays    decompte des conges d'un morceau de periode (unite + feries fermes)
 * @param extraNames   nom complet des extras par identifiant (fiches admin) ;
 *                     a defaut, le prenom recopie sur le shift
 */
export const payrollVariables = (
  month: string,
  staff: Staff[],
  shiftsByWeek: Record<string, Shift[]>,
  periods: AbsencePeriod[],
  countDays: (start: string, end: string) => number,
  extraNames: Record<string, string> = {},
): PayrollMonth => {
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(first)).padStart(2, '0')}`;
  const inMonth = (iso: string) => iso >= first && iso <= last;

  const byId = new Map(staff.map(s => [s.id, s]));
  const isContracted = (id: string) => {
    const s = byId.get(id);
    return !!s && !s.isPool && !s.isExtra;
  };

  // Heures par personne et par jour, sur toutes les semaines chargees.
  const hoursByPersonDate = new Map<string, Map<string, number>>();
  const extraRows = new Map<string, PayrollExtraLine>();
  for (const [weekId, shifts] of Object.entries(shiftsByWeek)) {
    for (const sh of shifts || []) {
      const iso = addDaysIso(weekId, sh.dayIndex + 1);
      const h = sh.endTime - sh.startTime;
      // Un shift couvert compte pour celui qui le fait.
      const who = sh.coverageBy || sh.staffId;
      if (sh.extraName || !isContracted(who)) {
        if (!inMonth(iso)) continue;
        const name = extraNames[who] || byId.get(who)?.name || sh.extraName || who;
        const row = extraRows.get(who) || { staffId: who, name, days: [], hours: 0 };
        if (!row.days.includes(iso)) row.days.push(iso);
        row.hours += h;
        extraRows.set(who, row);
        continue;
      }
      const m = hoursByPersonDate.get(who) || new Map<string, number>();
      m.set(iso, (m.get(iso) || 0) + h);
      hoursByPersonDate.set(who, m);
    }
  }

  const lines: PayrollLine[] = [];
  for (const s of staff) {
    if (s.isPool || s.isExtra) continue;
    if (s.startDate && s.startDate > last) continue;
    if (s.endDate && s.endDate < first) continue;
    const hours = hoursByPersonDate.get(s.id) || new Map<string, number>();

    let worked = 0;
    for (const [iso, h] of hours) if (inMonth(iso)) worked += h;

    const absences: PayrollAbsence[] = periods
      .filter(p => p.staffId === s.id && p.start <= last && p.end >= first)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map(p => {
        const start = p.start < first ? first : p.start;
        const end = p.end > last ? last : p.end;
        const days = p.half && p.start === p.end ? 0.5 : countDays(start, end);
        let h: number;
        if (p.hoursByDate) {
          h = Object.entries(p.hoursByDate).reduce((n, [d, v]) => (d >= start && d <= end ? n + v : n), 0);
        } else if (start === p.start && end === p.end) {
          h = p.hoursLost;
        } else {
          h = p.daysCounted > 0 ? p.hoursLost * days / p.daysCounted : 0;
        }
        return {
          periodId: p.id, kind: p.kind, start, end, fullStart: p.start, fullEnd: p.end,
          ...(p.half ? { half: p.half } : {}),
          days, hours: round2(h), justificatif: p.justificatif,
          ...(p.note ? { note: p.note } : {}),
        };
      });

    // Semaines dont le dimanche tombe dans le mois.
    const weeks: PayrollWeek[] = [];
    for (const weekId of Object.keys(shiftsByWeek).sort()) {
      const monday = addDaysIso(weekId, 1);
      const sunday = addDaysIso(weekId, 7);
      if (!inMonth(sunday)) continue;
      const contract = contractHoursOn(s, monday);
      if (contract <= 0) continue;
      let w = 0;
      for (let i = 0; i < 7; i++) w += hours.get(addDaysIso(monday, i)) || 0;
      const extra = w - contract;
      if (extra < 0.01) continue;
      const partTime = contract < LEGAL_WEEKLY_HOURS;
      weeks.push({
        monday, sunday, worked: round2(w), contract, extra: round2(extra),
        kind: partTime ? 'complementaires' : 'supplementaires',
        beyondTenth: partTime ? round2(Math.max(0, extra - contract / 10)) : 0,
        reachesLegal: partTime && w >= LEGAL_WEEKLY_HOURS,
      });
    }

    const refDay = s.endDate && s.endDate < last ? s.endDate : last;
    const weeklyHours = contractHoursOn(s, refDay);
    if (weeklyHours <= 0 && worked === 0 && absences.length === 0) continue;

    lines.push({
      staffId: s.id,
      name: s.name,
      weeklyHours,
      monthlyBase: round2(monthlyContractHours(s, first)),
      ...(s.startDate && inMonth(s.startDate) ? { entry: s.startDate } : {}),
      ...(s.endDate && inMonth(s.endDate) ? { exit: s.endDate } : {}),
      contractChanges: (s.contractChanges || []).filter(c => inMonth(c.from)).sort((a, b) => a.from.localeCompare(b.from)),
      worked: round2(worked),
      absences,
      weeks,
    });
  }

  lines.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const extras = [...extraRows.values()]
    .map(r => ({ ...r, days: r.days.sort(), hours: round2(r.hours) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return { month, lines, extras };
};

// -----------------------------------------------------------------------------
// Mise en forme : un texte a coller dans un mail, et un CSV pour un tableur.
// Les libelles viennent de l'appelant (traductions) : ce module reste pur.
// -----------------------------------------------------------------------------

export interface PayrollLabels {
  title: string;              // « Éléments variables de paie — septembre 2026 »
  contract: string;           // « contrat {h} h/semaine (base {base} h/mois) »
  noContract: string;         // « contrat non renseigné »
  entry: string;              // « Entrée le {date} »
  exit: string;               // « Sortie le {date} (dernier jour travaillé) »
  change: string;             // « Avenant : {h} h/semaine à partir du {date} »
  worked: string;             // « Heures travaillées : {h} h »
  noAbsence: string;          // « Absences : aucune »
  absences: string;           // « Absences : »
  absenceLine: string;        // « {kind} du {from} au {to} : {days} j, {h} h »
  halfDay: string;            // « (demi-journée) »
  continues: string;          // « (période du {from} au {to}) »
  justifReceived: string;     // « justificatif reçu »
  justifMissing: string;      // « justificatif non reçu »
  weekLine: string;           // « Semaine du {from} au {to} : {worked} h pour {contract} h de contrat, soit {extra} h {kind} »
  beyondTenth: string;        // « dont {h} h au-delà du dixième du contrat »
  reachesLegal: string;       // « ⚠ 35 h atteintes : interdit pour un temps partiel »
  complementaires: string;
  supplementaires: string;
  extrasTitle: string;        // « Extras (hors contrat) »
  extraLine: string;          // « {name} : {h} h sur {n} jour(s) — {dates} »
  daysUnit: string;           // « j »
  footer: string;             // « Chiffres issus du planning… »
  kindLabel: (kind: LeaveKind) => string;
  date: (iso: string) => string;
  num: (n: number) => string;
  csvHeader: string[];        // Salarié, Rubrique, Du, Au, Jours, Heures, Détail
  csvWorked: string;
  csvEntry: string;
  csvExit: string;
  csvChange: string;
  csvExtra: string;           // « Extra »
}

const fill = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));

export const payrollText = (pm: PayrollMonth, L: PayrollLabels): string => {
  const out: string[] = [L.title, ''];
  for (const line of pm.lines) {
    const head = line.weeklyHours > 0
      ? fill(L.contract, { h: L.num(line.weeklyHours), base: L.num(line.monthlyBase) })
      : L.noContract;
    out.push(`${line.name.toUpperCase()} — ${head}`);
    if (line.entry) out.push('  ' + fill(L.entry, { date: L.date(line.entry) }));
    if (line.exit) out.push('  ' + fill(L.exit, { date: L.date(line.exit) }));
    for (const c of line.contractChanges) out.push('  ' + fill(L.change, { h: L.num(c.weeklyHours), date: L.date(c.from) }));
    out.push('  ' + fill(L.worked, { h: L.num(line.worked) }));
    if (line.absences.length === 0) {
      out.push('  ' + L.noAbsence);
    } else {
      out.push('  ' + L.absences);
      for (const a of line.absences) {
        let s = fill(L.absenceLine, {
          kind: L.kindLabel(a.kind), from: L.date(a.start), to: L.date(a.end),
          days: L.num(a.days), h: L.num(a.hours),
        });
        if (a.half) s += ' ' + L.halfDay;
        if (a.fullStart !== a.start || a.fullEnd !== a.end) {
          s += ' ' + fill(L.continues, { from: L.date(a.fullStart), to: L.date(a.fullEnd) });
        }
        if (a.kind === 'maladie' || a.kind === 'at_mp' || a.kind === 'maternite_paternite') {
          s += ', ' + (a.justificatif === 'received' ? L.justifReceived : L.justifMissing);
        }
        if (a.note) s += ` — ${a.note}`;
        out.push('   - ' + s);
      }
    }
    for (const w of line.weeks) {
      let s = fill(L.weekLine, {
        from: L.date(w.monday), to: L.date(w.sunday), worked: L.num(w.worked),
        contract: L.num(w.contract), extra: L.num(w.extra),
        kind: w.kind === 'complementaires' ? L.complementaires : L.supplementaires,
      });
      if (w.beyondTenth > 0) s += ', ' + fill(L.beyondTenth, { h: L.num(w.beyondTenth) });
      if (w.reachesLegal) s += ' ' + L.reachesLegal;
      out.push('  ' + s);
    }
    out.push('');
  }
  if (pm.extras.length) {
    out.push(L.extrasTitle);
    for (const e of pm.extras) {
      out.push('  ' + fill(L.extraLine, {
        name: e.name, h: L.num(e.hours), n: String(e.days.length), dates: e.days.map(L.date).join(', '),
      }));
    }
    out.push('');
  }
  out.push(L.footer);
  return out.join('\n');
};

/** CSV au format des tableurs francais : point-virgule, virgule decimale. */
export const payrollCsv = (pm: PayrollMonth, L: PayrollLabels): string => {
  const rows: string[][] = [L.csvHeader];
  const n = (x: number) => String(x).replace('.', ',');
  for (const line of pm.lines) {
    if (line.entry) rows.push([line.name, L.csvEntry, line.entry, '', '', '', '']);
    if (line.exit) rows.push([line.name, L.csvExit, line.exit, '', '', '', '']);
    for (const c of line.contractChanges) rows.push([line.name, L.csvChange, c.from, '', '', n(c.weeklyHours), '']);
    rows.push([line.name, L.csvWorked, `${pm.month}-01`, '', '', n(line.worked),
      line.weeklyHours > 0 ? fill(L.contract, { h: n(line.weeklyHours), base: n(line.monthlyBase) }) : L.noContract]);
    for (const a of line.absences) {
      const detail = [
        a.half ? L.halfDay : '',
        a.fullStart !== a.start || a.fullEnd !== a.end ? fill(L.continues, { from: a.fullStart, to: a.fullEnd }) : '',
        a.kind === 'maladie' || a.kind === 'at_mp' || a.kind === 'maternite_paternite'
          ? (a.justificatif === 'received' ? L.justifReceived : L.justifMissing) : '',
        a.note || '',
      ].filter(Boolean).join(' ; ');
      rows.push([line.name, L.kindLabel(a.kind), a.start, a.end, n(a.days), n(a.hours), detail]);
    }
    for (const w of line.weeks) {
      const detail = [
        fill(L.beyondTenth, { h: n(w.beyondTenth) }),
      ].filter(() => w.beyondTenth > 0);
      if (w.reachesLegal) detail.push(L.reachesLegal);
      rows.push([line.name, w.kind === 'complementaires' ? L.complementaires : L.supplementaires,
        w.monday, w.sunday, '', n(w.extra), detail.join(' ; ')]);
    }
  }
  for (const e of pm.extras) {
    rows.push([e.name, L.csvExtra, e.days[0] || '', e.days[e.days.length - 1] || '', String(e.days.length), n(e.hours), '']);
  }
  const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map(r => r.map(cell).join(';')).join('\r\n');
};
