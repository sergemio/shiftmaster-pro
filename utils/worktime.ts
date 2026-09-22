/**
 * LE calcul du temps de travail. Tout ecran, la paie, le cout et les alertes
 * passent par ici ; aucun ne soustrait lui-meme une heure de fin d'une heure de
 * debut.
 *
 * Pourquoi (audit du 22/09/2026, docs/audit-calculs.md) : « combien d'heures a
 * travaille cette personne » avait HUIT definitions dans l'app. Une seule
 * comptait une fois les heures de deux shifts qui se chevauchent ; les sept
 * autres les additionnaient, et la paie annoncait des heures supplementaires
 * qui n'existaient pas. Une grandeur, une fonction.
 *
 * Les regles, decidees par Serge le 22/09/2026 :
 * - Les heures d'un shift couvert vont a celui qui le fait (le remplacant).
 * - Deux shifts de la meme personne le meme jour : les heures communes ne
 *   comptent qu'une fois (union des plages).
 * - La pause n'est pas du temps de travail effectif (Code du travail
 *   L3121-1) : elle est retiree des heures, de la paie et du cout.
 * - Un shift peut finir jusqu'a 6 h du matin (30 h) ; il reste rattache au
 *   jour ou il commence, comme les heures qu'il porte.
 *
 * Tout se compte en MINUTES ENTIERES : les horaires tombent sur la demi-heure,
 * les pauses sur le quart d'heure et durent un nombre entier de minutes. En
 * minutes, additionner et soustraire est exact ; en heures decimales, une
 * pause de 20 minutes (0,333...) laissait des restes d'arrondi.
 */

/** Fin la plus tardive d'un shift : 6 h du matin le lendemain. */
export const LATEST_END = 30;

/** Ce que ce module lit d'un shift. `Shift` le satisfait. */
export interface TimedShift {
  staffId: string;
  coverageBy?: string | null;
  dayIndex: number;
  startTime: number;
  endTime: number;
  /** Debut de la pause, en heures decimales, dans le shift. */
  breakStart?: number;
  /** Duree de la pause, en minutes. Absente ou 0 = pas de pause. */
  breakMinutes?: number;
}

/** Plage [debut, fin[ en minutes depuis minuit du jour du shift. */
export type Span = [number, number];

const toMin = (hours: number): number => Math.round(hours * 60);

/** Qui fait reellement le shift : le remplacant s'il y en a un. */
export const workerOf = (s: { staffId: string; coverageBy?: string | null }): string =>
  s.coverageBy || s.staffId;

/**
 * La pause d'un shift, bornee au shift, en minutes. `null` = aucune pause
 * exploitable (absente, nulle, ou entierement hors du shift).
 */
export const breakSpan = (s: TimedShift): Span | null => {
  if (!s.breakMinutes || s.breakMinutes <= 0 || typeof s.breakStart !== 'number') return null;
  const from = Math.max(toMin(s.startTime), toMin(s.breakStart));
  const to = Math.min(toMin(s.endTime), toMin(s.breakStart) + Math.round(s.breakMinutes));
  return to > from ? [from, to] : null;
};

/** Plages de travail effectif d'un shift : le shift, moins sa pause. */
export const workSpans = (s: TimedShift): Span[] => {
  const start = toMin(s.startTime), end = toMin(s.endTime);
  if (end <= start) return [];
  const b = breakSpan(s);
  if (!b) return [[start, end]];
  return ([[start, b[0]], [b[1], end]] as Span[]).filter(([a, z]) => z > a);
};

/** Union de plages : triees, fusionnees, sans recouvrement. */
export const mergeSpans = (spans: Span[]): Span[] => {
  const sorted = spans.filter(([a, z]) => z > a).sort((x, y) => x[0] - y[0]);
  const out: Span[] = [];
  for (const [a, z] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], z);
    else out.push([a, z]);
  }
  return out;
};

export const spanMinutes = (spans: Span[]): number =>
  spans.reduce((n, [a, z]) => n + (z - a), 0);

/** Minutes → heures decimales. Le seul endroit ou l'on divise par 60. */
export const minutesToHours = (m: number): number => m / 60;

/** Heures de travail effectif d'un shift seul : ce qu'affiche sa carte. */
export const shiftWorkHours = (s: TimedShift): number =>
  minutesToHours(spanMinutes(workSpans(s)));

