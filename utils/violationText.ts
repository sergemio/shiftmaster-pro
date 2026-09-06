import { Language, Shift, Staff } from '../types';
import { Violation } from './laborRules';
import { getTranslation } from './translations';
import { formatTime } from './helpers';
import { DAYS_EN, DAYS_FR } from '../constants';

/**
 * Met une infraction en phrase.
 *
 * Deux regles de formulation, et ce sont des choix, pas du detail :
 *
 * 1. On dit CE QUI EST, puis CE QUI DEVRAIT ETRE. « 9 h de repos, le minimum
 *    est 11 h. » Jamais « infraction L3131-1 » : celui qui fait le planning ne
 *    connait pas les articles, et n'a pas a les apprendre pour s'en servir.
 *
 * 2. On nomme l'autre shift. « Elle n'aurait que 9 h de repos » n'est pas
 *    actionnable tant qu'on ne sait pas APRES QUOI — sinon il faut chercher le
 *    coupable a l'oeil sur le planning.
 *
 * Le moteur decrit, cette fonction formule : c'est ce qui permet de tester les
 * regles sans navigateur, et de changer les mots sans toucher aux calculs.
 */
export const violationText = (
  v: Violation,
  language: Language,
  /** Pour retrouver l'autre shift cite dans le message. */
  shiftsById: Map<string, { shift: Shift; date: string }>,
): string => {
  const t = getTranslation(language);
  // La virgule decimale est francaise ; l'anglais garde le point. Sans ca on
  // ecrivait « 8,5h rest » dans une phrase anglaise.
  const num = (n: number) =>
    Number.isInteger(n) ? String(n) : String(n).replace('.', language === 'fr' ? ',' : '.');

  const fill = (key: string, extra: Record<string, string> = {}) =>
    Object.entries({ actual: num(v.actual), required: num(v.required), ...extra })
      .reduce((str, [k, val]) => str.replaceAll(`{${k}}`, val), t(key));

  switch (v.rule) {
    case 'dailyRest': {
      const other = v.otherShiftId ? shiftsById.get(v.otherShiftId) : undefined;
      const days = language === 'fr' ? DAYS_FR : DAYS_EN;
      // Sans le shift precedent sous la main — il peut appartenir a une semaine
      // qu'on n'a pas chargee — on tombe sur une formule sans reference plutot
      // que d'inventer un jour.
      let label = language === 'fr' ? 'le service precedent' : 'the previous shift';
      if (other) {
        // getUTCDay() met dimanche a 0 ; nos tableaux de jours commencent lundi.
        const dow = (new Date(other.date + 'T00:00:00Z').getUTCDay() + 6) % 7;
        label = `${days[dow].toLowerCase()} ${formatTime(other.shift.startTime)}–${formatTime(other.shift.endTime)}`;
      }
      return fill('ruleDailyRest', { other: label });
    }
    case 'weeklyRest': return fill('ruleWeeklyRest');
    case 'maxDaily': return fill('ruleMaxDaily');
    case 'maxConsecutiveDays': return fill('ruleMaxConsecutive');
  }
};

/** Le nom a afficher devant la phrase, dans le recapitulatif. */
export const violationWho = (v: Violation, staffList: Staff[]): string =>
  staffList.find(s => s.id === v.staffId)?.name || '—';
