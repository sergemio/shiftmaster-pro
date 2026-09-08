import React, { useState } from 'react';
import { Language } from '../types';
import { exportWeeksData, loadStaffFromFirebase } from '../services/firebaseService';
import { toWeekId } from '../utils/helpers';

interface ExportDataButtonProps {
  language?: Language;
}

/**
 * Export mensuel des donnees, en JSON.
 *
 * Vit dans les reglages et non dans la colonne de droite : c'est une action
 * qu'on utilise quelques fois par an, et elle occupait en permanence une place
 * que le planning utilise tous les jours. Deplace le 08/09/2026 a la demande de
 * Serge — « pourquoi l'avoir en plein milieu de la figure en permanence ? ».
 *
 * Le code est inchange : seul l'endroit ou il s'affiche a bouge.
 */
const ExportDataButton: React.FC<ExportDataButtonProps> = ({ language = 'en' }) => {
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
      // Toutes les semaines qui chevauchent le mois choisi : une semaine a
      // cheval sur deux mois appartient aux deux exports.
      const weekIds: string[] = [];
      const firstDay = new Date(Date.UTC(year, month - 1, 1));
      const startSunday = new Date(firstDay);
      startSunday.setUTCDate(startSunday.getUTCDate() - startSunday.getUTCDay());
      const lastDay = new Date(Date.UTC(year, month, 0));
      const runner = new Date(startSunday);
      while (runner <= lastDay) {
        weekIds.push(toWeekId(runner));
        runner.setUTCDate(runner.getUTCDate() + 7);
      }

      const [weeksData, staffData] = await Promise.all([
        exportWeeksData(weekIds),
        loadStaffFromFirebase(),
      ]);

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        month: exportMonth,
        staff: staffData?.staff || [],
        guests: staffData?.guests || [],
        weeks: weeksData,
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
    </>
  );
};

export default ExportDataButton;
