/**
 * Abonnement Firestore depuis un appelant synchrone.
 *
 * React attend une fonction de desabonnement TOUT DE SUITE, alors que le SDK
 * n'est pas encore charge. On rend donc un desabonnement qui couvre les deux cas :
 * si l'effet est demonte avant l'arrivee du module, `cancelled` empeche l'ecoute
 * de s'ouvrir dans le vide — sans lui, un changement rapide de semaine laissait
 * derriere lui des ecoutes que plus personne ne fermait.
 *
 * Dans son propre fichier pour que `scripts/test-lazy-subscribe.mjs` importe le
 * vrai code, sans charger Firebase.
 */
export const lazySubscribeWith = <C>(load: () => Promise<C>, open: (ctx: C) => () => void): (() => void) => {
  let stop: (() => void) | null = null;
  let cancelled = false;
  load().then(ctx => {
    if (cancelled) return;
    stop = open(ctx);
  });
  return () => {
    cancelled = true;
    stop?.();
    stop = null;
  };
};