// -----------------------------------------------------------------------------
// Agregats. Ils prennent des shifts DATES : une semaine seule n'a besoin que du
// dayIndex, mais un mois melange plusieurs lundis, et les confondre fusionnerait
// les heures de deux jours differents.
// -----------------------------------------------------------------------------

export interface DatedWork<S extends TimedShift = TimedShift> {
  shift: S;
  /** Jour ISO ou le shift commence. */
  date: string;
}

/** Les shifts d'une semaine, dates. `weekId` = le dimanche qui precede le lundi. */
export const datedWeek = <S extends TimedShift>(weekId: string, shifts: S[]): DatedWork<S>[] => {
  const [y, m, d] = weekId.split('-').map(Number);
  return shifts.map(shift => ({
    shift,
    date: new Date(Date.UTC(y, m - 1, d + shift.dayIndex + 1)).toISOString().slice(0, 10),
  }));
};

/**
 * Minutes de presence par personne et par jour : l'union des plages de travail
 * de tous ses shifts de la journee (les siens non repris, et ceux qu'elle
 * reprend).
 */
export const minutesByWorkerDate = (work: DatedWork[]): Map<string, Map<string, number>> => {
  const spans = new Map<string, Map<string, Span[]>>();
  for (const { shift, date } of work) {
    const who = workerOf(shift);
    const byDate = spans.get(who) || new Map<string, Span[]>();
    byDate.set(date, [...(byDate.get(date) || []), ...workSpans(shift)]);
    spans.set(who, byDate);
  }
  const out = new Map<string, Map<string, number>>();
  for (const [who, byDate] of spans) {
    const m = new Map<string, number>();
    for (const [date, list] of byDate) m.set(date, spanMinutes(mergeSpans(list)));
    out.set(who, m);
  }
  return out;
};

/** Heures de presence par personne et par jour. */
export const hoursByWorkerDate = (work: DatedWork[]): Map<string, Map<string, number>> => {
  const out = new Map<string, Map<string, number>>();
  for (const [who, byDate] of minutesByWorkerDate(work)) {
    out.set(who, new Map([...byDate].map(([d, m]) => [d, minutesToHours(m)])));
  }
  return out;
};

/**
 * Heures de presence par personne, sur les jours retenus (`keep`, tous par
 * defaut). La somme se fait en minutes, la conversion a la fin : aucun reste
 * d'arrondi ne s'accumule.
 */
export const hoursByWorker = (work: DatedWork[], keep: (date: string) => boolean = () => true): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [who, byDate] of minutesByWorkerDate(work)) {
    let m = 0;
    for (const [date, v] of byDate) if (keep(date)) m += v;
    out[who] = minutesToHours(m);
  }
  return out;
};

/**
 * Le taux stocke est le cout CHARGE (brut + charges patronales) : ce que le
 * restaurant decaisse. Un shift couvert coute le taux de celui qui le fait.
 *
 * Cout d'un ensemble de shifts : pour chaque personne et chaque jour, ses
 * minutes de presence (union, pause retiree) au taux de celui qui travaille.
 * `missing` = nombre de shifts dont la personne n'a pas de taux : le total est
 * alors un minimum, et l'interface le dit (« ≥ »). Jamais zero pour un inconnu.
 */
export const workCost = (
  work: DatedWork[],
  rates: Record<string, number>,
): { total: number; missing: number } => {
  const priced: DatedWork[] = [];
  let missing = 0;
  for (const w of work) {
    const rate = rates[workerOf(w.shift)];
    if (Number.isFinite(rate) && rate > 0) priced.push(w);
    else missing++;
  }
  let total = 0;
  for (const [who, byDate] of minutesByWorkerDate(priced)) {
    let m = 0;
    for (const v of byDate.values()) m += v;
    total += (m * rates[who]) / 60;
  }
  return { total: Math.round(total * 100) / 100, missing };
};

/** Cout d'un shift seul (sa carte). `null` = taux inconnu, jamais zero. */
export const shiftWorkCost = (s: TimedShift, rates: Record<string, number>): number | null => {
  const rate = rates[workerOf(s)];
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return (spanMinutes(workSpans(s)) * rate) / 60;
};

// -----------------------------------------------------------------------------
// Pause : la garder dans le shift quand le shift bouge ou change de taille.
// -----------------------------------------------------------------------------

