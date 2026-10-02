import { useEffect, useRef } from 'react';
import type React from 'react';

/**
 * Fermer une fenetre comme « Annuler » : clic sur le fond sombre, ou touche Echap.
 * (29/09/2026 : les fenetres de shift ne se fermaient ni l'un ni l'autre.)
 *
 * Le clic ne ferme que s'il COMMENCE et FINIT sur le fond. Sans ce garde-fou,
 * selectionner le texte d'un champ en glissant la souris hors de la fenetre
 * la fermait au relachement, et tout ce qui avait ete saisi etait perdu.
 *
 * A etaler sur le fond : `<div {...backdrop} className="fixed inset-0 ...">`.
 */
export function useDismiss(onClose: () => void) {
  const pressedOnBackdrop = useRef(false);
  // Un shift s'ouvre d'un simple clic (02/10/2026) ; qui double-clique par
  // habitude enverrait son second clic sur le fond et refermerait aussitot.
  // Un clic sur le fond dans les 400 ms qui suivent l'ouverture est ignore.
  const openedAt = useRef(Date.now());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return {
    onMouseDown: (e: React.MouseEvent) => { pressedOnBackdrop.current = e.target === e.currentTarget; },
    onClick: (e: React.MouseEvent) => {
      if (pressedOnBackdrop.current && e.target === e.currentTarget && Date.now() - openedAt.current > 400) onClose();
      pressedOnBackdrop.current = false;
    },
  };
}
