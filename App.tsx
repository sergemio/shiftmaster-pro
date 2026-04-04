
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Staff, Shift, LogEntry, Language } from './types';
import { getMonday, getWeekRangeString, getShiftDate, formatTime } from './utils/helpers';
import { INITIAL_STAFF, DAYS_EN, DAYS_FR } from './constants';
import Calendar from './components/Calendar';
import Sidebar from './components/Sidebar';
import ShiftModal from './components/ShiftModal';
import StaffModal from './components/StaffModal';
import EditShiftModal from './components/EditShiftModal';
import AiReportModal from './components/AiReportModal';
import AskAiModal from './components/AskAiModal';
import MonthYearPicker from './components/MonthYearPicker';
import LogHistoryModal from './components/LogHistoryModal';
import AutoScheduleModal from './components/AutoScheduleModal';
import SettingsModal from './components/SettingsModal';
import { getTranslation } from './utils/translations';
import { getScheduleInsights, interrogateData, generateAutoSchedule } from './services/geminiService';
import { 
  saveShiftsToFirebase, 
  saveStaffToFirebase,
  saveLogToFirebase,
  loginWithGoogle,
  logout,
  subscribeToAuth,
  subscribeToShifts,
  subscribeToStaff,
  subscribeToLogs,
  AuthResult,
  loadShiftsFromFirebase
} from './services/firebaseService';