/** Pas de deplacement d'une pause : le quart d'heure. */
export const BREAK_STEP = 0.25;

/**
 * La pause ramenee dans le shift. Deplacer ou raccourcir un shift ne doit
 * jamais laisser une pause dehors, qui ne se verrait plus mais retirerait
 * encore des heures. Un shift plus court que sa pause la perd.
 */
export const clampBreak = <S extends TimedShift>(s: S): S => {
  if (!s.breakMinutes || s.breakMinutes <= 0 || typeof s.breakStart !== 'number') return s;
  const len = s.breakMinutes / 60;
  if (s.endTime - s.startTime <= len) {
    const { breakStart: _b, breakMinutes: _m, ...rest } = s;
    return rest as S;
  }
  const start = Math.min(Math.max(s.breakStart, s.startTime), s.endTime - len);
  return start === s.breakStart ? s : { ...s, breakStart: start };
};

/** Pause par defaut d'un shift : au milieu, calee au quart d'heure. */
export const defaultBreakStart = (start: number, end: number, minutes: number): number =>
  Math.round(((start + end) / 2 - minutes / 120) / BREAK_STEP) * BREAK_STEP;

// -----------------------------------------------------------------------------
// Attendu du contrat, et affichage des heures.
// -----------------------------------------------------------------------------

/**
 * Heures attendues : le contrat moins les heures d'absence, jamais negatif.
 * Arrondi au dixieme, comme tout ce qui s'affiche a l'ecran (decision du
 * 22/09/2026 : « 151,7 h » et non « 152 h »).
 */
export const expectedHours = (contract: number, absenceHours = 0): number =>
  roundTenth(Math.max(0, contract - (absenceHours > 0 ? absenceHours : 0)));

/** Arrondi d'affichage : une decimale. Les calculs, eux, restent exacts. */
export const roundTenth = (n: number): number => Math.round(n * 10) / 10;

/**
 * Une duree lisible : « 7 h 15 », « 35 h ». Arrondie a la minute. Pour ce qui
 * est travaille (cartes, totaux). Remplace « 7.3H » : 7 h 15 lu comme 7 h 30
 * (constate au relu du jeu de verite, 22/09/2026).
 */
export const formatDuration = (hours: number, language = 'fr'): string => {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (language === 'fr') return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
};

/**
 * Un nombre d'heures de reference (contrat, attendu) : « 35 h », « 151,7 h ».
 * Reste en decimal : c'est la forme de la mensualisation (151,67 h) et de la paie.
 */
export const formatHoursRef = (hours: number, language = 'fr'): string => {
  const r = roundTenth(hours);
  const s = Number.isInteger(r) ? String(r) : r.toFixed(1);
  return language === 'fr' ? `${s.replace('.', ',')} h` : `${s}h`;
};

/**
 * Pause posee d'office sur un NOUVEAU shift de plus de 6 h : 20 min, le minimum
 * legal (L3121-16), au milieu du shift. Le manager la deplace ou en change la
 * duree (decision de Serge du 22/09/2026 : l'alerte de pause faisait 24 alertes
 * sur 29 dans la semaine test, faute de pause saisie).
 */
export const AUTO_BREAK_AFTER_HOURS = 6;
export const AUTO_BREAK_MINUTES = 20;
export const autoBreak = (start: number, end: number): { breakStart?: number; breakMinutes?: number } =>
  end - start > AUTO_BREAK_AFTER_HOURS
    ? { breakMinutes: AUTO_BREAK_MINUTES, breakStart: defaultBreakStart(start, end, AUTO_BREAK_MINUTES) }
    : {};

/**
 * Un shift qu'on allonge au-dela de 6 h, sans pause, en recoit une de 20 min.
 * Seulement au FRANCHISSEMENT du seuil : un shift deja long dont le manager a
 * retire la pause la garde retiree (on ne la remet pas en silence).
 */
export const withAutoBreak = <S extends TimedShift>(before: { startTime: number; endTime: number }, after: S): S =>
  !after.breakMinutes
  && before.endTime - before.startTime <= AUTO_BREAK_AFTER_HOURS
  && after.endTime - after.startTime > AUTO_BREAK_AFTER_HOURS
    ? { ...after, ...autoBreak(after.startTime, after.endTime) }
    : after;
