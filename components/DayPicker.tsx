import React from 'react';
import { Language } from '../types';
import { DAYS_EN, DAYS_FR, DAYS_EN_SHORT, DAYS_FR_SHORT } from '../constants';

interface DayPickerProps {
  /** Jours coches, index 0 = lundi. */
  value: number[];
  onChange: (days: number[]) => void;
  /** Jour affiche coche et non decochable — le jour du shift qu'on modifie. */
  lockedDay?: number;
  language?: Language;
  disabled?: boolean;
}

/**
 * Sept pastilles, une par jour de la semaine.
 *
 * Remplace la liste deroulante « Day of Week » : poser le meme service du lundi
 * au vendredi demandait cinq allers-retours dans la fenetre, alors que c'est le
 * geste le plus courant d'un planning de restaurant. Ici les sept jours sont
 * visibles d'un coup et se cochent au doigt.
 *
 * Le jour verrouille (`lockedDay`) reste affiche plutot que masque : sans lui la
 * rangee changerait de forme d'une fenetre a l'autre, et on ne verrait plus a
 * quel jour appartient le shift qu'on est en train de modifier.
 */
const DayPicker: React.FC<DayPickerProps> = ({ value, onChange, lockedDay, language = 'en', disabled = false }) => {
  const full = language === 'fr' ? DAYS_FR : DAYS_EN;
  const short = language === 'fr' ? DAYS_FR_SHORT : DAYS_EN_SHORT;

  const toggle = (i: number) => {
    if (disabled || i === lockedDay) return;
    onChange(value.includes(i) ? value.filter(d => d !== i) : [...value, i].sort((a, b) => a - b));
  };

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {short.map((label, i) => {
        const locked = i === lockedDay;
        const on = locked || value.includes(i);
        return (
          <button
            key={label}
            type="button"
            onClick={() => toggle(i)}
            disabled={disabled || locked}
            aria-pressed={on}
            aria-label={full[i]}
            title={locked ? full[i] : undefined}
            className={`py-3 rounded-xl text-xs font-bold uppercase tracking-wide border-2 transition-all
              ${on ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-600'}
              ${locked ? 'opacity-70 cursor-default' : 'active:scale-95'}
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};

export default DayPicker;
