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

export type RuleId = 'dailyRest' | 'weeklyRest' | 'maxDaily' | 'maxConsecutiveDays';

/** Un shift a plat, avec sa date reelle. Le moteur ne manipule que ca. */
export interface DatedShift {
  id: string;
  staffId: string;
  /** ISO yyyy-mm-dd */
  date: string;
  /** Heures decimales depuis minuit : 18,5 = 18 h 30. */
  start: number;
  end: number;
}

export interface Convention {
  id: string;
  /** Nom affiche a l'utilisateur. Il doit toujours savoir quelle loi on lui cite. */
  label: string;
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
}

export const CONVENTIONS: Record<string, Convention> = {
  '1501': {
    id: '1501',
    label: 'Restauration rapide',
    idcc: '1501',
    source: 'IDCC 1501 pour la journee ; Code du travail pour les repos',
    checkedOn: '2026-09-06',
    dailyRestHours: 11,
    weeklyRestHours: 35,
    maxDailyHours: 10,
    maxConsecutiveDays: 6,
  },
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

/** Instant absolu en heures depuis l'epoque, pour comparer deux dates. */
const at = (date: string, hour: number): number => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 3600000 + hour;
};

const addDays = (date: string, n: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Toutes les infractions pour une personne, sur la liste de shifts fournie.
 *
 * L'appelant decide de la fenetre : plus il fournit de semaines, plus les regles
 * qui traversent les semaines sont exactes. Une fenetre trop courte ne produit
 * pas de faux positif — elle produit un silence, ce qui est le bon defaut.
 */
export const violationsForStaff = (
  shifts: DatedShift[],
  convention: Convention,
  /** Bornes de la periode a signaler. En dehors, les shifts servent au calcul
   *  mais ne declenchent pas d'avertissement : on ne va pas alerter sur une
   *  semaine que l'utilisateur ne regarde pas. */
  window?: { from: string; to: string },
): Violation[] => {
  const out: Violation[] = [];
  const inWindow = (date: string) => !window || (date >= window.from && date <= window.to);

  const sorted = [...shifts].sort((a, b) => at(a.date, a.start) - at(b.date, b.start));
  if (sorted.length === 0) return out;

  // ---------------------------------------------------------- duree quotidienne
  // On additionne les shifts d'une meme journee : une coupure midi/soir reste
  // une seule journee de travail, et c'est bien le total qui est plafonne.
  const byDate = new Map<string, DatedShift[]>();
  for (const s of sorted) {
    const list = byDate.get(s.date) || [];
    list.push(s);
    byDate.set(s.date, list);
  }
  for (const [date, list] of byDate) {
    if (!inWindow(date)) continue;
    const total = list.reduce((sum, s) => sum + (s.end - s.start), 0);
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

  // ------------------------------------------------------------- repos quotidien
  // Entre deux shifts de DATES differentes. Deux shifts le meme jour, c'est une
  // coupure : un autre sujet, avec ses propres regles.
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.date === prev.date) continue;
    const gap = at(cur.date, cur.start) - at(prev.date, prev.end);
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

  // ------------------------------------------------------- repos hebdomadaire
  // 24 h consecutives + le repos quotidien, soit 35 h. Un jour marque « off »
  // ne suffit donc pas : finir vendredi a 23 h 30 et reprendre dimanche a 9 h
  // fait 33 h 30, samedi vide ou non. C'est exactement ce qu'un planificateur
  // ne peut pas deviner de tete.
  //
  // On regarde le plus grand repos disponible dans la fenetre. Si meme le plus
  // grand est trop court, la semaine n'offre nulle part le repos hebdomadaire.
  if (window) {
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(at(sorted[i].date, sorted[i].start) - at(sorted[i - 1].date, sorted[i - 1].end));
    }
    // Les bords comptent : le repos peut commencer avant la fenetre ou finir
    // apres. Sans eux, une semaine ou l'on ne travaille que le lundi serait
    // signalee alors qu'elle est evidemment conforme.
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    gaps.push(at(first.date, first.start) - at(window.from, 0));
    gaps.push(at(addDays(window.to, 1), 0) - at(last.date, last.end));

    const longest = Math.max(...gaps);
    if (longest < convention.weeklyRestHours) {
      out.push({
        rule: 'weeklyRest',
        staffId: first.staffId,
        date: window.from,
        actual: round2(longest),
        required: convention.weeklyRestHours,
      });
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
    out.push(...violationsForStaff(list, convention, window));
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.rule.localeCompare(b.rule));
};
