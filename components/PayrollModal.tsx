import React, { useEffect, useMemo, useState } from 'react';
import { Staff, AbsencePeriod, LeaveUnit, Language, WeekData, Extra } from '../types';
import { getTranslation } from '../utils/translations';
import { weekIdsForMonth, countLeaveDays, closedHolidayDates, formatShortDate, todayIso } from '../utils/helpers';
import { payrollVariables, payrollText, payrollCsv, PayrollLabels } from '../utils/payroll';

interface PayrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  staff: Staff[];
  periods: AbsencePeriod[];
  extras: Record<string, Extra>;
  leaveUnit: LeaveUnit;
  closedHolidays: string[];
  /** Semaines OFFICIELLES (jamais les brouillons) : la paie suit ce qui est publie. */
  loadWeeks: (weekIds: string[]) => Promise<Record<string, WeekData>>;
  language?: Language;
}

/**
 * Mois propose a l'ouverture : le mois en cours a partir du 20 (on prepare la
 * paie de fin de mois), le mois precedent avant (on envoie celle du mois ecoule).
 */
const defaultMonth = (today: string): string => {
  if (Number(today.slice(8, 10)) >= 20) return today.slice(0, 7);
  const [y, m] = today.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

/**
 * Elements variables de paie du mois : ce que le comptable recoit, en texte a
 * coller dans un mail ou en tableur. Reserve aux admins : le motif d'un arret
 * est une donnee de sante.
 */
const PayrollModal: React.FC<PayrollModalProps> = ({
  isOpen, onClose, staff, periods, extras, leaveUnit, closedHolidays, loadWeeks, language = 'en',
}) => {
  const t = getTranslation(language as Language);
  const [month, setMonth] = useState(() => defaultMonth(todayIso()));
  const [weeks, setWeeks] = useState<Record<string, WeekData> | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || !/^\d{4}-\d{2}$/.test(month)) return;
    let live = true;
    setWeeks(null);
    loadWeeks(weekIdsForMonth(`${month}-01`)).then(w => { if (live) setWeeks(w); }).catch(() => { if (live) setWeeks({}); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, month]);

  const monthName = useMemo(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return month;
    return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${month}-15T12:00:00Z`));
  }, [month, language]);

  const labels: PayrollLabels = useMemo(() => ({
    title: t('payrollTitle').replace('{month}', monthName),
    contract: t('payContract'), noContract: t('payNoContract'),
    entry: t('payEntry'), exit: t('payExit'), change: t('payChange'),
    worked: t('payWorked'), noAbsence: t('payNoAbsence'), absences: t('payAbsences'),
    absenceLine: t('payAbsenceLine'), halfDay: t('payHalf'), continues: t('payContinues'),
    justifReceived: t('payJustifYes'), justifMissing: t('payJustifNo'),
    weekLine: t('payWeekLine'), beyondTenth: t('payBeyondTenth'), reachesLegal: t('payReachesLegal'),
    complementaires: t('payComp'), supplementaires: t('paySup'),
    extrasTitle: t('payExtrasTitle'), extraLine: t('payExtraLine'),
    daysUnit: t('daysUnit'), footer: t('payFooter'),
    kindLabel: k => t('leaveKind_' + k),
    date: iso => formatShortDate(iso, language as Language),
    num: n => {
      const s = String(Math.round(n * 100) / 100);
      return language === 'fr' ? s.replace('.', ',') : s;
    },
    csvHeader: t('payCsvHeader').split(';'),
    csvWorked: t('payCsvWorked'), csvEntry: t('payCsvEntry'), csvExit: t('payCsvExit'),
    csvChange: t('payCsvChange'), csvExtra: t('payCsvExtra'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [language, monthName]);

  const result = useMemo(() => {
    if (!weeks) return null;
    const shiftsByWeek = Object.fromEntries(Object.entries(weeks).map(([id, w]) => [id, w.shifts || []]));
    const countDays = (a: string, b: string) => countLeaveDays(a, b, leaveUnit, closedHolidayDates(a, b, closedHolidays));
    const extraNames = Object.fromEntries(Object.values(extras).map(e => [e.id, [e.firstName, e.lastName].filter(Boolean).join(' ')]));
    return payrollVariables(month, staff, shiftsByWeek, periods, countDays, extraNames);
  }, [weeks, month, staff, periods, extras, leaveUnit, closedHolidays]);

  const text = result ? payrollText(result, labels) : '';
  const empty = !!result && result.lines.length === 0 && result.extras.length === 0;

  if (!isOpen) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* presse-papiers refuse : le texte reste selectionnable a l'ecran */ }
  };

  const download = () => {
    if (!result) return;
    // BOM : sans lui, Excel lit l'UTF-8 comme du Windows-1252 (« SalariÃ© »).
    const blob = new Blob(['﻿' + payrollCsv(result, labels)], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.download = `elements-variables-paie-${month}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="fixed inset-0 z-[170] flex items-end md:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 md:p-6" onClick={onClose}>
      <div className="bg-white w-full md:max-w-2xl rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()} role="dialog" aria-labelledby="payroll-title">
        <div className="flex-none border-b px-5 py-4 flex items-center justify-between gap-3">
          <h2 id="payroll-title" className="text-lg font-black text-slate-900">{t('payrollOpen')}</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-700 rounded-lg" title={t('close')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <p className="text-sm text-slate-600">{t('payrollIntro')}</p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="payroll-month" className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">{t('payrollMonth')}</label>
              <input id="payroll-month" type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={copy} disabled={!result || empty}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-40">
                {copied ? t('payrollCopied') : t('payrollCopy')}
              </button>
              <button type="button" onClick={download} disabled={!result || empty}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50 disabled:opacity-40">
                {t('payrollCsv')}
              </button>
            </div>
          </div>
          <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{t('payrollPrivate')}</p>
          {!result ? (
            <p className="text-sm text-slate-400">{t('loading')}</p>
          ) : empty ? (
            <p className="text-sm text-slate-400 italic">{t('payrollEmpty')}</p>
          ) : (
            <pre data-testid="payroll-text"
              className="text-xs leading-relaxed text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-4 whitespace-pre-wrap break-words font-mono">
              {text}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};

export default PayrollModal;
