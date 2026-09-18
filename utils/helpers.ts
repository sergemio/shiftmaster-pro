
import { Language, Staff, Shift, Absence, AbsencePeriod } from '../types';

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
 * Cout d'un shift, en euros, pour l'employeur.
 *
 * Le taux stocke est le cout CHARGE (salaire brut + charges patronales) : c'est
 * ce que le restaurant decaisse, et c'est le seul chiffre sur lequel on peut
 * decider. Un brut afficherait vingt-cinq a quarante pour cent de moins que la
 * realite, ce qui serait pire que pas de chiffre du tout.
 *
 * `coverageBy` prime sur `staffId` : un shift repris par un collegue coute le
 * taux de CELUI QUI LE FAIT, comme les heures lui sont deja comptees.
 *
 * Renvoie `null` — et non zero — quand le taux est inconnu. La difference
 * compte : zero se totalise silencieusement et fait passer un cout ignore pour
 * un cout nul, alors que `null` permet de dire « incomplet ».
 */
export const shiftCost = (
  shift: { staffId: string; coverageBy?: string | null; startTime: number; endTime: number },
  rates: Record<string, number>,
): number | null => {
  const rate = rates[shift.coverageBy || shift.staffId];
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return (shift.endTime - shift.startTime) * rate;
};

/**
 * Total d'une liste de shifts, avec le nombre de ceux qu'on n'a pas pu chiffrer.
 * Le second nombre est ce qui permet a l'interface d'annoncer un total partiel
 * au lieu de le presenter comme complet.
 */
export const totalCost = (
  shifts: { staffId: string; coverageBy?: string | null; startTime: number; endTime: number }[],
  rates: Record<string, number>,
): { total: number; missing: number } => {
  let total = 0, missing = 0;
  for (const s of shifts) {
    const c = shiftCost(s, rates);
    if (c === null) missing++; else total += c;
  }
  return { total: Math.round(total * 100) / 100, missing };
};

/**
 * Heures d'ouverture affichees sur le planning, reglees par un admin dans
 * Reglages et partagees par toute l'equipe (settings/global : openHour,
 * closeHour), par demi-heure. Defaut : 8 h -> minuit, la plage codee en dur
 * jusqu'au 16/09/2026.
 */
export interface OperatingHours { start: number; end: number }
export const DEFAULT_OPERATING_HOURS: OperatingHours = { start: 8, end: 24 };

/** Tout ce qui n'est pas une plage valide (demi-heures entre 0 et 24, au moins
 *  une heure d'ecart) retombe sur le defaut : une valeur abimee en base ne doit
 *  pas pouvoir casser la grille. */
export const normalizeOperatingHours = (start: unknown, end: unknown): OperatingHours => {
  const ok = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 24 && Number.isInteger(v * 2);
  return ok(start) && ok(end) && end - start >= 1 ? { start, end } : DEFAULT_OPERATING_HOURS;
};

/**
 * Plage de la grille : les heures d'ouverture arrondies a l'heure pleine vers
 * l'exterieur (la grille est tracee heure par heure), puis elargie a tout shift
 * qui en deborde. Le reglage reduit le vide, il ne cache jamais un shift.
 */
export const gridHourRange = (
  hours: OperatingHours,
  shifts: { startTime: number; endTime: number }[],
): OperatingHours => {
  let start = Math.floor(hours.start), end = Math.ceil(hours.end);
  for (const s of shifts) {
    start = Math.min(start, Math.floor(s.startTime));
    end = Math.max(end, Math.ceil(s.endTime));
  }
  return { start: Math.max(0, start), end: Math.min(24, end) };
};

/** Heures proposees dans un menu, par demi-heure, de `from` a `to` inclus. */
export const halfHourSteps = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let v = Math.ceil(from * 2) / 2; v <= to; v += 0.5) out.push(v);
  return out;
};

/** Montant court pour un badge : « 48 € » / « 48,50 € ». */
export const formatMoney = (amount: number, lang: Language = 'en'): string =>
  new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);

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
/**
 * Etat de la pastille a cote du nom de l'application.
 *
 * Avant le 13/09/2026 elle etait verte par defaut : verte dans le bac a sable
 * (qui n'est relie a aucune base), verte sans connexion. Elle affirmait donc
 * « en direct » sans rien mesurer. L'ordre ci-dessous va du plus grave au plus
 * banal : une erreur d'enregistrement prime sur tout, puis l'absence de reseau.
 * « Pas encore confirme par le serveur » compte comme une synchronisation en
 * cours, jamais comme du direct.
 */
