
import React, { useState } from 'react';
import { Shift, Staff, Language, Absence } from '../types';

// Meme vocabulaire que la bande du calendrier : un motif porte le meme nom
// partout, sinon on croit lire deux choses differentes.
const ABSENCE_LABELS: Record<string, string> = {
  conge: 'absenceConge',
  maladie: 'absenceMaladie',
  repos: 'absenceRepos',
};
import { getTranslation } from '../utils/translations';
import { isStaffActiveInWeek, contractHoursOn, monthlyContractHours, getShiftIsoDate } from '../utils/helpers';

interface SidebarProps {
  shifts: Shift[];
  staff: Staff[];
  currentWeek: Date;
  onAddClick: () => void;
  onAbsenceClick: () => void;
  absences?: Absence[];
  /** Heures du mois par employe, chargees a la demande. null = pas encore demande. */
  monthHours?: Record<string, number> | null;
  monthLoading?: boolean;
  onPeriodChange?: (period: 'week' | 'month') => void;
  period?: 'week' | 'month';
  monthLabel?: string;
  onManageStaffClick: () => void;
  onCopyLastWeek: () => void;
  /** Depassements de duree du travail sur la semaine affichee. */
  compliance?: { who: string; text: string }[];
  /** Nom de la convention appliquee. L'utilisateur doit toujours savoir de
   *  quelle loi on lui parle : sans ca, un seuil affiche n'est pas verifiable. */
  conventionLabel?: string;
  onDeleteWeek: () => void;
  onOpenHistory: () => void;
  onExportSnapshot: () => void;
  isReadOnly?: boolean;
  isLoading?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  language?: Language;
  isOpen?: boolean;
  onClose?: boolean | (() => void);
}

