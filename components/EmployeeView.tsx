
import React, { useMemo } from 'react';
import { Shift, Staff, Language } from '../types';
import { DAYS_EN, DAYS_FR } from '../constants';
import { getTranslation } from '../utils/translations';
import { formatTime } from '../utils/helpers';

interface EmployeeViewProps {
  shifts: Shift[];
  staff: Staff[];
  currentWeek: Date;
  onEditShift: (shiftId: string) => void;
  language: Language;
}

const EmployeeView: React.FC<EmployeeViewProps> = ({
  shifts,
  staff,
  currentWeek,
  onEditShift,
  language
}) => {
  const t = getTranslation(language);
  const localizedDays = language === 'fr' ? DAYS_FR : DAYS_EN;

  const staffWithShifts = useMemo(() => {
    return staff.map(s => {
      const staffShifts = shifts.filter(sh => sh.staffId === s.id);
      const totalHours = staffShifts.reduce((acc, sh) => acc + (sh.endTime - sh.startTime), 0);
      return { ...s, shifts: staffShifts, totalHours };
    }).sort((a, b) => b.totalHours - a.totalHours);
  }, [staff, shifts]);

  return (
    <div className="min-w-[1000px] bg-white border rounded-xl overflow-hidden shadow-sm animate-in fade-in duration-500">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b">
            <th className="p-4 text-left border-r w-[200px] sticky left-0 bg-slate-50 z-10">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('manageStaff')}</span>
            </th>
            <th className="p-4 text-left border-r w-[150px] sticky left-[200px] bg-slate-50 z-10 hidden md:table-cell">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Poste</span>
            </th>
            {localizedDays.map((day, idx) => {
              const date = new Date(currentWeek);
              date.setDate(date.getDate() + idx);
              return (
                <th key={day} className="p-4 text-center border-r last:border-r-0 min-w-[120px]">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{day}</span>
                    <span className="text-lg font-black text-slate-800">{date.getDate()}</span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {staffWithShifts.map((member) => (
            <tr key={member.id} className="border-b last:border-b-0 hover:bg-slate-50/50 transition-colors">
              <td className="p-4 border-r sticky left-0 bg-white z-10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm"
                    style={{ backgroundColor: member.color }}
                  >
                    {member.name.charAt(0)}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-sm font-bold text-slate-800 leading-none">{member.name}</span>
                      <span className={`text-[8px] px-1 py-0.5 rounded uppercase font-black tracking-widest ${member.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                        {member.role}
                      </span>
                    </div>
                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-tighter self-start">
                      {member.totalHours.toFixed(1)}h / {member.targetHours}h
                    </span>
                  </div>
                </div>
              </td>
              <td className="p-4 border-r sticky left-[200px] bg-white z-10 hidden md:table-cell">
                <span className="text-xs font-medium text-slate-500 italic">
                  {member.jobTitle || '—'}
                </span>
              </td>
              {Array.from({ length: 7 }).map((_, dayIdx) => {
                const dayShifts = member.shifts.filter(s => s.dayIndex === dayIdx);
                return (
                  <td key={dayIdx} className="p-2 border-r last:border-r-0 align-top min-h-[80px]">
                    <div className="space-y-2">
                      {dayShifts.map(shift => (
                        <div 
                          key={shift.id}
                          onClick={() => onEditShift(shift.id)}
                          className="p-2 rounded-lg border-l-4 shadow-sm cursor-pointer hover:scale-[1.02] active:scale-95 transition-all group relative overflow-hidden"
                          style={{ 
                            backgroundColor: `${member.color}15`, 
                            borderColor: member.color 
                          }}
                        >
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-800">
                              {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
                            </span>
                            <span className="text-[9px] font-medium text-slate-500 uppercase tracking-tight">
                              {(shift.endTime - shift.startTime).toFixed(1)}h
                            </span>
                          </div>
                          {shift.notes && (
                            <div className="mt-1 pt-1 border-t border-slate-200/50">
                              <p className="text-[8px] text-slate-400 italic truncate">{shift.notes}</p>
                            </div>
                          )}
                          {shift.coverageBy && (
                            <div className="absolute top-1 right-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default EmployeeView;
