
import { Language, Staff, Shift } from '../types';

export const formatTime = (hours: number): string => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export const getWeekRangeString = (date: Date, lang: Language = 'en'): string => {
  const start = new Date(date);
  start.setDate(start.getDate() + 1); // +1: weekStart is Sunday, display starts Monday
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  return `${start.toLocaleDateString(locale, options)} - ${end.toLocaleDateString(locale, options)}`;
};

export const getIsoDateString = (date: Date, timeZone: string = 'Europe/Paris'): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch (e) {
    const y = date.getUTCFullYear();
    const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const d = date.getUTCDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
};

export const getWeekStart = (d: Date, timeZone: string = 'Europe/Paris'): Date => {
  const iso = getIsoDateString(d, timeZone);
  const [y, m, day] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, day, 12, 0, 0);
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon...
  // WeekId = Sunday before the Monday. If today IS Sunday, it belongs to
  // the previous display week (Mon-Sun), so go back 7 days.
  const diff = date.getDate() - dayOfWeek - (dayOfWeek === 0 ? 7 : 0);
  const sunday = new Date(y, m - 1, diff, 12, 0, 0);
  return new Date(Date.UTC(sunday.getFullYear(), sunday.getMonth(), sunday.getDate()));
};

/**
 * Converts a Date (expected to be a week-start Sunday from getWeekStart)
 * into a timezone-safe ISO date string for use as Firestore weekId.
 * Avoids toISOString() which uses UTC and can drift around DST transitions.
 */
export const toWeekId = (date: Date, timeZone: string = 'Europe/Paris'): string => {
  return getIsoDateString(date, timeZone);
};

/**
 * Returns the current time and day index in a specific timezone
 */
export const getNowInTimezone = (timeZone: string): { hour: number, minute: number, dayIndex: number, isoDate: string } => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short'
  });
  
  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
  
  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const hour = parseInt(getPart('hour'));
  const minute = parseInt(getPart('minute'));
  const weekday = getPart('weekday'); // Mon, Tue...
  
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayIndex = days.indexOf(weekday);
  
  return {
    hour,
    minute,
    dayIndex,
    isoDate: `${year}-${month}-${day}`
  };
};

export const getShiftDate = (weekStartIso: string, dayIndex: number, lang: Language = 'en'): string => {
  const d = new Date(weekStartIso);
  d.setDate(d.getDate() + dayIndex + 1); // +1 because weekStart is Sunday, dayIndex 0 = Monday
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
};

// ISO YYYY-MM-DD for shift's actual calendar day (weekStart is Sunday, dayIndex 0 = Monday => +1)
export const getShiftIsoDate = (weekStart: Date, dayIndex: number): string => {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + dayIndex + 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Pourquoi ce shift tombe hors de la periode d'emploi — ou `null` s'il est
 * normal. On renvoie la RAISON plutot qu'un booleen : le badge affiche « Parti
 * le 3 sept 26 » et non un « Ghost » dont l'utilisateur devait deviner le sens.
 *
 * Sans startDate, la personne est consideree active depuis toujours (donnees
 * anterieures a la saisie des dates) ; sans endDate, elle est toujours en poste.
 */
export type OrphanReason = { kind: 'before-start' | 'after-end'; date: string } | null;

export const getOrphanReason = (staff: Staff, isoDate: string): OrphanReason => {
  if (staff.startDate && isoDate < staff.startDate) return { kind: 'before-start', date: staff.startDate };
  if (staff.endDate && isoDate > staff.endDate) return { kind: 'after-end', date: staff.endDate };
  return null;
};

// Employment lifecycle: is staff active on a given ISO date (YYYY-MM-DD)?
// Defini a partir de getOrphanReason pour que les deux ne puissent pas diverger.
export const isStaffActiveOnDate = (staff: Staff, isoDate: string): boolean =>
  getOrphanReason(staff, isoDate) === null;

/**
 * Date courte et non ambigue pour un badge : « 3 sept 26 » / « Sep 3, 26 ».
 * Le mois et l'annee sont toujours presents — un numero de jour seul ne dit rien.
 */
export const formatShortDate = (isoDate: string, lang: Language = 'en'): string => {
  const d = new Date(isoDate + 'T12:00:00Z');
  if (Number.isNaN(d.getTime())) return isoDate;
  const parts = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
    day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC',
  }).format(d);
  return parts.replace('.', '');
};

// Active during any day of the week (Mon..Sun) starting at weekStart (Sunday).
export const isStaffActiveInWeek = (staff: Staff, weekStart: Date): boolean => {
  const monday = getShiftIsoDate(weekStart, 0);
  const sunday = getShiftIsoDate(weekStart, 6);
  // Range overlap: staff [startDate, endDate] ∩ [monday, sunday] non-empty
  if (staff.startDate && staff.startDate > sunday) return false;
  if (staff.endDate && staff.endDate < monday) return false;
  return true;
};

