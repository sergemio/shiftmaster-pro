
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Staff, Shift, Language, Absence, AbsenceKind, WeekData, EMPTY_WEEK, ViewType } from './types';
import { getWeekStart, getWeekRangeString, getShiftDate, formatTime, toWeekId, isStaffAssignableInWeek, getAssignmentBlock, getOrphanReason, formatShortDate, POST_CONTRACT_GRACE_DAYS, getShiftIsoDate, weekIdsForMonth } from './utils/helpers';
import { INITIAL_STAFF, DAYS_EN, DAYS_FR, DAYS_EN_SHORT, DAYS_FR_SHORT, START_HOUR, END_HOUR } from './constants';
import { CONVENTIONS, DEFAULT_CONVENTION, findViolations, DatedShift, Violation } from './utils/laborRules';
import { violationText, violationWho } from './utils/violationText';
import Calendar from './components/Calendar';
import Sidebar from './components/Sidebar';
import ShiftModal from './components/ShiftModal';
import SelectionBar from './components/SelectionBar';
import StaffModal from './components/StaffModal';
import EditShiftModal from './components/EditShiftModal';
import MonthYearPicker from './components/MonthYearPicker';
import LogHistoryModal from './components/LogHistoryModal';
import SettingsModal from './components/SettingsModal';
import AbsenceModal from './components/AbsenceModal';
import { getTranslation } from './utils/translations';
import { 
  saveWeekToFirebase, 
  saveStaffToFirebase,
  saveLogToFirebase,
  loginWithGoogle,
  logout,
  subscribeToAuth,
  subscribeToWeek,
  subscribeToStaff,
  subscribeToGlobalSettings,
  AuthResult,
  loadShiftsFromFirebase,
  loadWeeks,
  setFirestoreErrorReporter,
  WeekConflictError
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
  const [viewType, setViewType] = useState<ViewType>(() => {
    return (localStorage.getItem('shiftmaster_view') as ViewType) || 'day';
  });
  const t = useMemo(() => getTranslation(language), [language]);

  const [currentWeek, setCurrentWeek] = useState<Date>(getWeekStart(new Date()));
  const [navDirection, setNavDirection] = useState<'forward' | 'backward' | 'none'>('none');
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [guestEmails, setGuestEmails] = useState<string[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [holidays, setHolidays] = useState<number[]>([]);

  // L'historique porte la semaine ENTIERE. S'il ne portait que les shifts,
  // annuler apres avoir saisi une absence remettrait les anciens shifts en
  // laissant l'absence en place — un etat que personne n'a jamais valide.
  const [past, setPast] = useState<WeekData[]>([]);
  const [future, setFuture] = useState<WeekData[]>([]);

  const [user, setUser] = useState<any>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [authError, setAuthError] = useState<AuthResult['error'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState<'week' | 'month'>('week');
  const [monthHours, setMonthHours] = useState<Record<string, number> | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  // Shifts coches. Non vide = mode selection : un appui coche au lieu d'ouvrir
  // la fiche, et la barre d'actions apparait en bas.
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([]);
  /** Semaines voisines, pour les regles qui traversent le dimanche soir. */
  const [neighbourWeeks, setNeighbourWeeks] = useState<Record<string, WeekData>>({});
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState('Europe/Paris');
  /** Convention collective appliquee. Elle vit dans settings/global, a cote du
   *  fuseau : c'est un reglage de l'etablissement, pas une preference d'ecran. */
  const [conventionId, setConventionId] = useState<string>(DEFAULT_CONVENTION);
  // `updatedAt` of the week currently on screen, used to detect that another
  // admin saved it while this one was editing.
  const weekVersion = useRef<string | null | undefined>(undefined);
  // Saves are chained rather than fired in parallel: two quick edits (a drag,
  // then another) would otherwise both start from the same version and the
  // second would be reported as someone else's conflict.
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  const monthPickerRef = useRef<HTMLDivElement>(null);
  const weekId = toWeekId(currentWeek);

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
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // "The roster has not arrived yet" and "the roster is genuinely empty" look
  // identical from staffList alone. Treating the first as the second granted
  // write access to any signed-in user for the first seconds after login — and
  // right after a roster corruption, which is exactly the wrong moment.
  const [staffLoaded, setStaffLoaded] = useState(false);

  const isBootstrapMode = useMemo(() => {
    if (!staffLoaded) return false;
    if (!staffList || staffList.length === 0) return true;
    return !staffList.some(s => s.role === 'admin' && s.email && s.email.trim() !== '');
  }, [staffList, staffLoaded]);

  const isReadOnly = useMemo(() => {
    if (isGuest) return false;
    if (!staffLoaded) return true;      // no rights until we know who is who
    if (isBootstrapMode) return false;
    if (!user || !user.email) return true;
    const currentUserEmail = user.email.trim().toLowerCase();
    // One email can legitimately appear on several rows — the shared "Extra"
    // entry used for one-off helpers carries Serge's address. Taking the FIRST
    // match would demote a real admin to read-only the moment the generic row
    // happened to come first in the list. Admin on any matching row wins.
    const mine = staffList.filter(s => (s.email || '').trim().toLowerCase() === currentUserEmail);
    return !mine.some(s => s.role === 'admin');
  }, [user, staffList, isGuest, isBootstrapMode]);

  /**
   * La fiche de l'employe connecte, pour « ma semaine ».
   *
   * Un meme email peut apparaitre sur plusieurs lignes — la ligne partagee
   * « Extra » porte celui de Serge. On prend la ligne qui a des heures de
   * contrat, faute de quoi on tomberait sur la ligne generique.
   */
  const me = useMemo(() => {
    // Le bac a sable n'authentifie personne : on prete la premiere fiche, sinon
    // « ma semaine » n'y serait pas essayable du tout.
    if (isGuest) return staffList[1] || staffList[0] || null;
    const email = (user?.email || '').trim().toLowerCase();
    if (!email) return null;
    const mine = staffList.filter(s => (s.email || '').trim().toLowerCase() === email);
    if (mine.length === 0) return null;
    return mine.find(s => (s.contractHours ?? s.targetHours ?? 0) > 0) || mine[0];
  }, [user, staffList, isGuest]);

  // Sans fiche a son nom, « ma semaine » n'a rien a montrer : on retombe sur le
  // planning complet plutot que sur un ecran vide.
  const effectiveViewType: ViewType = viewType === 'me' && !me ? 'day' : viewType;

  // A failed write used to be invisible: the badge said "Saved" regardless.
  useEffect(() => {
    setFirestoreErrorReporter((message) => setSaveError(message));
    return () => setFirestoreErrorReporter(null);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) setIsGuest(false);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // The journal no longer streams for the whole session: it loads its two
  // months only when opened. See loadLogs() for why that matters to quota.

  // settings/global has held { timezone: "Europe/Paris" } all along, but
  // nothing read it — the zone was hardcoded in five places instead.
  useEffect(() => {
    if (!user || isGuest) return;
    const unsubscribe = subscribeToGlobalSettings((settings) => {
      if (settings?.timezone) setTimezone(settings.timezone);
      if (settings?.convention) setConventionId(settings.convention);
    });
    return () => unsubscribe();
  }, [user, isGuest]);

  useEffect(() => {
    if (user && !isGuest) {
      const unsubscribe = subscribeToStaff((updatedStaff, updatedGuests) => {
        // Only update local state from Firebase data. NEVER write INITIAL_STAFF
        // back to the DB — that caused a production incident on 2026-05-04
        // where the real roster was overwritten with defaults at login when
        // the first snapshot fired empty (cache cold).
        // If Firebase has no staff doc yet, use INITIAL_STAFF locally only.
        if (updatedStaff && updatedStaff.length > 0) {
          setStaffList(updatedStaff);
        } else {
          setStaffList(prev => prev.length === 0 ? INITIAL_STAFF : prev);
        }
        if (updatedGuests) setGuestEmails(updatedGuests);
        setStaffLoaded(true);
      });
      return () => unsubscribe();
    } else if (isGuest) {
      const cachedStaff = localStorage.getItem('sandbox_staff');
      if (cachedStaff) {
        setStaffList(JSON.parse(cachedStaff));
      } else {
        setStaffList(INITIAL_STAFF);
      }
      setStaffLoaded(true);
    }
  }, [user, isGuest]);

  // Undo/redo history belongs to ONE week. Carrying it across a week change
  // meant Undo wrote the previous week's shifts onto the week now on screen,
  // wiping it. Clearing on every weekId change is what keeps undo scoped.
  useEffect(() => {
    setPast([]);
    setFuture([]);
  }, [weekId]);

  useEffect(() => {
    if (user && !isGuest) {
      setIsLoading(true);
      const unsubscribe = subscribeToWeek(weekId, (week, updatedAt) => {
        weekVersion.current = updatedAt;
        setShifts(week.shifts);
        setAbsences(week.absences);
        setHolidays(week.holidays);
        setIsLoading(false);
      });
      return () => unsubscribe();
    } else if (isGuest) {
      setIsLoading(true);
      const timer = setTimeout(() => {
        const cached = localStorage.getItem(`sandbox_week_${weekId}`);
        const week: WeekData = cached ? { ...EMPTY_WEEK, ...JSON.parse(cached) } : EMPTY_WEEK;
        setShifts(week.shifts);
        setAbsences(week.absences);
        setHolidays(week.holidays);
        setIsLoading(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [weekId, user, isGuest]);

  /**
   * Total d'heures du mois par employe.
   *
   * Ne se declenche QUE si l'utilisateur a bascule sur « Mois ». Firestore
   * facture une lecture par document : charger 5 ou 6 semaines a chaque
   * ouverture de l'app couterait ce prix a tout le monde, tout le temps, pour
   * un ecran que personne n'ouvre la plupart du temps.
   *
   * Chaque shift est rattache a SA date reelle, pas a sa semaine : une semaine
   * a cheval sur deux mois se repartit correctement entre les deux.
   */
  useEffect(() => {
    if (statsPeriod !== 'month' && effectiveViewType !== 'me') {
      setMonthHours(null);
      return;
    }
    let cancelled = false;
    setMonthLoading(true);
    // Ancre sur le JEUDI, pas le lundi. La semaine du 31 aout au 6 septembre a
    // son lundi en aout alors qu'elle est a six septiemes en septembre : ancrer
    // sur le lundi affichait « aout » un 6 septembre. Le jeudi est la regle
    // ISO 8601 pour decider a quel mois appartient une semaine.
    const monthAnchor = getShiftIsoDate(currentWeek, 3);
    const month = monthAnchor.slice(0, 7);
    const ids = weekIdsForMonth(monthAnchor);
    // Le bac a sable n'est pas authentifie : Firestore refuserait la lecture.
    // Il relit ses propres semaines dans le navigateur, ce qui permet aussi de
    // faire une demonstration sans toucher aux donnees reelles.
    const source = (user && !isGuest)
      ? loadWeeks(ids)
      : Promise.resolve(Object.fromEntries(ids.map(wid => {
          const raw = localStorage.getItem(`sandbox_week_${wid}`);
          return [wid, raw ? { ...EMPTY_WEEK, ...JSON.parse(raw) } : EMPTY_WEEK];
        })));
    source.then(weeks => {
      if (cancelled) return;
      const totals: Record<string, number> = {};
      for (const [wid, data] of Object.entries(weeks)) {
        const weekStart = new Date(wid + 'T00:00:00Z');
        for (const sh of data.shifts) {
          if (getShiftIsoDate(weekStart, sh.dayIndex).slice(0, 7) !== month) continue;
          // Un shift couvert par quelqu'un d'autre compte pour celui qui le fait.
          const who = sh.coverageBy || sh.staffId;
          totals[who] = (totals[who] || 0) + (sh.endTime - sh.startTime);
        }
      }
      setMonthHours(totals);
      setMonthLoading(false);
    }).catch(() => { if (!cancelled) setMonthLoading(false); });
    return () => { cancelled = true; };
  }, [statsPeriod, effectiveViewType, currentWeek, user, isGuest]);

  /**
   * Charge la semaine precedente et la suivante, uniquement pour les regles de
   * duree du travail.
   *
   * Le repos de 11 h entre dimanche soir et lundi matin traverse deux documents
   * Firestore : sans les voisines, l'infraction la plus frequente d'un planning
   * de restaurant serait la seule invisible. Deux lectures par changement de
   * semaine, servies par le cache local des la deuxieme fois.
   *
   * Une voisine absente ne produit pas de faux positif : elle produit un
   * silence, ce qui est le bon defaut quand on ne sait pas.
   */
  useEffect(() => {
    let cancelled = false;
    const prev = new Date(currentWeek); prev.setDate(prev.getDate() - 7);
    const next = new Date(currentWeek); next.setDate(next.getDate() + 7);
    const ids = [toWeekId(prev), toWeekId(next)];
    const source = (user && !isGuest)
      ? loadWeeks(ids)
      : Promise.resolve(Object.fromEntries(ids.map(wid => {
          const raw = localStorage.getItem(`sandbox_week_${wid}`);
          return [wid, raw ? { ...EMPTY_WEEK, ...JSON.parse(raw) } : EMPTY_WEEK];
        })));
    source.then(weeks => { if (!cancelled) setNeighbourWeeks(weeks); })
          .catch(() => { if (!cancelled) setNeighbourWeeks({}); });
    return () => { cancelled = true; };
  }, [currentWeek, user, isGuest]);

  const convention = CONVENTIONS[conventionId] || CONVENTIONS[DEFAULT_CONVENTION];

  /**
   * Les depassements de la semaine affichee.
   *
   * Les shifts des semaines voisines entrent dans le CALCUL mais pas dans les
   * alertes : on ne signale pas des problemes d'une semaine que l'utilisateur
   * ne regarde pas. Un shift couvert par quelqu'un d'autre compte pour celui
   * qui le fait reellement — c'est lui qui se fatigue.
   */
  const violations = useMemo<Violation[]>(() => {
    const flat: DatedShift[] = [];
    const push = (weekStart: Date, list: Shift[]) => {
      for (const sh of list) {
        flat.push({
          id: sh.id,
          staffId: sh.coverageBy || sh.staffId,
          date: getShiftIsoDate(weekStart, sh.dayIndex),
          start: sh.startTime,
          end: sh.endTime,
        });
      }
    };
    push(currentWeek, shifts);
    for (const [wid, data] of Object.entries(neighbourWeeks)) {
      push(new Date(wid + 'T00:00:00Z'), data.shifts || []);
    }
    const pooled = staffList.filter(s => s.isPool).map(s => s.id);
    return findViolations(flat, convention, {
      from: getShiftIsoDate(currentWeek, 0),
      to: getShiftIsoDate(currentWeek, 6),
    }, pooled);
  }, [shifts, neighbourWeeks, currentWeek, staffList, convention]);

  /** Les shifts de la fenetre, indexes pour retrouver celui qu'un message cite. */
  const shiftIndex = useMemo(() => {
    const map = new Map<string, { shift: Shift; date: string }>();
    const add = (weekStart: Date, list: Shift[]) => {
      for (const sh of list) map.set(sh.id, { shift: sh, date: getShiftIsoDate(weekStart, sh.dayIndex) });
    };
    add(currentWeek, shifts);
    for (const [wid, data] of Object.entries(neighbourWeeks)) {
      add(new Date(wid + 'T00:00:00Z'), data.shifts || []);
    }
    return map;
  }, [shifts, neighbourWeeks, currentWeek]);

  /** Les phrases, groupees par carte. Le repos hebdomadaire n'en a pas : il ne
   *  designe aucune carte en particulier, il n'apparait que dans le recapitulatif. */
  const warningsByShift = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const v of violations) {
      if (!v.shiftId) continue;
      (out[v.shiftId] ||= []).push(violationText(v, language, shiftIndex));
    }
    return out;
  }, [violations, language, shiftIndex]);

  /** Le recapitulatif de la semaine : qui, quoi. */
  const complianceList = useMemo(
    () => violations.map(v => ({
      who: violationWho(v, staffList),
      text: violationText(v, language, shiftIndex),
    })),
    [violations, staffList, language, shiftIndex],
  );

  /**
   * Ce que donnerait un shift qu'on est en train de composer, avant de l'enregistrer.
   *
   * C'est le coeur du dispositif. Le badge sur la carte arrive trop tard : quand
   * on le voit, le shift est pose et on est passe a autre chose. Ici la
   * consequence s'affiche PENDANT qu'on choisit, dans le meme ecran, et
   * disparait si on recule l'heure. C'est ce qui apprend la regle a quelqu'un
   * qui ne l'a jamais lue.
   *
   * On simule : les shifts existants moins celui qu'on modifie, plus les
   * candidats. Rien n'est ecrit.
   */
  const previewViolations = useCallback((
    staffId: string,
    dayIndexes: number[],
    start: number,
    end: number,
    excludeShiftId?: string,
  ): string[] => {
    if (!staffId || end <= start || dayIndexes.length === 0) return [];
    if (staffList.find(s => s.id === staffId)?.isPool) return [];

    const flat: DatedShift[] = [];
    const index = new Map<string, { shift: Shift; date: string }>();
    const add = (weekStart: Date, list: Shift[]) => {
      for (const sh of list) {
        if (sh.id === excludeShiftId) continue;
        const date = getShiftIsoDate(weekStart, sh.dayIndex);
        flat.push({ id: sh.id, staffId: sh.coverageBy || sh.staffId, date, start: sh.startTime, end: sh.endTime });
        index.set(sh.id, { shift: sh, date });
      }
    };
    add(currentWeek, shifts);
    for (const [wid, data] of Object.entries(neighbourWeeks)) {
      add(new Date(wid + 'T00:00:00Z'), data.shifts || []);
    }
    for (const dayIndex of dayIndexes) {
      const candidate: Shift = { id: `preview-${dayIndex}`, staffId, dayIndex, startTime: start, endTime: end };
      const date = getShiftIsoDate(currentWeek, dayIndex);
      flat.push({ id: candidate.id, staffId, date, start, end });
      index.set(candidate.id, { shift: candidate, date });
    }

    const pooled = staffList.filter(s => s.isPool).map(s => s.id);
    return findViolations(flat, convention, {
      from: getShiftIsoDate(currentWeek, 0),
      to: getShiftIsoDate(currentWeek, 6),
    }, pooled)
      // Seulement la personne concernee : on ne va pas signaler le probleme
      // d'un collegue au moment ou l'on saisit le shift de quelqu'un d'autre.
      .filter(v => v.staffId === staffId)
      .map(v => violationText(v, language, index));
  }, [shifts, neighbourWeeks, currentWeek, staffList, convention, language]);

  /**
   * La periode d'emploi, jour par jour, pour un shift qu'on s'apprete a poser.
   *
   * `errors` : ce qui INTERDIT le shift (avant la date d'entree, ou plus de
   * trois semaines apres la sortie). `notes` : ce qui est permis mais sera
   * marque « hors contrat » (entre la sortie et la fin des trois semaines).
   * Le filtre `assignableStaff` travaille a la semaine ; ici on regarde le jour,
   * sinon quelqu'un qui arrive mercredi pourrait etre pose le lundi.
   */
  const employmentCheck = useCallback((staffId: string, dayIndexes: number[]) => {
    const errors: string[] = [];
    const notes: string[] = [];
    const staff = staffList.find(s => s.id === staffId);
    if (!staff) return { errors, notes };
    const say = (key: string, date: string) => t(key)
      .replace('{name}', staff.name)
      .replace('{date}', formatShortDate(date, language))
      .replace('{days}', String(POST_CONTRACT_GRACE_DAYS));
    let blocked: string | null = null;
    let offContract: string | null = null;
    for (const dayIndex of dayIndexes) {
      const date = getShiftIsoDate(currentWeek, dayIndex);
      const block = getAssignmentBlock(staff, date);
      if (block) {
        blocked ??= say(block.kind === 'before-start' ? 'blockedBeforeStart' : 'blockedAfterGrace', block.date);
      } else if (getOrphanReason(staff, date)?.kind === 'after-end') {
        offContract ??= say('offContractHint', staff.endDate!);
      }
    }
    // Un seul message par categorie : cinq jours coches avant l'arrivee donnent
    // une phrase, pas cinq fois la meme.
    if (blocked) errors.push(blocked);
    if (offContract) notes.push(offContract);
    return { errors, notes };
  }, [staffList, currentWeek, language, t]);

  const triggerSyncFeedback = () => {
    setShowSyncSuccess(true);
    setTimeout(() => setShowSyncSuccess(false), 2000);
  };

  /**
   * @param target the staff member the action is about — stored as its own
   *               field so the journal can filter on it, instead of the name
   *               only existing buried inside the English sentence.
   */
  const createLog = (action: string, details: string, target?: Staff | null) => {
    saveLogToFirebase({
      userId: user?.uid || 'guest',
      userName: user?.displayName || 'Sandbox Admin',
      ...(target ? { targetStaffId: target.id, targetStaffName: target.name } : {}),
      weekId,
      action,
      details,
      timestamp: new Date().toISOString()
    });
  };

  /**
   * Point de passage UNIQUE pour toute modification de la semaine. Shifts,
   * absences et jours feries partent ensemble : Firestore remplace le document
   * entier, donc sauvegarder les shifts seuls effacerait les absences.
   */
  const commitWeek = useCallback(async (next: Partial<WeekData>, isHistoryAction = false) => {
    if (isReadOnly) return;
    const before: WeekData = { shifts, absences, holidays };
    const after: WeekData = { ...before, ...next };
    if (!isHistoryAction) {
      setPast(prev => [before, ...prev].slice(0, 10));
      setFuture([]);
    }
    setShifts(after.shifts);
    setAbsences(after.absences);
    setHolidays(after.holidays);

    if (user && !isGuest) {
      writeQueue.current = writeQueue.current.then(async () => {
        try {
          const stamp = await saveWeekToFirebase(weekId, after, weekVersion.current);
          // Adopt the version we just wrote, so consecutive edits by the same
          // person are not mistaken for someone else's changes.
          if (stamp) weekVersion.current = stamp;
          setSaveError(null);
          triggerSyncFeedback();
        } catch (e) {
          if (e instanceof WeekConflictError) {
            setSaveError('Someone else changed this week while you were editing it. Your change was not saved — what you see below is their version.');
            // The live subscription already pushed their version into `shifts`.
            setPast([]);
            setFuture([]);
          }
        }
      });
      await writeQueue.current;
    } else if (isGuest) {
      localStorage.setItem(`sandbox_week_${weekId}`, JSON.stringify(after));
      triggerSyncFeedback();
    }
  }, [weekId, user, isGuest, isReadOnly, shifts, absences, holidays]);

  // Ancien point d'entree, conserve pour tout ce qui ne touche que les shifts.
  const handleUpdateShifts = useCallback(
    (newShifts: Shift[], isHistoryAction = false) => commitWeek({ shifts: newShifts }, isHistoryAction),
    [commitWeek]
  );

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[0];
    setFuture(prev => [{ shifts, absences, holidays }, ...prev]);
    commitWeek(previous, true);
    setPast(past.slice(1));
    createLog('UNDO', 'Performed an undo action');
  }, [past, shifts, absences, holidays, commitWeek]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setPast(prev => [{ shifts, absences, holidays }, ...prev]);
    commitWeek(next, true);
    setFuture(future.slice(1));
    createLog('REDO', 'Performed a redo action');
  }, [future, shifts, absences, holidays, commitWeek]);

  /**
   * Un meme service sur plusieurs jours. Les shifts sont crees en UN SEUL
   * commit : une seule ecriture Firestore, et surtout une seule etape d'annulation
   * — cinq etapes a annuler une par une pour un geste unique serait un piege.
   */
  const handleAddShift = useCallback((staffId: string, dayIndexes: number[], startTime: number, endTime: number) => {
    if (isReadOnly || dayIndexes.length === 0) return;
    // La fenetre bloque deja l'envoi ; on refuse aussi ici pour que la regle
    // tienne quel que soit le chemin qui cree un shift.
    const { errors } = employmentCheck(staffId, dayIndexes);
    if (errors.length > 0) { setSaveError(errors[0]); return; }
    const created: Shift[] = dayIndexes.map(dayIndex => ({
      id: Math.random().toString(36).substr(2, 9), staffId, dayIndex, startTime, endTime,
    }));
    handleUpdateShifts([...shifts, ...created]);
    const target = staffList.find(s => s.id === staffId) || null;
    const days = dayIndexes.map(d => getShiftDate(toWeekId(currentWeek), d, language)).join(', ');
    createLog('CREATE SHIFT', `Added ${created.length} shift(s) for ${target?.name || 'Unknown'} on ${days} (${formatTime(startTime)}-${formatTime(endTime)})`, target);
  }, [shifts, handleUpdateShifts, isReadOnly, staffList, currentWeek, language, employmentCheck]);

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
      // Seulement quand le shift change de jour ou de personne (glisser vers un
      // autre jour, reassignation). Retoucher l'horaire d'un vieux shift deja
      // hors periode doit rester possible : ce sont des donnees passees.
      const moved = original.dayIndex !== updatedShift.dayIndex || original.staffId !== updatedShift.staffId;
      if (moved) {
        const { errors } = employmentCheck(updatedShift.staffId, [updatedShift.dayIndex]);
        if (errors.length > 0) { setSaveError(errors[0]); return; }
      }
    }
    handleUpdateShifts(shifts.map(s => s.id === updatedShift.id ? updatedShift : s));
    const target = staffList.find(s => s.id === updatedShift.staffId) || null;
    const dayLabel = getShiftDate(toWeekId(currentWeek), updatedShift.dayIndex, language);
    createLog('UPDATE SHIFT', `Updated shift for ${target?.name || 'Unknown'} on ${dayLabel} (${formatTime(updatedShift.startTime)}-${formatTime(updatedShift.endTime)})`, target);
  }, [shifts, handleUpdateShifts, isReadOnly, staffList, employmentCheck]);

  /**
   * Recopie un shift sur d'autres jours de la semaine affichee.
   *
   * `source` est le shift tel qu'EDITE par la fenetre : corriger l'horaire puis
   * cocher trois jours pose le bon horaire partout. Cette fonction porte donc
   * aussi la mise a jour de l'original — sinon l'edition et les copies
   * partiraient en deux commits, soit deux ecritures et deux etapes d'annulation
   * pour un seul geste.
   *
   * Le jour d'origine est verrouille dans le selecteur, mais on le refiltre ici :
   * un appel programme ne doit pas pouvoir creer un doublon sur place.
   */
  const repeatShift = useCallback((source: Shift, dayIndexes: number[]) => {
    if (isReadOnly) return;
    const copies: Shift[] = dayIndexes
      .filter(d => d !== source.dayIndex)
      .map(dayIndex => ({ ...source, id: Math.random().toString(36).substr(2, 9), dayIndex }));
    if (copies.length === 0) return;
    const { errors } = employmentCheck(source.staffId, copies.map(c => c.dayIndex));
    if (errors.length > 0) { setSaveError(errors[0]); return; }
    handleUpdateShifts([...shifts.map(s => (s.id === source.id ? source : s)), ...copies]);
    const target = staffList.find(s => s.id === source.staffId) || null;
    const days = copies.map(c => getShiftDate(toWeekId(currentWeek), c.dayIndex, language)).join(', ');
    createLog('REPEAT SHIFT', `Copied shift for ${target?.name || 'Unknown'} onto ${days}`, target);
  }, [shifts, handleUpdateShifts, isReadOnly, staffList, currentWeek, language, employmentCheck]);

  // -------------------------------------------------------------- selection
  const toggleShiftSelection = useCallback((id: string) => {
    if (isReadOnly) return;
    setSelectedShiftIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, [isReadOnly]);

  const clearSelection = useCallback(() => setSelectedShiftIds([]), []);

  /**
   * Decale toute la selection de +/- 30 minutes.
   *
   * Tout ou rien : si un seul des shifts sortait de la journee, rien ne bouge.
   * Un bloc a moitie decale serait pire que pas de decalage — on croirait le
   * geste fait, et il faudrait rattraper a la main les shifts restes en place.
   */
  const nudgeSelected = useCallback((delta: number) => {
    if (isReadOnly || selectedShiftIds.length === 0) return;
    const chosen = shifts.filter(s => selectedShiftIds.includes(s.id));
    const impossible = chosen.some(s => s.startTime + delta < START_HOUR || s.endTime + delta > END_HOUR);
    if (impossible) {
      setSaveError(t('cannotShiftOutOfRange'));
      return;
    }
    // Le refus precedent, s'il y en a eu un, ne concerne plus rien : la meme
    // action vient de reussir, le bandeau rouge n'a plus rien a dire.
    setSaveError(null);
    handleUpdateShifts(shifts.map(s => selectedShiftIds.includes(s.id)
      ? { ...s, startTime: s.startTime + delta, endTime: s.endTime + delta }
      : s));
    createLog('MOVE SHIFTS', `Moved ${chosen.length} shift(s) by ${delta > 0 ? '+' : ''}${delta * 60} min`);
  }, [shifts, selectedShiftIds, handleUpdateShifts, isReadOnly, t]);

  const moveSelectedToDay = useCallback((dayIndex: number) => {
    if (isReadOnly || selectedShiftIds.length === 0) return;
    const chosen = shifts.filter(s => selectedShiftIds.includes(s.id));
    if (chosen.every(s => s.dayIndex === dayIndex)) return;
    // Tout ou rien, comme pour le decalage horaire : si une seule des personnes
    // ne peut pas travailler ce jour-la, rien ne bouge.
    for (const s of chosen) {
      const { errors } = employmentCheck(s.staffId, [dayIndex]);
      if (errors.length > 0) { setSaveError(errors[0]); return; }
    }
    setSaveError(null);
    handleUpdateShifts(shifts.map(s => selectedShiftIds.includes(s.id) ? { ...s, dayIndex } : s));
    const dayLabel = getShiftDate(toWeekId(currentWeek), dayIndex, language);
    createLog('MOVE SHIFTS', `Moved ${chosen.length} shift(s) to ${dayLabel}`);
  }, [shifts, selectedShiftIds, handleUpdateShifts, isReadOnly, currentWeek, language, employmentCheck]);

  const deleteSelected = useCallback(() => {
    if (isReadOnly || selectedShiftIds.length === 0) return;
    const question = selectedShiftIds.length > 1
      ? t('confirmDeleteSelectedPlural').replace('{n}', String(selectedShiftIds.length))
      : t('confirmDeleteSelected');
    if (!window.confirm(question)) return;
    handleUpdateShifts(shifts.filter(s => !selectedShiftIds.includes(s.id)));
    createLog('DELETE SHIFTS', `Removed ${selectedShiftIds.length} shift(s)`);
    setSelectedShiftIds([]);
  }, [shifts, selectedShiftIds, handleUpdateShifts, isReadOnly, t]);

  const deleteShift = useCallback((id: string) => {
    if (isReadOnly) return;
    const shift = shifts.find(s => s.id === id);
    if (!shift) return;
    
    const target = staffList.find(s => s.id === shift.staffId) || null;
    handleUpdateShifts(shifts.filter(s => s.id !== id));
    const dayLabel = getShiftDate(toWeekId(currentWeek), shift.dayIndex, language);
    createLog('DELETE SHIFT', `Removed shift for ${target?.name || 'Unknown'} on ${dayLabel}`, target);
  }, [shifts, handleUpdateShifts, isReadOnly, staffList]);

  /**
   * Sur telephone, la barre laterale est un tiroir en z-[110] et les fenetres
   * modales sont en dessous : ouvrir « Add Shift » depuis le tiroir affichait
   * donc la fenetre DERRIERE lui, hors d'atteinte. Le tiroir a fait son travail
   * des qu'on a choisi une action — on le referme.
   */
  const fromSidebar = (open: () => void) => () => {
    setIsMobileSidebarOpen(false);
    open();
  };

  // ---------------------------------------------------------------- absences
  // Une absence se saisit souvent sur PLUSIEURS jours d'un coup (des conges ne
  // durent pas un jour), d'ou la liste de jours plutot qu'un jour unique.
  const addAbsences = useCallback((staffId: string, dayIndexes: number[], kind: AbsenceKind) => {
    if (isReadOnly || dayIndexes.length === 0) return;
    const target = staffList.find(s => s.id === staffId) || null;
    // Une personne ne peut pas etre deux fois absente le meme jour : on remplace
    // le motif au lieu d'empiler deux lignes contradictoires dans la bande.
    const kept = absences.filter(a => !(a.staffId === staffId && dayIndexes.includes(a.dayIndex)));
    const added: Absence[] = dayIndexes.map(dayIndex => ({
      id: Math.random().toString(36).substr(2, 9),
      staffId,
      dayIndex,
      kind,
    }));
    commitWeek({ absences: [...kept, ...added] });
    const days = dayIndexes
      .slice()
      .sort((a, b) => a - b)
      .map(d => getShiftDate(toWeekId(currentWeek), d, language))
      .join(', ');
    createLog('CREATE ABSENCE', `Marked ${target?.name || 'Unknown'} as ${kind} on ${days}`, target);
  }, [absences, commitWeek, isReadOnly, staffList, currentWeek, language]);

  const removeAbsence = useCallback((id: string) => {
    if (isReadOnly) return;
    const gone = absences.find(a => a.id === id);
    if (!gone) return;
    const target = staffList.find(s => s.id === gone.staffId) || null;
    commitWeek({ absences: absences.filter(a => a.id !== id) });
    const dayLabel = getShiftDate(toWeekId(currentWeek), gone.dayIndex, language);
    createLog('DELETE ABSENCE', `Removed ${gone.kind} for ${target?.name || 'Unknown'} on ${dayLabel}`, target);
  }, [absences, commitWeek, isReadOnly, staffList, currentWeek, language]);

  // Un jour ferie est un etat du JOUR, pas l'absence d'une personne : il ne
  // rentre donc pas dans la liste des absences mais dans celle des jours.
  const toggleHoliday = useCallback((dayIndex: number) => {
    if (isReadOnly) return;
    const on = holidays.includes(dayIndex);
    commitWeek({ holidays: on ? holidays.filter(d => d !== dayIndex) : [...holidays, dayIndex] });
    const dayLabel = getShiftDate(toWeekId(currentWeek), dayIndex, language);
    createLog(on ? 'UNSET HOLIDAY' : 'SET HOLIDAY', `${on ? 'Cleared' : 'Marked'} ${dayLabel} as a public holiday`);
  }, [holidays, commitWeek, isReadOnly, currentWeek, language]);

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

  /**
   * Raccourcis clavier, poste fixe uniquement — sur telephone il n'y a pas de
   * clavier physique et rien ici ne remplace un bouton existant.
   *
   * Trois garde-fous, dans cet ordre : on ignore la frappe si elle vise un champ
   * de saisie (sinon Ctrl+Z annulerait la semaine au lieu du texte tape) ; on
   * ignore les fleches quand une fenetre est ouverte (changer de semaine derriere
   * une fenetre ouverte n'a aucun sens) ; Echap ferme la fenetre du dessus.
   */
  useEffect(() => {
    const anyModalOpen = isShiftModalOpen || isStaffModalOpen || isHistoryModalOpen ||
      isSettingsModalOpen || isAbsenceModalOpen || !!editingShiftId || isMonthPickerOpen;

    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);

      if (e.key === 'Escape') {
        if (isMonthPickerOpen) setIsMonthPickerOpen(false);
        else if (editingShiftId) setEditingShiftId(null);
        else if (isAbsenceModalOpen) setIsAbsenceModalOpen(false);
        else if (isShiftModalOpen) setIsShiftModalOpen(false);
        else if (isStaffModalOpen) setIsStaffModalOpen(false);
        else if (isHistoryModalOpen) setIsHistoryModalOpen(false);
        else if (isSettingsModalOpen) setIsSettingsModalOpen(false);
        else if (selectedShiftIds.length > 0) setSelectedShiftIds([]);
        else if (isMobileSidebarOpen) setIsMobileSidebarOpen(false);
        return;
      }

      if (typing) return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (mod || e.altKey || anyModalOpen) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); changeWeek(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); changeWeek(1); }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, isShiftModalOpen, isStaffModalOpen, isHistoryModalOpen, isSettingsModalOpen,
      isAbsenceModalOpen, editingShiftId, isMonthPickerOpen, isMobileSidebarOpen, currentWeek,
      selectedShiftIds]);

  useEffect(() => {
    // Les ids coches appartiennent a la semaine affichee : en changer, ou passer
    // en lecture seule, laisserait une barre d'actions sans cartes en face.
    setSelectedShiftIds([]);
  }, [currentWeek, isReadOnly]);

  const changeWeek = (direction: number) => {
    setNavDirection(direction > 0 ? 'forward' : 'backward');
    const next = new Date(currentWeek);
    next.setDate(next.getDate() + direction * 7);
    setCurrentWeek(next);
  };

  const handleJumpToMonth = (month: number, year: number) => {
    setNavDirection('none');
    const firstDay = new Date(year, month, 1);
    setCurrentWeek(getWeekStart(firstDay));
    setIsMonthPickerOpen(false);
  };

  const handleJumpToToday = () => {
    setNavDirection('none');
    setCurrentWeek(getWeekStart(new Date()));
    setIsMonthPickerOpen(false);
  };

  /**
   * Reprend les shifts de la semaine precedente.
   *
   * Le bouton n'apparaissait que sur une semaine VIDE, ce qui interdisait le cas
   * le plus courant : la trame est deja la, il manque deux personnes le samedi.
   * Il est desormais toujours disponible, et les shifts repris s'AJOUTENT a ceux
   * en place — jamais de remplacement, donc jamais de travail efface. Un doublon
   * eventuel se signale de lui-meme via l'alerte de chevauchement.
   *
   * Les absences et les jours feries ne sont PAS repris : ils sont propres a une
   * semaine donnee, contrairement a une trame de service.
   *
   * La lecture du bac a sable pointait encore `sandbox_shifts_`, ancienne cle
   * abandonnee en passant a `sandbox_week_` : la copie y etait silencieusement
   * cassee depuis.
   */
  const handleCopyLastWeek = async () => {
    if (isReadOnly || isLoading) return;
    const prevWeek = new Date(currentWeek);
    prevWeek.setDate(prevWeek.getDate() - 7);
    const prevWeekId = toWeekId(prevWeek);

    let prevShifts: Shift[] = [];
    if (user && !isGuest) {
      prevShifts = (await loadShiftsFromFirebase(prevWeekId)) || [];
    } else {
      const cached = localStorage.getItem(`sandbox_week_${prevWeekId}`);
      prevShifts = cached ? (JSON.parse(cached).shifts || []) : [];
    }
    if (prevShifts.length === 0) {
      setSaveError(t('nothingToCopy'));
      return;
    }
    // Sur une semaine deja remplie on demande : l'ajout reste annulable, mais
    // mieux vaut ne pas surprendre.
    if (shifts.length > 0 && !window.confirm(t('confirmCopyInto').replace('{n}', String(prevShifts.length)))) {
      return;
    }
    const copied = prevShifts.map(s => ({ ...s, id: Math.random().toString(36).substr(2, 9) }));
    commitWeek({ shifts: [...shifts, ...copied] });
    createLog('COPY WEEK', `Copied ${copied.length} shifts from week ${getWeekRangeString(prevWeek)}`);
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

  // People you can still assign work to on the week being viewed : pas avant la
  // date d'entree, et jusqu'a trois semaines apres la date de sortie (voir
  // `getAssignmentBlock`). Someone who left in March must not be offered on a
  // May week — but their past shifts stay on the calendar, flagged, rather than
  // being hidden. Le controle jour par jour est fait par `employmentCheck`.
  const assignableStaff = useMemo(
    () => staffList.filter(s => isStaffAssignableInWeek(s, currentWeek)),
    [staffList, currentWeek]
  );

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
          <h1 className="text-display font-black mb-4 tracking-tighter drop-shadow-2xl">{t('appName')}</h1>
          <p className="text-emerald-100/60 font-bold text-xl uppercase tracking-[0.3em]">Enterprise Weekly Scheduling</p>
        </div>
        <div className="flex flex-col gap-5 w-full max-w-sm relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
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
              <button onClick={() => changeWeek(-1)} title="←" aria-label="Previous week" className="p-1 hover:bg-gray-100 rounded-lg transition-colors active:scale-95">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div className="relative" ref={monthPickerRef}>
                <button 
                  onClick={() => setIsMonthPickerOpen(!isMonthPickerOpen)}
                  className={`font-semibold text-slate-700 text-center px-1 py-2 hover:bg-slate-50 rounded-xl transition-all flex items-center justify-center gap-1 border-2 sm:min-w-[220px] ${isMonthPickerOpen ? 'border-indigo-500 bg-indigo-50/30' : 'border-transparent'}`}
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
              <button onClick={changeWeek.bind(null, 1)} title="→" aria-label="Next week" className="p-1 hover:bg-gray-100 rounded-lg transition-colors active:scale-95">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
              <div className="flex items-center gap-2 ml-1 md:ml-3">
                {saveError ? (
                  <div className="bg-red-100 text-red-700 text-xs font-black px-1.5 md:px-2 py-1 rounded-full uppercase tracking-widest border border-red-200 flex items-center gap-1 md:gap-2">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                    <span className="hidden xs:inline">Not saved</span>
                  </div>
                ) : isLoading ? (
                  <div className="bg-indigo-50 text-indigo-600 text-xs font-black px-1.5 md:px-2 py-1 rounded-full uppercase tracking-widest border border-indigo-100 flex items-center gap-1 md:gap-2">
                    <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-ping" /> <span className="hidden xs:inline">{t('syncing')}</span>
                  </div>
                ) : showSyncSuccess ? (
                  <div className="bg-green-100 text-green-700 text-xs font-black px-1.5 md:px-2 py-1 rounded-full uppercase tracking-widest border border-green-200 flex items-center gap-1 md:gap-2 animate-in fade-in slide-in-from-left-2">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> <span className="hidden xs:inline">{t('saved')}</span>
                  </div>
                ) : (
                  <div className="bg-green-50 text-green-600 text-xs font-black px-1.5 md:px-2 py-1 rounded-full uppercase tracking-widest border border-green-100 flex items-center gap-1 md:gap-2">
                    <div className="w-1.5 h-1.5 bg-green-600 rounded-full" /> <span className="hidden xs:inline">{t('live')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3 relative">
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
                <button onClick={handleLogout} className="text-xs text-red-500 hover:underline cursor-pointer whitespace-nowrap">{t('signOut')}</button>
              </div>
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-full border-2 border-indigo-100 p-0.5 overflow-hidden">
                <img src={user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.displayName || 'User')}&background=6366f1&color=fff`} className="w-full h-full rounded-full object-cover" alt="User" />
              </div>
            </div>
          </div>
        </header>
        {saveError && (
          <div className="bg-red-50 border-b-2 border-red-200 px-4 md:px-6 py-3 flex items-start gap-3 animate-in slide-in-from-top-2 duration-200">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="flex-1 text-sm text-red-800 font-medium leading-snug">{saveError}</p>
            <button
              onClick={() => setSaveError(null)}
              className="text-red-400 hover:text-red-700 transition-colors flex-shrink-0 p-1"
              title="Dismiss"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
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
            timezone={timezone}
            viewType={effectiveViewType}
            ruleWarnings={warningsByShift}
            selectedShiftIds={selectedShiftIds}
            onToggleSelect={toggleShiftSelection}
            me={me}
            monthHours={monthHours}
            absences={absences}
            holidays={holidays}
            onRemoveAbsence={removeAbsence}
          />
        </div>
      </div>
      <Sidebar
        shifts={shifts}
        staff={staffList}
        currentWeek={currentWeek}
        onAddClick={fromSidebar(() => setIsShiftModalOpen(true))}
        onAbsenceClick={fromSidebar(() => setIsAbsenceModalOpen(true))}
        absences={absences}
        period={statsPeriod}
        onPeriodChange={setStatsPeriod}
        monthHours={monthHours}
        monthLoading={monthLoading}
        monthLabel={new Date(getShiftIsoDate(currentWeek, 3) + 'T12:00:00Z').toLocaleDateString(
          language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
        onManageStaffClick={fromSidebar(() => setIsStaffModalOpen(true))}
        onCopyLastWeek={handleCopyLastWeek}
        compliance={complianceList}
        conventionLabel={`${convention.label} — IDCC ${convention.idcc}`}
        onDeleteWeek={handleDeleteWeek}
        onOpenHistory={fromSidebar(() => setIsHistoryModalOpen(true))}
        onExportSnapshot={handleExportSnapshot}
        isReadOnly={isReadOnly}
        isLoading={isLoading}
        onUndo={undo}
        onRedo={redo}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        language={language}
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      />
      <ShiftModal isOpen={isShiftModalOpen} onClose={() => setIsShiftModalOpen(false)} staff={assignableStaff} onAdd={handleAddShift} onCheck={previewViolations} onEmployment={employmentCheck} language={language} />
      <StaffModal 
        isOpen={isStaffModalOpen} 
        onClose={() => setIsStaffModalOpen(false)} 
        staffList={staffList} 
        guestEmails={guestEmails}
        onAdd={(s) => handleUpdateStaffList([...staffList, s])} 
        onUpdate={(s) => handleUpdateStaffList(staffList.map(item => item.id === s.id ? s : item))}
        onAddGuest={handleAddGuest}
        onRemoveGuest={handleRemoveGuest}
        language={language} 
      />
      <EditShiftModal isOpen={!!editingShiftId} onClose={() => setEditingShiftId(null)} shift={editingShift} staffList={staffList} assignableStaff={assignableStaff} onUpdate={updateShift} onRepeat={repeatShift} onCheck={previewViolations} onEmployment={employmentCheck} onDelete={deleteShift} isReadOnly={isReadOnly} language={language} />
      {/* La barre n'existe que pendant une selection : elle occupe le bas de
          l'ecran, et rien ne justifie de manger cette place le reste du temps. */}
      {selectedShiftIds.length > 0 && !isReadOnly && (
        <SelectionBar
          count={selectedShiftIds.length}
          onNudge={nudgeSelected}
          onMoveToDay={moveSelectedToDay}
          onDelete={deleteSelected}
          onClear={clearSelection}
          language={language}
        />
      )}
      <LogHistoryModal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} language={language} />
      <AbsenceModal
        isOpen={isAbsenceModalOpen}
        onClose={() => setIsAbsenceModalOpen(false)}
        staff={assignableStaff}
        absences={absences}
        holidays={holidays}
        days={language === 'fr' ? DAYS_FR : DAYS_EN}
        shortDays={language === 'fr' ? DAYS_FR_SHORT : DAYS_EN_SHORT}
        onAdd={addAbsences}
        onRemove={removeAbsence}
        onToggleHoliday={toggleHoliday}
        language={language}
      />
      <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} language={language} onLanguageChange={setLanguage} viewType={viewType} onViewTypeChange={setViewType} canSeeMyWeek={!!me} />
    </div>
  );
};

export default App;
