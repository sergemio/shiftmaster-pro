import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

const DELAY_MS = 300;
const GAP = 8;      // entre l'element et la bulle
const MARGIN = 8;   // distance minimale aux bords de l'ecran

/**
 * Infobulle unique de l'application.
 *
 * L'infobulle native du navigateur (attribut `title`) s'affiche sur une seule
 * ligne qui peut traverser l'ecran, dans le style du systeme, sans rien qui dise
 * « ceci est une aide ». Serge a demande le 13/09/2026 que TOUTES les aides au
 * survol aient le meme style : bulle sombre, pictogramme d'information, texte
 * qui passe a la ligne.
 *
 * Plutot que de remplacer les ~30 `title` un par un (et d'oublier les suivants),
 * ce composant, monte une fois, prend la main sur tout element porteur de `title` :
 * au survol, il deplace le texte dans `data-tip` — ce qui empeche la bulle native
 * de s'afficher — puis affiche la sienne. Un bouton sans texte visible garde son
 * nom accessible via `aria-label`. On continue donc d'ecrire `title="..."` partout.
 *
 * Souris seulement : sur un ecran tactile il n'y a pas de survol, et un appui ne
 * doit pas faire surgir une bulle au moment d'agir.
 *
 * Placement : au-dessus de l'element et centree ; en dessous s'il n'y a pas la
 * place ; toujours ramenee a l'interieur de l'ecran, jamais coupee.
 */
const Tooltip: React.FC = () => {
  const [tip, setTip] = useState<{ text: string; rect: DOMRect } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const bubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: number | undefined;
    let current: HTMLElement | null = null;

    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTip(null);
      setPos(null);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[title], [data-tip]') ?? null;
      if (el === current && !el?.hasAttribute('title')) return;
      hide();
      if (!el) return;
      const native = el.getAttribute('title');
      if (native !== null) {
        el.removeAttribute('title');
        el.dataset.tip = native;
        if (!el.getAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', native);
      }
      const text = el.dataset.tip?.trim();
      if (!text) return;
      current = el;
      timer = window.setTimeout(() => {
        if (current === el && el.isConnected) setTip({ text, rect: el.getBoundingClientRect() });
      }, DELAY_MS);
    };

    const onOut = (e: PointerEvent) => { if (!e.relatedTarget) hide(); };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tip || !bubble.current) return;
    const b = bubble.current.getBoundingClientRect();
    let top = tip.rect.top - GAP - b.height;
    if (top < MARGIN) top = tip.rect.bottom + GAP;
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - MARGIN - b.height));
    let left = tip.rect.left + tip.rect.width / 2 - b.width / 2;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - MARGIN - b.width));
    setPos({ left, top });
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={bubble}
      role="tooltip"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      className="fixed z-[1000] pointer-events-none max-w-[21rem] flex items-start gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium leading-snug text-slate-100 shadow-lg whitespace-pre-line"
    >
      <svg className="w-4 h-4 flex-shrink-0 text-sky-300" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" clipRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" />
      </svg>
      <span>{tip.text}</span>
    </div>
  );
};

export default Tooltip;