export type SyncStatus = 'sandbox' | 'error' | 'offline' | 'syncing' | 'saved' | 'live';
export const syncStatus = (s: {
  sandbox: boolean; writeFailed: boolean; online: boolean;
  loading: boolean; serverConfirmed: boolean; justSaved: boolean;
}): SyncStatus => {
  if (s.sandbox) return 'sandbox';
  if (s.writeFailed) return 'error';
  if (!s.online) return 'offline';
  if (s.loading || !s.serverConfirmed) return 'syncing';
  if (s.justSaved) return 'saved';
  return 'live';
};

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

/** Couleur des lignes d'extras : grise, pour les distinguer de l'equipe. */
export const EXTRA_COLOR = '#94a3b8';

/**
 * Reconstitue les lignes d'extras a afficher, a partir des SHIFTS.
 *
 * Le vivier (`orgs/{orgId}/extras`) contient tous les extras connus, y compris
 * ceux qui ne viennent pas cette semaine ; les afficher tous allongerait le
 * planning de noms inutiles. On ne montre donc que ceux qui ont un shift dans
 * les semaines regardees, et l'information necessaire est deja sur le shift
 * (`extraName`) — un employe, qui n'a pas acces au vivier, voit donc les noms.
 *
 * `isPool` sert a EXCLURE des regles de duree du travail : un extra encore
 * anonyme (« Extra 1 », formulaire non rempli) n'est pas une personne
 * identifiee, une alerte de repos a son sujet ne voudrait rien dire. Des qu'il
 * est nomme, les regles s'appliquent a lui comme a n'importe qui.
 */
