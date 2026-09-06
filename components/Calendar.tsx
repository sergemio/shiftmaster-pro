
import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Shift, Staff, DragState, DragType, Language, Absence, ViewType } from '../types';
import { DAYS_EN, DAYS_FR, DAYS_EN_SHORT, DAYS_FR_SHORT, START_HOUR, END_HOUR, HOUR_HEIGHT, TOTAL_HOURS } from '../constants';
import ShiftCard from './ShiftCard';
import EmployeeView from './EmployeeView';
import MyWeekView from './MyWeekView';
import { getTranslation } from '../utils/translations';
import { getIsoDateString, getNowInTimezone, getWeekStart, getShiftIsoDate, getOrphanReason, findOverlappingShiftIds, staffingPerSlot, formatTime, getWeekRangeLongEn, getIsoWeekNumber } from '../utils/helpers';
import { SEZAM_LOGO_DATA_URI } from '../utils/brandLogo';

// Branded header stamped on top of the grid in the PNG export only.
// Fixed height so it can be added to the capture container's height.
const EXPORT_HEADER_HEIGHT = 76;

/** Pas de la bande d'effectif, en heures. Cale sur le pas des horaires saisis. */
const COVERAGE_SLOT = 0.5;

/**
 * Un motif d'absence = une couleur qui veut dire quelque chose (R5.2).
 * AUCUN ROUGE : un conge n'est pas un incident, et une interface qui crie pour
 * une information normale finit ignoree quand elle crie pour de vrai. L'ambre
 * est reserve a l'arret maladie, seul motif non prevu — le seul qui oblige a
 * recomposer un service.
 */
const ABSENCE_STYLES: Record<string, { cls: string; label: string }> = {
  conge:   { cls: 'bg-sky-100 text-sky-800 border-sky-300',          label: 'absenceConge' },
  maladie: { cls: 'bg-amber-100 text-amber-800 border-amber-300',    label: 'absenceMaladie' },
  repos:   { cls: 'bg-slate-100 text-slate-600 border-slate-300',    label: 'absenceRepos' },
};

interface CalendarProps {
  shifts: Shift[];
  absences?: Absence[];
  holidays?: number[];
  onRemoveAbsence?: (id: string) => void;
  showCoverage?: boolean;
  staff: Staff[];
  currentWeek: Date;
  navDirection?: 'forward' | 'backward' | 'none';
  onUpdateShift: (shift: Shift) => void;
  onAddShift: (staffId: string, dayIndex: number, start: number) => void;
  onEditShift: (shiftId: string) => void;
  isReadOnly?: boolean;
  isLoading?: boolean;
  isExporting?: boolean;
  language?: Language;
  timezone?: string;
  viewType?: ViewType;
  /** L'employe connecte, quand on le connait. Absent pour un invite. */
  me?: Staff | null;
  monthHours?: Record<string, number> | null;
  /** Shifts coches. Non vide = on est en mode selection. */
  selectedShiftIds?: string[];
  onToggleSelect?: (shiftId: string) => void;
}

interface LayoutShift extends Shift {
  columnIndex: number;
  totalColumns: number;
}

const CurrentTimeIndicator: React.FC<{ timezone?: string }> = ({ timezone = 'Europe/Paris' }) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  
  const currentHourDecimal = hour + minute / 60;
  
  // Only show if within the calendar's visible hours
  if (currentHourDecimal < START_HOUR || currentHourDecimal > END_HOUR) {
    return null;
  }

  const top = (currentHourDecimal - START_HOUR) * HOUR_HEIGHT;

  return (
    <div 
      className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
      style={{ top, transform: 'translateY(-50%)' }}
    >
      {/* 3D Triangle Arrow Head */}
      <div className="relative -ml-0.5 filter drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)]">
        <svg width="12" height="14" viewBox="0 0 12 14" className="block">
          <defs>
            <linearGradient id="arrow3dGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#f5d0fe', stopOpacity: 1 }} />
              <stop offset="60%" style={{ stopColor: '#d946ef', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: '#a21caf', stopOpacity: 1 }} />
            </linearGradient>
          </defs>
          <path 
            d="M0 0 L12 7 L0 14 Z" 
            fill="url(#arrow3dGrad)"
          />
        </svg>
      </div>

      {/* 3D Line with Highlight and Glow */}
      <div className="flex-1 h-[2px] bg-fuchsia-500 relative shadow-[0_0_8px_rgba(217,70,239,0.4)]">
        {/* Top edge highlight for 3D effect */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-white/40" />
        {/* Bottom shadow for 3D depth */}
        <div className="absolute inset-x-0 bottom-[-1px] h-[1px] bg-black/10" />
      </div>
    </div>
  );
};

