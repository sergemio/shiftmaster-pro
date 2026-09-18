import React, { useState } from 'react';
import { Staff, AbsencePeriod, LeaveBalance, LeaveUnit, Language } from '../types';
import { getTranslation } from '../utils/translations';
import {
  leaveBalanceSummary, countLeaveDays, closedHolidayDates, formatShortDate, addDaysIso, todayIso,
} from '../utils/helpers';
import DateField from './DateField';

interface LeaveCardProps {
  person: Staff;
  /** Toutes les absences connues (on garde celles de la personne). */
  periods: AbsencePeriod[];
  balance?: LeaveBalance;
  /** Absent = lecture seule. */
  onSave?: (staffId: string, anchorDate: string, anchorBalance: number) => void;
  leaveUnit: LeaveUnit;
  closedHolidays: string[];
  language: Language;
}

/**
 * Conges payes et historique des absences, dans la fiche du salarie.
 *
 * Le compteur part du solde LU SUR UN BULLETIN (l'app ne fait pas la paie), puis
 * ajoute l'acquis et retire le pris depuis. Il est affiche comme provisoire : si
 * les deux divergent, c'est le bulletin qui a raison, et on repart de lui.
 */
const LeaveCard: React.FC<LeaveCardProps> = ({
  person, periods, balance, onSave, leaveUnit, closedHolidays, language,
}) => {
  const t = getTranslation(language);
  // null = pas encore choisi : formulaire tant qu'aucun solde n'existe. Le
  // solde peut arriver de la base apres l'ouverture de la fiche.
  const [editingChoice, setEditing] = useState<boolean | null>(null);
  const editing = editingChoice ?? !balance;
  const [date, setDate] = useState(balance?.anchorDate || '');
  const [amount, setAmount] = useState(balance ? String(balance.anchorBalance).replace('.', ',') : '');

  const mine = periods.filter(p => p.staffId === person.id);
  const num = (n: number) => {
    const s = Number.isInteger(n) ? String(n) : n.toFixed(1);
    return language === 'fr' ? s.replace('.', ',') : s;
  };
  const countDays = (a: string, b: string) => countLeaveDays(a, b, leaveUnit, closedHolidayDates(a, b, closedHolidays));
  const summary = balance
    ? leaveBalanceSummary({ date: balance.anchorDate, balance: balance.anchorBalance }, mine, person, todayIso(), leaveUnit, countDays)
    : null;

  const amountNum = parseFloat(amount.replace(',', '.'));
  const canSave = !!onSave && !!date && Number.isFinite(amountNum) && date <= todayIso();
  const save = () => {
    if (!canSave) return;
    onSave!(person.id, date, Math.round(amountNum * 100) / 100);
    setEditing(false);
  };

  const history = [...mine].sort((a, b) => b.start.localeCompare(a.start));
  const line = 'flex justify-between gap-3 text-xs text-slate-600 tabular-nums';
  const input = 'w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="pt-3 border-t border-indigo-100 flex flex-col gap-2" onClick={e => e.stopPropagation()} data-testid="leave-card">
      <span className="block text-xs font-bold text-indigo-700 uppercase">{t('leaveCardTitle')}</span>

      {summary && !editing && (
        <div className="bg-white border border-indigo-100 rounded-lg p-2.5 flex flex-col gap-1">
          <div className={line}>
            <span>{t('leavePayslip').replace('{date}', formatShortDate(balance!.anchorDate, language))}</span>
            <span>{num(balance!.anchorBalance)} {t('daysUnit')}</span>
          </div>
          <div className={line}><span>{t('leaveAcquired')}</span><span>+ {num(summary.acquired)} {t('daysUnit')}</span></div>
          <div className={line}><span>{t('leaveTaken')}</span><span>− {num(summary.taken)} {t('daysUnit')}</span></div>
          <div className="flex justify-between gap-3 text-sm font-bold text-slate-900 tabular-nums border-t border-slate-100 pt-1" data-testid="leave-balance">
            <span>{t('leaveBalanceToday')}</span><span>{num(summary.balance)} {t('daysUnit')}</span>
          </div>
          {summary.upcoming > 0 && (
            <div className={line} data-testid="leave-upcoming">
              <span>{t('leaveUpcoming').replace('{n}', num(summary.upcoming))}</span>
              <span>{t('leaveAfter').replace('{n}', num(summary.afterUpcoming))}</span>
            </div>
          )}
          <p className="text-xs text-slate-400">{t('leaveProvisional')}</p>
          {onSave && (
            <button type="button" onClick={() => {
              setDate(balance!.anchorDate); setAmount(String(balance!.anchorBalance).replace('.', ',')); setEditing(true);
            }}
              className="self-start text-xs font-bold text-indigo-600 hover:text-indigo-800">{t('leaveUpdateFromPayslip')}</button>
          )}
        </div>
      )}

      {editing && onSave && (
        <div className="bg-white border border-indigo-100 rounded-lg p-2.5 flex flex-col gap-2">
          <p className="text-xs text-slate-500">{t('leaveAnchorHint')}</p>
          <div className="grid grid-cols-2 gap-2">
            <DateField label={t('leavePayslipDate')} labelClassName="block text-xs text-slate-500 mb-0.5"
              value={date} onChange={setDate} language={language} className={input} />
            <div>
              <label className="block text-xs text-slate-500 mb-0.5" htmlFor={`leave-amount-${person.id}`}>{t('leavePayslipBalance')}</label>
              <input id={`leave-amount-${person.id}`} inputMode="decimal" value={amount}
                onChange={e => setAmount(e.target.value)} className={input} />
            </div>
          </div>
          {date && date > todayIso() && <p className="text-xs font-semibold text-red-700">{t('leaveDateFuture')}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={!canSave}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-bold disabled:opacity-40 hover:bg-indigo-700">
              {t('leaveSaveBalance')}
            </button>
            {balance && (
              <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs font-bold text-slate-500">{t('cancel')}</button>
            )}
          </div>
        </div>
      )}
      {!summary && !onSave && <p className="text-xs text-slate-400">{t('leaveNoBalance')}</p>}

      <span className="block text-xs font-bold text-indigo-700 uppercase mt-1">{t('leaveHistory')}</span>
      {history.length === 0 ? (
        <p className="text-xs text-slate-400 italic">{t('leaveHistoryNone')}</p>
      ) : (
        <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto" data-testid="leave-history">
          {history.map(p => (
            <li key={p.id} className="bg-white border border-indigo-100 rounded px-2 py-1 text-xs text-slate-700">
              <b className="font-bold">{t('leaveKind_' + p.kind)}</b>
              {' · '}{t('absRange')
                .replace('{from}', formatShortDate(p.start, language))
                .replace('{back}', formatShortDate(addDaysIso(p.end, 1), language))}
              {' · '}{num(p.daysCounted)}{t(p.daysCounted <= 1 ? 'daysShortOne' : 'daysShort')}
              {' · '}{num(p.hoursLost)} h
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LeaveCard;
