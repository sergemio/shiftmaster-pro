
import React from 'react';
import { Language } from '../types';
import { getTranslation } from '../utils/translations';
import { TIMEZONES } from '../constants';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  viewType: 'day' | 'employee';
  onViewTypeChange: (type: 'day' | 'employee') => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  language, 
  onLanguageChange,
  viewType,
  onViewTypeChange
}) => {
  if (!isOpen) return null;
  const t = getTranslation(language);

  return (
    <div className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="p-6 md:p-8 pb-4 flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600">
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
            <h2 className="text-lg md:text-xl font-black text-slate-800 tracking-tight">{t('settings')}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 md:p-8 space-y-6">
          <section className="space-y-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">{t('language')}</label>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => onLanguageChange('en')}
                className={`py-4 rounded-2xl font-bold flex flex-col items-center gap-2 border-2 transition-all ${language === 'en' ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
              >
                <span className="text-2xl">🇺🇸</span>
                <span className="text-xs uppercase tracking-widest">{t('english')}</span>
              </button>
              <button 
                onClick={() => onLanguageChange('fr')}
                className={`py-4 rounded-2xl font-bold flex flex-col items-center gap-2 border-2 transition-all ${language === 'fr' ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
              >
                <span className="text-2xl">🇫🇷</span>
                <span className="text-xs uppercase tracking-widest">{t('french')}</span>
              </button>
            </div>
          </section>

          <section className="space-y-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">{t('viewType')}</label>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => onViewTypeChange('day')}
                className={`py-4 rounded-2xl font-bold flex flex-col items-center gap-2 border-2 transition-all ${viewType === 'day' ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg>
                </div>
                <span className="text-xs uppercase tracking-widest">{t('dayView')}</span>
              </button>
              <button 
                onClick={() => onViewTypeChange('employee')}
                className={`py-4 rounded-2xl font-bold flex flex-col items-center gap-2 border-2 transition-all ${viewType === 'employee' ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                </div>
                <span className="text-xs uppercase tracking-widest">{t('employeeView')}</span>
              </button>
            </div>
          </section>

          <div className="pt-4">
            <button 
              onClick={onClose}
              className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl shadow-lg hover:bg-slate-800 active:scale-95 transition-all text-sm uppercase tracking-widest"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
