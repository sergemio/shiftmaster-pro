/**
 * Regles de duree du travail : le moteur, et la table des conventions.
 *
 * Le principe qui gouverne tout ce fichier : **on informe, on ne bloque jamais**.
 * C'est l'employeur qui decide ; l'application dit ce qu'il est en train de faire.
 * Une application qui refuse une saisie devient une application qu'on contourne.
 *
 * L'autre principe, celui qui permet de servir plus tard un autre restaurant :
 * une regle porte son CALCUL et sa PHRASE, une convention ne porte que des
 * CHIFFRES. « Repos entre deux journees » se calcule pareil partout ; seul le
 * seuil compare change. Ajouter une convention = ajouter une ligne dans
 * CONVENTIONS, pas ecrire du code.
 *
 * Le moteur ne connait ni semaines ni `dayIndex` : il travaille sur une liste
 * plate de shifts dates. C'est ce qui lui permet de voir le repos entre dimanche
 * soir et lundi matin, qui traverse deux documents Firestore, sans rien savoir
 * du decoupage en semaines.
 */

import { mergeSpans, minutesToHours, spanMinutes, workSpans } from './worktime';

export type RuleId = 'dailyRest' | 'weeklyRest' | 'maxDaily' | 'maxConsecutiveDays' | 'maxWeekly' | 'breakRequired';

/** Un shift a plat, avec sa date reelle. Le moteur ne manipule que ca. */
export interface DatedShift {
  id: string;
  staffId: string;
  /** ISO yyyy-mm-dd */
  date: string;
  /** Heures decimales depuis minuit : 18,5 = 18 h 30. Fin jusqu'a 30 (6 h le
   *  lendemain) : le shift reste rattache a `date`. */
  start: number;
  end: number;
  /** Pause (debut en heures, duree en minutes) : pas du temps de travail. */
  breakStart?: number;
  breakMinutes?: number;
}

export interface Convention {
  id: string;
  /** Nom affiche a l'utilisateur. Il doit toujours savoir quelle loi on lui cite. */
  label: string;
  /** Nom en anglais, pour l'interface anglaise. */
  labelEn: string;
  idcc: string;
  /** D'ou viennent les chiffres, et quand ils ont ete verifies pour la derniere
   *  fois. Les conventions changent par avenants : sans ces deux champs, la
   *  table pourrit en silence. */
  source: string;
  checkedOn: string;
  /** Heures de repos minimum entre deux journees de travail. */
  dailyRestHours: number;
  /** Repos hebdomadaire : 24 h consecutives + le repos quotidien. */
  weeklyRestHours: number;
  /** Duree maximale de travail sur une meme journee. */
  maxDailyHours: number;
  /** Jours travailles d'affilee au maximum. */
  maxConsecutiveDays: number;
  /** Duree maximale sur une meme semaine (L3121-20). */
  maxWeeklyHours: number;
  /** Travail continu au-dela duquel une pause est due (L3121-16), en heures. */
  breakAfterHours: number;
  /** Duree minimale de cette pause, en minutes : une coupure plus courte ne compte pas. */
  breakMinutes: number;
}

export const CONVENTIONS: Record<string, Convention> = {
  '1501': {
    id: '1501',
    label: 'Restauration rapide',
    labelEn: 'Quick-service restaurants',
    idcc: '1501',
    source: 'IDCC 1501 pour la journee ; Code du travail pour les repos',
    checkedOn: '2026-09-06',
    dailyRestHours: 11,
    weeklyRestHours: 35,
    maxDailyHours: 10,
    maxConsecutiveDays: 6,
    maxWeeklyHours: 48,
    breakAfterHours: 6,
    breakMinutes: 20,
  },
  // Hotels, cafes, restaurants : la convention de la restauration « a table ».
  // La duree maximale d'une journee y depend du poste (11 h cuisinier, 11 h 30
  // autre personnel, 12 h veilleur de nuit, avenant n° 2 du 05/02/2007) ; le
  // moteur n'a qu'un seuil par convention, on retient le plus protecteur.
  '1979': {
    id: '1979',
    label: 'Hôtels, cafés, restaurants (HCR)',
    labelEn: 'Hotels, cafés, restaurants (HCR)',
    idcc: '1979',
    source: 'IDCC 1979, avenant n° 2 du 05/02/2007 (non reverifie en ligne) ; Code du travail pour les repos',
    checkedOn: '2026-09-18',
    dailyRestHours: 11,
    weeklyRestHours: 35,
    maxDailyHours: 11,
    maxConsecutiveDays: 6,
    maxWeeklyHours: 48,
    breakAfterHours: 6,
    breakMinutes: 20,
  },
  // Sans convention : le Code du travail seul (L3131-1 repos quotidien,
  // L3132-2 repos hebdomadaire, L3121-18 duree quotidienne maximale).
  none: {
    id: 'none',
    label: 'Code du travail (sans convention)',
    labelEn: 'Labour Code (no collective agreement)',
    idcc: '',
    source: 'Code du travail L3131-1, L3132-2, L3121-18',
    checkedOn: '2026-09-18',
    dailyRestHours: 11,
    weeklyRestHours: 35,
    maxDailyHours: 10,
    maxConsecutiveDays: 6,
    maxWeeklyHours: 48,
    breakAfterHours: 6,
    breakMinutes: 20,
  },
};