const Calendar: React.FC<CalendarProps> = ({ 
  shifts, 
  absences = [],
  holidays = [],
  onRemoveAbsence,
  showCoverage = true,
  staff, 
  currentWeek, 
  navDirection = 'none',
  onUpdateShift, 
  onAddShift, 
  onEditShift, 
  isReadOnly = false,
  isLoading = false,
  isExporting = false,
  language = 'en',
  timezone = 'Europe/Paris',
  viewType = 'day',
  me = null,
  monthHours = null,
  selectedShiftIds = [],
  onToggleSelect
}) => {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const dayStripRef = useRef<HTMLDivElement>(null);
  const weekId = getIsoDateString(currentWeek);
  const t = getTranslation(language as Language);
  const localizedDays = language === 'fr' ? DAYS_FR : DAYS_EN;
  const shortDays = language === 'fr' ? DAYS_FR_SHORT : DAYS_EN_SHORT;

  // Sur telephone la bande de jours defile horizontalement et n'en montre que
  // cinq ou six. Le jour actif pouvait donc etre hors champ — on regardait une
  // colonne sans pouvoir lire de quel jour il s'agissait, typiquement le
  // dimanche. On le ramene au centre a chaque changement de jour ou de semaine.
  useEffect(() => {
    const strip = dayStripRef.current;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    const btn = strip.querySelectorAll('button')[activeDayIndex] as HTMLElement | undefined;
    if (!btn) return;
    strip.scrollTo({
      left: btn.offsetLeft - (strip.clientWidth - btn.clientWidth) / 2,
      behavior: 'smooth',
    });
  }, [activeDayIndex, weekId]);

  const todayIndex = useMemo(() => {
    const { isoDate, dayIndex } = getNowInTimezone(timezone);
    const weekStartOfNow = getWeekStart(new Date(isoDate));
    if (getIsoDateString(weekStartOfNow) === getIsoDateString(currentWeek)) {
      return dayIndex;
    }
    return -1;
  }, [currentWeek, timezone]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    // Le -1 signifiait « aucun jour a mettre en avant » sur une semaine qui ne
    // contient pas aujourd'hui. Mais sur telephone une seule colonne est rendue,
    // celle dont l'index vaut activeDayIndex : a -1 aucune ne correspondait, et
    // TOUTE semaine autre que la semaine courante paraissait vide — les shifts
    // etaient bien charges, simplement aucune colonne ne les accueillait.
    // On retombe donc sur le lundi, qui reste un jour valide a afficher.
    setActiveDayIndex(todayIndex !== -1 ? todayIndex : 0);
  }, [todayIndex]);

  // Recalcule seulement quand les shifts changent, pas a chaque rendu.
  const overlappingIds = useMemo(() => findOverlappingShiftIds(shifts), [shifts]);

  const processedShifts = useMemo(() => {
    const layoutShifts: LayoutShift[] = [];
    for (let day = 0; day < 7; day++) {
      const dayShifts = shifts
        .filter(s => s.dayIndex === day)
        .sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);

      if (dayShifts.length === 0) continue;

      const clusters: Shift[][] = [];
      let currentCluster: Shift[] = [];
      let clusterMaxEnd = -1;

      dayShifts.forEach(shift => {
        if (shift.startTime < clusterMaxEnd) {
          currentCluster.push(shift);
          clusterMaxEnd = Math.max(clusterMaxEnd, shift.endTime);
        } else {
          if (currentCluster.length > 0) clusters.push(currentCluster);
          currentCluster = [shift];
          clusterMaxEnd = shift.endTime;
        }
      });
      if (currentCluster.length > 0) clusters.push(currentCluster);

      clusters.forEach(cluster => {
        const columns: number[][] = [];
        cluster.forEach(shift => {
          let placed = false;
          for (let i = 0; i < columns.length; i++) {
            const colIndices = columns[i];
            const columnLastShift = cluster.filter((_, idx) => colIndices.includes(idx)).sort((a,b) => b.endTime - a.endTime)[0];
            if (shift.startTime >= columnLastShift.endTime) {
              columns[i].push(cluster.indexOf(shift));
              placed = true;
              break;
            }
          }
          if (!placed) columns.push([cluster.indexOf(shift)]);
        });

        cluster.forEach(shift => {
          const colIdx = columns.findIndex(col => col.includes(cluster.indexOf(shift)));
          layoutShifts.push({
            ...shift,
            columnIndex: colIdx,
            totalColumns: columns.length
          });
        });
      });
    }
    return layoutShifts.sort((a, b) => (a.dayIndex - b.dayIndex) || (a.startTime - b.startTime));
  }, [shifts]);

  const getDayFromX = (x: number, containerWidth: number) => {
    const dayWidth = (containerWidth - 60) / 7;
    return Math.max(0, Math.min(6, Math.floor((x - 60) / dayWidth)));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isReadOnly || !dragState || !gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDragState(prev => prev ? { ...prev, currentX: x, currentY: y } : null);
  };

  const handleMouseUp = () => {
    if (isReadOnly || !dragState || !gridRef.current) {
        setDragState(null);
        return;
    }
    const rect = gridRef.current.getBoundingClientRect();
    const timeDelta = (dragState.currentY - dragState.initialY) / HOUR_HEIGHT;
    const snappedDelta = Math.round(timeDelta * 2) / 2;
    const shift = shifts.find(s => s.id === dragState.shiftId);

    if (shift) {
      if (dragState.dragType === 'move') {
        const finalDay = getDayFromX(dragState.currentX, rect.width);
        const finalStart = Math.max(START_HOUR, Math.min(END_HOUR - (shift.endTime - shift.startTime), dragState.originalStart + snappedDelta));
        const duration = shift.endTime - shift.startTime;
        const finalEnd = Math.min(END_HOUR, finalStart + duration);

        if (finalDay !== dragState.originalDay || finalStart !== dragState.originalStart) {
          onUpdateShift({
            ...shift,
            dayIndex: finalDay,
            startTime: finalStart,
            endTime: finalEnd
          });
        }
      } else if (dragState.dragType === 'resize-top') {
        const finalStart = Math.max(START_HOUR, Math.min(shift.endTime - 0.5, dragState.originalStart + snappedDelta));
        if (finalStart !== dragState.originalStart) {
          onUpdateShift({ ...shift, startTime: finalStart });
        }
      } else if (dragState.dragType === 'resize-bottom') {
        const finalEnd = Math.max(shift.startTime + 0.5, Math.min(END_HOUR, dragState.originalEnd + snappedDelta));
        if (finalEnd !== dragState.originalEnd) {
          onUpdateShift({ ...shift, endTime: finalEnd });
        }
      }
    }
    setDragState(null);
  };

  const animationClass = navDirection === 'forward' 
    ? 'animate-shift-forward' 
    : navDirection === 'backward' 
    ? 'animate-shift-backward' 
    : 'animate-shift-fade';

  const visualStateClass = (isLoading && !isExporting) 
    ? 'opacity-30 blur-[2px] grayscale-[0.5]' 
    : 'opacity-100 blur-0 grayscale-0 shadow-none';

  if (viewType === 'me' && me) {
    const now = getNowInTimezone(timezone);
    return (
      <div className="bg-slate-50 min-h-full overflow-auto">
        <MyWeekView
          shifts={shifts}
          absences={absences}
          holidays={holidays}
          me={me}
          allStaff={staff}
          currentWeek={currentWeek}
          days={localizedDays}
          monthHours={monthHours ? (monthHours[me.id] ?? 0) : null}
          todayIsoDate={now.isoDate}
          nowHour={now.hour + now.minute / 60}
          language={language as Language}
        />
      </div>
    );
  }

  if (viewType === 'employee') {
    return (
      <div className="p-4 md:p-6 bg-slate-50 min-h-full overflow-auto">
        <EmployeeView 
          shifts={shifts} 
          staff={staff} 
          currentWeek={currentWeek} 
          onEditShift={onEditShift} 
          language={language as Language} 
        />
      </div>
    );
  }

  return (
    <div 
      id="calendar-grid-capture"
      ref={gridRef}
      className="relative select-none min-w-0 md:min-w-[1000px] transition-all duration-300 bg-white"
      /* La hauteur etait la somme, ecrite en dur, de l'en-tete et de la grille.
         La bande des absences est venue s'intercaler sans y etre comptee : avec
         deux absences le meme jour, le conteneur debordait de 50px et l'export
         PNG rognait la derniere heure. Chaque morceau porte deja sa propre
         hauteur — on laisse donc le conteneur les additionner, au lieu de tenir
         un total a jour a la main a chaque fois qu'on ajoute une rangee.
         `minHeight` conserve la hauteur d'origine pour qu'une semaine vide
         garde exactement l'allure qu'elle avait. */
      style={{ minHeight: (TOTAL_HOURS + 1) * HOUR_HEIGHT + 64 + (isExporting ? EXPORT_HEADER_HEIGHT : 0) }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {isLoading && !isExporting && (
        <div className="absolute inset-0 z-50 bg-white/40 backdrop-blur-[1px] flex items-start justify-center pt-32 transition-all duration-500 animate-in fade-in">
          <div className="flex flex-col items-center gap-3">
             <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
             <span className="text-xs font-black uppercase tracking-widest text-indigo-600/60">Updating...</span>
          </div>
        </div>
      )}

      {isExporting && (
        <div
          className="flex items-center gap-4 px-5 border-b-2"
          style={{ height: EXPORT_HEADER_HEIGHT, backgroundColor: '#f3faec', borderBottomColor: '#d9edc4' }}
        >
          <img src={SEZAM_LOGO_DATA_URI} alt="Sezam&Co" className="block w-auto" style={{ height: 46 }} />
          <div className="flex-1">
            <div className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: '#417f0a' }}>
              Weekly Schedule
            </div>
            <div className="mt-0.5 text-xl font-extrabold tracking-tight text-slate-800">
              {getWeekRangeLongEn(currentWeek)}
            </div>
          </div>
          <div className="text-right text-xs font-extrabold uppercase tracking-[0.12em] leading-tight text-slate-400 whitespace-nowrap">
            Sezam&amp;Co<br />Week {getIsoWeekNumber(currentWeek)}
          </div>
        </div>
      )}

      <div ref={dayStripRef} className="flex border-b sticky top-0 z-20 bg-white shadow-sm overflow-x-auto hide-scrollbar md:overflow-visible">
        <div className="w-[54px] md:w-[60px] border-r bg-slate-50/50 flex-shrink-0" />
        {localizedDays.map((day, idx) => {
          const date = new Date(currentWeek);
          date.setDate(date.getDate() + idx + 1); // +1: weekStart is Sunday, dayIndex 0 = Monday
          const dayNum = date.getDate();
          const today = new Date();
          const isToday = 
            date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
          const isActive = idx === activeDayIndex;

          return (
            <button 
              key={day} 
              onClick={() => setActiveDayIndex(idx)}
              className={`flex-1 h-12 md:h-14 flex flex-col items-center justify-center border-r last:border-r-0 transition-all min-w-[60px] md:min-w-0 ${isToday ? 'bg-indigo-50/30' : 'bg-white'} ${isActive ? 'bg-indigo-50/50' : ''}`}
            >
              <span className={`font-bold text-xs uppercase tracking-widest ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
                <span className="md:hidden">{shortDays[idx]}</span>
                <span className="hidden md:inline">{day}</span>
              </span>
              <div className={`
                mt-0.5 md:mt-1 w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded-full font-black text-sm md:text-base transition-all
                ${isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 ring-2 md:ring-4 ring-indigo-100/50' : 'text-slate-800'}
                ${isToday && !isActive ? 'border-2 border-indigo-600' : ''}
              `}>
                {dayNum}
              </div>
            </button>
          );
        })}
      </div>

      {/* -------------------------------------------------------------------
          Bande des absences. Elle est SOUS l'en-tete du jour et AU-DESSUS de la
          premiere heure, parce qu'une absence n'a ni debut ni fin : la poser
          dans la grille horaire lui inventerait une plage. Elle n'apparait que
          s'il y a quelque chose a montrer, pour ne pas voler 34px a la grille
          les semaines ordinaires.
          ------------------------------------------------------------------- */}
      {(absences.length > 0 || holidays.length > 0) && (
        <div className="flex border-b bg-white">
          <div className="w-[54px] md:w-[60px] flex-shrink-0 border-r bg-slate-50/50 flex items-center justify-end pr-1 md:pr-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {t('absencesShort')}
            </span>
          </div>
          {localizedDays.map((_, i) => {
            const dayAbsences = absences.filter(a => a.dayIndex === i);
            const isHoliday = holidays.includes(i);
            return (
              <div
                key={i}
                className={`flex-1 border-r last:border-r-0 p-1 flex flex-col gap-1 min-w-0 ${i === activeDayIndex ? 'block' : 'hidden md:flex'}`}
              >
                {isHoliday && (
                  <div className="rounded px-1.5 py-0.5 text-xs font-bold text-center truncate bg-violet-100 text-violet-700 border border-violet-200">
                    {t('publicHoliday')}
                  </div>
                )}
                {dayAbsences.map(a => {
                  const person = staff.find(p => p.id === a.staffId);
                  const style = ABSENCE_STYLES[a.kind] ?? ABSENCE_STYLES.repos;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={isReadOnly || !onRemoveAbsence}
                      onClick={() => onRemoveAbsence?.(a.id)}
                      title={`${person?.name || '?'} — ${t(style.label)}${isReadOnly ? '' : ` · ${t('tapToRemove')}`}`}
                      className={`w-full text-left rounded px-1.5 py-0.5 text-xs font-semibold truncate border ${style.cls} ${isReadOnly ? '' : 'hover:brightness-95 active:scale-[0.98]'} transition-all`}
                      style={{
                        // Hachures : une absence n'est pas un bloc de travail.
                        // La texture le dit avant meme qu'on lise l'etiquette.
                        backgroundImage:
                          'repeating-linear-gradient(-45deg, rgba(255,255,255,.55) 0 5px, transparent 5px 10px)',
                      }}
                    >
                      <span className="font-bold">{person?.name || '?'}</span>
                      <span className="@max-[104px]:hidden"> · {t(style.label)}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* -------------------------------------------------------------------
          Effectif par heure. On voyait les heures PAR EMPLOYE, jamais la
          couverture du service : un trou a 20h un samedi restait invisible.
          Une barre par DEMI-HEURE — pas par heure : tous les horaires tombent sur
          :00 ou :30, donc une barre horaire fusionnait deux realites (une personne
          a 17h00, trois a 17h30 -> affichait 3) et effacait le creux qu'on veut
          justement voir. Hauteur proportionnelle au nombre de presents.
          Les heures sans personne sont laissees en creux plutot que colorees en
          rouge : un service ferme n'est pas une anomalie (R5.3), c'est le vide
          qui doit sauter aux yeux, pas une alerte.
          ------------------------------------------------------------------- */}
      {showCoverage && shifts.length > 0 && (
        <div className="flex border-b bg-white">
          <div className="w-[54px] md:w-[60px] flex-shrink-0 border-r bg-slate-50/50 flex items-center justify-end pr-1 md:pr-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {t('coverageShort')}
            </span>
          </div>
          {localizedDays.map((_, i) => {
            const counts = staffingPerSlot(shifts, i, START_HOUR, END_HOUR, COVERAGE_SLOT * 60);
            const peak = Math.max(1, ...counts);
            return (
              <div
                key={i}
                className={`flex-1 border-r last:border-r-0 px-0.5 py-1 min-w-0 ${i === activeDayIndex ? 'block' : 'hidden md:block'}`}
                title={`${t('coverageTitle')} — ${t('peak')} ${peak}`}
              >
                <div className="flex items-end gap-px h-6">
                  {counts.map((n, h) => (
                    <div
                      key={h}
                      className="flex-1 rounded-sm bg-indigo-200"
                      style={{ height: `${Math.max(6, (n / peak) * 100)}%`, opacity: n === 0 ? 0.25 : 1 }}
                      title={`${formatTime(START_HOUR + h * COVERAGE_SLOT)} — ${n}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex relative bg-white">
        <div className="w-[54px] md:w-[60px] flex-shrink-0 bg-white z-10">
          {Array.from({ length: TOTAL_HOURS + 1 }).map((_, i) => (
            <div key={i} className="border-b text-xs text-gray-400 text-right pr-1 md:pr-2 pt-1 flex flex-col justify-start bg-white" style={{ height: HOUR_HEIGHT }}>
              {String(START_HOUR + i).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        <div className={`flex-1 flex calendar-grid relative transition-all duration-300 bg-white ${visualStateClass}`} key={weekId}>
          {localizedDays.map((_, i) => (
            <div key={i} className={`flex-1 border-r last:border-r-0 h-full relative ${holidays.includes(i) ? 'bg-violet-50/60' : 'bg-transparent'} ${i === activeDayIndex ? 'block' : 'hidden md:block'}`}>
              {i === todayIndex && !isExporting && <CurrentTimeIndicator timezone={timezone} />}
            </div>
          ))}
          
          {processedShifts.map((shift, index) => {
            if (shift.dayIndex !== activeDayIndex && !isExporting) {
              // On mobile, only show shifts for the active day
              // But we need to handle the md:block case
            }
            const isVisibleOnMobile = shift.dayIndex === activeDayIndex;

            const isDraggingThis = dragState?.shiftId === shift.id;
            const staffMember = staff.find(s => s.id === shift.staffId);

            if (!staffMember) return null;

            const shiftIso = getShiftIsoDate(currentWeek, shift.dayIndex);
            const orphanReason = getOrphanReason(staffMember, shiftIso);

            const dayWidthPercentage = 100 / 7;
            const subColumnWidth = dayWidthPercentage / shift.totalColumns;
            
            // Mobile positioning (single day view)
            const mobileLeft = `calc(${(shift.columnIndex * (100 / shift.totalColumns))}% + 2px)`;
            const mobileWidth = `calc(${(100 / shift.totalColumns)}% - 4px)`;

            let top = (shift.startTime - START_HOUR) * HOUR_HEIGHT;
            let left = `calc(${(shift.dayIndex * dayWidthPercentage) + (shift.columnIndex * subColumnWidth)}% + 2px)`;
            let width = `calc(${subColumnWidth}% - 4px)`;
            let height = (shift.endTime - shift.startTime) * HOUR_HEIGHT;

            let previewStartTime = shift.startTime;
            let previewEndTime = shift.endTime;

            if (isDraggingThis && dragState) {
               const timeDelta = (dragState.currentY - dragState.initialY) / HOUR_HEIGHT;
               const snappedDelta = Math.round(timeDelta * 2) / 2;
               
               if (dragState.dragType === 'move') {
                 const rect = gridRef.current?.getBoundingClientRect();
                 const tempStart = Math.max(START_HOUR, Math.min(END_HOUR - (shift.endTime - shift.startTime), shift.startTime + snappedDelta));
                 previewStartTime = tempStart;
                 previewEndTime = tempStart + (shift.endTime - shift.startTime);
                 
                 if (rect) {
                   const tempDay = getDayFromX(dragState.currentX, rect.width);
                   top = (tempStart - START_HOUR) * HOUR_HEIGHT;
                   left = `calc(${(tempDay * dayWidthPercentage)}% + 2px)`;
                   width = `calc(${dayWidthPercentage}% - 4px)`;
                 }
               } else if (dragState.dragType === 'resize-top') {
                 const tempStart = Math.max(START_HOUR, Math.min(shift.endTime - 0.5, shift.startTime + snappedDelta));
                 previewStartTime = tempStart;
                 top = (tempStart - START_HOUR) * HOUR_HEIGHT;
                 height = (shift.endTime - tempStart) * HOUR_HEIGHT;
               } else if (dragState.dragType === 'resize-bottom') {
                 const tempEnd = Math.max(shift.startTime + 0.5, Math.min(END_HOUR, shift.endTime + snappedDelta));
                 previewEndTime = tempEnd;
                 height = (tempEnd - shift.startTime) * HOUR_HEIGHT;
               }
            }

            const staggerClass = `stagger-${(index % 30) + 1}`;

            return (
              <div 
                key={`${shift.id}-${weekId}`} 
                className={`${isExporting ? '' : animationClass} ${isExporting ? '' : staggerClass} ${isVisibleOnMobile ? 'block' : 'hidden md:block'}`}
                style={{
                  position: 'absolute',
                  top,
                  left: isMobile ? mobileLeft : left,
                  width: isMobile ? mobileWidth : width,
                  height,
                  zIndex: isDraggingThis ? 40 : 10,
                  opacity: 1
                }}
              >
                <ShiftCard 
                  shift={shift}
                  staff={staffMember}
                  allStaff={staff}
                  orphanReason={orphanReason}
                  hasOverlap={overlappingIds.has(shift.id)}
                  isReadOnly={isReadOnly}
                  isSelected={selectedShiftIds.includes(shift.id)}
                  selectionMode={selectedShiftIds.length > 0}
                  onToggleSelect={onToggleSelect ? () => onToggleSelect(shift.id) : undefined}
                  onEdit={() => !isReadOnly && onEditShift(shift.id)}
                  renderStartTime={isDraggingThis ? previewStartTime : undefined}
                  renderEndTime={isDraggingThis ? previewEndTime : undefined}
                  language={language}
                  style={{
                    width: '100%',
                    height: '100%',
                    opacity: isDraggingThis ? 0.7 : 1,
                    transition: (isDraggingThis || isExporting) ? 'none' : 'opacity 0.2s ease-out',
                    filter: 'none'
                  }}
                  onDragStart={(e, type) => {
                    if (isReadOnly) return;
                    const rect = gridRef.current?.getBoundingClientRect();
                    if (rect) {
                      setDragState({
                        shiftId: shift.id,
                        initialX: e.clientX - rect.left,
                        initialY: e.clientY - rect.top,
                        currentX: e.clientX - rect.left,
                        currentY: e.clientY - rect.top,
                        originalDay: shift.dayIndex,
                        originalStart: shift.startTime,
                        originalEnd: shift.endTime,
                        dragType: type
                      });
                    }
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Calendar;
