import React, { useEffect, useRef, useState } from 'react';

interface MonthPickerProps {
  /** Mois choisi, « 2026-09 ». */
  value: string;
  onChange: (month: string) => void;
  language?: string;
  id?: string;
  /** Nom lu par les lecteurs d'ecran (et les tests) : « Mois », suivi du mois choisi. */
  name?: string;
  className?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Choix d'un mois : fleches pour le mois voisin, et un clic sur le nom ouvre la
 * grille des douze mois de l'annee.
 *
 * Remplace `<input type="month">` (Serge, 02/10/2026 : « on dirait Windows 95 ») :
 * son calendrier est dessine par le navigateur, en anglais, et ne se stylise pas.
 */
const MonthPicker: React.FC<MonthPickerProps> = ({ value, onChange, language = 'fr', id, name, className = '' }) => {
  const [y, m] = value.split('-').map(Number);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(y);
  const root = useRef<HTMLDivElement>(null);
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

  const label = new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const shortName = (i: number) => {
    const s = new Date(2000, i, 1).toLocaleDateString(locale, { month: 'short' }).replace('.', '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const step = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  useEffect(() => { if (open) setViewYear(y); }, [open, y]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc, true); };
  }, [open]);

  const arrow = 'w-9 h-10 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors';
  const chevron = (d: string) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={d} /></svg>;
  const LEFT = 'M15 19l-7-7 7-7', RIGHT = 'M9 5l7 7-7 7';

  return (
    <div ref={root} className={`relative inline-flex ${className}`}>
      <div className="inline-flex items-stretch bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
        <button type="button" onClick={() => step(-1)} className={arrow} aria-label={language === 'fr' ? 'Mois précédent' : 'Previous month'}>{chevron(LEFT)}</button>
        <button type="button" id={id} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={name ? `${name} : ${label}` : undefined}
          className="px-3 min-w-[9.5rem] text-sm font-semibold text-slate-800 capitalize hover:bg-white transition-colors">
          {label}
        </button>
        <button type="button" onClick={() => step(1)} className={arrow} aria-label={language === 'fr' ? 'Mois suivant' : 'Next month'}>{chevron(RIGHT)}</button>
      </div>
      {open && (
        <div role="dialog" data-testid="month-picker" className="absolute left-0 top-full mt-2 z-50 w-64 bg-white rounded-2xl border border-slate-200 shadow-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setViewYear(v => v - 1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" aria-label={language === 'fr' ? 'Année précédente' : 'Previous year'}>{chevron(LEFT)}</button>
            <span className="text-sm font-bold text-slate-800 tabular-nums">{viewYear}</span>
            <button type="button" onClick={() => setViewYear(v => v + 1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" aria-label={language === 'fr' ? 'Année suivante' : 'Next year'}>{chevron(RIGHT)}</button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 12 }, (_, i) => {
              const key = `${viewYear}-${pad(i + 1)}`;
              const selected = key === value;
              const current = key === thisMonth;
              return (
                <button key={key} type="button" data-month={key}
                  onClick={() => { onChange(key); setOpen(false); }}
                  className={`py-2 rounded-lg text-sm font-semibold transition-colors
                    ${selected ? 'bg-indigo-600 text-white' : current ? 'text-indigo-600 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {shortName(i)}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => { onChange(thisMonth); setOpen(false); }}
            className="mt-2 w-full py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg">
            {language === 'fr' ? 'Ce mois-ci' : 'This month'}
          </button>
        </div>
      )}
    </div>
  );
};

export default MonthPicker;
