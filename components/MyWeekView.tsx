import React, { useMemo } from 'react';
import { Shift, Staff, Absence, Language, WeekHoliday } from '../types';
import { getTranslation } from '../utils/translations';
import {
  formatTime, getShiftIsoDate, formatShortDate, contractHoursOn, monthlyContractHours,
  AbsenceDeduction, expectedNote,
} from '../utils/helpers';

interface MyWeekViewProps {
  shifts: Shift[];
  absences: Absence[];
  holidays: WeekHoliday[];
  me: Staff;
  allStaff: Staff[];
  currentWeek: Date;
  days: string[];
  /** Heures deja faites ce mois-ci, ou null si la donnee n'a pas ete demandee. */
  monthHours?: number | null;
  /** Attendu perdu pour absence : semaine affichee, mois charge. */
  weekAbsence?: AbsenceDeduction;
  monthAbsence?: AbsenceDeduction;
  /** ISO du jour, injecte pour rester testable et coherent avec le fuseau de l'app. */
  todayIsoDate: string;
  nowHour: number;
  language?: Language;
}

const KIND_STYLES: Record<string, { cls: string; label: string }> = {
  conge:   { cls: 'bg-sky-50 border-sky-200 text-sky-800',       label: 'absenceConge' },
  maladie: { cls: 'bg-amber-50 border-amber-200 text-amber-800', label: 'absenceMaladie' },
  absent:  { cls: 'bg-slate-100 border-slate-300 text-slate-700', label: 'absenceAbsent' },
};

/**
 * « Ma semaine » — ce que l'employe vient chercher.
 *
 * L'equipe recevait la grille complete en lecture seule : sept colonnes, tout le
 * monde, a lire sur un telephone pour y trouver ses deux shifts. Cet ecran ne
 * montre que les siens, en liste, du lundi au dimanche, avec le prochain mis en
 * avant. Les jours sans rien restent VISIBLES : « je ne travaille pas jeudi » est
 * une information, pas un vide a masquer.
 */
