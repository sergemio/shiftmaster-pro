
import React, { useState, useMemo } from 'react';
import { Staff, Language } from '../types';
import { DAYS_EN, DAYS_FR, START_HOUR, END_HOUR } from '../constants';
import { formatTime } from '../utils/helpers';
import { getTranslation } from '../utils/translations';

interface ShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  staff: Staff[];
  onAdd: (staffId: string, dayIndex: number, startTime: number, endTime: number) => void;
  language?: Language;
}

const ShiftModal: React.FC<ShiftModalProps> = ({ isOpen, onClose, staff, onAdd, language = 'en' }) => {
  if (!isOpen) return null;
  // Fix: cast language to Language to avoid string assignability error during translation retrieval
  const t = getTranslation(language as Language);
  const localizedDays = language === 'fr' ? DAYS_FR : DAYS_EN;

  const [selectedStaff, setSelectedStaff] = useState(staff[0]?.id || '');
  const [selectedDay, setSelectedDay] = useState(0);
  const [startTime, setStartTime] = useState(11.5);
  const [endTime, setEndTime] = useState(17.5);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (endTime <= startTime) {
      alert("End time must be after start time");
      return;
    }
    onAdd(selectedStaff, selectedDay, startTime, endTime);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="p-6 md:p-8 pb-4 flex justify-between items-start">
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">{t('createShift')}</h2>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors p-1">
            <svg className="w-6 h-6 md:w-7 md:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 md:p-8 pt-4 space-y-4 md:space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-2">{t('selectStaff')}</label>
            <div className="relative">
              <select 
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
                className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all"
              >
                {staff.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-600 mb-2">{t('dayOfWeek')}</label>
            <div className="relative">
              <select 
                value={selectedDay}
                onChange={(e) => setSelectedDay(parseInt(e.target.value))}
                className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all"
              >
                {localizedDays.map((day, idx) => (
                  <option key={day} value={idx}>{day}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">{t('startTime')}</label>
              <div className="relative">
                <select 
                  value={startTime}
                  onChange={(e) => setStartTime(parseFloat(e.target.value))}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all"
                >
                  {timeOptions.filter(o => o.value < END_HOUR).map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">{t('endTime')}</label>
              <div className="relative">
                <select 
                  value={endTime}
                  onChange={(e) => setEndTime(parseFloat(e.target.value))}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all"
                >
                  {timeOptions.filter(o => o.value > startTime).map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="pt-4 flex gap-4">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-4 border border-slate-200 text-slate-500 font-bold rounded-xl hover:bg-slate-50 transition-all text-base shadow-sm active:scale-95"
            >
              {t('cancel')}
            </button>
            <button 
              type="submit"
              className="flex-1 px-6 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-base active:scale-95"
            >
              {t('addShift')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ShiftModal;