export const extraStaffRows = (
  shifts: { staffId: string; extraName?: string }[],
  extras: Record<string, { firstName?: string; filledAt?: string | null }> = {},
): Staff[] => {
  const rows = new Map<string, Staff>();
  for (const s of shifts) {
    if (!s.extraName || rows.has(s.staffId)) continue;
    const known = extras[s.staffId];
    const identified = !!known?.filledAt;
    rows.set(s.staffId, {
      id: s.staffId,
      // La fiche du vivier fait foi quand on y a acces : elle porte le prenom
      // le plus recent, celui que la personne a elle-meme saisi.
      name: known?.firstName || s.extraName,
      email: '',
      color: EXTRA_COLOR,
      role: 'staff',
      isExtra: true,
      isPool: !identified,
    });
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
};

/** Prochain nom par defaut : « Extra 1 », « Extra 2 »… sans trou ni doublon. */
export const nextExtraName = (shifts: { extraName?: string }[]): string => {
  let max = 0;
  for (const s of shifts) {
    const m = /^Extra (\d+)$/.exec((s.extraName || '').trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Extra ${max + 1}`;
};

// =============================================================================
// ABSENCES PAR PERIODE — decompte des conges et heures d'absence
// =============================================================================
//
// Une absence est une PERIODE (premier jour -> veille de la reprise), comme la
// paie la connait. Les fonctions ci-dessous sont pures : elles ne lisent ni la
// base ni l'heure, pour etre testees sur des cas juridiques connus
// (`scripts/test-absences.mjs`).

/** 0 = lundi ... 6 = dimanche, la convention des shifts. */
export const isoDayIndex = (iso: string): number =>
  (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7;

/** Identifiant de la semaine qui contient ce jour : le dimanche qui la precede. */
export const weekIdOfIso = (iso: string): string => addDaysIso(iso, -(isoDayIndex(iso) + 1));

/** Tous les jours de la periode, bornes incluses. Plafonne a 400 jours : une
 *  date de fin mal saisie (2062 au lieu de 2026) ne doit pas geler l'ecran. */
export const periodDays = (start: string, end: string): string[] => {
  if (!start || !end || end < start) return [];
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 400; d = addDaysIso(d, 1)) out.push(d);
  return out;
};

/**
 * Jours de conges decomptes sur la periode.
 *
 * Code du travail : on compte en jours OUVRABLES, du premier jour ou la
 * personne aurait du travailler jusqu'a la veille de la reprise, y compris
 * les jours qu'elle ne travaille pas d'habitude — un temps partiel a trois
 * shifts qui part une semaine consomme 6 jours, pas 3 (Cass. soc.).
 * Le dimanche (repos hebdomadaire) et les jours feries CHOMES dans
 * l'entreprise ne comptent pas ; un ferie travaille (restaurant ouvert) compte.
 *
 * @param closedDates jours feries chomes, ISO. C'est a l'appelant de dire
 *                    lesquels le sont : un jour ferie marque dans l'app n'est
 *                    pas forcement un jour de fermeture.
 */
export const countLeaveDays = (
  start: string,
  end: string,
  unit: 'ouvrables' | 'ouvres' = 'ouvrables',
  closedDates: string[] = [],
  half?: 'am' | 'pm',
): number => {
  const lastWorkDay = unit === 'ouvres' ? 4 : 5; // vendredi ou samedi
  const closed = new Set(closedDates);
  const n = periodDays(start, end)
    .filter(d => isoDayIndex(d) <= lastWorkDay && !closed.has(d))
    .length;
  return half && n === 1 ? 0.5 : n;
};

/**
 * Heures que la personne aurait travaillees pendant l'absence — ce que le
 * bulletin retient (heures reelles, pas une moyenne theorique).
 *
 * Semaine par semaine :
 * - la semaine est PLANIFIEE pour elle (au moins un shift quelque part dans la
 *   semaine) : on prend les heures de ses shifts tombant sur les jours d'absence.
 *   Si le manager a planifie autour de l'absence, il n'y a rien a retenir.
 * - la semaine n'est PAS planifiee : estimation au contrat —
 *   contrat hebdo / jours travailles par semaine, pour chaque jour ouvrable
 *   d'absence, plafonne au nombre de jours travailles.
 * Le resultat est une proposition : le manager le corrige a la saisie.
 *
 * @param plannedHoursByDate heures de SES shifts par jour, ISO -> heures
 * @param plannedWeekIds     semaines ou elle a au moins un shift
 * @param weeklyHoursOn      heures du contrat en vigueur a une date (avenants)
 */
export const absenceHours = (
  start: string,
  end: string,
  plannedHoursByDate: Record<string, number>,
  plannedWeekIds: Set<string>,
  weeklyHoursOn: (iso: string) => number,
  workDaysPerWeek = 5,
  closedDates: string[] = [],
  half?: 'am' | 'pm',
): number => {
  const byDate = absenceHoursByDate(start, end, plannedHoursByDate, plannedWeekIds, weeklyHoursOn, workDaysPerWeek, closedDates, half);
  return Math.round(Object.values(byDate).reduce((a, b) => a + b, 0) * 100) / 100;
};

/**
 * Les memes heures, jour par jour (jours a 0 omis). C'est ce detail que
 * portent la periode et sa projection : l'attendu d'une SEMAINE ou d'un MOIS
 * se reduit des heures qui y tombent, pas d'une moyenne de la periode.
 * Semaine non planifiee : l'estimation se repartit a parts egales sur ses
 * jours ouvrables d'absence.
 */
export const absenceHoursByDate = (
  start: string,
  end: string,
  plannedHoursByDate: Record<string, number>,
  plannedWeekIds: Set<string>,
  weeklyHoursOn: (iso: string) => number,
  workDaysPerWeek = 5,
  closedDates: string[] = [],
  half?: 'am' | 'pm',
): Record<string, number> => {
  const days = periodDays(start, end);
  const closed = new Set(closedDates);
  const byWeek = new Map<string, string[]>();
  for (const d of days) {
    const w = weekIdOfIso(d);
    byWeek.set(w, [...(byWeek.get(w) || []), d]);
  }
  const perDay = Math.max(1, Math.min(6, workDaysPerWeek));
  const factor = half && days.length === 1 ? 0.5 : 1;
  const out: Record<string, number> = {};
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

/**
 * Repartit le total retenu (celui que le manager a pu corriger) au prorata du
 * detail propose, arrondi au centieme, le reste d'arrondi sur le dernier jour :
 * la somme vaut toujours exactement `total`. Detail vide mais total non nul
 * (le manager a saisi des heures la ou rien n'etait prevu) : parts egales sur
 * les jours ouvrables de la periode.
 */
export const spreadAbsenceHours = (
  byDate: Record<string, number>,
  total: number,
  start: string,
  end: string,
): Record<string, number> => {
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
  const out: Record<string, number> = {};
  for (const e of parts) if (e.c > 0) out[e.d] = e.c / 100;
  return out;
};

/**
 * Heures d'absence a retrancher de l'attendu du contrat, sur les jours donnes.
 *
 * Un jour d'absence porte ses heures (`hours`, fixees a l'enregistrement de la
 * periode). Une ancienne etiquette sans heures vaut contrat / jours travailles,
 * du lundi au samedi, moitie pour une demi-journee. Plafond : le contrat de la
 * semaine — une semaine entiere d'absence ramene l'attendu a 0, jamais en dessous.
 */
export const absenceHoursToDeduct = (
  days: { iso: string; hours?: number; half?: 'am' | 'pm' }[],
  weeklyHoursOn: (iso: string) => number,
  workDaysPerWeek = 5,
): number => {
  const perDay = Math.max(1, Math.min(6, workDaysPerWeek));
  const byWeek = new Map<string, number>();
  const seen = new Set<string>();
  for (const a of days) {
    // Deux etiquettes le meme jour (ancienne + periode) ne retirent pas deux fois.
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

/** Ce qu'une personne perd d'attendu sur la periode affichee. */
export interface AbsenceDeduction {
  /** Heures a retrancher du contrat. */
  hours: number;
  /** Jours d'absence du lundi au samedi (demi-journee = 0,5), pour le libelle. */
  days: number;
  /** « conge » si tout est du conge, sinon « absent » (le motif reste prive). */
  kind: 'conge' | 'absent';
}

/**
 * Regroupe par personne les jours d'absence d'une semaine ou d'un mois.
 * `staff` fournit le contrat en vigueur a chaque date (avenants) et le nombre
 * de jours travailles, pour estimer les anciennes etiquettes sans heures.
 */
export const absenceDeductions = (
  items: { staffId: string; iso: string; kind: string; hours?: number; half?: 'am' | 'pm' }[],
  staff: Staff[],
): Record<string, AbsenceDeduction> => {
  const byPerson = new Map<string, typeof items>();
  for (const a of items) byPerson.set(a.staffId, [...(byPerson.get(a.staffId) || []), a]);
  const out: Record<string, AbsenceDeduction> = {};
  for (const [staffId, list] of byPerson) {
    const person = staff.find(s => s.id === staffId);
    if (!person) continue;
    const hours = absenceHoursToDeduct(list, iso => contractHoursOn(person, iso), person.workDaysPerWeek || 5);
    const perDay = new Map<string, number>();
    for (const a of list) {
      if (isoDayIndex(a.iso) > 5) continue;
      perDay.set(a.iso, Math.max(perDay.get(a.iso) || 0, a.half ? 0.5 : 1));
    }
    const days = [...perDay.values()].reduce((x, y) => x + y, 0);
    out[staffId] = { hours, days, kind: list.every(a => a.kind === 'conge') ? 'conge' : 'absent' };
  }
  return out;
};

/** « 16 h attendues (1 j de congé) » : l'attendu reduit, et pourquoi. */
export const expectedNote = (
  t: (key: string) => string,
  expected: number,
  d: AbsenceDeduction,
  language: string,
): string => {
  const num = (n: number) => {
    const s = Number.isInteger(n) ? String(n) : n.toFixed(1);
    return language === 'fr' ? s.replace('.', ',') : s;
  };
  return t(d.kind === 'conge' ? 'expectedAfterConge' : 'expectedAfterAbsent')
    .replace('{h}', num(expected))
    .replace('{d}', num(d.days));
};

/**
 * Le motif a AFFICHER d'un jour d'absence. Les anciennes etiquettes jour par
 * jour (d'avant les periodes) portent encore « maladie » en clair : seul un
 * administrateur le voit, l'equipe et toute image exportee lisent « absent ».
 * Le motif d'un arret est une donnee de sante (RGPD). Les donnees ne sont pas
 * modifiees : la conversion en periodes viendra avec la migration.
 */
export const visibleAbsenceKind = (kind: string, canSeeMotive: boolean): string =>
  kind === 'maladie' && !canSeeMotive ? 'absent' : kind;

/** Ce que l'equipe voit d'un motif : « conge » pour ce qui n'a rien de
 *  personnel, « absent » pour tout le reste (sante, famille, disciplinaire). */
export const publicAbsenceKind = (kind: string): 'conge' | 'absent' =>
  kind === 'cp' || kind === 'sans_solde' ? 'conge' : 'absent';

export interface ProjectedAbsenceDay {
  id: string;
  staffId: string;
  dayIndex: number;
  kind: 'conge' | 'absent';
  periodId: string;
  half?: 'am' | 'pm';
  /** Heures d'absence de ce jour (0 ou absent = rien a retrancher). */
  hours?: number;
}

/**
 * Projection d'une periode dans les documents de semaine : un jour d'absence
 * par jour calendaire (dimanche compris — la personne n'est pas disponible),
 * range par semaine. L'identifiant de chaque jour derive de la periode :
 * re-projeter apres une modification remplace, sans doublon.
 */
export const projectAbsencePeriod = (
  period: {
    id: string; staffId: string; kind: string; start: string; end: string; half?: 'am' | 'pm';
    hoursByDate?: Record<string, number>;
  },
): Record<string, ProjectedAbsenceDay[]> => {
  const out: Record<string, ProjectedAbsenceDay[]> = {};
  const days = periodDays(period.start, period.end);
  for (const d of days) {
    const w = weekIdOfIso(d);
    // Periode enregistree avant le detail par jour : pas de `hours`, l'attendu
    // retombe sur l'estimation au contrat (absenceHoursToDeduct).
    const hours = period.hoursByDate ? (period.hoursByDate[d] || 0) : undefined;
    (out[w] ||= []).push({
      id: `${period.id}-${d}`,
      staffId: period.staffId,
      dayIndex: isoDayIndex(d),
      kind: publicAbsenceKind(period.kind),
      periodId: period.id,
      ...(period.half && days.length === 1 ? { half: period.half } : {}),
      ...(hours !== undefined ? { hours } : {}),
    });
  }
  return out;
};

// =============================================================================
// CHEVAUCHEMENTS — une personne n'a qu'une absence par jour
// =============================================================================
//
// Regle generale : deux absences de la meme personne ne se recouvrent pas —
// sinon un jour est decompte deux fois. Une exception, de droit : un ARRET
// (maladie, accident du travail, maternite/paternite) survenu pendant des
// conges payes les interrompt ; les jours qui coincident ne sont pas
// consommes et restent a prendre (loi du 22/04/2024, Cass. soc. 10/09/2025).
// L'inverse est refuse : on ne pose pas de conges pendant un arret.

/** Motifs qui suspendent le contrat et priment sur des conges payes. */
export const SUSPENDING_KINDS = ['maladie', 'at_mp', 'maternite_paternite'];
/** Motifs qui se prennent a la demi-journee. Un arret se compte en jours entiers. */
export const HALF_DAY_KINDS = ['cp', 'sans_solde', 'injustifiee'];

/** Une modification a ecrire : `period` null = effacer `previous`. */
export interface AbsenceChange {
  period: AbsencePeriod | null;
  previous: AbsencePeriod | null;
}

export type AbsencePlan =
  | { ok: true; changes: AbsenceChange[]; daysGivenBack: number }
  | { ok: false; conflict: AbsencePeriod; reason: 'overlap' | 'leaveDuringSickness' };

const rangesOverlap = (a: { start: string; end: string; half?: string }, b: { start: string; end: string; half?: string }) => {
  if (a.end < b.start || b.end < a.start) return false;
  // Matin et apres-midi du meme jour : deux moities distinctes.
  return !(a.start === a.end && b.start === b.end && a.half && b.half && a.half !== b.half);
};

/**
 * Ce qu'il faut ecrire pour enregistrer `candidate` parmi les absences deja
 * connues : la periode elle-meme, plus les conges payes qu'elle raccourcit.
 * Refus = la premiere absence en conflit, pour que la fenetre la nomme.
 *
 * Un conge raccourci garde son identifiant (sa partie AVANT l'arret) ; s'il
 * reprend apres l'arret, la suite devient une periode a part. Un morceau qui
 * ne compte plus aucun jour (un dimanche seul) disparait. Les heures du
 * morceau sont celles de ses jours, prises dans le detail d'origine.
 *
 * @param countDays decompte des conges d'un morceau (unite et feries fermes du restaurant)
 */
export const planAbsenceChange = (
  candidate: AbsencePeriod,
  previous: AbsencePeriod | null,
  existing: AbsencePeriod[],
  countDays: (start: string, end: string) => number,
  now: string,
): AbsencePlan => {
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
  const changes: AbsenceChange[] = [{ period: candidate, previous }];
  let daysGivenBack = 0;
  for (const o of others) {
    const piece = (id: string, start: string, end: string): AbsencePeriod | null => {
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
    const kept = [before, after].filter((p): p is AbsencePeriod => p !== null);
    daysGivenBack += o.daysCounted - kept.reduce((a, p) => a + p.daysCounted, 0);
    if (kept.length === 0) changes.push({ period: null, previous: o });
    kept.forEach(p => changes.push({ period: p, previous: p.id === o.id ? o : null }));
  }
  return { ok: true, changes, daysGivenBack: Math.round(daysGivenBack * 10) / 10 };
};

/**
 * Les absences d'une semaine apres application des modifications : les jours
 * des periodes touchees sont retires puis re-projetes, et une periode remplace
 * les anciennes etiquettes jour par jour de la meme personne sur ses jours.
 * Partage par l'ecriture en base et par le mode invite.
 */
export const applyAbsenceChanges = (absences: Absence[], weekId: string, changes: AbsenceChange[]): Absence[] => {
  const touched = new Set(changes.map(c => (c.period || c.previous)!.id));
  const covered = new Set<string>();
  const added: Absence[] = [];
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

/**
 * Les shifts d'une semaine sans ceux que la personne tenait elle-meme sur ses
 * jours d'absence entiers. Un shift deja repris par un collegue reste : il
 * sera fait. Une demi-journee laisse l'autre moitie travaillable.
 */
export const shiftsWithoutAbsence = (shifts: Shift[], weekId: string, period: AbsencePeriod | null): Shift[] => {
  if (!period || period.half) return shifts;
  const off = new Set(periodDays(period.start, period.end));
  return shifts.filter(sh => !(sh.staffId === period.staffId && !sh.coverageBy && off.has(addDaysIso(weekId, sh.dayIndex + 1))));
};

// =============================================================================
// COMPTEUR DE CONGES PAYES — provisoire, le bulletin fait foi
// =============================================================================
//
// L'app ne tient pas la paie : elle part du solde LU SUR UN BULLETIN a une date
// (l'ancre), puis ajoute ce qui s'acquiert et retire ce qui se prend depuis.
// Acquisition (Code du travail, loi du 22/04/2024) : 2,5 jours ouvrables par
// mois (30 par an ; 25 jours ouvres en decompte ouvres), au prorata des jours.
// Sont assimiles a du travail effectif : conges payes, accident du travail /
// maladie professionnelle, maternite / paternite, evenement familial. L'arret
// maladie non professionnel acquiert 2 jours par mois au lieu de 2,5. Le sans
// solde et l'absence injustifiee n'acquierent rien.

export interface LeaveBalanceSummary {
  /** Acquis depuis le bulletin, jusqu'a aujourd'hui inclus. */
  acquired: number;
  /** Conges payes pris depuis le bulletin, jusqu'a aujourd'hui inclus. */
  taken: number;
  /** Solde aujourd'hui = bulletin + acquis - pris. */
  balance: number;
  /** Conges payes deja poses apres aujourd'hui. */
  upcoming: number;
  /** Solde une fois ces conges pris. */
  afterUpcoming: number;
}

/**
 * @param anchor      solde lu sur le bulletin, a la date du bulletin (fin de mois en general)
 * @param periods     les absences de la personne (toutes)
 * @param countDays   decompte des conges d'un morceau de periode (unite + feries fermes)
 */
export const leaveBalanceSummary = (
  anchor: { date: string; balance: number },
  periods: { kind: string; start: string; end: string; half?: 'am' | 'pm' }[],
  staff: { startDate?: string; endDate?: string | null },
  today: string,
  unit: 'ouvrables' | 'ouvres',
  countDays: (start: string, end: string) => number,
): LeaveBalanceSummary => {
  const monthly = unit === 'ouvres' ? 25 / 12 : 2.5;
  const factorOf = new Map<string, number>();
  for (const p of periods) {
    const f = p.kind === 'sans_solde' || p.kind === 'injustifiee' ? 0 : p.kind === 'maladie' ? 0.8 : 1;
    if (f === 1) continue;
    for (const d of periodDays(p.start, p.end)) factorOf.set(d, Math.min(factorOf.get(d) ?? 1, f));
  }
  const from = addDaysIso(anchor.date, 1);
  const until = staff.endDate && staff.endDate < today ? staff.endDate : today;
  let acquired = 0;
  // Boucle bornee par periodDays (400 jours) : un bulletin tres ancien ne gele pas l'ecran.
  for (const d of periodDays(from, until)) {
    if (staff.startDate && d < staff.startDate) continue;
    acquired += (monthly / daysInMonth(d)) * (factorOf.get(d) ?? 1);
  }
  let taken = 0;
  let upcoming = 0;
  for (const p of periods) {
    if (p.kind !== 'cp' || p.end < from) continue;
    const s = p.start < from ? from : p.start;
    const days = (a: string, b: string) => (b < a ? 0 : p.half && p.start === p.end ? 0.5 : countDays(a, b));
    taken += days(s, p.end < today ? p.end : today);
    upcoming += days(s > today ? s : addDaysIso(today, 1), p.end);
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  const balance = anchor.balance + acquired - taken;
  return { acquired: r(acquired), taken: r(taken), balance: r(balance), upcoming: r(upcoming), afterUpcoming: r(balance - upcoming) };
};

// =============================================================================
// JOURS FERIES — calcules, jamais saisis
// =============================================================================
//
// Les 11 feries legaux francais (Code du travail, art. L3133-1) se calculent :
// huit a date fixe, trois derives de Paques. Les saisir a la main chaque annee
// etait une source d'oubli ; l'app les connait desormais toute seule.
// Ce que chaque restaurant decide, c'est lesquels il FERME (reglage
// `closedHolidays`, une fois pour toutes) : un ferie ferme bloque les shifts et
// ne se decompte pas des conges payes ; un ferie ouvert reste un jour ordinaire.
// Alsace-Moselle (Vendredi saint, 26 decembre) : pas couvert a ce jour.

export type HolidayKey =
  | 'jan1' | 'easterMonday' | 'may1' | 'may8' | 'ascension' | 'whitMonday'
  | 'jul14' | 'aug15' | 'nov1' | 'nov11' | 'dec25';

export const HOLIDAY_KEYS: HolidayKey[] = [
  'jan1', 'easterMonday', 'may1', 'may8', 'ascension', 'whitMonday',
  'jul14', 'aug15', 'nov1', 'nov11', 'dec25',
];

/** Dimanche de Paques (calendrier gregorien, algorithme dit « anonyme »). */
export const easterSunday = (year: number): string => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/** Les 11 feries d'une annee, dans l'ordre du calendrier. */
export const frenchPublicHolidays = (year: number): { key: HolidayKey; date: string }[] => {
  const easter = easterSunday(year);
  const fixed = (mmdd: string) => `${year}-${mmdd}`;
  return ([
    { key: 'jan1', date: fixed('01-01') },
    { key: 'easterMonday', date: addDaysIso(easter, 1) },
    { key: 'may1', date: fixed('05-01') },
    { key: 'may8', date: fixed('05-08') },
    { key: 'ascension', date: addDaysIso(easter, 39) },
    { key: 'whitMonday', date: addDaysIso(easter, 50) },
    { key: 'jul14', date: fixed('07-14') },
    { key: 'aug15', date: fixed('08-15') },
    { key: 'nov1', date: fixed('11-01') },
    { key: 'nov11', date: fixed('11-11') },
    { key: 'dec25', date: fixed('12-25') },
  ] as { key: HolidayKey; date: string }[]).sort((x, y) => x.date.localeCompare(y.date));
};

/** Feries compris entre deux dates incluses (a cheval sur deux annees compris). */
export const holidaysBetween = (start: string, end: string): { key: HolidayKey; date: string }[] => {
  if (!start || !end || end < start) return [];
  const out: { key: HolidayKey; date: string }[] = [];
  for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
    for (const h of frenchPublicHolidays(y)) if (h.date >= start && h.date <= end) out.push(h);
  }
  return out;
};

/** Dates des feries FERMES par le restaurant entre deux dates : ce que le
 *  decompte des conges et le blocage des shifts doivent ecarter. */
export const closedHolidayDates = (start: string, end: string, closed: string[] = []): string[] =>
  holidaysBetween(start, end).filter(h => closed.includes(h.key)).map(h => h.date);
