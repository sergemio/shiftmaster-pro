import React from 'react';
import { Language } from '../types';
import { formatTime, halfHourSteps } from '../utils/helpers';
import { getTranslation } from '../utils/translations';
import { BREAK_STEP, LATEST_END, defaultBreakStart } from '../utils/worktime';

/** Durees de pause proposees, en minutes. 20 min = le minimum legal (L3121-16). */
export const BREAK_CHOICES = [15, 20, 30, 45, 60];

/**
 * Heures proposees par les formulaires de shift : toute la journee, et la fin
 * jusqu'a 6 h le lendemain (decision du 22/09/2026). Les heures d'ouverture ne
 * limitent plus la saisie : un cuisinier arrive avant l'ouverture, un plongeur
 * part apres la fermeture.
 */
export const shiftStartOptions = (): number[] => halfHourSteps(0, 23.5);
export const shiftEndOptions = (after: number): number[] => halfHourSteps(after + 0.5, LATEST_END);

/** « 01:00 (lendemain) » : une fin apres minuit ne doit pas se lire comme 1 h du matin le jour meme. */
export const endLabel = (v: number, language: Language): string =>
  v > 24 ? `${formatTime(v)} (${getTranslation(language)('nextDayShort')})` : formatTime(v);

/** Ce que porte un shift : les deux champs vont ensemble, ou aucun. */
export interface PauseValue { breakStart?: number; breakMinutes?: number }

/** Les champs de pause a ecrire : jamais `undefined` (Firestore le refuse). */
export const pauseFields = (p: PauseValue): PauseValue =>
  p.breakMinutes && p.breakMinutes > 0 && typeof p.breakStart === 'number'
    ? { breakStart: p.breakStart, breakMinutes: p.breakMinutes }
    : {};

/**
 * Pause d'un shift : une duree, et l'heure ou elle commence (au quart d'heure,
 * dans le shift). Choisir une duree la place au milieu du shift ; le manager la
 * deplace ici, ou en la faisant glisser sur le planning.
 */
const PauseField: React.FC<{
  start: number;
  end: number;
  value: PauseValue;
  onChange: (v: PauseValue) => void;
  language: Language;
  disabled?: boolean;
}> = ({ start, end, value, onChange, language, disabled = false }) => {
  const t = getTranslation(language);
  const minutes = value.breakMinutes || 0;
  const choices = BREAK_CHOICES.filter(m => m / 60 < end - start);
  const starts: number[] = [];
  if (minutes > 0) {
    for (let v = Math.ceil(start / BREAK_STEP) * BREAK_STEP; v + minutes / 60 <= end + 1e-9; v += BREAK_STEP) starts.push(v);
  }
  const cls = 'w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all';
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label htmlFor="shift-break-minutes" className="block text-sm font-bold text-slate-600 mb-2">{t('breakLabel')}</label>
        <select
          id="shift-break-minutes"
          value={minutes}
          disabled={disabled}
          onChange={(e) => {
            const m = parseInt(e.target.value, 10);
            onChange(m > 0 ? { breakMinutes: m, breakStart: defaultBreakStart(start, end, m) } : {});
          }}
          className={cls}
        >
          <option value={0}>{t('breakNone')}</option>
          {choices.map(m => <option key={m} value={m}>{m} min</option>)}
        </select>
      </div>
      {minutes > 0 && (
        <div>
          <label htmlFor="shift-break-start" className="block text-sm font-bold text-slate-600 mb-2">{t('breakAt')}</label>
          <select
            id="shift-break-start"
            value={value.breakStart}
            disabled={disabled}
            onChange={(e) => onChange({ breakMinutes: minutes, breakStart: parseFloat(e.target.value) })}
            className={cls}
          >
            {starts.map(v => <option key={v} value={v}>{formatTime(v)}</option>)}
          </select>
        </div>
      )}
    </div>
  );
};

export default PauseField;
