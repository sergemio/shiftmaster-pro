import React, { useState } from 'react';
import { Language } from '../types';
import { DAYS_EN, DAYS_FR, DAYS_EN_SHORT, DAYS_FR_SHORT } from '../constants';
import { getTranslation } from '../utils/translations';

interface SelectionBarProps {
  count: number;
  onNudge: (deltaHours: number) => void;
  onMoveToDay: (dayIndex: number) => void;
  onDelete: () => void;
  onClear: () => void;
  language?: Language;
}

/**
 * Barre d'actions sur une selection de shifts.
 *
 * Pourquoi une barre et pas un glisser-deposer en bloc : le glisser est un geste
 * de souris, et l'application sert surtout sur telephone — ou il est d'ailleurs
 * desactive volontairement pour eviter les deplacements accidentels. Une barre
 * d'actions marche au doigt comme a la souris, et surtout elle ne touche pas au
 * code de glisser-deposer, la partie la plus delicate du calendrier.
 *
 * Elle se pose en bas : c'est la que le pouce arrive, et elle ne recouvre pas
 * l'en-tete des jours dont on a justement besoin pour viser.
 */
const SelectionBar: React.FC<SelectionBarProps> = ({ count, onNudge, onMoveToDay, onDelete, onClear, language = 'en' }) => {
  const t = getTranslation(language);
  const [dayOpen, setDayOpen] = useState(false);
  const full = language === 'fr' ? DAYS_FR : DAYS_EN;
  const short = language === 'fr' ? DAYS_FR_SHORT : DAYS_EN_SHORT;

  const pickDay = (i: number) => {
    setDayOpen(false);
    onMoveToDay(i);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[105] px-3 pb-3 pt-2 pointer-events-none">
      <div className="mx-auto max-w-3xl pointer-events-auto rounded-2xl bg-slate-900 text-white shadow-2xl overflow-hidden">
        {dayOpen && (
          <div className="grid grid-cols-7 gap-1 p-2 border-b border-white/10">
            {short.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => pickDay(i)}
                aria-label={full[i]}
                className="py-3 rounded-xl text-xs font-bold uppercase bg-white/10 hover:bg-indigo-500 active:scale-95 transition-all"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Sur telephone le compte passe AU-DESSUS des actions : en le laissant
            sur la meme ligne, les boutons se repliaient et le compte finissait
            seul en bas a gauche, decolle de ce qu'il decrit. */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 p-2">
          <span className="px-2 pt-1 sm:pt-0 text-xs font-black uppercase tracking-widest text-indigo-300 whitespace-nowrap">
            {t('selectedCount').replace('{n}', String(count))}
          </span>

          <div className="flex items-center justify-end gap-1.5 flex-nowrap sm:ml-auto">
            <button
              type="button"
              onClick={() => onNudge(-0.5)}
              title={t('shiftEarlier')}
              className="px-2.5 sm:px-3 py-3 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-sm font-bold"
            >
              −30
            </button>
            <button
              type="button"
              onClick={() => onNudge(0.5)}
              title={t('shiftLater')}
              className="px-2.5 sm:px-3 py-3 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-sm font-bold"
            >
              +30
            </button>
            <button
              type="button"
              onClick={() => setDayOpen(v => !v)}
              aria-expanded={dayOpen}
              className={`px-2.5 sm:px-3 py-3 rounded-xl active:scale-95 transition-all text-sm font-bold whitespace-nowrap ${dayOpen ? 'bg-indigo-500' : 'bg-white/10 hover:bg-white/20'}`}
            >
              {t('moveToDay')}
            </button>
            {/* Rouge assume : c'est la seule action destructrice de la barre, et
                elle doit se distinguer au premier coup d'oeil des trois autres,
                qui sont toutes annulables d'un Ctrl+Z comme elle mais ne font
                pas disparaitre de carte a l'ecran. */}
            <button
              type="button"
              onClick={onDelete}
              className="px-2.5 sm:px-3 py-3 rounded-xl bg-red-500/90 hover:bg-red-500 active:scale-95 transition-all text-sm font-bold"
            >
              {t('deleteSelected')}
            </button>
            <button
              type="button"
              onClick={onClear}
              aria-label={t('clearSelection')}
              title={t('clearSelection')}
              className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-white/10 active:scale-95 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectionBar;
