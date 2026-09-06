// Abonnement Firestore ouvert APRES coup, depuis un appelant synchrone.
//
// React attend une fonction de desabonnement tout de suite, alors que le SDK
// Firestore n'est charge qu'a la demande. Le piege est la : entre l'appel et
// l'arrivee du module, l'effet peut deja avoir ete demonte — un changement
// rapide de semaine, un aller-retour dans les reglages. Sans le drapeau
// `cancelled`, l'ecoute s'ouvrirait apres coup et plus personne ne la fermerait :
// une ecoute Firestore qui survit, c'est de la facturation qui continue.
//
// Meme code que `lazySubscribe` dans services/firebaseService.ts, recopie ici
// faute de pouvoir importer un .ts sans etape de compilation.

const lazySubscribe = (loadModule, open) => {
  let stop = null;
  let cancelled = false;
  loadModule().then(ctx => {
    if (cancelled) return;
    stop = open(ctx);
  });
  return () => {
    cancelled = true;
    stop?.();
    stop = null;
  };
};

let ko = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) ko++;
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${label.padEnd(56)} ${JSON.stringify(got)} (attendu ${JSON.stringify(want)})`);
};

const tick = () => new Promise(r => setTimeout(r, 0));

/** Un faux SDK dont on controle le moment exact ou il "arrive". */
const deferred = () => {
  let resolve;
  const promise = new Promise(r => (resolve = r));
  return { load: () => promise, arrive: () => (resolve({}), tick()) };
};

// ---------------------------------------------------------------- cas nominal
{
  const sdk = deferred();
  let opened = 0, closed = 0;
  const unsub = lazySubscribe(sdk.load, () => { opened++; return () => closed++; });
  check('avant l arrivee du SDK : rien d ouvert', [opened, closed], [0, 0]);
  await sdk.arrive();
  check('SDK arrive : ecoute ouverte', [opened, closed], [1, 0]);
  unsub();
  check('desabonnement : ecoute fermee', [opened, closed], [1, 1]);
}

// ------------------------------------- demontage AVANT l'arrivee du SDK
{
  const sdk = deferred();
  let opened = 0, closed = 0;
  const unsub = lazySubscribe(sdk.load, () => { opened++; return () => closed++; });
  unsub();                       // l'effet est demonte tout de suite
  await sdk.arrive();            // ... et le module arrive apres
  check('demonte avant le SDK : aucune ecoute ouverte', [opened, closed], [0, 0]);
}

// ------------------------------------- double desabonnement
{
  const sdk = deferred();
  let closed = 0;
  const unsub = lazySubscribe(sdk.load, () => () => closed++);
  await sdk.arrive();
  unsub();
  unsub();                       // React peut rappeler le nettoyage
  check('double desabonnement : ferme une seule fois', closed, 1);
}

// ------------------------------------- deux abonnements independants
{
  const a = deferred(), b = deferred();
  const log = [];
  const ua = lazySubscribe(a.load, () => { log.push('a'); return () => log.push('-a'); });
  const ub = lazySubscribe(b.load, () => { log.push('b'); return () => log.push('-b'); });
  await a.arrive();
  ua();
  await b.arrive();
  ub();
  check('deux abonnements ne se marchent pas dessus', log, ['a', '-a', 'b', '-b']);
}

// ------------------------------------- un echec de chargement ne condamne pas
// la session : le prochain appel doit retenter, pas rejouer l'echec memorise.
{
  let attempts = 0;
  let cache = null;
  const load = () => (cache ??= (async () => {
    attempts++;
    if (attempts === 1) throw new Error('reseau coupe');
    return {};
  })().catch(e => { cache = null; throw e; }));

  let failed = false;
  try { await load(); } catch { failed = true; }
  check('1er essai : echec remonte', failed, true);

  let opened = 0;
  const unsub = lazySubscribe(load, () => { opened++; return () => {}; });
  await tick(); await tick();
  check('2e essai : le SDK est retente et l ecoute s ouvre', [attempts, opened], [2, 1]);
  unsub();
}

console.log(ko === 0 ? '\nTOUT PASSE' : `\n${ko} ECHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
