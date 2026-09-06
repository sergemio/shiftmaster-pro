import React, { useState, useEffect } from 'react';
import { Staff, Absence, AbsenceKind, Language } from '../types';
import { getTranslation } from '../utils/translations';

interface AbsenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  staff: Staff[];
  absences: Absence[];
  holidays: number[];
  days: string[];
  shortDays: string[];
  onAdd: (staffId: string, dayIndexes: number[], kind: AbsenceKind) => void;
  onRemove: (id: string) => void;
  onToggleHoliday: (dayIndex: number) => void;
  language?: Language;
}

/**
 * Les trois motifs et leurs couleurs. Aucun rouge : une absence n'est pas un
 * incident. L'ambre est reserve a l'arret maladie, seul motif non prevu.
 * La table est dupliquee ici et dans Calendar parce que les deux ecrans en ont
 * besoin sous une forme differente (choix vs affichage) ; les couleurs, elles,
 * restent les memes.
 */
const KINDS: { kind: AbsenceKind; label: string; on: string; off: string }[] = [
  { kind: 'conge',   label: 'absenceConge',   on: 'bg-sky-500 text-white border-sky-500',       off: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100' },
  { kind: 'maladie', label: 'absenceMaladie', on: 'bg-amber-500 text-white border-amber-500',   off: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
  { kind: 'repos',   label: 'absenceRepos',   on: 'bg-slate-500 text-white border-slate-500',   off: 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100' },
];

const AbsenceModal: React.FC<AbsenceModalProps> = ({
  isOpen, onClose, staff, absences, holidays, days, shortDays,
  onAdd, onRemove, onToggleHoliday, language = 'en',
}) => {
  const t = getTranslation(language as Language);
  const [staffId, setStaffId] = useState('');
  const [kind, setKind] = useState<AbsenceKind>('conge');
  const [picked, setPicked] = useState<number[]>([]);

  // Repartir d'un formulaire vierge a chaque ouverture : garder la selection
  // precedente fait saisir l'absence de quelqu'un d'autre sans s'en rendre compte.
  useEffect(() => {
    if (isOpen) {
      setStaffId(staff[0]?.id || '');
      setKind('conge');
      setPicked([]);
    }
  }, [isOpen, staff]);

  if (!isOpen) return null;

  const toggleDay = (i: number) =>
    setPicked(prev => (prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]));

  const canSave = !!staffId && picked.length > 0;

  const submit = () => {
    if (!canSave) return;
    onAdd(staffId, picked, kind);
    setPicked([]);
  };

  const nameOf = (id: string) => staff.find(s => s.id === id)?.name || '?';
  const labelOf = (k: AbsenceKind) => t(KINDS.find(x => x.kind === k)?.label || 'absenceRepos');

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 md:p-6" onClick={onClose}>
      <div
        className="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-lg font-black text-slate-900">{t('absences')}</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-700 rounded-lg" title={t('close')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-6">

          {/* ---------------- saisie ---------------- */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">{t('whoIsOff')}</label>
              <select
                value={staffId}
                onChange={e => setStaffId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-base font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">{t('whichReason')}</label>
              <div className="flex gap-2 flex-wrap">
                {KINDS.map(k => (
                  <button
                    key={k.kind}
                    type="button"
                    onClick={() => setKind(k.kind)}
                    className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all ${kind === k.kind ? k.on : k.off}`}
                  >
                    {t(k.label)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {/* Plusieurs jours d'un coup : des conges ne durent pas un jour. */}
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">{t('whichDays')}</label>
              <div className="grid grid-cols-7 gap-1">
                {shortDays.map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`py-3 rounded-lg border text-xs font-black uppercase transition-all ${
                      picked.includes(i)
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={!canSave}
              className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.99]"
            >
              {t('addAbsence')}
            </button>
          </div>

          {/* ---------------- ce qui est deja saisi ---------------- */}
          <div className="flex flex-col gap-2 border-t pt-5">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">{t('thisWeekAbsences')}</span>
            {absences.length === 0 ? (
              <p className="text-sm text-slate-400 italic">{t('noAbsences')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {absences
                  .slice()
                  .sort((a, b) => a.dayIndex - b.dayIndex || nameOf(a.staffId).localeCompare(nameOf(b.staffId)))
                  .map(a => (
                    <li key={a.id} className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      <span className="text-sm text-slate-700 min-w-0 truncate">
                        <b className="font-bold text-slate-900">{nameOf(a.staffId)}</b>
                        {' · '}{labelOf(a.kind)}{' · '}{days[a.dayIndex]}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemove(a.id)}
                        className="text-red-500 hover:text-red-700 p-1 flex-none"
                        title={t('tapToRemove')}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {/* ---------------- jours feries ----------------
              Separes des absences : un ferie est un etat du jour, pas de
              quelqu'un. Il ne concerne personne en particulier. */}
          <div className="flex flex-col gap-2 border-t pt-5">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">{t('markHolidays')}</span>
            <div className="grid grid-cols-7 gap-1">
              {shortDays.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onToggleHoliday(i)}
                  className={`py-3 rounded-lg border text-xs font-black uppercase transition-all ${
                    holidays.includes(i)
                      ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default AbsenceModal;
