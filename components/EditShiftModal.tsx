import React, { useState, useEffect, useMemo } from 'react';
import { Staff, Shift, Language } from '../types';
import { formatTime, DEFAULT_OPERATING_HOURS, OperatingHours } from '../utils/helpers';
import PauseField, { PauseValue, pauseFields, shiftStartOptions, shiftEndOptions, endLabel } from './PauseField';
import { clampBreak, withAutoBreak } from '../utils/worktime';
import { getTranslation } from '../utils/translations';
import DayPicker from './DayPicker';
import { useDismiss } from './useDismiss';
import { toast } from './Toast';

interface EditShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  shift: Shift | null;
  staffList: Staff[];
  /** People still employed on the week being viewed. Defaults to everyone. */
  assignableStaff?: Staff[];
  onUpdate: (updatedShift: Shift) => void;
  /** Copie le shift (tel qu'edite) sur d'autres jours de la meme semaine. */
  onRepeat: (shift: Shift, dayIndexes: number[]) => void;
  /** Shifts de la semaine affichee : les jours ou la personne travaille deja. */
  weekShifts?: Shift[];
  onDelete: (id: string) => void;
  /** Ce que ce shift enfreindrait une fois modifie. `excludeShiftId` retire la
   *  version actuelle du calcul, sinon elle se comparerait a elle-meme. */
  onCheck?: (staffId: string, dayIndexes: number[], start: number, end: number, excludeShiftId?: string, pause?: PauseValue) => string[];
  /** Periode d'emploi : `errors` interdit le shift, `notes` le marque hors contrat. */
  onEmployment?: (staffId: string, dayIndexes: number[]) => { errors: string[]; notes: string[] };
  isReadOnly?: boolean;
  language: string;
  /** Heures d'ouverture reglees. Les menus d'heures offrent toute la journee
   *  (decision du 22/09/2026) : ce reglage ne sert plus qu'a la grille. */
  hours?: OperatingHours;
}

