import React, { useState } from 'react';
import { LeaveRequest, RequestableLeaveKind, LeaveUnit, Language } from '../types';
import { getTranslation } from '../utils/translations';
import { addDaysIso, countLeaveDays, closedHolidayDates, formatShortDate } from '../utils/helpers';
import DateField from './DateField';

interface LeaveRequestPanelProps {
  /** Les demandes de la personne. */
  requests: LeaveRequest[];
  onSubmit: (kind: RequestableLeaveKind, start: string, end: string, half: 'am' | 'pm' | undefined, note: string) => void;
  onWithdraw: (request: LeaveRequest) => void;
  leaveUnit: LeaveUnit;
  closedHolidays: string[];
  /** Premier jour propose : le lundi de la semaine affichee. */
  defaultStart: string;
  language?: Language;
}

const STATUS_STYLE: Record<LeaveRequest['status'], string> = {
  pending: 'bg-amber-100 text-amber-800',
  accepted: 'bg-emerald-100 text-emerald-800',
  refused: 'bg-slate-200 text-slate-700',
};

/**
 * « Demander un conge », sous « ma semaine ». Le salarie propose, l'admin
 * tranche : la demande ne devient une absence qu'une fois acceptee, avec les
 * controles habituels (chevauchements, heures, solde). Un arret ne se demande
 * pas — il se declare au responsable, qui le saisit.
 */
const LeaveRequestPanel: React.FC<LeaveRequestPanelProps> = ({
  requests, onSubmit, onWithdraw, leaveUnit, closedHolidays, defaultStart, language = 'en',
}) => {
  const t = getTranslation(language as Language);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RequestableLeaveKind>('cp');
  const [start, setStart] = useState(defaultStart);
  const [returnOn, setReturnOn] = useState(addDaysIso(defaultStart, 1));
  const [half, setHalf] = useState<'' | 'am' | 'pm'>('');
  const [note, setNote] = useState('');

  const end = returnOn ? addDaysIso(returnOn, -1) : '';
  const valid = !!start && !!end && end >= start;
  const single = valid && start === end;
  const effectiveHalf = single && half ? half : undefined;
  const days = valid ? countLeaveDays(start, end, leaveUnit, closedHolidayDates(start, end, closedHolidays), effectiveHalf) : 0;

  const reset = () => {
    setOpen(false); setKind('cp'); setStart(defaultStart); setReturnOn(addDaysIso(defaultStart, 1)); setHalf(''); setNote('');
  };
  const submit = () => {
    if (!valid) return;
    onSubmit(kind, start, end, effectiveHalf, note);
    reset();
  };

  const fmt = (iso: string) => formatShortDate(iso, language as Language);
  const mine = [...requests].sort((a, b) => b.start.localeCompare(a.start)).slice(0, 10);
  const label = 'text-xs font-black uppercase tracking-widest text-slate-400';
  const field = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <section className="flex flex-col gap-3 bg-white border border-slate-200 rounded-2xl p-4" data-testid="leave-request-panel">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)}
          className="self-start px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">
          {t('reqOpen')}
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-black text-slate-900">{t('reqTitle')}</h3>
          <div className="flex gap-2" role="group" aria-label={t('whichReason')}>
            {(['cp', 'sans_solde'] as const).map(k => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                className={`flex-1 py-2 rounded-xl border text-sm font-bold ${kind === k ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                {t('leaveKind_' + k)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DateField label={t('absFirstDay')} value={start} language={language as Language}
              onChange={v => { setStart(v); if (v && (!returnOn || returnOn <= v)) setReturnOn(addDaysIso(v, 1)); }}
              labelClassName={`${label} block mb-1.5`} className={field} />
            <DateField label={t('absReturn')} value={returnOn} language={language as Language}
              onChange={setReturnOn} labelClassName={`${label} block mb-1.5`} className={field} />
          </div>
          {start && returnOn && !valid && <p className="text-xs font-semibold text-red-700">{t('absReturnBeforeStart')}</p>}
          {single && (
            <div className="flex gap-2" role="group" aria-label={t('absHalf')}>
              {([['', 'absFullDay'], ['am', 'absHalfAm'], ['pm', 'absHalfPm']] as const).map(([v, k]) => (
                <button key={v} type="button" aria-pressed={half === v} onClick={() => setHalf(v)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-bold ${half === v ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>
                  {t(k)}
                </button>
              ))}
            </div>
          )}
          {valid && (
            <p className="text-sm font-bold text-slate-700" data-testid="req-days">
              {t(leaveUnit === 'ouvres' ? 'absDaysOuvres' : 'absDays').replace('{n}', String(days).replace('.', ','))}
            </p>
          )}
          <div>
            <label className={`${label} block mb-1.5`} htmlFor="req-note">{t('reqNote')}</label>
            <input id="req-note" value={note} onChange={e => setNote(e.target.value)} maxLength={500} className={field} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={submit} disabled={!valid}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-40">
              {t('reqSend')}
            </button>
            <button type="button" onClick={reset} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500">{t('cancel')}</button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className={label}>{t('reqMine')}</span>
        {mine.length === 0 ? (
          <p className="text-xs text-slate-400 italic">{t('reqNone')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5" data-testid="req-list">
            {mine.map(r => (
              <li key={r.id} className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700">
                <span className="flex-1 min-w-0">
                  <b className="font-bold text-slate-900">{t('leaveKind_' + r.kind)}</b>
                  {' · '}{t('absRange').replace('{from}', fmt(r.start)).replace('{back}', fmt(addDaysIso(r.end, 1)))}
                  {r.reply && <span className="block text-slate-500 mt-0.5">« {r.reply} »</span>}
                </span>
                <span className={`flex-none px-1.5 py-0.5 rounded font-bold ${STATUS_STYLE[r.status]}`}>{t('reqStatus_' + r.status)}</span>
                {r.status === 'pending' && (
                  <button type="button" onClick={() => onWithdraw(r)} className="flex-none font-bold text-slate-500 hover:text-slate-800">
                    {t('reqWithdraw')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default LeaveRequestPanel;
