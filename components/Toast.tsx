import React, { useEffect, useRef, useState } from 'react';
import { Language } from '../types';
import { getTranslation } from '../utils/translations';

/**
 * Message de retour apres une action (Serge, 06/10/2026 : « aujourd'hui on ne
 * sait pas trop si ca marche ou pas »).
 *
 * Meme principe que `askConfirm` : un hote monte une fois (index.tsx), et
 * n'importe quel code ecrit `toast('Shift ajoute')`.
 *
 * - En haut au centre, sous l'en-tete : il ne cache ni les fleches de semaine
 *   ni le retour en arriere.
 * - Succes : coche verte, disparait seul au bout de 3,5 s.
 * - Echec (`kind: 'error'`) : rouge, reste jusqu'a ce qu'on le ferme.
 * - `undo` : bouton « Annuler » pour les suppressions et les actions groupees.
 * Un nouveau message remplace le precedent.
 */
export interface ToastOptions {
  kind?: 'success' | 'error' | 'info';
  undo?: () => void;
  /** Reste affiche jusqu'a ce qu'on le ferme (hors ligne). Les erreurs le sont toujours. */
  sticky?: boolean;
}
interface Item extends ToastOptions { id: number; message: string }

let show: ((item: Item) => void) | null = null;
let seq = 0;

export const toast = (message: string, opts: ToastOptions = {}) => {
  show?.({ id: ++seq, message, ...opts });
};

const appLang = (): Language => {
  try { return (localStorage.getItem('shiftmaster_lang') as Language) || 'fr'; } catch { return 'fr'; }
};

const DURATION = 3500;
/** Duree de la sortie (glisse vers le haut en s'effacant), voir index.css. */
const LEAVE_MS = 180;

export const ToastHost: React.FC = () => {
  const [item, setItem] = useState<Item | null>(null);
  // Le message joue son animation de sortie avant de disparaitre (Serge, 06/10/2026).
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const leaveTimer = useRef<number | undefined>(undefined);

  const close = () => {
    setLeaving(true);
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => { setItem(null); setLeaving(false); }, LEAVE_MS);
  };

  useEffect(() => {
    // Le meme message deux fois de suite (un reglage enregistre champ apres
    // champ) prolonge l'affichage au lieu de rejouer l'apparition.
    show = it => {
      window.clearTimeout(leaveTimer.current);
      setLeaving(false);
      setItem(prev => (prev && prev.message === it.message && prev.kind === it.kind ? { ...it, id: prev.id } : it));
    };
    return () => { show = null; };
  }, []);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (item && item.kind !== 'error' && !item.sticky) {
      // Un peu plus long quand on peut annuler : le temps de lire et de cliquer.
      timer.current = window.setTimeout(close, item.undo ? DURATION + 2000 : DURATION);
    }
    return () => window.clearTimeout(timer.current);
  }, [item]);

  if (!item) return null;
  const t = getTranslation(appLang());
  const error = item.kind === 'error';
  return (
    <div className="fixed inset-x-0 z-[300] flex justify-center px-4 pointer-events-none"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4.5rem)' }}>
      <div key={item.id} role={error ? 'alert' : 'status'} data-testid="toast" data-kind={item.kind || 'success'}
        className={`pointer-events-auto flex items-center gap-3 max-w-full pl-3 pr-2 py-2.5 rounded-xl shadow-lg text-sm font-semibold ${leaving ? 'toast-leave' : 'toast-enter'}
          ${error ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}>
        {error ? (
          <svg className="w-5 h-5 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
        ) : item.kind === 'info' ? (
          <svg className="w-5 h-5 flex-none text-sky-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        ) : (
          <span className="w-5 h-5 flex-none rounded-full bg-emerald-500 grid place-items-center">
            <svg className="w-3 h-3" fill="none" stroke="white" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" /></svg>
          </span>
        )}
        <span className="min-w-0">{item.message}</span>
        {item.undo && (
          <button type="button" onClick={() => { setItem(null); item.undo?.(); }}
            className="flex-none px-2 py-1 rounded-lg text-indigo-300 hover:text-white hover:bg-white/10 font-bold">
            {t('undo')}
          </button>
        )}
        {(error || item.undo || item.sticky) && (
          <button type="button" onClick={close} aria-label={t('close')}
            className="flex-none w-7 h-7 grid place-items-center rounded-lg text-white/60 hover:text-white hover:bg-white/10">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default ToastHost;
