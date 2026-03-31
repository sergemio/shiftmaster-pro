
import React, { useState, useMemo } from 'react';
import { Staff, Shift } from '../types';
import { DAYS, START_HOUR, END_HOUR } from '../constants';
import { formatTime } from '../utils/helpers';

interface AutoScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  staff: Staff[];
  onGenerate: (constraints: {
    operatingHours: { day: number, start: number, end: number }[],
    avgShiftLength: number,
    instructions: string
  }) => Promise<void>;
  onStop?: () => void;
  language?: string;
}

const AutoScheduleModal: React.FC<AutoScheduleModalProps> = ({ isOpen, onClose, staff, onGenerate, onStop, language }) => {
  const [instructions, setInstructions] = useState('');
  const [avgShiftLength, setAvgShiftLength] = useState(6);
  const [isDailySpecific, setIsDailySpecific] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Global settings
  const [globalStart, setGlobalStart] = useState(9);
  const [globalEnd, setGlobalEnd] = useState(18);

  // Daily settings
  const [dailyHours, setDailyHours] = useState(
    DAYS.map((_, i) => ({ day: i, start: 9, end: 18 }))
  );

  const timeOptions = useMemo(() => {
    const options = [];
    for (let h = START_HOUR; h <= END_HOUR; h++) {
      for (let m = 0; m < 60; m += 30) {
        if (h === END_HOUR && m > 0) break;
        const val = h + m / 60;
        options.push({ value: val, label: formatTime(val) });
      }
    }
    return options;
  }, []);

  const handleStop = () => {
    onStop?.();
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const operatingHours = isDailySpecific 
      ? dailyHours 
      : DAYS.map((_, i) => ({ day: i, start: globalStart, end: globalEnd }));

    try {
      await onGenerate({
        operatingHours,
        avgShiftLength,
        instructions
      });
      onClose();
    } catch (error) {
      alert("Failed to generate schedule. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const updateDaily = (index: number, field: 'start' | 'end', val: number) => {
    const next = [...dailyHours];
    next[index] = { ...next[index], [field]: val };
    setDailyHours(next);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        <div className="p-8 pb-4 flex justify-between items-start border-b border-slate-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[linear-gradient(135deg,#6366f1,#7c3aed)] rounded-2xl flex items-center justify-center text-white shadow-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">AI Auto-Scheduler</h2>
              <p className="text-sm text-slate-400 font-medium uppercase tracking-widest">Generate a smart draft for the week</p>
            </div>
          </div>
          <button onClick={onClose} disabled={isLoading} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400 disabled:opacity-30">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8 bg-white selection:bg-indigo-100">
          {/* Instructions */}
          <section className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
              Weekly Context & Special Instructions
            </label>
            <textarea
              disabled={isLoading}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Ex: 'Tuesday delivery at 9:30 AM, need extra hands.' or 'Try to keep Chris and Tatiana on different shifts.'"
              className="w-full h-32 px-5 py-4 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none disabled:opacity-50"
            />
          </section>

          {/* Operating Hours */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Operating Hours
              </label>
              {!isLoading && (
                <button 
                  type="button"
                  onClick={() => setIsDailySpecific(!isDailySpecific)}
                  className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1 hover:underline"
                >
                  {isDailySpecific ? 'Set Global Hours' : 'Set Specific Daily Hours'}
                  <svg className={`w-3 h-3 transition-transform ${isDailySpecific ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
              )}
            </div>

            {!isDailySpecific ? (
              <div className="grid grid-cols-2 gap-4 bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100">
                <div>
                  <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-2">Arrival Time</label>
                  <select 
                    disabled={isLoading}
                    value={globalStart}
                    onChange={(e) => setGlobalStart(parseFloat(e.target.value))}
                    className="w-full bg-white border border-indigo-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 outline-none disabled:opacity-50"
                  >
                    {timeOptions.filter(o => o.value < globalEnd).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-2">Departure Time</label>
                  <select 
                    disabled={isLoading}
                    value={globalEnd}
                    onChange={(e) => setGlobalEnd(parseFloat(e.target.value))}
                    className="w-full bg-white border border-indigo-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 outline-none disabled:opacity-50"
                  >
                    {timeOptions.filter(o => o.value > globalStart).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                {DAYS.map((day, idx) => (
                  <div key={day} className="flex items-center gap-4 bg-slate-50 px-4 py-3 rounded-xl border border-slate-100">
                    <span className="w-24 text-xs font-bold text-slate-500 uppercase">{day}</span>
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <select 
                        disabled={isLoading}
                        value={dailyHours[idx].start}
                        onChange={(e) => updateDaily(idx, 'start', parseFloat(e.target.value))}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 outline-none disabled:opacity-50"
                      >
                         {timeOptions.filter(o => o.value < dailyHours[idx].end).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <select 
                        disabled={isLoading}
                        value={dailyHours[idx].end}
                        onChange={(e) => updateDaily(idx, 'end', parseFloat(e.target.value))}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 outline-none disabled:opacity-50"
                      >
                         {timeOptions.filter(o => o.value > dailyHours[idx].start).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Average Shift Length */}
          <section className="space-y-3">
             <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Average Shift Duration Target
              </label>
              <div className="flex gap-2">
                {[4, 5, 6, 7, 8].map(h => (
                  <button
                    disabled={isLoading}
                    key={h}
                    type="button"
                    onClick={() => setAvgShiftLength(h)}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold border-2 transition-all ${avgShiftLength === h ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-500 hover:border-indigo-200'} disabled:opacity-50`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
          </section>
        </form>

        <div className="p-8 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
           {!isLoading ? (
             <>
                <button 
                  type="button"
                  onClick={onClose}
                  className="px-6 py-4 bg-white border border-slate-200 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 transition-all active:scale-95 shadow-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  onClick={handleSubmit}
                  className="px-10 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-3"
                >
                  Generate Schedule ✨
                </button>
             </>
           ) : (
             <button 
                type="button"
                onClick={handleStop}
                className="w-full py-4 bg-red-500 text-white font-black rounded-2xl shadow-lg shadow-red-100 hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center gap-3 animate-in zoom-in-95"
              >
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Stop Generation
              </button>
           )}
        </div>
      </div>
    </div>
  );
};

export default AutoScheduleModal;
