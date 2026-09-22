import { Language, Shift, Staff } from '../types';
import { Convention, Violation } from './laborRules';
import { getTranslation } from './translations';
import { formatTime, formatShortDate } from './helpers';
import { formatDuration } from './worktime';
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
 * 2. On nomme la personne et l'autre shift. « Le plus long repos de la semaine
 *    accorde a Serge n'est que de 30,5 heures » se lit seul, sans avoir a
 *    regarder quel equipier est selectionne (retour de Serge, 21/09/2026).
 *
 * 3. On cite la vraie source. Les repos et les jours d'affilee viennent du Code
 *    du travail quelle que soit la convention ; seule la duree maximale d'une
 *    journee vient de la convention choisie dans les reglages.
 *
 * 4. On nomme l'autre shift. « Elle n'aurait que 9 h de repos » n'est pas
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
  /** Le prenom a mettre dans la phrase. */
  who: string,
  /** Pour citer la convention quand c'est elle qui fixe le seuil. */
  convention: Convention,
  /** Formulaire de shift : le shift n'existe pas encore, la phrase passe au
   *  conditionnel (« Avec ce shift, … travaillerait »). */
  preview = false,
): string => {
  const t = getTranslation(language);
  // La virgule decimale est francaise ; l'anglais garde le point. Sans ca on
  // ecrivait « 8,5h rest » dans une phrase anglaise.
  const num = (n: number) =>
    Number.isInteger(n) ? String(n) : String(n).replace('.', language === 'fr' ? ',' : '.');

  const fill = (key: string, extra: Record<string, string> = {}) =>
    // Une duree se lit « 12 h 40 », pas « 12,67 heures » (recette du 22/09/2026) ;
    // seul le nombre de jours d'affilee reste un compte.
    Object.entries({ actual: v.rule === 'maxConsecutiveDays' ? num(v.actual) : formatDuration(v.actual, language), required: num(v.required), who, ...extra })
      .reduce((str, [k, val]) => str.replaceAll(`{${k}}`, val), t(preview ? `${key}Preview` : key));

  const dayLabel = (iso: string) =>
    `${(language === 'fr' ? DAYS_FR : DAYS_EN)[(new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7][language === 'fr' ? 'toLowerCase' : 'toString']()} ${formatShortDate(iso, language)}`;

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
    case 'maxWeekly': return fill('ruleMaxWeekly');
    case 'breakRequired': return fill('ruleBreakRequired', { day: dayLabel(v.date), minutes: String(convention.breakMinutes) });
    case 'maxDaily': return fill('ruleMaxDaily', {
      // « le mardi 22 sept 26 » : « ce jour-la » obligeait a chercher lequel.
      day: dayLabel(v.date),
      source: convention.idcc
        ? t('ruleSourceConvention').replace('{label}', convention.label).replace('{idcc}', convention.idcc)
        : t('ruleSourceLaw'),
    });
    case 'maxConsecutiveDays': return fill('ruleMaxConsecutive');
  }
};

/** Le nom a afficher devant la phrase, dans le recapitulatif. */
export const violationWho = (v: Violation, staffList: Staff[]): string =>
  staffList.find(s => s.id === v.staffId)?.name || '—';