/**
 * A qui peut-on DONNER un shift, et quand. Regle fixee par Serge le 09/09/2026 :
 *
 * - Avant la date d'entree : jamais. Le contrat n'a pas commence.
 * - Apres la date de sortie : encore possible pendant trois semaines — quelqu'un
 *   qui vient de partir depanne souvent sur quelques services. Ces shifts sont
 *   marques « hors contrat » sur le planning (badge `after-end`), rien de plus.
 * - Au-dela de ces trois semaines : plus possible.
 *
 * Distinct de `isStaffActiveOnDate` (est-ce que le contrat court ce jour-la),
 * qui reste la reference pour l'affichage et les badges.
 */
export const POST_CONTRACT_GRACE_DAYS = 21;

export const addDaysIso = (isoDate: string, days: number): string => {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Dernier jour ou un shift peut encore etre donne, ou null sans date de sortie. */
export const lastAssignableDate = (staff: Staff): string | null =>
  staff.endDate ? addDaysIso(staff.endDate, POST_CONTRACT_GRACE_DAYS) : null;

/** Pourquoi on ne peut PAS donner ce shift, ou null si c'est permis. */
export type AssignmentBlock = { kind: 'before-start' | 'after-grace'; date: string } | null;

export const getAssignmentBlock = (staff: Staff, isoDate: string): AssignmentBlock => {
  if (staff.startDate && isoDate < staff.startDate) return { kind: 'before-start', date: staff.startDate };
  const last = lastAssignableDate(staff);
  if (last && isoDate > last) return { kind: 'after-grace', date: staff.endDate! };
  return null;
};

/** Au moins un jour de la semaine ou cette personne peut recevoir un shift. */
export const isStaffAssignableInWeek = (staff: Staff, weekStart: Date): boolean => {
  const monday = getShiftIsoDate(weekStart, 0);
  const sunday = getShiftIsoDate(weekStart, 6);
  if (staff.startDate && staff.startDate > sunday) return false;
  const last = lastAssignableDate(staff);
  if (last && last < monday) return false;
  return true;
};

/** Today as YYYY-MM-DD in the app's timezone. */
export const todayIso = (timeZone: string = 'Europe/Paris'): string =>
  getIsoDateString(new Date(), timeZone);

/**
 * Heures contractuelles applicables A UNE DATE donnee.
 *
 * Un salarie peut signer un avenant en cours d'annee : 24h jusqu'en septembre,
 * 30h ensuite. Sans cet historique, changer le chiffre du contrat reecrirait
 * retroactivement tous les mois deja ecoules — et fausserait la paie.
 *
 * On prend le dernier avenant dont la date d'effet est deja passee. Aucun
 * avenant applicable (ou aucun avenant du tout) => le contrat courant.
 */
export const contractHoursOn = (staff: Staff, isoDate: string): number => {
  const applicable = (staff.contractChanges || [])
    .filter(c => c.from <= isoDate)
    .sort((a, b) => a.from.localeCompare(b.from));
  if (applicable.length > 0) return applicable[applicable.length - 1].weeklyHours;
  // `targetHours` est l'ancien nom du champ : les fiches non reenregistrees
  // depuis le renommage ne portent que lui.
  return staff.contractHours ?? staff.targetHours ?? 0;
};

/** Heures contractuelles aujourd'hui — le cas courant, pour ne pas repeter todayIso(). */
export const currentContractHours = (staff: Staff): number =>
  contractHoursOn(staff, todayIso());

/**
 * Les weekId (dimanches) dont la semaine touche le mois de `isoDateInMonth`.
 * Une semaine a cheval sur deux mois est prise dans les deux : chaque shift
 * est ensuite rattache a sa vraie date, jamais a la semaine entiere.
 */
export const weekIdsForMonth = (isoDateInMonth: string): string[] => {
  const [y, m] = isoDateInMonth.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const ids: string[] = [];
  const cursor = getWeekStart(first);
  const d = new Date(cursor);
  while (d <= last) {
    ids.push(getIsoDateString(d));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return ids;
};

/** Nombre de jours du mois contenant cette date. */
export const daysInMonth = (isoDateInMonth: string): number => {
  const [y, m] = isoDateInMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/**
 * Heures contractuelles du MOIS.
 *
 * Base legale francaise : un contrat hebdomadaire vaut 52/12 fois plus par mois
 * (35h/semaine = 151,67h/mois), quel que soit le nombre de jours du mois.
 *
 * On calcule jour par jour plutot que d'appliquer le facteur au contrat
 * courant : si un avenant prend effet le 15, la moitie du mois compte a
 * l'ancien tarif et l'autre au nouveau, sans cas particulier a ecrire.
 */
export const monthlyContractHours = (staff: Staff, isoDateInMonth: string): number => {
  const [y, m] = isoDateInMonth.split('-').map(Number);
  const n = daysInMonth(isoDateInMonth);
  let total = 0;
  for (let day = 1; day <= n; day++) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    total += contractHoursOn(staff, iso) * 52 / 12 / n;
  }
  return total;
};

/**
 * Les shifts qui se chevauchent POUR LA MEME PERSONNE le meme jour.
 *
 * Personne ne peut etre a deux endroits a la fois : c'est une erreur de saisie,
 * pas un choix. Rien ne la signalait — elle se decouvrait le jour meme, ou dans
 * les heures de paie. Deux shifts qui se touchent (11h-15h puis 15h-19h) ne se
 * chevauchent pas : la comparaison est stricte.
 *
 * Renvoie les identifiants concernes, pour que la carte puisse se signaler
 * elle-meme sans recalculer quoi que ce soit.
 */
export const findOverlappingShiftIds = (shifts: Shift[]): Set<string> => {
  const clashing = new Set<string>();
  const byPersonAndDay = new Map<string, Shift[]>();
  for (const s of shifts) {
    const key = `${s.staffId}#${s.dayIndex}`;
    const list = byPersonAndDay.get(key);
    if (list) list.push(s);
    else byPersonAndDay.set(key, [s]);
  }
  for (const list of byPersonAndDay.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.startTime - b.startTime);
    for (let i = 1; i < sorted.length; i++) {
      // Trie par debut : il suffit de comparer au maximum des fins precedentes.
      const prevEnd = Math.max(...sorted.slice(0, i).map(x => x.endTime));
      if (sorted[i].startTime < prevEnd) {
        clashing.add(sorted[i].id);
        for (const earlier of sorted.slice(0, i)) {
          if (earlier.endTime > sorted[i].startTime) clashing.add(earlier.id);
        }
      }
    }
  }
  return clashing;
};

/**
 * Combien de personnes sont presentes sur chaque tranche de 30 minutes.
 *
 * L'application montrait les heures PAR EMPLOYE, jamais la couverture du
 * service : un trou a 20h un samedi etait invisible tant qu'on ne relisait pas
 * chaque carte une par une.
 *
 * Pourquoi la demi-heure et pas l'heure. Tous les horaires de l'application
 * tombent sur :00 ou :30 — les listes des formulaires avancent par 30 minutes,
 * le glisser-deposer s'aligne sur 0,5. Une tranche d'une heure devait donc
 * fusionner deux realites differentes : le vendredi 28, une seule personne a
 * 17h00 puis trois a 17h30, affiche « 3 » sur toute l'heure. Ce nombre ne
 * correspondait a aucun instant lisible sur le planning, et surtout il effacait
 * le creux — exactement ce que cette bande existe pour montrer. Signale par
 * Serge le 2026-09-06. A la demi-heure, chaque barre vaut un instant precis du
 * planning : plus rien n'est agrege, donc plus rien n'est masque.
 *
 * Une personne compte des qu'elle couvre une partie de la tranche. Un shift
 * couvert par quelqu'un d'autre compte pour le remplacant, pas pour la personne
 * absente ; deux shifts d'une meme personne ne la comptent qu'une fois.
 */
export const staffingPerSlot = (
  shifts: Shift[],
  dayIndex: number,
  startHour: number,
  endHour: number,
  slotMinutes = 30,
): number[] => {
  const step = slotMinutes / 60;
  const dayShifts = shifts.filter(s => s.dayIndex === dayIndex);
  const counts: number[] = [];
  for (let i = 0; i < Math.round((endHour - startHour) / step); i++) {
    const t = startHour + i * step;
    const present = new Set<string>();
    for (const s of dayShifts) {
      if (s.startTime < t + step && s.endTime > t) present.add(s.coverageBy || s.staffId);
    }
    counts.push(present.size);
  }
  return counts;
};

/** Someone whose last day is already behind us. They keep their history. */
export const isFormerStaff = (staff: Staff, today: string = todayIso()): boolean =>
  !!staff.endDate && staff.endDate < today;

/**
 * Long, unambiguous week range for the PNG export header. Always English,
 * always with the year — the exported image travels without the app around it.
 * "Mon 10 Aug - Sun 16 Aug 2026", or "Mon 28 Dec 2026 - Sun 3 Jan 2027" when
 * the week straddles two years.
 * weekStart is the Sunday weekId; the displayed week runs Monday..Sunday.
 */
export const getWeekRangeLongEn = (weekStart: Date): string => {
  const monday = new Date(weekStart);
  monday.setUTCDate(monday.getUTCDate() + 1);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);

  // Parts are composed by hand rather than using a single toLocaleDateString
  // call: en-GB puts the day first but renders September as "Sept" (4 letters,
  // out of line with every other month), en-US keeps "Sep" but puts the month
  // first. Taking the parts from en-US gives day-first order and 3-letter months.
  const fmt = (d: Date, withYear: boolean) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).formatToParts(d);
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    return `${get('weekday')} ${get('day')} ${get('month')}${withYear ? ` ${get('year')}` : ''}`;
  };

  const sameYear = monday.getUTCFullYear() === sunday.getUTCFullYear();
  return `${fmt(monday, !sameYear)} - ${fmt(sunday, true)}`;
};

/**
 * ISO 8601 week number of the Monday that opens the displayed week.
 * weekStart is the Sunday weekId, so the Monday is weekStart + 1.
 */
export const getIsoWeekNumber = (weekStart: Date): number => {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + 1); // Monday of the displayed week
  // ISO: the week belongs to the year containing its Thursday.
  d.setUTCDate(d.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};