const FloatingBackground: React.FC = () => {
  const items = useMemo(() => {
    return Array.from({ length: 14 }).map((_, i) => ({
      id: i,
      left: `${(i * 12) % 100}%`,
      delay: `${Math.random() * -60}s`, 
      duration: `${35 + Math.random() * 25}s`,
      width: `${160 + Math.random() * 100}px`,
      height: `${70 + Math.random() * 60}px`,
      color: [
        { bg: 'bg-indigo-500/30', border: 'border-indigo-400', bar: 'bg-indigo-300/40' },
        { bg: 'bg-lime-500/30', border: 'border-lime-400', bar: 'bg-lime-300/40' },
        { bg: 'bg-emerald-500/30', border: 'border-emerald-400', bar: 'bg-emerald-300/40' },
        { bg: 'bg-violet-500/30', border: 'border-violet-400', bar: 'bg-violet-300/40' },
        { bg: 'bg-cyan-500/30', border: 'border-cyan-400', bar: 'bg-cyan-300/40' }
      ][i % 5],
      direction: i % 2 === 0 ? 'animate-float-up' : 'animate-float-down',
      rotation: `${Math.random() * 20 - 10}deg`
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 bg-emerald-950">
      <style>{`
        @keyframes floatUp {
          from { transform: translateY(115vh) rotate(var(--rotation)); }
          to { transform: translateY(-25vh) rotate(var(--rotation)); }
        }
        @keyframes floatDown {
          from { transform: translateY(-25vh) rotate(var(--rotation)); }
          to { transform: translateY(115vh) rotate(var(--rotation)); }
        }
        .animate-float-up {
          animation: floatUp linear infinite;
        }
        .animate-float-down {
          animation: floatDown linear infinite;
        }
      `}</style>
      
      <div className="absolute top-[-5%] left-[-5%] w-[50%] h-[50%] bg-lime-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-5%] right-[-5%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px]" />

      {items.map((item) => (
        <div
          key={item.id}
          className={`absolute rounded-xl border-l-4 blur-[3px] shadow-2xl ${item.color.bg} ${item.color.border} ${item.direction} p-4 flex flex-col gap-2`}
          style={{
            left: item.left,
            width: item.width,
            height: item.height,
            animationDuration: item.duration,
            animationDelay: item.delay,
            '--rotation': item.rotation,
            opacity: 0.35
          } as React.CSSProperties}
        >
          <div className={`h-3 w-3/4 rounded-full ${item.color.bar}`} />
          <div className={`h-2 w-1/2 rounded-full opacity-50 ${item.color.bar}`} />
        </div>
      ))}
    </div>
  );
};

const App: React.FC = () => {
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('shiftmaster_lang') as Language) || 'en';
  });
  const [viewType, setViewType] = useState<'day' | 'employee'>(() => {
    return (localStorage.getItem('shiftmaster_view') as 'day' | 'employee') || 'day';
  });
  const t = useMemo(() => getTranslation(language), [language]);

  const [currentWeek, setCurrentWeek] = useState<Date>(getMonday(new Date()));
  const [navDirection, setNavDirection] = useState<'forward' | 'backward' | 'none'>('none');
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [guestEmails, setGuestEmails] = useState<string[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const [past, setPast] = useState<Shift[][]>([]);
  const [future, setFuture] = useState<Shift[][]>([]);

  const [user, setUser] = useState<any>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [authError, setAuthError] = useState<AuthResult['error'] | null>(null);
  const [aiInsight, setAiInsight] = useState<string>("");
  const [reportLabel, setReportLabel] = useState<string>("");
  const [isMonthlyAiLoading, setIsMonthlyAiLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isAiReportModalOpen, setIsAiReportModalOpen] = useState(false);
  const [isAskAiModalOpen, setIsAskAiModalOpen] = useState(false);
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);
  const [isAutoScheduleModalOpen, setIsAutoScheduleModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);

  // AI Cancellation Support
  const aiRequestActive = useRef<boolean>(false);

  const monthPickerRef = useRef<HTMLDivElement>(null);
  const aiMenuRef = useRef<HTMLDivElement>(null);
  const weekId = currentWeek.toISOString().split('T')[0];

  useEffect(() => {
    localStorage.setItem('shiftmaster_lang', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('shiftmaster_view', viewType);
  }, [viewType]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (monthPickerRef.current && !monthPickerRef.current.contains(event.target as Node)) {
        setIsMonthPickerOpen(false);
      }
      if (aiMenuRef.current && !aiMenuRef.current.contains(event.target as Node)) {
        setIsAiMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isBootstrapMode = useMemo(() => {
    if (!staffList || staffList.length === 0) return true;
    return !staffList.some(s => s.role === 'admin' && s.email && s.email.trim() !== '');
  }, [staffList]);

  const isReadOnly = useMemo(() => {
    if (isGuest || isBootstrapMode) return false; 
    if (!user || !user.email) return true;
    const currentUserEmail = user.email.trim().toLowerCase();
    const staffMember = staffList.find(s => (s.email || '').trim().toLowerCase() === currentUserEmail);
    return !staffMember || staffMember.role !== 'admin';
  }, [user, staffList, isGuest, isBootstrapMode]);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) setIsGuest(false);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToLogs((updatedLogs) => {
      setLogs(updatedLogs);
    });
    return () => unsubscribe();
  }, [user, isGuest]);

  useEffect(() => {
    if (user && !isGuest) {
      const unsubscribe = subscribeToStaff((updatedStaff, updatedGuests) => {
        if (updatedStaff && updatedStaff.length > 0) setStaffList(updatedStaff);
        else if (staffList.length === 0) {
          setStaffList(INITIAL_STAFF);
          saveStaffToFirebase(INITIAL_STAFF);
        }
        if (updatedGuests) setGuestEmails(updatedGuests);
      });
      return () => unsubscribe();
    } else if (isGuest) {
      const cachedStaff = localStorage.getItem('sandbox_staff');
      if (cachedStaff) {
        setStaffList(JSON.parse(cachedStaff));
      } else {
        setStaffList(INITIAL_STAFF);
      }
    }
  }, [user, isGuest]);

  useEffect(() => {
    if (user && !isGuest) {
      setIsLoading(true);
      const unsubscribe = subscribeToShifts(weekId, (updatedShifts) => {
        setShifts(updatedShifts);
        setIsLoading(false);
      });
      return () => unsubscribe();
    } else if (isGuest) {
      setIsLoading(true);
      const timer = setTimeout(() => {
        const cachedShifts = localStorage.getItem(`sandbox_shifts_${weekId}`);
        if (cachedShifts) {
          setShifts(JSON.parse(cachedShifts));
        } else {
          setShifts([]);
        }
        setIsLoading(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [weekId, user, isGuest]);

  const triggerSyncFeedback = () => {
    setShowSyncSuccess(true);
    setTimeout(() => setShowSyncSuccess(false), 2000);
  };

  const createLog = (action: string, details: string) => {
    saveLogToFirebase({
      userId: user?.uid || 'guest',
      userName: user?.displayName || 'Sandbox Admin',
      action,
      details,
      timestamp: new Date().toISOString()
    });
  };

  const handleUpdateShifts = useCallback(async (newShifts: Shift[], isHistoryAction = false) => {
    if (isReadOnly) return;
    if (!isHistoryAction) {
      setPast(prev => [shifts, ...prev].slice(0, 10));
      setFuture([]);
    }
    setShifts(newShifts);
    
    if (user && !isGuest) {
      await saveShiftsToFirebase(weekId, newShifts);
      triggerSyncFeedback();
    } else if (isGuest) {
      localStorage.setItem(`sandbox_shifts_${weekId}`, JSON.stringify(newShifts));
      triggerSyncFeedback();
    }
  }, [weekId, user, isGuest, isReadOnly, shifts]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[0];
    const newPast = past.slice(1);
    setFuture(prev => [shifts, ...prev]);
    handleUpdateShifts(previous, true);
    setPast(newPast);
    createLog('UNDO', 'Performed an undo action on shifts');
  }, [past, shifts, handleUpdateShifts]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    setPast(prev => [shifts, ...prev]);
    handleUpdateShifts(next, true);
    setFuture(newFuture);
    createLog('REDO', 'Performed a redo action on shifts');
  }, [future, shifts, handleUpdateShifts]);

  const handleAddShift = useCallback((staffId: string, dayIndex: number, startTime: number, endTime: number) => {
    if (isReadOnly) return;
    const newShift: Shift = { id: Math.random().toString(36).substr(2, 9), staffId, dayIndex, startTime, endTime };
    handleUpdateShifts([...shifts, newShift]);
    const name = staffList.find(s => s.id === staffId)?.name || 'Unknown';
    const dayLabel = getShiftDate(currentWeek.toISOString().split('T')[0], dayIndex, language);
    createLog('CREATE SHIFT', `Added shift for ${name} on ${dayLabel} (${formatTime(startTime)}-${formatTime(endTime)})`);
  }, [shifts, handleUpdateShifts, isReadOnly, staffList]);

  const updateShift = useCallback((updatedShift: Shift) => {
    if (isReadOnly) return;
    const original = shifts.find(s => s.id === updatedShift.id);
    if (original) {
      const isUnchanged = original.staffId === updatedShift.staffId &&
                          original.startTime === updatedShift.startTime &&
                          original.endTime === updatedShift.endTime &&
                          original.dayIndex === updatedShift.dayIndex &&
                          (original.coverageBy || '') === (updatedShift.coverageBy || '') &&
                          (original.notes || '') === (updatedShift.notes || '');
      if (isUnchanged) return;
    }
    handleUpdateShifts(shifts.map(s => s.id === updatedShift.id ? updatedShift : s));
    const name = staffList.find(s => s.id === updatedShift.staffId)?.name || 'Unknown';
    const dayLabel = getShiftDate(currentWeek.toISOString().split('T')[0], updatedShift.dayIndex, language);
    createLog('UPDATE SHIFT', `Updated shift for ${name} on ${dayLabel} (${formatTime(updatedShift.startTime)}-${formatTime(updatedShift.endTime)})`);
  }, [shifts, handleUpdateShifts, isReadOnly, staffList]);

  const deleteShift = useCallback((id: string) => {
    if (isReadOnly) return;
    const shift = shifts.find(s => s.id === id);
    if (!shift) return;
    
    const staffName = staffList.find(s => s.id === shift.staffId)?.name || 'Unknown';
    handleUpdateShifts(shifts.filter(s => s.id !== id));
    const dayLabel = getShiftDate(currentWeek.toISOString().split('T')[0], shift.dayIndex, language);
    createLog('DELETE SHIFT', `Removed shift for ${staffName} on ${dayLabel}`);
  }, [shifts, handleUpdateShifts, isReadOnly, staffList]);

  const handleUpdateStaffList = async (newList: Staff[], newGuests: string[] = guestEmails) => {
    setStaffList(newList);
    setGuestEmails(newGuests);
    if (user && !isGuest) {
      await saveStaffToFirebase(newList, newGuests);
      triggerSyncFeedback();
    } else if (isGuest) {
      localStorage.setItem('sandbox_staff', JSON.stringify(newList));
      localStorage.setItem('sandbox_guests', JSON.stringify(newGuests));
      triggerSyncFeedback();
    }
    createLog('UPDATE STAFF', 'Modified staff roster details');
  };

  const handleAddGuest = (email: string) => {
    const newGuests = [...guestEmails, email.toLowerCase().trim()];
    handleUpdateStaffList(staffList, newGuests);
  };

  const handleRemoveGuest = (email: string) => {
    const newGuests = guestEmails.filter(e => e !== email.toLowerCase().trim());
    handleUpdateStaffList(staffList, newGuests);
  };

  const changeWeek = (direction: number) => {
    setNavDirection(direction > 0 ? 'forward' : 'backward');
    const next = new Date(currentWeek);
    next.setDate(next.getDate() + direction * 7);
    setCurrentWeek(next);
    setAiInsight("");
  };

  const handleJumpToMonth = (month: number, year: number) => {
    setNavDirection('none');
    const firstDay = new Date(year, month, 1);
    setCurrentWeek(getMonday(firstDay));
    setIsMonthPickerOpen(false);
    setAiInsight("");
  };

  const handleJumpToToday = () => {
    setNavDirection('none');
    setCurrentWeek(getMonday(new Date()));
    setIsMonthPickerOpen(false);
    setAiInsight("");
  };

  const stopAiGeneration = () => {
    aiRequestActive.current = false;
    setIsMonthlyAiLoading(false);
  };

  const fetchMonthlyDataStrictlyFiltered = async () => {
    const year = currentWeek.getFullYear();
    const month = currentWeek.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    let runner = getMonday(firstOfMonth);
    const weekIds: string[] = [];
    while (runner <= lastOfMonth) {
      weekIds.push(runner.toISOString().split('T')[0]);
      runner.setDate(runner.getDate() + 7);
    }
    const results = await Promise.all(
      weekIds.map(async (wid) => {
        let weeklyShifts: Shift[] = [];
        if (isGuest) {
          const cached = localStorage.getItem(`sandbox_shifts_${wid}`);
          weeklyShifts = cached ? JSON.parse(cached) : [];
        } else {
          weeklyShifts = (await loadShiftsFromFirebase(wid) || []);
        }
        return weeklyShifts.map(s => {
          const d = new Date(wid);
          d.setDate(d.getDate() + s.dayIndex + 1); // +1: weekId is Sunday, dayIndex 0 = Monday
          const isInMonth = d.getMonth() === month && d.getFullYear() === year;
          const dateLabel = d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' });
          const weekRangeLabel = getWeekRangeString(new Date(wid));
          return { ...s, dateLabel, weekRangeLabel, isInMonth };
        });
      })
    );
    return results.flat().filter(s => s.isInMonth);
  };

  const handleAskAi = async (question: string) => {
    aiRequestActive.current = true;
    const filteredShifts = await fetchMonthlyDataStrictlyFiltered();
    const monthLabel = currentWeek.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' });
    const response = await interrogateData(question, filteredShifts as any, staffList, monthLabel);
    if (!aiRequestActive.current) return "Request cancelled.";
    return response || "Aucune réponse trouvée.";
  };

  const handleAutoSchedule = async (constraints: {
    operatingHours: { day: number, start: number, end: number }[],
    avgShiftLength: number,
    instructions: string
  }) => {
    aiRequestActive.current = true;
    const weekLabel = getWeekRangeString(currentWeek);
    const generatedShifts = await generateAutoSchedule(staffList, constraints, weekLabel);
    if (!aiRequestActive.current) return;
    handleUpdateShifts(generatedShifts);
    createLog('AUTO SCHEDULE', `AI generated ${generatedShifts.length} shifts for ${weekLabel}`);
  };

  const askGeminiMonthly = async () => {
    setIsMonthlyAiLoading(true);
    setIsAiMenuOpen(false);
    aiRequestActive.current = true;
    try {
      const filteredShifts = await fetchMonthlyDataStrictlyFiltered();
      if (!aiRequestActive.current) return;

      const firstOfMonth = new Date(currentWeek.getFullYear(), currentWeek.getMonth(), 1);
      const staffSummaries: Record<string, any> = {};
      staffList.forEach(p => {
        staffSummaries[p.id] = { name: p.name, weeklyTarget: p.targetHours, weeks: {}, monthlyTotal: 0 };
      });
      filteredShifts.forEach(s => {
        const hours = s.endTime - s.startTime;
        const actualWorkerId = s.coverageBy ? s.coverageBy : s.staffId;
        const originalId = s.staffId;
        const summary = staffSummaries[actualWorkerId];
        if (summary) {
          if (!summary.weeks[s.weekRangeLabel]) {
            summary.weeks[s.weekRangeLabel] = { label: s.weekRangeLabel, total: 0, days: [] };
          }
          summary.weeks[s.weekRangeLabel].total += hours;
          summary.weeks[s.weekRangeLabel].days.push({ 
            date: s.dateLabel, 
            hours: hours,
            type: s.coverageBy ? (language === 'fr' ? `Remplacement (${staffList.find(st => st.id === originalId)?.name})` : `Covering (${staffList.find(st => st.id === originalId)?.name})`) : (language === 'fr' ? 'Normal' : 'Normal')
          });
          summary.monthlyTotal += hours;
        }
        if (s.coverageBy) {
          const originalSummary = staffSummaries[originalId];
          if (originalSummary) {
            if (!originalSummary.weeks[s.weekRangeLabel]) {
              originalSummary.weeks[s.weekRangeLabel] = { label: s.weekRangeLabel, total: 0, days: [] };
            }
            originalSummary.weeks[s.weekRangeLabel].days.push({ 
              date: s.dateLabel, 
              hours: 0,
              type: language === 'fr' ? `Absence (Couvert par ${staffList.find(st => st.id === s.coverageBy)?.name})` : `Leave (Covered by ${staffList.find(st => st.id === s.coverageBy)?.name})`
            });
          }
        }
      });
      const numWeeksInReport = Array.from(new Set(filteredShifts.map(s => s.weekRangeLabel))).length;
      const finalSummary = Object.values(staffSummaries).map(s => ({
        ...s,
        weeks: Object.values(s.weeks),
        monthlyObjective: s.weeklyTarget * numWeeksInReport
      }));
      const result = await getScheduleInsights(finalSummary as any, staffList, firstOfMonth, 'mensuel');
      
      if (!aiRequestActive.current) return;

      setAiInsight(result || "Erreur de génération.");
      setReportLabel(firstOfMonth.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' }));
      setIsAiReportModalOpen(true);
      createLog('AI REPORT', `Generated monthly report for ${reportLabel}`);
    } catch (err) {
      console.error(err);
      if (aiRequestActive.current) alert("Erreur lors de la récupération des données.");
    } finally {
      setIsMonthlyAiLoading(false);
    }
  };

  const handleCopyLastWeek = async () => {
    if (isReadOnly) return;
    const prevWeek = new Date(currentWeek);
    prevWeek.setDate(prevWeek.getDate() - 7);
    const prevWeekId = prevWeek.toISOString().split('T')[0];
    let prevShifts: Shift[] | null = [];
    if (isGuest) {
      const cached = localStorage.getItem(`sandbox_shifts_${prevWeekId}`);
      prevShifts = cached ? JSON.parse(cached) : [];
    } else {
      prevShifts = await loadShiftsFromFirebase(prevWeekId);
    }
    if (prevShifts?.length) {
      handleUpdateShifts(prevShifts.map(s => ({ ...s, id: Math.random().toString(36).substr(2, 9) })));
      createLog('COPY WEEK', `Cloned shifts from week ${getWeekRangeString(prevWeek)}`);
    }
  };

  const handleDeleteWeek = useCallback(() => {
    if (isReadOnly) return;
    handleUpdateShifts([]);
    createLog('DELETE WEEK', `Removed all shifts for week ${getWeekRangeString(currentWeek)}`);
  }, [handleUpdateShifts, isReadOnly, currentWeek]);


  const handleExportSnapshot = async () => {
    const element = document.getElementById('calendar-grid-capture');
    if (!element) return;
    setIsExporting(true);
    setIsLoading(true);
    try {
      const { toPng } = await import('html-to-image');
      await new Promise(resolve => setTimeout(resolve, 500));
      const dataUrl = await toPng(element, {
        backgroundColor: '#ffffff',
        filter: (node) => {
          const classList = (node as HTMLElement).classList;
          if (!classList) return true;
          return !classList.contains('z-50') && !classList.contains('animate-spin'); 
        },
        pixelRatio: 3 
      });
      const link = document.createElement('a');
      link.download = `Weekly_Schedule_${weekId}.png`;
      link.href = dataUrl;
      link.click();
      createLog('EXPORT SNAPSHOT', `Exported weekly snapshot image for ${getWeekRangeString(currentWeek)}`);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Unable to generate snapshot. Please try again.');
    } finally {
      setIsExporting(false);
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    const result = await loginWithGoogle();
    if (result.error) setAuthError(result.error);
  };

  const handleBypass = () => setIsGuest(true);

  const handleLogout = async () => {
    setIsGuest(false); setUser(null); setAuthError(null);
    try { await logout(); } catch (e) {}
  };

  const editingShift = shifts.find(s => s.id === editingShiftId) || null;

  if (!user && !isGuest) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white flex-col gap-8 p-6 relative overflow-hidden">
        <FloatingBackground />
        <div className="text-center animate-in fade-in zoom-in duration-1000 relative z-10">
          <div className="inline-block p-6 bg-white/10 backdrop-blur-3xl border border-white/20 rounded-[3rem] mb-8 shadow-2xl">
             <svg className="w-16 h-16 text-lime-400 drop-shadow-[0_0_20px_rgba(163,230,53,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z" />
             </svg>
          </div>
          <h1 className="text-7xl font-black mb-4 tracking-tighter drop-shadow-2xl">{t('appName')}</h1>
          <p className="text-emerald-100/60 font-bold text-xl uppercase tracking-[0.3em]">Enterprise Weekly Scheduling</p>
        </div>
        <div className="flex flex-col gap-5 w-full max-sm relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
          <button onClick={handleLogin} className="bg-white text-emerald-950 px-8 py-6 rounded-[2.5rem] font-black hover:bg-lime-50 transition-all flex items-center justify-center gap-4 shadow-2xl active:scale-[0.98] group relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-shimmer" />
            <svg className="w-6 h-6" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            <span className="text-xl">{t('signInGoogle')}</span>
          </button>
          <button onClick={handleBypass} className="bg-white/10 backdrop-blur-xl text-emerald-100 border border-white/20 px-8 py-5 rounded-[2.5rem] font-bold hover:text-white hover:bg-white/20 hover:border-white/30 transition-all flex items-center justify-center gap-3 active:scale-95">
            <svg className="w-5 h-5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            {t('devSandbox')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white">
      {isMonthlyAiLoading && (
        <div className="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
           <div className="bg-white p-12 rounded-[3rem] shadow-2xl flex flex-col items-center gap-6 max-w-sm text-center">
              <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
              <div>
                <h3 className="text-xl font-black text-slate-800 mb-2">Génération du Rapport IA</h3>
                <p className="text-slate-500 font-medium">Analyse des données de paie en cours pour tout le mois...</p>
              </div>
              <button 
                onClick={stopAiGeneration}
                className="mt-4 px-8 py-3 bg-red-50 text-red-600 font-bold rounded-2xl hover:bg-red-100 transition-all flex items-center gap-2 active:scale-95"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                Arrêter l'analyse
              </button>
           </div>
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b flex items-center justify-between px-4 md:px-6 bg-white sticky top-0 z-30">
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-2 hover:bg-slate-100 rounded-lg text-slate-600 active:scale-95 transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button 
              onClick={handleJumpToToday}
              className="text-lg md:text-lg font-bold text-slate-800 hover:text-indigo-600 transition-colors active:scale-95 truncate max-w-[120px] md:max-w-none"
              title={t('returnToday')}
            >
              {t('appName')}
            </button>
            <div className="h-6 w-px bg-slate-200 hidden md:block" />
            <div className="flex items-center gap-0 relative">
              <button onClick={() => changeWeek(-1)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors active:scale-95">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div className="relative" ref={monthPickerRef}>
                <button 
                  onClick={() => setIsMonthPickerOpen(!isMonthPickerOpen)}
                  className={`font-semibold text-slate-700 text-center px-1 py-2 hover:bg-slate-50 rounded-xl transition-all flex items-center justify-center gap-1 border-2 ${isMonthPickerOpen ? 'border-indigo-500 bg-indigo-50/30' : 'border-transparent'}`}
                >
                  <span className="hidden sm:inline">{getWeekRangeString(currentWeek, language)}</span>
                  <span className="sm:hidden text-xs">{currentWeek.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}</span>
                  <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isMonthPickerOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isMonthPickerOpen && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50">
                    <MonthYearPicker selectedDate={currentWeek} onSelect={handleJumpToMonth} onJumpToToday={handleJumpToToday} language={language} />
                  </div>
                )}
              </div>
              <button onClick={changeWeek.bind(null, 1)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors active:scale-95">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
              <div className="flex items-center gap-2 ml-1 md:ml-3">
                {isLoading ? (
                  <div className="bg-indigo-50 text-indigo-600 text-[8px] md:text-[10px] font-black px-1.5 md:px-2 py-1 rounded-full uppercase tracking-widest border border-indigo-100 flex items-center gap-1 md:gap-2">
                    <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-ping" /> <span className="hidden xs:inline">{t('syncing')}</span>
                  </div>
                ) : showSyncSuccess ? (
                  <div className="bg-green-100 text-green-700 text-[8px] md:text-[10px] font-black px-1.5 md:px-2 py-1 rounded-full uppercase tracking-widest border border-green-200 flex items-center gap-1 md:gap-2 animate-in fade-in slide-in-from-left-2">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> <span className="hidden xs:inline">{t('saved')}</span>
                  </div>
                ) : (
                  <div className="bg-green-50 text-green-600 text-[8px] md:text-[10px] font-black px-1.5 md:px-2 py-1 rounded-full uppercase tracking-widest border border-green-100 flex items-center gap-1 md:gap-2">
                    <div className="w-1.5 h-1.5 bg-green-600 rounded-full" /> <span className="hidden xs:inline">{t('live')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3 relative">
            <div className="relative flex items-center" ref={aiMenuRef}>
              <div className={`
                absolute right-0 flex items-center gap-2 bg-white/80 backdrop-blur-xl border border-indigo-100 shadow-xl rounded-full px-3 py-1.5 pr-14 transition-all duration-300 origin-right overflow-hidden
                ${isAiMenuOpen ? 'w-[280px] md:w-[420px] opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-4 pointer-events-none'}
              `}>
                <button 
                  onClick={() => { setIsAskAiModalOpen(true); setIsAiMenuOpen(false); }}
                  className="flex-shrink-0 flex items-center gap-2 bg-indigo-50 text-indigo-700 px-2 md:px-3 py-1.5 rounded-full font-bold text-[10px] md:text-xs hover:bg-indigo-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span className="hidden xs:inline">{t('askAi')}</span>
                </button>
                <button 
                  onClick={askGeminiMonthly}
                  disabled={isMonthlyAiLoading}
                  className="flex-shrink-0 flex items-center gap-2 bg-emerald-50 text-emerald-700 px-2 md:px-3 py-1.5 rounded-full font-bold text-[10px] md:text-xs hover:bg-emerald-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <span className="hidden xs:inline">{isMonthlyAiLoading ? '...' : t('aiReport')}</span>
                </button>
                <button 
                  onClick={() => { setIsAutoScheduleModalOpen(true); setIsAiMenuOpen(false); }}
                  className="flex-shrink-0 flex items-center gap-2 bg-violet-50 text-violet-700 px-2 md:px-3 py-1.5 rounded-full font-bold text-[10px] md:text-xs hover:bg-violet-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span className="hidden xs:inline">{t('autoSchedule')}</span>
                </button>
              </div>
              <button 
                onClick={() => setIsAiMenuOpen(!isAiMenuOpen)}
                className={`
                  z-10 w-9 h-9 md:w-9 md:h-9 flex items-center justify-center rounded-full transition-all duration-300 shadow-lg active:scale-95
                  ${isAiMenuOpen ? 'bg-indigo-600 text-white rotate-90 scale-110' : 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white hover:scale-105'}
                `}
              >
                {isAiMenuOpen ? (
                   <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                ) : (
                   <span className="font-black text-[8px] md:text-[10px] tracking-tighter flex flex-col items-center leading-none">
                     <span className="text-[12px] md:text-[14px]">✨</span>AI
                   </span>
                )}
              </button>
            </div>

            <button 
              onClick={() => setIsSettingsModalOpen(true)}
              className="w-9 h-9 md:w-9 md:h-9 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all active:scale-95 border border-slate-100"
              title={t('settings')}
            >
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>

            <div className="flex items-center gap-2 md:gap-3 pl-2 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-slate-900 leading-none truncate max-w-[80px]">{user?.displayName || "User"}</p>
                <button onClick={handleLogout} className="text-[10px] text-red-500 hover:underline cursor-pointer">{t('signOut')}</button>
              </div>
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-full border-2 border-indigo-100 p-0.5 overflow-hidden">
                <img src={user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.displayName || 'User')}&background=6366f1&color=fff`} className="w-full h-full rounded-full object-cover" alt="User" />
              </div>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-auto relative bg-white hide-scrollbar">
          <Calendar 
            shifts={shifts} 
            staff={staffList} 
            currentWeek={currentWeek} 
            navDirection={navDirection}
            onUpdateShift={updateShift} 
            onAddShift={() => !isReadOnly && setIsShiftModalOpen(true)} 
            onEditShift={(id) => !isReadOnly && setEditingShiftId(id)} 
            isReadOnly={isReadOnly} 
            isLoading={isLoading} 
            isExporting={isExporting}
            language={language}
            viewType={viewType}
          />
        </div>
      </div>
      <Sidebar 
        shifts={shifts} 
        staff={staffList} 
        currentWeek={currentWeek} 
        aiInsight={aiInsight} 
        onAddClick={() => setIsShiftModalOpen(true)} 
        onManageStaffClick={() => setIsStaffModalOpen(true)} 
        onCopyLastWeek={handleCopyLastWeek} 
        onDeleteWeek={handleDeleteWeek}
        onViewAiReport={() => setIsAiReportModalOpen(true)} 
        onOpenHistory={() => setIsHistoryModalOpen(true)}
        onExportSnapshot={handleExportSnapshot}
        isReadOnly={isReadOnly}
        onUndo={undo}
        onRedo={redo}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        language={language}
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      />
      <ShiftModal isOpen={isShiftModalOpen} onClose={() => setIsShiftModalOpen(false)} staff={staffList} onAdd={handleAddShift} language={language} />
      <StaffModal 
        isOpen={isStaffModalOpen} 
        onClose={() => setIsStaffModalOpen(false)} 
        staffList={staffList} 
        guestEmails={guestEmails}
        onAdd={(s) => handleUpdateStaffList([...staffList, s])} 
        onUpdate={(s) => handleUpdateStaffList(staffList.map(item => item.id === s.id ? s : item))} 
        onRemove={(id) => handleUpdateStaffList(staffList.filter(s => s.id !== id))} 
        onAddGuest={handleAddGuest}
        onRemoveGuest={handleRemoveGuest}
        language={language} 
      />
      <EditShiftModal isOpen={!!editingShiftId} onClose={() => setEditingShiftId(null)} shift={editingShift} staffList={staffList} onUpdate={updateShift} onDelete={deleteShift} isReadOnly={isReadOnly} language={language} />
      <AiReportModal isOpen={isAiReportModalOpen} onClose={() => setIsAiReportModalOpen(false)} report={aiInsight} weekRange={reportLabel} language={language} />
      <AskAiModal isOpen={isAskAiModalOpen} onClose={() => setIsAskAiModalOpen(false)} onSubmit={handleAskAi} onStop={stopAiGeneration} language={language} />
      <LogHistoryModal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} logs={logs} language={language} />
      <AutoScheduleModal isOpen={isAutoScheduleModalOpen} onClose={() => setIsAutoScheduleModalOpen(false)} staff={staffList} onGenerate={handleAutoSchedule} onStop={stopAiGeneration} language={language} />
      <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} language={language} onLanguageChange={setLanguage} viewType={viewType} onViewTypeChange={setViewType} />
    </div>
  );
};

export default App;
