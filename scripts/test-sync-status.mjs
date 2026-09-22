// Pastille d'etat a cote du nom de l'application, sans navigateur.
//
// Meme code que `syncStatus` dans utils/helpers.ts, recopie ici faute de pouvoir
// importer un .ts sans etape de compilation — meme convention que les autres tests.

import { loadTs } from './load-ts.mjs';
// Le VRAI code (utils/helpers.ts), plus aucune copie : voir load-ts.mjs.
const { syncStatus } = await loadTs('utils/helpers.ts');
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
