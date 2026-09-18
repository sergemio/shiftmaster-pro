
import React, { useState, useMemo } from 'react';
import { Staff, Language, Extra } from '../types';
import { formatTime, halfHourSteps, DEFAULT_OPERATING_HOURS, OperatingHours } from '../utils/helpers';
import { getTranslation } from '../utils/translations';
import DayPicker from './DayPicker';

interface ShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  staff: Staff[];
  onAdd: (staffId: string, dayIndexes: number[], startTime: number, endTime: number) => void;
  /**
   * Meme geste, mais pour un extra : une personne qui vient a la mission, sans
   * contrat. `extraId` renseigne = quelqu'un du vivier ; sinon c'est une
   * nouvelle personne, dont on ne connait peut-etre que le prenom (ou rien, et
   * le shift s'appellera « Extra 1 »).
   */
  onAddExtra?: (
    who: { extraId?: string; firstName: string; retained: boolean },
    dayIndexes: number[], startTime: number, endTime: number,
  ) => void;
  /** Le vivier, pour reprendre quelqu'un sans retaper son nom. Admins seulement. */
  extras?: Extra[];
  language?: Language;
  /** Ce que ce shift enfreindrait, calcule a chaque changement. */
  onCheck?: (staffId: string, dayIndexes: number[], start: number, end: number) => string[];
  /** Periode d'emploi : `errors` interdit le shift, `notes` le marque hors contrat. */
  onEmployment?: (staffId: string, dayIndexes: number[]) => { errors: string[]; notes: string[] };
  /** Heures d'ouverture reglees : les menus d'heures n'offrent que cette plage. */
  hours?: OperatingHours;
}

