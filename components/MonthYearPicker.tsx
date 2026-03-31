
import React, { useState } from 'react';
import { Language } from '../types';
import { getTranslation } from '../utils/translations';

interface MonthYearPickerProps {
  selectedDate: Date;
  onSelect: (month: number, year: number) => void;
  onJumpToToday: () => void;
  language?: Language;
}

const MONTHS_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const MONTHS_FR = [
  'Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 
  'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'
];

const MonthYearPicker: React.FC<MonthYearPickerProps> = ({ selectedDate, onSelect, onJumpToToday, language = 'en' }) => {
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const currentMonth = selectedDate.getMonth();
  const currentYear = selectedDate.getFullYear();
  // Fix: cast language to Language to avoid string assignability error during translation retrieval
  const t = getTranslation(language as Language);
  const localizedMonths = language === 'fr' ? MONTHS_FR : MONTHS_EN;

  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 w-64 animate-in fade-in zoom-in-95 duration-200 origin-top">
      <div className="flex items-center justify-between mb-4 px-1">
        <button 
          onClick={() => setViewYear(v => v - 1)}
          className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="font-bold text-slate-800 text-lg">{viewYear}</span>
        <button 
          onClick={() => setViewYear(v => v + 1)}
          className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {localizedMonths.map((month, idx) => {
          const isSelected = idx === currentMonth && viewYear === currentYear;
          return (
            <button
              key={month}
              onClick={() => onSelect(idx, viewYear)}
              className={`
                py-3 rounded-xl text-sm font-bold transition-all
                ${isSelected 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                  : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}
              `}
            >
              {month}
            </button>
          );
        })}
      </div>
      
      <div className="mt-4 pt-3 border-t border-slate-100">
        <button 
          onClick={onJumpToToday}
          className="w-full py-2 text-xs font-black text-indigo-600 uppercase tracking-widest hover:bg-indigo-50 rounded-lg transition-colors"
        >
          {t('returnToday')}
        </button>
      </div>
    </div>
  );
};

export default MonthYearPicker;