const EditShiftModalBody: React.FC<EditShiftModalProps & { shift: NonNullable<EditShiftModalProps['shift']> }> = ({ isOpen, onClose, shift, staffList, assignableStaff, onUpdate, onRepeat, weekShifts = [], onDelete, onCheck, onEmployment, isReadOnly = false, language, hours = DEFAULT_OPERATING_HOURS }) => {

  const [staffId, setStaffId] = useState(shift.staffId);
  const [startTime, setStartTime] = useState(shift.startTime);
  const [endTime, setEndTime] = useState(shift.endTime);
  // null = pause pas touchee : celle du shift, ou 20 min d'office si l'horaire
  // franchit les 6 h (voir withAutoBreak).
  const [pauseChosen, setPause] = useState<PauseValue | null>(null);
  const [coverageBy, setCoverageBy] = useState(shift.coverageBy || '');
  const [notes, setNotes] = useState(shift.notes || '');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  // Jours sur lesquels recopier ce shift, en plus du sien.
  const [repeatOn, setRepeatOn] = useState<number[]>([]);
  const t = getTranslation((language || 'en') as Language);
  // Clic sur le fond ou Echap : comme « Annuler » (29/09/2026).
  const backdrop = useDismiss(onClose);

  useEffect(() => {
    if (shift) {
      setStaffId(shift.staffId);
      setStartTime(shift.startTime);
      setEndTime(shift.endTime);
      setPause(null);
      setCoverageBy(shift.coverageBy || '');
      setNotes(shift.notes || '');
      setIsConfirmingDelete(false);
      setRepeatOn([]);
    }
  }, [shift]);

  // Jours ou la personne choisie a deja un shift (hors celui-ci) : affiches
  // appuyes et non cliquables, sinon on recopie par-dessus et on cree un doublon.
  const takenDays = useMemo(
    () => [...new Set(weekShifts.filter(s => s.staffId === staffId && s.id !== shift.id && s.dayIndex !== shift.dayIndex).map(s => s.dayIndex))],
    [weekShifts, staffId, shift.id, shift.dayIndex],
  );
  // Changer de personne peut rendre un jour coche deja tenu : on le retire.
  useEffect(() => {
    setRepeatOn(prev => prev.some(d => takenDays.includes(d)) ? prev.filter(d => !takenDays.includes(d)) : prev);
  }, [takenDays]);

  const pauseRaw = pauseChosen ?? pauseFields(withAutoBreak(shift, { staffId: '', dayIndex: 0, startTime, endTime, ...pauseFields(shift) }));
  // La pause toujours ramenee dans le shift, meme si l'horaire vient de changer.
  const pause = pauseFields(clampBreak({ staffId: '', dayIndex: 0, startTime, endTime, ...pauseRaw }));

  // Les jours verifies : celui du shift, plus ceux ou on s'appreste a le
  // recopier — une repetition sur cinq jours peut creer cinq problemes.
  const warnings = useMemo(
    () => onCheck?.(staffId, [shift.dayIndex, ...repeatOn], startTime, endTime, shift.id, pause) || [],
    [onCheck, staffId, shift.dayIndex, shift.id, repeatOn, startTime, endTime, pause.breakStart, pause.breakMinutes],
  );

  // Periode d'emploi, verifiee sur les jours de COPIE, et sur le jour du shift
  // seulement si on change de personne. Retoucher l'horaire d'un vieux shift
  // deja hors periode reste possible : ce sont des donnees passees.
  const employment = useMemo(() => {
    const days = staffId !== shift.staffId ? [shift.dayIndex, ...repeatOn] : repeatOn;
    return days.length > 0 && onEmployment ? onEmployment(staffId, days) : { errors: [], notes: [] };
  }, [onEmployment, staffId, shift.staffId, shift.dayIndex, repeatOn]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (endTime <= startTime) {
      toast(t('endBeforeStart'), { kind: 'error' });
      return;
    }
    if (employment.errors.length > 0) return;

    // Un shift inchange n'est pas reecrit : App (updateShift) le detecte.
    const sanitizedCoverage = coverageBy.trim() || null as any;
    const sanitizedNotes = notes.trim() || null as any;

    // La pause remplace l'ancienne, ou disparait : jamais de champ `undefined`.
    const { breakStart: _b, breakMinutes: _m, ...base } = shift;
    const edited: Shift = {
      ...base,
      ...pause,
      staffId,
      startTime,
      endTime,
      coverageBy: sanitizedCoverage,
      notes: sanitizedNotes,
    };

    // `onRepeat` porte aussi la mise a jour de l'original, pour n'avoir qu'un
    // seul commit : une ecriture, une etape d'annulation.
    if (repeatOn.length > 0) onRepeat(edited, repeatOn);
    // Meme sans changement : App ne reecrit rien, mais affiche « Shift enregistre »
    // (06/10/2026) — un clic sur Enregistrer sans retour laissait dans le doute.
    else onUpdate(edited);

    onClose();
  };

  const handleDelete = () => {
    if (isReadOnly) return;
    onDelete(shift.id);
    onClose();
  };

  const assignedStaff = staffList.find(s => s.id === staffId);

  // Only currently-employed people can be picked — but whoever is already on
  // this shift stays in the list even if they have left, otherwise an old shift
  // could not be opened and edited at all.
  const pickable = useMemo(() => {
    const base = assignableStaff ?? staffList;
    const current = staffList.find(s => s.id === shift.staffId);
    return current && !base.some(s => s.id === current.id) ? [current, ...base] : base;
  }, [assignableStaff, staffList, shift.staffId]);

  return (
    <div {...backdrop} className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl w-full max-w-md max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        {/* Espacements resserres le 29/09/2026 (grille de 4 px) : marges 24 px,
            16 px entre les champs, notes sur 2 lignes, boutons de 48 px. La
            fenetre depassait l'ecran d'un telephone et se mettait a defiler
            pour une poignee de champs. Le sous-titre « Detailed configuration »
            n'apportait rien : retire. */}
        <div className="flex-none px-6 pt-6 pb-2 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">{t(isReadOnly ? 'viewShift' : 'editShift')}</h2>
          <button type="button" onClick={onClose} aria-label={t('close')} className="text-slate-300 hover:text-slate-500 transition-colors p-2 -mr-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-6 pt-2 pb-6 space-y-4">
          {!isConfirmingDelete ? (
            <>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-2">{t('assignedTo')}</label>
                <div className="relative">
                  <select 
                    disabled={isReadOnly}
                    value={staffId}
                    onChange={(e) => setStaffId(e.target.value)}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all disabled:opacity-80"
                  >
                    {pickable.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {!isReadOnly && (
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-2">{t('startTime')}</label>
                  <div className="relative">
                    <select 
                      disabled={isReadOnly}
                      value={startTime}
                      onChange={(e) => setStartTime(parseFloat(e.target.value))}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all disabled:opacity-80"
                    >
                      {shiftStartOptions().map(v => (
                        <option key={v} value={v}>{formatTime(v)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-2">{t('endTime')}</label>
                  <div className="relative">
                    <select 
                      disabled={isReadOnly}
                      value={endTime}
                      onChange={(e) => setEndTime(parseFloat(e.target.value))}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all disabled:opacity-80"
                    >
                      {shiftEndOptions(startTime).map(v => (
                        <option key={v} value={v}>{endLabel(v, (language || 'en') as Language)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <PauseField start={startTime} end={endTime} value={pause} onChange={setPause} language={(language || 'en') as Language} disabled={isReadOnly} />

              <div>
                <label className="block text-sm font-bold text-slate-600 mb-2">{t('coverageHoursSup')}</label>
                <div className="relative">
                   <select 
                    disabled={isReadOnly}
                    value={coverageBy}
                    onChange={(e) => setCoverageBy(e.target.value)}
                    className={`w-full bg-slate-50/50 border rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all disabled:opacity-80 ${coverageBy ? 'border-indigo-300 bg-indigo-50/30 text-indigo-900' : 'border-slate-200'}`}
                  >
                    <option value="">{t('noCoverageOption')}</option>
                    {pickable.filter(s => s.id !== staffId).map(s => (
                      <option key={s.id} value={s.id}>{t('coveredBy')} {s.name}</option>
                    ))}
                  </select>
                </div>
                {coverageBy && (
                  <p className="mt-3 text-xs text-indigo-600 font-semibold leading-relaxed">
                    ℹ️ {t('coverNote').replace('{name}', assignedStaff?.name || '')}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-600 mb-2">{t('notes')}</label>
                <textarea 
                  readOnly={isReadOnly}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder={t(isReadOnly ? 'noNotes' : 'notesPlaceholder')}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all placeholder:text-slate-300"
                />
              </div>

              {!isReadOnly && (
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-2">{t('repeatAlsoOn')}</label>
                  <DayPicker
                    value={repeatOn}
                    onChange={setRepeatOn}
                    lockedDay={shift.dayIndex}
                    takenDays={takenDays}
                    takenTitle={t('dayAlreadyWorked')}
                    language={(language || 'en') as Language}
                  />
                  {repeatOn.length > 0 && (
                    <p className="mt-2 text-xs font-semibold text-indigo-600">
                      {t(repeatOn.length > 1 ? 'repeatHintPlural' : 'repeatHint').replace('{n}', String(repeatOn.length))}
                    </p>
                  )}
                </div>
              )}

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
                  {warnings.length > 0 && <p className="text-xs text-amber-700/80 leading-snug pt-0.5">{t('ruleInformative')}</p>}
                </div>
              )}

              <div className="pt-2 space-y-2">
                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={onClose}
                    className="flex-1 h-12 px-6 border border-slate-200 text-slate-500 font-bold rounded-2xl hover:bg-slate-50 transition-all text-base shadow-sm active:scale-95"
                  >
                    {isReadOnly ? t('close') : t('cancel')}
                  </button>
                  {!isReadOnly && (
                    <button 
                      type="submit"
                      disabled={employment.errors.length > 0}
                      className="flex-1 h-12 px-6 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-base active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
                    >
                      {t('saveChanges')}
                    </button>
                  )}
                </div>
                {!isReadOnly && (
                  <div className="flex justify-center">
                    <button 
                      type="button"
                      onClick={() => setIsConfirmingDelete(true)}
                      className="text-red-500 hover:text-red-600 font-black text-xs uppercase tracking-widest transition-colors h-11 px-3 flex items-center gap-2 group"
                    >
                      <svg className="w-4 h-4 transition-transform group-hover:rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      {t('deleteShift')}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-6 space-y-8 animate-in zoom-in-95 duration-200">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-800">{t('areYouSure')}</h3>
                <p className="text-slate-500 leading-relaxed">
                  {t('deleteShiftFor')} <span className="font-bold text-slate-800">{assignedStaff?.name}</span>. {t('cannotBeUndone')}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  type="button"
                  onClick={handleDelete}
                  className="w-full py-4 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 transition-all shadow-lg shadow-red-100 text-base active:scale-95"
                >
                  {t('yesDelete')}
                </button>
                <button 
                  type="button"
                  onClick={() => setIsConfirmingDelete(false)}
                  className="w-full py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all text-base active:scale-95"
                >
                  {t('noKeep')}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

// Meme correction que ShiftModal (QA du 02/10/2026) : sortir avant les hooks
// faisait varier leur nombre d'un rendu a l'autre.
const EditShiftModal: React.FC<EditShiftModalProps> = (props) =>
  (props.isOpen && props.shift ? <EditShiftModalBody {...props} shift={props.shift} /> : null);

export default EditShiftModal;