
import React, { useState } from 'react';

interface AskAiModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (question: string) => Promise<string>;
  onStop?: () => void;
  language?: string;
}

const AskAiModal: React.FC<AskAiModalProps> = ({ isOpen, onClose, onSubmit, onStop, language }) => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setQuestion('');
    setAnswer(null);
    onClose();
  };

  const handleStop = () => {
    onStop?.();
    setIsLoading(false);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setIsLoading(true);
    setAnswer(null);
    try {
      const response = await onSubmit(question);
      setAnswer(response);
    } catch (error) {
      setAnswer("An error occurred while getting insights.");
    } finally {
      setIsLoading(false);
    }
  };

  const formatAnswer = (text: string) => {
    return text.split('\n').map((line, i) => {
      // Basic markdown bold parsing
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const formattedLine = parts.map((part, j) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={j} className="text-indigo-700">{part.slice(2, -2)}</strong>;
        }
        return part;
      });

      return (
        <p key={i} className="mb-2 last:mb-0 leading-relaxed text-slate-700">
          {line.startsWith('- ') || line.startsWith('• ') ? (
            <span className="flex gap-2">
              <span className="text-indigo-400">•</span>
              <span>{formattedLine.slice(1)}</span>
            </span>
          ) : formattedLine}
        </p>
      );
    });
  };

  return (
    <div 
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Interroger l'AI</h2>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {!answer && !isLoading && (
            <p className="text-slate-500 font-medium">Posez une question sur les horaires, les congés ou les heures de l'équipe ce mois-ci.</p>
          )}

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-indigo-600 font-bold animate-pulse uppercase tracking-widest text-xs">Analyse en cours...</p>
            </div>
          )}

          {answer && (
            <div className="bg-indigo-50/50 rounded-2xl p-6 border border-indigo-100 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="text-sm font-black text-indigo-400 uppercase tracking-widest mb-4">Réponse</div>
              <div className="prose prose-slate max-w-none text-sm">
                {formatAnswer(answer)}
              </div>
            </div>
          )}
        </div>

        <div className="p-8 border-t border-slate-100 bg-slate-50">
          <form onSubmit={handleFormSubmit} className="flex gap-3">
            <input 
              autoFocus
              disabled={isLoading}
              type="text" 
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ex: Qui a travaillé le moins d'heures ?"
              className="flex-1 px-5 py-4 bg-white border border-slate-200 rounded-2xl text-base font-medium outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all disabled:opacity-50"
            />
            {isLoading ? (
              <button 
                type="button"
                onClick={handleStop}
                className="px-6 py-4 bg-red-500 text-white font-black rounded-2xl shadow-lg shadow-red-100 hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            ) : (
              <button 
                disabled={!question.trim()}
                type="submit"
                className="px-6 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default AskAiModal;