/** « hcr » : ancienne valeur du reglage, avant que la table ne soit indexee par IDCC. */
export const conventionFor = (id?: string | null): Convention =>
  CONVENTIONS[id === 'hcr' ? '1979' : id || DEFAULT_CONVENTION] || CONVENTIONS[DEFAULT_CONVENTION];

/** Libelle complet, IDCC compris quand il existe. */
export const conventionLabel = (c: Convention, language: string = 'fr'): string => {
  const label = language === 'fr' ? c.label : c.labelEn;
  return c.idcc ? `${label} — IDCC ${c.idcc}` : label;
};

export const DEFAULT_CONVENTION = '1501';

/** Un depassement constate. Le moteur decrit, l'interface formule. */
export interface Violation {
  rule: RuleId;
  staffId: string;
  /** Le shift qui portera le badge. Absent quand aucune carte n'est « fautive »
   *  en particulier — c'est le cas du repos hebdomadaire, qui concerne la
   *  semaine entiere : le signaler sur une carte choisie au hasard induirait en
   *  erreur, donc il n'apparait que dans le recapitulatif. */
  shiftId?: string;
  /** L'autre shift en cause, quand il y en a un. Sans lui, « 9 h de repos »
   *  n'est pas actionnable : il faut pouvoir dire APRES QUOI. */
  otherShiftId?: string;
  /** Date ISO a laquelle le probleme se manifeste. */
  date: string;
  /** Ce qui est constate, et ce qui est demande. Memes unites : des heures,
   *  sauf pour maxConsecutiveDays ou ce sont des jours. */
  actual: number;
  required: number;
}

// -----------------------------------------------------------------------------
// Le temps. Les horaires sont des heures MURALES (18 h 30 a Paris) ; le repos
// se mesure en temps ECOULE. La nuit du changement d'heure, les deux different
// d'une heure : du samedi 23 h au dimanche 10 h, il s'ecoule 12 h fin octobre et
// 10 h fin mars. Calculer en UTC donnait 11 h les deux fois (audit du 22/09/2026).
// -----------------------------------------------------------------------------

export const DEFAULT_TIME_ZONE = 'Europe/Paris';

const formatters = new Map<string, Intl.DateTimeFormat>();
/** Decalage de la zone sur UTC, en heures, a l'instant `utcHours`. */
const offsetAt = (utcHours: number, timeZone: string): number => {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(utcHours * 3600000)).map(x => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) / 3600000;
  return wall - utcHours;
};

/** Instant absolu (heures depuis l'epoque) d'une heure murale d'un jour donne.
 *  `hour` peut depasser 24 : 25 = 1 h du matin le lendemain. */
const at = (date: string, hour: number, timeZone: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d) / 3600000 + hour;
  // Le decalage depend de l'instant cherche : une seconde passe le stabilise.
  let off = offsetAt(wall, timeZone);
  off = offsetAt(wall - off, timeZone);
  return wall - off;
};

