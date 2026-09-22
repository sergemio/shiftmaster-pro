import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Language } from '../types';
import { getTranslation } from '../utils/translations';

/**
 * Visite guidee de la premiere connexion.
 *
 * Pourquoi : un restaurateur qui decouvre l'app ne sait pas par ou commencer
 * (retour de Serge, 21/09/2026). Meme mecanique que la visite de PayVerif, deja
 * validee : un voile sombre, une decoupe claire sur l'element presente, une bulle
 * a cote qui dit ce qu'il fait. Chaque etape vise un VRAI element de l'ecran.
 *
 * Placement (regle « ancre + compartiments ») : la bulle se met sous la cible,
 * sinon au-dessus, a droite, a gauche ; sans place nulle part, en bas de l'ecran.
 * Elle ne deborde jamais. Sans cible (etape de bienvenue), elle est centree.
 *
 * Le composant ne sait rien de l'app : les etapes arrivent toutes faites, avec
 * un `target` (selecteur CSS) et un eventuel `prepare` — ouvrir le tiroir de la
 * barre laterale sur telephone, par exemple.
 */
export interface TourStep {
  /** Selecteur de l'element a eclairer ; absent = bulle centree. */
  target?: string;
  title: string;
  body: string;
  /** Appele en arrivant sur l'etape (ex. ouvrir le tiroir sur telephone). */
  prepare?: () => void;
}

interface Props {
  steps: TourStep[];
  language: Language | string;
  /** Fin de visite. `finished` = « Terminer » ; faux = « Passer » ou Echap. */
  onClose: (finished: boolean) => void;
  /** Libelle du dernier bouton (ex. « Ajouter mon équipe »). */
  finishLabel?: string;
}

const MARGIN = 16;
const GAP = 12;

const GuidedTour: React.FC<Props> = ({ steps, language, onClose, finishLabel }) => {
  const t = getTranslation(language as Language);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  const measure = useCallback(() => {
    // La cible visible : les reglages ont un bouton par taille d'ecran
    // (roue dentee sur telephone, menu du tiroir sur ordinateur).
    const el = step.target
      ? Array.from(document.querySelectorAll<HTMLElement>(step.target)).find(e => e.offsetParent !== null) ?? null
      : null;
    const r = el ? el.getBoundingClientRect() : null;
    setRect(r && r.width > 0 ? r : null);
  }, [step.target]);

  // En arrivant sur une etape : la preparer, puis mesurer — une fois tout de
  // suite, une fois apres l'animation du tiroir (300 ms).
  useEffect(() => {
    step.prepare?.();
    measure();
    const late = window.setTimeout(measure, 350);
    window.addEventListener('resize', measure);
    return () => { window.clearTimeout(late); window.removeEventListener('resize', measure); };
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  // La bulle se place une fois sa taille connue.
  useLayoutEffect(() => {
    const pop = popRef.current;
    if (!pop) return;
    const W = window.innerWidth, H = window.innerHeight, pw = pop.offsetWidth, ph = pop.offsetHeight;
    if (!rect) { setPos({ left: (W - pw) / 2, top: Math.max(MARGIN, (H - ph) / 2) }); return; }
    const R = { l: rect.left - 4, t: rect.top - 4, r: rect.right + 4, b: rect.bottom + 4 };
    const cx = Math.min(Math.max(MARGIN, (R.l + R.r) / 2 - pw / 2), W - pw - MARGIN);
    const cy = Math.min(Math.max(MARGIN, (R.t + R.b) / 2 - ph / 2), H - ph - MARGIN);
    const options: [boolean, number, number][] = [
      [R.b + GAP + ph <= H - MARGIN, cx, R.b + GAP],
      [R.t - GAP - ph >= MARGIN, cx, R.t - GAP - ph],
      [R.r + GAP + pw <= W - MARGIN, R.r + GAP, cy],
      [R.l - GAP - pw >= MARGIN, R.l - GAP - pw, cy],
    ];
    const o = options.find(c => c[0]) || [true, W - pw - MARGIN, H - ph - MARGIN];
    setPos({ left: o[1], top: o[2] });
  }, [rect, i]);

  useEffect(() => { nextRef.current?.focus(); }, [i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!['Escape', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      // Les fleches changent aussi de semaine dans l'app : la visite les garde pour elle.
      e.stopImmediatePropagation(); e.preventDefault();
      if (e.key === 'Escape') onClose(false);
      else if (e.key === 'ArrowRight') setI(n => Math.min(n + 1, steps.length - 1));
      else setI(n => Math.max(n - 1, 0));
    };
    // Capture : la visite passe avant les raccourcis de l'app (Echap ferme les fenetres).
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, steps.length]);

  return (
    <div className="fixed inset-0 z-[300]" data-testid="tour">
      {/* Couche qui bloque les clics sur l'app pendant la visite. */}
      <div className={`absolute inset-0 ${rect ? '' : 'bg-slate-900/60'}`} />
      {rect && (
        <div
          aria-hidden="true"
          className="absolute rounded-xl ring-2 ring-white/80 pointer-events-none transition-all duration-200 motion-reduce:transition-none"
          style={{
            left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.6)',
          }}
        />
      )}
      <div
        ref={popRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="absolute w-[min(340px,calc(100vw-32px))] bg-white rounded-2xl shadow-2xl p-5 flex flex-col gap-2"
        style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
      >
        <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
          {t('tourStep').replace('{n}', String(i + 1)).replace('{total}', String(steps.length))}
        </p>
        <h2 id="tour-title" className="text-base font-bold text-slate-900 text-balance">{step.title}</h2>
        <p className="text-sm text-slate-600 leading-relaxed">{step.body}</p>
        <div className="flex items-center gap-2 pt-2">
          {!last && (
            <button type="button" onClick={() => onClose(false)}
              className="h-9 px-2 text-sm font-semibold text-slate-400 hover:text-slate-600">
              {t('tourSkip')}
            </button>
          )}
          <span className="flex-1" />
          {i > 0 && (
            <button type="button" onClick={() => setI(i - 1)}
              className="h-9 px-3 rounded-lg text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50">
              {t('tourPrev')}
            </button>
          )}
          <button type="button" ref={nextRef}
            onClick={() => (last ? onClose(true) : setI(i + 1))}
            className="h-9 px-4 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
            {last ? (finishLabel || t('tourDone')) : t('tourNext')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GuidedTour;