const ShiftModal: React.FC<ShiftModalProps> = ({ isOpen, onClose, staff, onAdd, onAddExtra, extras = [], language = 'en', onCheck, onEmployment, hours = DEFAULT_OPERATING_HOURS }) => {
  if (!isOpen) return null;
  // Fix: cast language to Language to avoid string assignability error during translation retrieval
  const t = getTranslation(language as Language);

  const [selectedStaff, setSelectedStaff] = useState(staff[0]?.id || '');
  /** Pour qui : quelqu'un de l'equipe, ou un extra. */
  const [mode, setMode] = useState<'staff' | 'extra'>('staff');
  const [extraName, setExtraName] = useState('');
  const [extraId, setExtraId] = useState<string | undefined>(undefined);
  const [retained, setRetained] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const isExtra = mode === 'extra' && !!onAddExtra;
  // Les extras deja connus, le plus recemment venu en tete.
  const vivier = useMemo(
    () => extras.filter(e => e.retained).sort((a, b) => (b.lastMission || '').localeCompare(a.lastMission || '')),
    [extras],
  );
  // Plusieurs jours d'un coup : le meme service du lundi au vendredi se posait
  // en cinq ouvertures de cette fenetre.
  const [selectedDays, setSelectedDays] = useState<number[]>([0]);
  // 11 h 30 - 17 h 30 par defaut, ramene dans les heures d'ouverture si elles
  // ne le contiennent pas : un menu ne peut pas afficher une valeur absente.
  const defaultStart = Math.min(Math.max(11.5, hours.start), hours.end - 1);
  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(Math.min(Math.max(17.5, defaultStart + 0.5), hours.end));

  const timeOptions = useMemo(
    () => halfHourSteps(hours.start, hours.end).map(v => ({ value: v, label: formatTime(v) })),
    [hours.start, hours.end],
  );

  // Recalcule a chaque frappe : c'est ce qui fait disparaitre l'avertissement
  // quand on recule l'heure, et c'est la que la regle s'apprend.
  // Un extra pas encore identifie n'a ni contrat ni historique : les regles de
  // duree du travail et la periode d'emploi ne veulent rien dire pour lui.
  const warnings = useMemo(
    () => (isExtra ? [] : onCheck?.(selectedStaff, selectedDays, startTime, endTime) || []),
    [isExtra, onCheck, selectedStaff, selectedDays, startTime, endTime],
  );

  // Rouge et bloquant, contrairement aux regles de duree du travail (ambre,
  // informatives) : avant la date d'entree il n'y a pas de contrat, donc pas
  // de shift. La decision est prise ici et non laissee a l'utilisateur.
  const employment = useMemo(
    () => (isExtra ? { errors: [], notes: [] } : onEmployment?.(selectedStaff, selectedDays) || { errors: [], notes: [] }),
    [isExtra, onEmployment, selectedStaff, selectedDays],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (endTime <= startTime) {
      alert("End time must be after start time");
      return;
    }
    if (selectedDays.length === 0) {
      alert(t('pickAtLeastOneDay'));
      return;
    }
    if (employment.errors.length > 0) return;
    if (isExtra) {
      onAddExtra!({ extraId, firstName: extraName.trim(), retained }, selectedDays, startTime, endTime);
    } else {
      onAdd(selectedStaff, selectedDays, startTime, endTime);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl w-full max-w-md max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="flex-none p-6 md:p-8 pb-4 flex justify-between items-start">
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">{t('createShift')}</h2>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors p-1">
            <svg className="w-6 h-6 md:w-7 md:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8 pt-4 space-y-4 md:space-y-6">
          {/* Equipe ou extra. Le reste de la fenetre est identique : un extra a
              un horaire et des jours comme tout le monde. */}
          {onAddExtra && (
            <div className="relative grid grid-cols-2 p-1 bg-slate-100 rounded-xl">
              {/* La pastille blanche GLISSE d'un onglet a l'autre : c'est elle
                  qui porte le fond, pas les boutons. Un fond pose sur le bouton
                  actif apparaitrait d'un coup a l'autre bout, et le changement
                  d'etat ne se lirait pas comme un deplacement.
                  `motion-reduce` : personne n'impose une animation a qui a
                  demande a son systeme de les limiter. */}
              <span
                aria-hidden="true"
                className={`absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none ${mode === 'extra' ? 'translate-x-full' : 'translate-x-0'}`}
              />
              {(['staff', 'extra'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`relative z-10 py-2.5 rounded-lg text-sm font-bold transition-colors duration-200 ${mode === m ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {t(m === 'staff' ? 'modeStaff' : 'modeExtra')}
                </button>
              ))}
            </div>
          )}

          {!isExtra ? (
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">{t('selectStaff')}</label>
              <div className="relative">
                <select 
                  value={selectedStaff}
                  onChange={(e) => setSelectedStaff(e.target.value)}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all"
                >
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2" htmlFor="extra-name">{t('extraWho')}</label>
              <div className="relative flex gap-2">
                <input
                  id="extra-name"
                  type="text"
                  value={extraName}
                  onChange={(e) => { setExtraName(e.target.value); setExtraId(undefined); }}
                  placeholder={t('extraNamePlaceholder')}
                  className="flex-1 bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
                {/* Reprendre quelqu'un du vivier, sans rien retaper. */}
                {vivier.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(o => !o)}
                    title={t('extraPickKnown')}
                    aria-label={t('extraPickKnown')}
                    className={`px-3 rounded-xl border transition-all ${pickerOpen ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-slate-200 bg-slate-50/50 text-slate-400 hover:text-slate-600'}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </button>
                )}
                {pickerOpen && (
                  <div className="absolute top-full right-0 mt-1 z-10 w-56 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1">
                    {vivier.map(e => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => { setExtraId(e.id); setExtraName(e.firstName); setPickerOpen(false); }}
                        className="w-full text-left px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {e.firstName}{e.lastName ? ' ' + e.lastName : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-400 font-medium">{t('extraNameHint')}</p>
              {!extraId && (
                <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-600">
                  <input type="checkbox" checked={retained} onChange={(e) => setRetained(e.target.checked)} className="w-4 h-4 rounded" />
                  {t('extraRetain')}
                </label>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-slate-600 mb-2">{t('daysOfWeek')}</label>
            <DayPicker value={selectedDays} onChange={setSelectedDays} language={language} />
            {/* Le nombre annonce est celui des shifts crees, pas des « copies
                supplementaires » : quatre jours coches -> quatre shifts. C'est ce
                que la personne vient de designer a l'ecran. */}
            {selectedDays.length > 1 && (
              <p className="mt-2 text-xs font-semibold text-indigo-600">
                {t('shiftsWillBeCreated').replace('{n}', String(selectedDays.length))}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">{t('startTime')}</label>
              <div className="relative">
                <select 
                  value={startTime}
                  onChange={(e) => setStartTime(parseFloat(e.target.value))}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all"
                >
                  {timeOptions.filter(o => o.value < hours.end).map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">{t('endTime')}</label>
              <div className="relative">
                <select 
                  value={endTime}
                  onChange={(e) => setEndTime(parseFloat(e.target.value))}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all"
                >
                  {timeOptions.filter(o => o.value > startTime).map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {employment.errors.length > 0 && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 space-y-1">
              {employment.errors.map((w, i) => (
                <p key={i} className="text-xs font-semibold text-red-800 leading-snug">⛔ {w}</p>
              ))}
            </div>
          )}

          {(warnings.length > 0 || employment.notes.length > 0) && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 space-y-1">
              {[...employment.notes, ...warnings].map((w, i) => (
                <p key={i} className="text-xs font-semibold text-amber-800 leading-snug">⚠ {w}</p>
              ))}
            </div>
          )}

          <div className="pt-4 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-4 border border-slate-200 text-slate-500 font-bold rounded-xl hover:bg-slate-50 transition-all text-base shadow-sm active:scale-95"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={employment.errors.length > 0}
              className="flex-1 px-6 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-base active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
            >
              {t('addShift')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ShiftModal;