const addDays = (date: string, n: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Plages de travail effectif d'un shift date (pause retiree), en minutes. */
const spansOf = (s: DatedShift) => workSpans({
  staffId: s.staffId, dayIndex: 0, startTime: s.start, endTime: s.end,
  breakStart: s.breakStart, breakMinutes: s.breakMinutes,
});

/**
 * Toutes les infractions pour une personne, sur la liste de shifts fournie.
 *
 * L'appelant decide de la fenetre : plus il fournit de semaines, plus les regles
 * qui traversent les semaines sont exactes. Ce qui n'est pas fourni compte comme
 * du repos : une fenetre trop courte produit un silence, jamais une fausse
 * alerte (decision de Serge du 22/09/2026).
 */
export const violationsForStaff = (
  shifts: DatedShift[],
  convention: Convention,
  /** Bornes de la periode a signaler. En dehors, les shifts servent au calcul
   *  mais ne declenchent pas d'avertissement : on ne va pas alerter sur une
   *  semaine que l'utilisateur ne regarde pas. */
  window?: { from: string; to: string },
  timeZone: string = DEFAULT_TIME_ZONE,
): Violation[] => {
  const out: Violation[] = [];
  const inWindow = (date: string) => !window || (date >= window.from && date <= window.to);
  const t = (date: string, hour: number) => at(date, hour, timeZone);

  const sorted = [...shifts].sort((a, b) => t(a.date, a.start) - t(b.date, b.start));
  if (sorted.length === 0) return out;

  const byDate = new Map<string, DatedShift[]>();
  for (const s of sorted) {
    const list = byDate.get(s.date) || [];
    list.push(s);
    byDate.set(s.date, list);
  }

  // ---------------------------------------------------------- duree quotidienne
  // Le temps de travail du module unique (utils/worktime.ts) : plages reunies,
  // pause retiree. Une coupure midi/soir reste une seule journee de travail.
  for (const [date, list] of byDate) {
    if (!inWindow(date)) continue;
    const total = minutesToHours(spanMinutes(mergeSpans(list.flatMap(spansOf))));
    if (total > convention.maxDailyHours) {
      out.push({
        rule: 'maxDaily',
        staffId: list[0].staffId,
        // Le badge va sur le dernier shift de la journee : c'est celui qui fait
        // franchir le plafond, et c'est celui qu'on raccourcira.
        shiftId: list[list.length - 1].id,
        date,
        actual: round2(total),
        required: convention.maxDailyHours,
      });
    }
  }

  // --------------------------------------------------------------------- pause
  // Code du travail L3121-16 : des 6 h de travail, 20 minutes de pause
  // consecutives. Decision du 22/09/2026 : on regarde le travail CONTINU ; une
  // coupure entre deux shifts vaut pause si elle dure au moins 20 minutes. Une
  // pause plus courte ne coupe rien. Signale au-dela de 6 h continues.
  for (const [date, list] of byDate) {
    if (!inWindow(date)) continue;
    const spans = mergeSpans(list.flatMap(spansOf));
    let longest = 0, from = spans[0]?.[0] ?? 0, to = from;
    for (const [a, z] of spans) {
      if (a - to >= convention.breakMinutes) from = a;
      to = Math.max(to, z);
      longest = Math.max(longest, to - from);
    }
    if (longest > convention.breakAfterHours * 60) {
      out.push({
        rule: 'breakRequired',
        staffId: list[0].staffId,
        shiftId: list[list.length - 1].id,
        date,
        actual: round2(minutesToHours(longest)),
        required: convention.breakAfterHours,
      });
    }
  }

  // ------------------------------------------------------------- repos quotidien
  // Entre deux shifts de DATES differentes. Deux shifts le meme jour, c'est une
  // coupure : un autre sujet, avec ses propres regles.
  // « prev » = le shift qui finit le plus tard jusqu'ici, et non le dernier
  // commence : avec 10 h - 23 h et 11 h - 17 h le meme jour, le repos court
  // depuis 23 h, pas depuis 17 h.
  let latest = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const prev = latest;
    const cur = sorted[i];
    if (t(cur.date, cur.end) > t(latest.date, latest.end)) latest = cur;
    if (cur.date === prev.date) continue;
    const gap = t(cur.date, cur.start) - t(prev.date, prev.end);
    if (gap < convention.dailyRestHours && inWindow(cur.date)) {
      out.push({
        rule: 'dailyRest',
        staffId: cur.staffId,
        shiftId: cur.id,
        otherShiftId: prev.id,
        date: cur.date,
        actual: round2(gap),
        required: convention.dailyRestHours,
      });
    }
  }

  // --------------------------------------------------------- jours consecutifs
  // Une serie s'arrete des qu'un jour n'a aucun shift. On ne signale que si la
  // serie DEPASSE le plafond, et on l'accroche au premier jour de trop.
  const dates = [...byDate.keys()].sort();
  let runStart = 0;
  for (let i = 0; i <= dates.length; i++) {
    // `i > 0` d'abord : sans lui, le premier tour lit dates[-1] et plante.
    const broken = i === dates.length || (i > 0 && dates[i] !== addDays(dates[i - 1], 1));
    if (broken && i > runStart) {
      const run = dates.slice(runStart, i);
      if (run.length > convention.maxConsecutiveDays) {
        const firstTooMany = run[convention.maxConsecutiveDays];
        if (inWindow(firstTooMany)) {
          out.push({
            rule: 'maxConsecutiveDays',
            staffId: sorted[0].staffId,
            shiftId: byDate.get(firstTooMany)![0].id,
            date: firstTooMany,
            actual: run.length,
            required: convention.maxConsecutiveDays,
          });
        }
      }
      runStart = i;
    }
  }

  if (window) {
    const from = t(window.from, 0);
    const to = t(addDays(window.to, 1), 0);
    const mine = sorted.filter(s => inWindow(s.date));

    // ------------------------------------------------------ duree hebdomadaire
    // Code du travail L3121-20 : 48 h au plus sur une meme semaine.
    if (mine.length > 0) {
      let minutes = 0;
      for (const list of byDate.values()) {
        if (inWindow(list[0].date)) minutes += spanMinutes(mergeSpans(list.flatMap(spansOf)));
      }
      const week = minutesToHours(minutes);
      if (week > convention.maxWeeklyHours) {
        out.push({
          rule: 'maxWeekly',
          staffId: mine[0].staffId,
          // Sur le dernier shift de la semaine : c'est lui qui fait depasser.
          shiftId: mine[mine.length - 1].id,
          date: window.from,
          actual: round2(week),
          required: convention.maxWeeklyHours,
        });
      }
    }

    // ------------------------------------------------------ repos hebdomadaire
    // 24 h consecutives + le repos quotidien, soit 35 h (L3132-2). Un jour marque
    // « off » ne suffit donc pas : finir vendredi a 23 h 30 et reprendre dimanche
    // a 9 h fait 33 h 30, samedi vide ou non.
    //
    // Les repos sont les intervalles entre deux periodes de travail. Avant le
    // premier shift connu et apres le dernier, le repos est OUVERT : une semaine
    // voisine vide ou pas encore planifiee compte comme du repos (decision de
    // Serge du 22/09/2026 ; avant, lundi 0 h etait pris pour une reprise et une
    // semaine « lundi-samedi, dimanche libre » etait signalee).
    //
    // Un repos ne compte pour CETTE semaine que si au moins 24 h en tombent dans
    // la semaine : un long repos pris surtout la semaine precedente ne couvre pas
    // celle-ci (le meme planning etait juge differemment selon les semaines
    // chargees). On retient la longueur du repos s'il remplit cette condition,
    // sinon sa seule part dans la semaine ; le plus grand doit atteindre 35 h.
    if (mine.length > 0) {
      const rests: [number, number][] = [];
      let reach = -Infinity;
      for (const s of sorted) {
        const a = t(s.date, s.start);
        if (a > reach) rests.push([reach, a]);
        reach = Math.max(reach, t(s.date, s.end));
      }
      rests.push([reach, Infinity]);
      let longest = 0;
      for (const [a, z] of rests) {
        const inside = Math.min(z, to) - Math.max(a, from);
        if (inside <= 0) continue;
        longest = Math.max(longest, inside >= 24 ? z - a : inside);
      }
      if (longest < convention.weeklyRestHours) {
        out.push({
          rule: 'weeklyRest',
          staffId: mine[0].staffId,
          date: window.from,
          actual: round2(longest),
          required: convention.weeklyRestHours,
        });
      }
    }
  }

  return out;
};

/**
 * Toutes les infractions, tous salaries confondus.
 *
 * `pooledStaffIds` : les lignes partagees par plusieurs personnes reelles, comme
 * « Extra ». Les regles individuelles n'ont aucun sens sur une telle ligne — deux
 * extras differents qui s'enchainent produiraient une fausse alerte par jour, et
 * on perdrait la confiance dans les avertissements des la premiere semaine.
 */
export const findViolations = (
  shifts: DatedShift[],
  convention: Convention,
  window?: { from: string; to: string },
  pooledStaffIds: string[] = [],
  timeZone: string = DEFAULT_TIME_ZONE,
): Violation[] => {
  const pooled = new Set(pooledStaffIds);
  const byStaff = new Map<string, DatedShift[]>();
  for (const s of shifts) {
    if (pooled.has(s.staffId)) continue;
    const list = byStaff.get(s.staffId) || [];
    list.push(s);
    byStaff.set(s.staffId, list);
  }
  const out: Violation[] = [];
  for (const list of byStaff.values()) {
    out.push(...violationsForStaff(list, convention, window, timeZone));
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.rule.localeCompare(b.rule));
};
