
import React from 'react';

interface AiReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: string;
  weekRange: string;
  language: string;
}

const AiReportModal: React.FC<AiReportModalProps> = ({ isOpen, onClose, report, weekRange, language }) => {
  if (!isOpen) return null;

  const handleExportCSV = () => {
    // Basic CSV conversion for the accountant
    const rows = report.split('\n').filter(line => line.trim() !== '');
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(r => `"${r.replace(/"/g, '""')}"`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `payroll_report_${weekRange.replace(/\s/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatReport = (text: string) => {
    return text.split('\n').map((line, i) => {
      // Handle Headers
      if (line.startsWith('####')) {
        return (
          <h4 key={i} className="text-lg font-black text-slate-900 border-b-2 border-slate-100 pb-2 mb-4 mt-8 first:mt-0 uppercase tracking-tight flex items-center gap-2">
            <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
            {line.replace(/^####\s*/, '')}
          </h4>
        );
      }
      
      // Handle Bold text
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const formattedLine = parts.map((part, j) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={j} className="text-indigo-700 font-bold px-1 rounded bg-indigo-50">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });

      return line.trim() === '' ? (
        <div key={i} className="h-2" />
      ) : (
        <p key={i} className="text-slate-600 mb-2 leading-relaxed text-base font-medium">
          {formattedLine}
        </p>
      );
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Rapport de Paie</h2>
              <p className="text-sm text-indigo-600 font-bold uppercase tracking-wider">{weekRange}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors group">
            <svg className="w-6 h-6 text-slate-400 group-hover:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-12 bg-white selection:bg-indigo-100">
          <div className="max-w-none">
            {formatReport(report)}
          </div>
        </div>

        <div className="p-8 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">
              Prêt pour comptabilité
            </p>
          </div>
          <div className="flex gap-3">
             <button 
              onClick={handleExportCSV}
              className="px-6 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-2xl hover:bg-slate-100 transition-all active:scale-95 flex items-center gap-2 shadow-sm"
            >
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              CSV (Sheets)
            </button>
            <button 
              onClick={() => window.print()} 
              className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-md active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Imprimer / PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiReportModal;
