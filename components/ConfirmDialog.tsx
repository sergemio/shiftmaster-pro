import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Language } from '../types';
import { getTranslation } from '../utils/translations';
import { useDismiss } from './useDismiss';

/**
 * Confirmation dans le style de l'app (retour d'Henry, 02/10/2026) : la fenetre
 * du navigateur (`window.confirm`) affichait le nom du site, dans le style du
 * systeme, et cassait le reste de l'interface.
 *
 * Meme principe que l'infobulle : un hote monte une fois (index.tsx), et
 * n'importe quel code ecrit `if (!(await askConfirm(question))) return;`.
 */
interface Request {
  message: string;
  okLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

let show: ((r: Request) => void) | null = null;

export const askConfirm = (message: string, opts: { okLabel?: string; danger?: boolean } = {}): Promise<boolean> =>
  new Promise(resolve => {
    // Hote absent (tests unitaires, page d'action) : repli sur la fenetre du navigateur.
    if (!show) { resolve(window.confirm(message)); return; }
    show({ message, ...opts, resolve });
  });

const appLang = (): Language => {
  try { return (localStorage.getItem('shiftmaster_lang') as Language) || 'fr'; } catch { return 'fr'; }
};

export const ConfirmHost: React.FC = () => {
  const [req, setReq] = useState<Request | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    show = r => setReq(prev => { prev?.resolve(false); return r; });
    return () => { show = null; };
  }, []);
  useEffect(() => { if (req) okRef.current?.focus(); }, [req]);

  const answer = useCallback((ok: boolean) => {
    setReq(prev => { prev?.resolve(ok); return null; });
  }, []);
  const cancel = useCallback(() => answer(false), [answer]);

  if (!req) return null;
  return <Dialog req={req} okRef={okRef} onAnswer={answer} onCancel={cancel} />;
};

const Dialog: React.FC<{
  req: Request;
  okRef: React.RefObject<HTMLButtonElement | null>;
  onAnswer: (ok: boolean) => void;
  onCancel: () => void;
}> = ({ req, okRef, onAnswer, onCancel }) => {
  const backdrop = useDismiss(onCancel);
  const t = getTranslation(appLang());
  return (
    <div {...backdrop} className="fixed inset-0 z-[200] bg-slate-900/40 flex items-center justify-center p-4" data-testid="confirm-dialog">
      <div role="alertdialog" aria-modal="true" aria-describedby="confirm-message"
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 flex flex-col gap-4">
        <p id="confirm-message" className="text-sm font-semibold text-slate-800 leading-relaxed whitespace-pre-line">{req.message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="h-10 px-4 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors">
            {t('cancel')}
          </button>
          <button type="button" ref={okRef} onClick={() => onAnswer(true)}
            className={`h-10 px-4 rounded-xl text-sm font-bold text-white transition-colors ${req.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
            {req.okLabel || t('confirmOk')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmHost;