const MyWeekView: React.FC<MyWeekViewProps> = ({
  shifts, absences, holidays, me, allStaff, currentWeek, days,
  monthHours = null, weekAbsence, monthAbsence, todayIsoDate, nowHour, language = 'en',
}) => {
  const t = getTranslation(language as Language);

  const byDay = useMemo(() => {
    return Array.from({ length: 7 }, (_, dayIndex) => {
      const iso = getShiftIsoDate(currentWeek, dayIndex);
      // Un shift que quelqu'un d'autre couvre ne m'appartient plus ; un shift que
      // je couvre pour un autre est bien le mien.
      const mine = shifts.filter(s =>
        (s.staffId === me.id && !s.coverageBy) || s.coverageBy === me.id);
      return {
        dayIndex,
        iso,
        isToday: iso === todayIsoDate,
        isPast: iso < todayIsoDate,
        holiday: holidays.find(h => h.dayIndex === dayIndex),
        shifts: mine.filter(s => s.dayIndex === dayIndex).sort((a, b) => a.startTime - b.startTime),
        absences: absences.filter(a => a.staffId === me.id && a.dayIndex === dayIndex),
      };
    });
  }, [shifts, absences, holidays, me.id, currentWeek, todayIsoDate]);

  // Le prochain shift : aujourd'hui s'il n'a pas encore fini, sinon le premier
  // des jours suivants. C'est l'information qu'on ouvre l'application pour lire.
  const nextShift = useMemo(() => {
    for (const day of byDay) {
      if (day.isPast) continue;
      for (const s of day.shifts) {
        if (!day.isToday || s.endTime > nowHour) return { day, shift: s };
      }
    }
    return null;
  }, [byDay, nowHour]);

  const weekHours = byDay.reduce(
    (sum, d) => sum + d.shifts.reduce((a, s) => a + (s.endTime - s.startTime), 0), 0);
  // Attendu = contrat moins les heures d'absence : en conge, on n'est pas en retard.
  const reduce = (contract: number, d?: AbsenceDeduction) =>
    d && d.hours > 0 ? Math.max(0, Math.round((contract - d.hours) * 10) / 10) : contract;
  const weekContract = reduce(contractHoursOn(me, getShiftIsoDate(currentWeek, 0)), weekAbsence);
  const monthContract = reduce(Math.round(monthlyContractHours(me, getShiftIsoDate(currentWeek, 3))), monthAbsence);
  const noteOf = (expected: number, d?: AbsenceDeduction) =>
    d && d.hours > 0 ? expectedNote(t, expected, d, language) : null;
  const weekNote = noteOf(weekContract, weekAbsence);
  const monthNote = monthHours === null ? null : noteOf(monthContract, monthAbsence);

  const nameOf = (id?: string) => allStaff.find(s => s.id === id)?.name || '?';

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 flex flex-col gap-5">

      {/* ---- le prochain shift, en tete ---- */}
      {nextShift ? (
        <div className="rounded-2xl p-5 text-white shadow-lg" style={{ backgroundColor: me.color }}>
          <div className="text-xs font-bold uppercase tracking-widest opacity-80">
            {nextShift.day.isToday ? t('today') : t('nextShift')}
          </div>
          <div className="mt-1 text-2xl font-black leading-tight">
            {formatTime(nextShift.shift.startTime)} – {formatTime(nextShift.shift.endTime)}
          </div>
          <div className="mt-0.5 text-sm font-semibold opacity-90">
            {days[nextShift.day.dayIndex]} {formatShortDate(nextShift.day.iso, language)}
            {nextShift.shift.coverageBy === me.id && ` · ${t('coveringFor')} ${nameOf(nextShift.shift.staffId)}`}
          </div>
          {nextShift.shift.notes && (
            <p className="mt-2 text-sm italic opacity-90">{nextShift.shift.notes}</p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl p-5 bg-slate-100 text-slate-500">
          <div className="text-xs font-bold uppercase tracking-widest">{t('nextShift')}</div>
          <div className="mt-1 text-lg font-bold">{t('nothingLeftThisWeek')}</div>
        </div>
      )}

      {/* ---- mes compteurs ---- */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{t('periodWeek')}</div>
          <div className="mt-1 text-xl font-black text-slate-900 tabular-nums">
            {weekHours.toFixed(1)}<span className="text-sm font-bold text-slate-400"> / {weekContract}h</span>
          </div>
          {weekNote && <div data-testid="expected-note" className="mt-0.5 text-xs text-slate-400">{weekNote}</div>}
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{t('periodMonth')}</div>
          <div className="mt-1 text-xl font-black text-slate-900 tabular-nums">
            {monthHours === null
              ? <span className="text-sm font-bold text-slate-300">—</span>
              : <>{monthHours.toFixed(1)}<span className="text-sm font-bold text-slate-400"> / {monthContract}h</span></>}
          </div>
          {monthNote && <div data-testid="expected-note" className="mt-0.5 text-xs text-slate-400">{monthNote}</div>}
        </div>
      </div>

      {/* ---- la semaine, jour par jour ---- */}
      <div className="flex flex-col gap-2">
        {byDay.map(day => (
          <div
            key={day.dayIndex}
            className={`rounded-xl border p-3 flex gap-3 ${
              day.isToday ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200 bg-white'
            } ${day.isPast ? 'opacity-55' : ''}`}
          >
            <div className="w-14 flex-none">
              <div className={`text-xs font-bold uppercase tracking-wider ${day.isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                {days[day.dayIndex].slice(0, 3)}
              </div>
              <div className="text-lg font-black text-slate-800 tabular-nums leading-tight">
                {Number(day.iso.slice(8, 10))}
              </div>
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-1.5 justify-center">
              {day.holiday && (
                <span className="self-start text-xs font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                  {day.holiday.closed ? `${t('holidayClosed')} · ` : ''}{t('holiday_' + day.holiday.key)}
                </span>
              )}
              {day.absences.map(a => {
                const st = KIND_STYLES[a.kind] ?? KIND_STYLES.absent;
                return (
                  <span key={a.id} className={`self-start text-xs font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>
                    {t(st.label)}
                  </span>
                );
              })}
              {day.shifts.map(s => (
                <div key={s.id} className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-base font-bold text-slate-900 tabular-nums">
                    {formatTime(s.startTime)} – {formatTime(s.endTime)}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    {(s.endTime - s.startTime).toFixed(1)}h
                  </span>
                  {s.coverageBy === me.id && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                      {t('coveringFor')} {nameOf(s.staffId)}
                    </span>
                  )}
                  {s.notes && <span className="w-full text-xs text-slate-500 italic">{s.notes}</span>}
                </div>
              ))}
              {day.shifts.length === 0 && day.absences.length === 0 && !day.holiday && (
                /* Un jour vide reste affiche : « je ne travaille pas jeudi » est
                   une information, pas un blanc a supprimer. */
                <span className="text-sm text-slate-400 italic">{t('notWorking')}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MyWeekView;