const Sidebar: React.FC<SidebarProps> = ({ 
  shifts, 
  staff, 
  currentWeek, 
  onAddClick,
  onAbsenceClick,
  absences = [],
  monthHours = null,
  monthLoading = false,
  onPeriodChange,
  period = 'week',
  monthLabel = '',
  onManageStaffClick, 
  onCopyLastWeek,
  compliance = [],
  conventionLabel = '',
  onDeleteWeek,
  onOpenHistory,
  onExportSnapshot,
  isReadOnly = false,
  isLoading = false,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  language = 'en',
  isOpen = false,
  onClose
}) => {
  // Fix: cast language to Language to avoid string assignability error during translation retrieval
  const t = getTranslation(language as Language);

  const getStats = () => {
    const worked: Record<string, number> = {};
    const extra: Record<string, number> = {};
    const leave: Record<string, number> = {};
    
    shifts.forEach(s => {
      const duration = s.endTime - s.startTime;
      if (s.coverageBy) {
        leave[s.staffId] = (leave[s.staffId] || 0) + duration;
        extra[s.coverageBy] = (extra[s.coverageBy] || 0) + duration;
      } else {
        worked[s.staffId] = (worked[s.staffId] || 0) + duration;
      }
    });
    return { worked, extra, leave };
  };

  const { worked, extra } = getStats();

  const getDateForDay = (weekStart: Date, dayIndex: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dayIndex + 1); // +1: weekStart is Sunday, dayIndex 0 = Monday
    const locale = language === 'fr' ? 'fr-FR' : 'en-US';
    return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });
  };

  const coverageEvents = shifts.filter(s => s.coverageBy).map(s => ({
    from: staff.find(st => st.id === s.staffId)?.name || 'Unknown',
    to: staff.find(st => st.id === s.coverageBy)?.name || 'Unknown',
    hours: s.endTime - s.startTime,
    dateInfo: getDateForDay(currentWeek, s.dayIndex)
  }));

  const isEmpty = shifts.length === 0;
  const [complianceOpen, setComplianceOpen] = useState(false);



  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] md:hidden transition-opacity duration-300"
          onClick={() => typeof onClose === 'function' && onClose()}
        />
      )}
      
      <aside className={`
        fixed md:relative top-0 right-0 h-full bg-white z-[110] md:z-auto
        w-[280px] sm:w-[320px] md:w-[320px] lg:w-[340px] border-l flex flex-col p-5 overflow-y-auto hide-scrollbar
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
      `}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <button onClick={onOpenHistory} title={t('systemLogs')} className="active:scale-95 transition-transform cursor-pointer p-1.5 hover:bg-slate-50 rounded-lg">
              <svg className="w-5 h-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </button>
            <h2 className="text-lg font-bold text-slate-800 whitespace-nowrap">
              {period === 'month' ? t('monthlyStats') : t('weeklyStats')}
            </h2>
            
            <button onClick={onExportSnapshot} title={t('exportSnapshot')} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all active:scale-90 ml-1">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
               </svg>
            </button>
          </div>
          
          <div className="flex items-center gap-1.5">
            {!isReadOnly && (
              <div className="flex gap-1.5">
                <button 
                  onClick={onUndo}
                  disabled={!canUndo}
                  title={`${t('undo')} (Ctrl+Z)`}
                  className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all active:scale-90"
                >
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
                <button 
                  onClick={onRedo}
                  disabled={!canRedo}
                  title={`${t('redo')} (Ctrl+Shift+Z)`}
                  className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all active:scale-90"
                >
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
                  </svg>
                </button>
              </div>
            )}
            
            <button 
              onClick={() => typeof onClose === 'function' && onClose()}
              className="md:hidden p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

      {/* ------------------------------------------------------------------
          Semaine / Mois. Le contrat, les heures supplementaires et la paie se
          raisonnent au mois ; l'app ne savait compter qu'a la semaine.
          Le mois n'est charge QU'AU CLIC : 5 ou 6 documents de plus, a la
          demande et non a chaque ouverture de l'application.
          ------------------------------------------------------------------ */}
      {onPeriodChange && (
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-4">
          {(['week', 'month'] as const).map(pKey => (
            <button
              key={pKey}
              type="button"
              onClick={() => onPeriodChange(pKey)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                period === pKey
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {pKey === 'week' ? t('periodWeek') : t('periodMonth')}
            </button>
          ))}
        </div>
      )}

      {period === 'month' && monthLabel && (
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">{monthLabel}</p>
      )}

      <div className="space-y-3 mb-6">
        {period === 'month' && monthLoading && (
          <p className="text-sm text-slate-400 italic">{t('loadingMonth')}</p>
        )}
        {[...staff].filter(p => {
          // Option A: active during the week OR has any shift this week (orphan still pulls them in)
          const hasHours = period === 'month'
            ? (monthHours?.[p.id] ?? 0) > 0
            : (worked[p.id] || 0) + (extra[p.id] || 0) > 0;
          return hasHours || isStaffActiveInWeek(p, currentWeek);
        }).sort((a, b) => {
          const tot = (x: Staff) => period === 'month'
            ? (monthHours?.[x.id] ?? 0)
            : (worked[x.id] || 0) + (extra[x.id] || 0);
          const aTotal = tot(a);
          const bTotal = tot(b);
          return bTotal - aTotal; // desc
        }).map(person => {
          const isMonth = period === 'month';
          // Heures du contrat A LA PERIODE AFFICHEE, jamais celles d'aujourd'hui :
          // un avenant signe en octobre ne doit pas reecrire le mois de septembre.
          const contractHours = isMonth
            ? Math.round(monthlyContractHours(person, getShiftIsoDate(currentWeek, 3)))
            : contractHoursOn(person, getShiftIsoDate(currentWeek, 0));
          // En mois, les heures viennent des semaines chargees a la demande, et
          // la reference est le contrat mensuel (52/12), pas l'hebdomadaire.
          const workedHours = isMonth ? (monthHours?.[person.id] ?? 0) : (worked[person.id] || 0);
          const extraHours = isMonth ? 0 : (extra[person.id] || 0);
          const totalWorked = workedHours + extraHours;

          // Un 0.0 ressemble a un oubli de planification. Quand la personne est
          // notee absente, on affiche le motif A LA PLACE de la barre vide : la
          // barre ne dirait rien, alors que le motif repond a la question.
          const myAbsences = absences.filter(a => a.staffId === person.id);
          const absenceLabel = (() => {
            if (isMonth || totalWorked > 0 || myAbsences.length === 0) return null;
            const kinds = [...new Set(myAbsences.map(a => a.kind))];
            const kindLabel = kinds.length === 1
              ? t(ABSENCE_LABELS[kinds[0]] ?? 'absenceRepos')
              : t('absences');
            return myAbsences.length >= 5
              ? `${kindLabel} · ${t('allWeek')}`
              : `${kindLabel} · ${myAbsences.length}${t('daysShort')}`;
          })();

          return (
            <div key={person.id} className="space-y-1">
              <div className="flex justify-between text-xs font-medium">
                <span className="flex items-center gap-2 text-slate-700">
                  <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: person.color }} />
                  {person.name}
                </span>
                <span className="text-slate-400 font-bold tabular-nums">
                  {totalWorked.toFixed(1)} / {contractHours}h
                  {isMonth && contractHours > 0 && (
                    <span className={`ml-1.5 ${totalWorked >= contractHours ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {totalWorked >= contractHours ? '+' : '−'}
                      {Math.abs(totalWorked - contractHours).toFixed(1)}
                    </span>
                  )}
                </span>
              </div>
              {absenceLabel ? (
                <span
                  className="inline-block text-xs font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(-45deg, rgba(255,255,255,.55) 0 5px, transparent 5px 10px)',
                  }}
                >
                  {absenceLabel}
                </span>
              ) : (
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                {totalWorked > contractHours ? (
                  // Over target: target portion in person color + overtime in darker shade
                  <>
                    <div
                      className="h-full transition-all duration-500"
                      style={{ width: `${(contractHours / totalWorked) * 100}%`, backgroundColor: person.color }}
                    />
                    <div
                      className="h-full transition-all duration-500"
                      style={{ width: `${((totalWorked - contractHours) / totalWorked) * 100}%`, backgroundColor: person.color, filter: 'brightness(0.55)' }}
                    />
                  </>
                ) : totalWorked === contractHours && contractHours > 0 ? (
                  // Exact: full green bar
                  <div
                    className="h-full transition-all duration-500"
                    style={{ width: '100%', backgroundColor: '#22c55e' }}
                  />
                ) : (
                  // Under target: existing behavior (worked + indigo extra)
                  <>
                    <div
                      className="h-full transition-all duration-500"
                      style={{ width: `${(workedHours / contractHours) * 100}%`, backgroundColor: person.color }}
                    />
                    <div
                      className="h-full transition-all duration-500 bg-indigo-500"
                      style={{ width: `${(extraHours / contractHours) * 100}%` }}
                    />
                  </>
                )}
              </div>
              )}
            </div>
          );
        })}
      </div>

      {!isReadOnly && (
        <div className="mb-6 flex gap-2">
          {/* Le « + » disait deja tout ce que « Add Shift » repetait a cote.
              Le mot parti, le bouton prend la meme hauteur que ses voisins et la
              rangee s'aligne enfin ; il garde la largeur et le degrade, qui
              disent sa place dans la hierarchie. */}
          <button 
            type="button"
            onClick={onAddClick}
            title={t('addShift')}
            aria-label={t('addShift')}
            className="flex-1 h-14 bg-[linear-gradient(135deg,#4f46e5,#7c3aed)] text-white rounded-2xl shadow-lg hover:-translate-y-0.5 transition-all duration-200 active:scale-95 flex items-center justify-center"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onAbsenceClick}
            title={t('absences')}
            className="w-14 h-14 flex items-center justify-center bg-sky-50 text-sky-600 border border-sky-100 rounded-2xl hover:bg-sky-100 transition-all active:scale-90 shadow-sm"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <button 
            type="button"
            onClick={() => {
              if (window.confirm(t('confirmDeleteWeek'))) {
                onDeleteWeek();
              }
            }}
            title={t('confirmDeleteWeek')}
            className="w-14 h-14 flex items-center justify-center bg-red-50 text-red-500 border border-red-100 rounded-2xl hover:bg-red-100 transition-all active:scale-90 shadow-sm"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}

      {/* Duree du travail. Le bloc n'apparait que s'il a quelque chose a dire :
          un encart « rien a signaler » permanent prend de la place et finit
          ignore, ce qui est exactement ce qu'on veut eviter pour un avertissement.
          Ambre et non rouge : ce sont des decisions possibles, pas des erreurs. */}
      {compliance.length > 0 && (
        <div className="bg-amber-50 rounded-2xl mb-8 border border-amber-200 shadow-sm overflow-hidden">
          {/* Replie par defaut : cinq points deplies poussaient les boutons du
              planning hors de l'ecran, alors que le nombre suffit a savoir s'il
              y a quelque chose a regarder. On ouvre quand on veut le detail. */}
          <button
            type="button"
            onClick={() => setComplianceOpen(v => !v)}
            aria-expanded={complianceOpen}
            className="w-full min-h-14 px-4 py-3 flex items-center gap-3 text-left hover:bg-amber-100/60 transition-colors active:scale-[0.99]"
          >
            <div className="flex-1 min-w-0">
              <span className="block text-xs font-black text-amber-700 uppercase tracking-widest">
                {t(compliance.length > 1 ? 'compliancePointsPlural' : 'compliancePoints').replace('{n}', String(compliance.length))}
              </span>
              {conventionLabel && (
                <span className="block text-xs text-amber-600/80 font-medium truncate">{conventionLabel}</span>
              )}
            </div>
            <svg
              className={`w-4 h-4 flex-shrink-0 text-amber-600 transition-transform duration-200 ${complianceOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {complianceOpen && (
            <div className="px-4 pb-4 space-y-2">
              {compliance.map((c, idx) => (
                <div key={idx} className="text-xs bg-white p-2.5 rounded-xl border border-amber-100">
                  <span className="font-bold text-slate-700 block">{c.who}</span>
                  <span className="text-slate-500 font-medium leading-snug">{c.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-slate-50 rounded-2xl p-4 mb-8 border border-slate-100 shadow-sm">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2.5">{t('leaveCoverage')}</h3>
        <div className="space-y-2.5">
          {coverageEvents.length > 0 ? coverageEvents.map((ev, idx) => (
            <div key={idx} className="flex justify-between text-xs items-center bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm">
               <div className="flex flex-col">
                 <span className="text-slate-500 font-bold text-xs uppercase mb-0.5">{ev.dateInfo}</span>
                 <span className="text-slate-400 font-medium truncate max-w-[120px]">Leave: <b className="text-slate-700">{ev.from}</b></span>
                 <span className="text-indigo-600 font-bold text-xs truncate max-w-[120px]">Cover: {ev.to}</span>
               </div>
               <span className="font-black text-slate-800 bg-slate-100 px-2 py-1 rounded-lg flex-shrink-0">{ev.hours}h</span>
            </div>
          )) : (
            <p className="text-xs text-slate-400 italic text-center py-2">{t('noCoverage')}</p>
          )}
        </div>
      </div>

      <div className="mt-auto pt-6 border-t border-slate-100 space-y-4">
        {!isReadOnly && (
          <>
            {/* Seulement sur une semaine vide. `shifts` vaut aussi [] pendant le
                chargement, d'ou le `!isLoading` : sans lui le bouton clignoterait
                sur une semaine qui, elle, a des shifts. */}
            {isEmpty && !isLoading && (
              <button
                type="button"
                onClick={onCopyLastWeek}
                className="w-full py-3 border-2 border-dashed border-slate-200 text-slate-500 rounded-2xl font-semibold hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all flex flex-col items-center justify-center group active:scale-[0.98]"
              >
                <span className="text-sm">{t('copyLastWeek')}</span>
              </button>
            )}
            
            <div className="space-y-3">
              <button 
                type="button"
                onClick={onManageStaffClick}
                className="w-full py-3.5 px-6 bg-slate-900 text-slate-100 rounded-2xl font-bold border border-slate-800 hover:bg-slate-800 transition-all duration-200 active:scale-95 flex items-center justify-center gap-3 shadow-sm"
              >
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span className="text-sm">{t('manageStaff')}</span>
              </button>
            </div>
          </>
        )}



        {isReadOnly && (
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-center">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Status</p>
            <p className="text-sm font-bold text-slate-600 flex items-center justify-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              {t('readOnlyStatus')}
            </p>
          </div>
        )}
      </div>
    </aside>
  </>
);
};

export default Sidebar;
