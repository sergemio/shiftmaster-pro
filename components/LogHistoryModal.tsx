import React from 'react';
import { LogEntry } from '../types';

interface LogHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: LogEntry[];
  language: string;
}

const LogHistoryModal: React.FC<LogHistoryModalProps> = ({ isOpen, onClose, logs, language }) => {
  if (!isOpen) return null;

  const getActionColor = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('DELETE')) return 'bg-red-100 text-red-700 border-red-200';
    if (act.includes('CREATE')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (act.includes('UPDATE')) return 'bg-blue-100 text-blue-700 border-blue-200';
    if (act.includes('UNDO') || act.includes('REDO')) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    }).replace(',', '');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-t-[2rem] sm:rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[85vh] sm:h-auto sm:max-h-[85vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-lg font-bold text-slate-800">System Logs</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-lg transition-colors text-slate-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Sticky Table Header - Hidden on mobile */}
        <div className="hidden sm:grid grid-cols-[140px_140px_140px_1fr] bg-slate-100 px-6 py-2 border-b border-slate-200">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Timestamp</span>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Administrator</span>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Action</span>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Details</span>
        </div>

        <div className="flex-1 overflow-y-auto bg-white divide-y divide-slate-50">
          {logs.length === 0 ? (
            <div className="text-center py-20 text-slate-400 font-medium">No activity recorded yet.</div>
          ) : (
            logs.map((log, idx) => (
              <div 
                key={log.id} 
                className={`flex flex-col sm:grid sm:grid-cols-[140px_140px_140px_1fr] sm:items-center px-4 md:px-6 py-3 sm:py-1.5 hover:bg-indigo-50/30 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
              >
                <div className="text-[10px] sm:text-[11px] font-mono text-slate-400 mb-1 sm:mb-0">
                  {formatShortDate(log.timestamp)}
                </div>
                <div className="flex sm:block items-center justify-between mb-2 sm:mb-0">
                  <div className="text-[12px] font-bold text-slate-700 truncate pr-4">
                    {log.userName}
                  </div>
                  <div className="sm:hidden">
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md border uppercase tracking-wider ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </div>
                </div>
                <div className="hidden sm:block pr-4">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border uppercase tracking-wider ${getActionColor(log.action)}`}>
                    {log.action}
                  </span>
                </div>
                <div className="text-[11px] sm:text-[12px] text-slate-600 font-medium italic break-words sm:truncate" title={log.details}>
                  {log.details}
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="px-6 py-3 border-t border-slate-100 bg-white flex justify-between items-center">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Latest {logs.length} operations tracked</p>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Encryption: Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LogHistoryModal;