import React from 'react';
import { Language } from '../types';

interface DateFieldProps {
  label: React.ReactNode;
  /** ISO yyyy-mm-dd, ou chaine vide. */
  value: string;
  onChange: (value: string) => void;
  language?: Language;
  required?: boolean;
  className?: string;
  labelClassName?: string;
}

/**
 * Champ de date qui REDIT en toutes lettres ce qu'il a compris.
 *
 * Pourquoi ce composant existe. Le 09/09/2026, Tatiana a saisi la date d'arrivee
 * de Stephanie et obtenu le 9 DECEMBRE au lieu du 14 SEPTEMBRE. Un `input
 * type="date"` affiche ses segments dans l'ordre de la langue du NAVIGATEUR, pas
 * de l'application : sur un navigateur en anglais c'est mois/jour/annee. Elle a
 * tape « 14 » en croyant saisir le jour — c'etait le mois, qui plafonne a 12 —
 * puis « 09 » est tombe dans le jour. Resultat en base : 2026-12-09.
 *
 * Le piege est double : la saisie est fausse, ET la consequence est invisible.
 * Une arrivee en decembre fait disparaitre la personne du planning de septembre
 * (le filtre `isStaffActiveInWeek` l'ecarte), donc l'utilisateur ne voit pas une
 * date fausse, il voit quelqu'un qui « n'existe pas ». Deux symptomes, une cause.
 *
 * On ne peut pas imposer l'ordre des segments — il appartient au navigateur.
 * Ce qu'on peut faire, c'est **rendre l'erreur visible a la seconde ou elle est
 * commise** : la date relue en toutes lettres, avec le jour de la semaine et le
 * mois ecrit, ne se confond avec rien. « lundi 14 septembre 2026 » et « mercredi
 * 9 decembre 2026 » ne se ressemblent pas, alors que 14/09 et 12/09 se
 * ressemblent beaucoup.
 */
const DateField: React.FC<DateFieldProps> = ({
  label,
  value,
  onChange,
  language = 'en',
  required = false,
  className = '',
  labelClassName = '',
}) => {
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';

  // On construit la date en UTC : `new Date('2026-09-14')` est deja interprete
  // en UTC, mais l'afficher dans un fuseau a l'ouest reculerait d'un jour.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T12:00:00Z') : null;

  const spelled = parsed
    ? parsed.toLocaleDateString(locale, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
      })
    : null;

  // Pas de seuil « trop loin dans le futur » : l'erreur de Tatiana etait a trois
  // mois, une embauche prevue a trois mois est parfaitement normale, et un seuil
  // pose entre les deux crierait au loup sur des dates justes. C'est la relecture
  // en toutes lettres qui fait le travail — « mercredi 9 decembre 2026 » ne se
  // confond pas avec « lundi 14 septembre 2026 », alors que 12/09 et 14/09 si.
  // Le second filet est ailleurs : la fiche d'equipe annonce desormais les
  // arrivees a venir, donc une date fausse se voit aussi dans la liste.

  return (
    <div>
      <label className={labelClassName}>{label}</label>
      <input
        type="date"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      />
      {spelled && (
        <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">{spelled}</p>
      )}
    </div>
  );
};

export default DateField;
