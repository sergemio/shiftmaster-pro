// Pastille d'etat a cote du nom de l'application, sans navigateur.
//
// Meme code que `syncStatus` dans utils/helpers.ts, recopie ici faute de pouvoir
// importer un .ts sans etape de compilation — meme convention que les autres tests.

const syncStatus = (s) => {
  if (s.sandbox) return 'sandbox';
  if (s.writeFailed) return 'error';
  if (!s.online) return 'offline';
  if (s.loading || !s.serverConfirmed) return 'syncing';
  if (s.justSaved) return 'saved';
  return 'live';
};

const base = { sandbox: false, writeFailed: false, online: true, loading: false, serverConfirmed: true, justSaved: false };

const cases = [
  ['connecte, confirme par le serveur -> direct', {}, 'live'],
  ['bac a sable -> jamais « direct »', { sandbox: true }, 'sandbox'],
  ['bac a sable meme hors ligne -> bac a sable', { sandbox: true, online: false }, 'sandbox'],
  ['plus de reseau -> hors ligne', { online: false }, 'offline'],
  ['reseau annonce mais contenu sorti du cache -> pas « direct »', { serverConfirmed: false }, 'syncing'],
  ['chargement de la semaine -> synchronisation', { loading: true }, 'syncing'],
  ['enregistrement reussi a l instant -> enregistre', { justSaved: true }, 'saved'],
  ['echec d enregistrement -> erreur, meme si tout le reste va bien', { writeFailed: true, justSaved: true }, 'error'],
  ['echec d enregistrement hors ligne -> l erreur prime', { writeFailed: true, online: false }, 'error'],
  ['hors ligne pendant un chargement -> hors ligne', { online: false, loading: true }, 'offline'],
];

let failed = 0;
for (const [label, patch, expected] of cases) {
  const got = syncStatus({ ...base, ...patch });
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'OK    ' : 'ECHEC '} ${label}${ok ? '' : `  (attendu ${expected}, obtenu ${got})`}`);
}
console.log(failed === 0 ? '\nTOUT PASSE' : `\n${failed} ECHEC(S)`);
process.exit(failed === 0 ? 0 : 1);
