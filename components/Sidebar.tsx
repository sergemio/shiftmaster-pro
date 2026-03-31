
import React, { useState } from 'react';
import { Shift, Staff, Language } from '../types';
import { getTranslation } from '../utils/translations';
import { exportWeeksData, loadStaffFromFirebase } from '../services/firebaseService';

interface SidebarProps {
  shifts: Shift[];
  staff: Staff[];
  currentWeek: Date;
  onAddClick: () => void;
  onManageStaffClick: () => void;
  onCopyLastWeek: () => void;
  onDeleteWeek: () => void;
  onViewAiReport: () => void;
  onOpenHistory: () => void;
  onExportSnapshot: () => void;
  aiInsight: string;
  isReadOnly?: boolean;
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
  onManageStaffClick, 
  onCopyLastWeek,
  onDeleteWeek,
  onViewAiReport,
  onOpenHistory,
  onExportSnapshot,
  aiInsight,
  isReadOnly = false,
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

  const getDateForDay = (monday: Date, dayIndex: number) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + dayIndex);
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

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportMonth, setExportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [isExporting, setIsExporting] = useState(false);

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const [year, month] = exportMonth.split('-').map(Number);
      // Generate all Sundays that start a week overlapping with the selected month
      const weekIds: string[] = [];
      // Find the Sunday on or before the 1st of the month
      const firstDay = new Date(Date.UTC(year, month - 1, 1));
      const startSunday = new Date(firstDay);
      startSunday.setUTCDate(startSunday.getUTCDate() - startSunday.getUTCDay());
      // Iterate week by week until the Sunday is past the last day of the month
      const lastDay = new Date(Date.UTC(year, month, 0)); // last day of month
      const runner = new Date(startSunday);
      while (runner <= lastDay) {
        weekIds.push(runner.toISOString().split('T')[0]);
        runner.setUTCDate(runner.getUTCDate() + 7);
      }

      const [weeksData, staffData] = await Promise.all([
        exportWeeksData(weekIds),
        loadStaffFromFirebase()
      ]);

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        month: exportMonth,
        staff: staffData?.staff || [],
        guests: staffData?.guests || [],
        weeks: weeksData
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.download = `shiftmaster-${exportMonth}.json`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
      setShowExportModal(false);
    } catch (e) {
      console.error('Export failed:', e);
    } finally {
      setIsExporting(false);
    }
  };

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
            <h2 className="text-lg font-bold text-slate-800 whitespace-nowrap">{t('weeklyStats')}</h2>
            
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
                  title={t('undo')}
                  className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all active:scale-90"
                >
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
                <button 
                  onClick={onRedo}
                  disabled={!canRedo}
                  title={t('redo')}
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

      <div className="space-y-3 mb-6">
        {staff.map(person => {
          const workedHours = worked[person.id] || 0;
          const extraHours = extra[person.id] || 0;
          const totalWorked = workedHours + extraHours;
          
          return (
            <div key={person.id} className="space-y-1">
              <div className="flex justify-between text-xs font-medium">
                <span className="flex items-center gap-2 text-slate-700">
                  <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: person.color }} />
                  {person.name}
                </span>
                <span className="text-slate-400 font-bold">
                  {totalWorked.toFixed(1)} / {person.targetHours}h
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                <div 
                  className="h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (workedHours / person.targetHours) * 100)}%`, backgroundColor: person.color }}
                />
                <div 
                  className="h-full transition-all duration-500 bg-indigo-500"
                  style={{ width: `${Math.min(100, (extraHours / person.targetHours) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {!isReadOnly && (
        <div className="mb-6 flex gap-2">
          <button 
            type="button"
            onClick={onAddClick}
            className="flex-1 py-4 px-6 bg-[linear-gradient(135deg,#4f46e5,#7c3aed)] text-white rounded-2xl font-bold shadow-lg hover:-translate-y-0.5 transition-all duration-200 active:scale-95 flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-base flex items-center gap-2">{t('addShift')}</span>
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

      <div className="bg-slate-50 rounded-2xl p-4 mb-8 border border-slate-100 shadow-sm">
        <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2.5">{t('leaveCoverage')}</h3>
        <div className="space-y-2.5">
          {coverageEvents.length > 0 ? coverageEvents.map((ev, idx) => (
            <div key={idx} className="flex justify-between text-xs items-center bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm">
               <div className="flex flex-col">
                 <span className="text-slate-500 font-bold text-[10px] uppercase mb-0.5">{ev.dateInfo}</span>
                 <span className="text-slate-400 font-medium truncate max-w-[120px]">Leave: <b className="text-slate-700">{ev.from}</b></span>
                 <span className="text-indigo-600 font-bold text-[10px] truncate max-w-[120px]">Cover: {ev.to}</span>
               </div>
               <span className="font-black text-slate-800 bg-slate-100 px-2 py-1 rounded-lg flex-shrink-0">{ev.hours}h</span>
            </div>
          )) : (
            <p className="text-xs text-slate-400 italic text-center py-2">{t('noCoverage')}</p>
          )}
        </div>
      </div>

      {aiInsight && (
        <div 
          onClick={onViewAiReport}
          className="mb-8 p-5 bg-[linear-gradient(135deg,#ffffff,#f8faff)] border border-indigo-100 rounded-2xl shadow-md relative overflow-hidden group cursor-pointer hover:shadow-lg hover:border-indigo-200 transition-all active:scale-[0.98]"
        >
          <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600" />
          <div className="font-black text-[10px] text-indigo-600 uppercase tracking-[0.2em] mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              {language === 'fr' ? 'Synthèse IA' : 'AI Insights'}
            </div>
            <div className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[8px] group-hover:bg-indigo-600 group-hover:text-white transition-colors">VIEW</div>
          </div>
          <div className="text-[12px] text-slate-700 leading-relaxed line-clamp-3 font-medium italic">
            {aiInsight}
          </div>
        </div>
      )}

      <div className="mt-auto pt-6 border-t border-slate-100 space-y-4">
        {!isReadOnly && (
          <>
            {isEmpty && (
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

        <button
          type="button"
          onClick={() => setShowExportModal(true)}
          className="w-full py-3 px-6 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-2xl font-semibold hover:bg-indigo-100 transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {language === 'fr' ? 'Exporter les données' : 'Export Data'}
        </button>

        {showExportModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center" onClick={() => setShowExportModal(false)}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-[300px] space-y-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-800">{language === 'fr' ? 'Exporter les données' : 'Export Data'}</h3>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">{language === 'fr' ? 'Mois' : 'Month'}</label>
                <input
                  type="month"
                  value={exportMonth}
                  onChange={e => setExportMonth(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowExportModal(false)}
                  className="flex-1 py-2.5 px-4 border border-slate-200 text-slate-600 rounded-xl font-medium hover:bg-slate-50 transition-all text-sm"
                >
                  {language === 'fr' ? 'Annuler' : 'Cancel'}
                </button>
                <button
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="flex-1 py-2.5 px-4 bg-[linear-gradient(135deg,#4f46e5,#7c3aed)] text-white rounded-xl font-bold hover:-translate-y-0.5 transition-all disabled:opacity-50 text-sm"
                >
                  {isExporting ? '...' : (language === 'fr' ? 'Exporter' : 'Export')}
                </button>
              </div>
            </div>
          </div>
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
