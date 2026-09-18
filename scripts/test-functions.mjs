/**
 * Teste les actions serveur (functions/index.js) de bout en bout dans les
 * EMULATEURS : vrais comptes de test, vrais jetons, vraies regles Firestore.
 *
 *   npm run test:functions
 *
 * Chaque cas verifie deux choses : ce que la function repond, ET ce que la
 * personne peut ensuite reellement faire avec son jeton rafraichi (lire,
 * ecrire, ou se voir refuser par les regles).
 */
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeApp as adminInit } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminDb } from 'firebase-admin/firestore';

const PROJECT = 'demo-shiftmaster';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

adminInit({ projectId: PROJECT });
const aauth = adminAuth();
const adb = adminDb();

let failed = 0, n = 0;
const check = (label, ok, extra = '') => {
  n++; if (!ok) failed++;
  console.log((ok ? 'OK     ' : 'ECHEC  ') + label + (!ok && extra ? `  [${extra}]` : ''));
};
const expectCode = async (label, promise, code) => {
  try { await promise; check(label, false, 'aucune erreur'); }
  catch (e) { check(label, e.code === `functions/${code}`, e.code + ' ' + e.message); }
};
const allowed = async (p) => { try { await p; return true; } catch { return false; } };

/** Une personne = une instance d'app client, comme un navigateur separe. */
let seq = 0;
const person = async (email, { verified = true, name } = {}) => {
  const app = initializeApp({ apiKey: 'fake', projectId: PROJECT }, `p${seq++}`);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const fns = getFunctions(app, 'europe-west1'); connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const cred = await createUserWithEmailAndPassword(auth, email, 'test1234');
  await aauth.updateUser(cred.user.uid, { emailVerified: verified, displayName: name || email.split('@')[0] });
  await signOut(auth); await signInWithEmailAndPassword(auth, email, 'test1234');
  const call = (fn, data) => httpsCallable(fns, fn)(data).then(r => r.data);
  const refresh = () => auth.currentUser.getIdTokenResult(true).then(r => r.claims);
  return { app, auth, db, uid: cred.user.uid, call, refresh };
};

const WEEK = { updatedAt: 'x', shifts: [{ id: 'a', staffId: 's', dayIndex: 1, startTime: 10, endTime: 14 }] };
const stamp = Date.now();
const mail = (who) => `${who}.${stamp}@test.fr`;

// ---------------------------------------------------------------------------
console.log('\n--- createOrg ---');
const owner = await person(mail('owner'), { name: 'Nadia' });
const stranger = await person(mail('stranger'));

await expectCode('Nom vide refuse', owner.call('createOrg', { name: '   ' }), 'invalid-argument');
await expectCode('Nom de plus de 80 caracteres refuse', owner.call('createOrg', { name: 'x'.repeat(81) }), 'invalid-argument');
const { orgId } = await owner.call('createOrg', { name: 'Le Petit Zinc', convention: '1979' });
check('Restaurant cree, identifiant lisible', /^le-petit-zinc-[0-9a-f]{6}$/.test(orgId), orgId);
const claims = await owner.refresh();
check('Le createur devient admin dans son jeton', claims.orgs?.[orgId] === 'admin', JSON.stringify(claims));
const org = (await adb.doc(`orgs/${orgId}`).get()).data();
check('Essai de 14 jours', org.status === 'trialing' && Math.round((org.trialEndsAt.toMillis() - Date.now()) / 86400000) === 14);
check('Le createur est proprietaire', org.ownerUid === owner.uid);
const staff = (await adb.doc(`orgs/${orgId}/settings/staff`).get()).data();
check('La fiche equipe contient le createur, admin, rattache a son compte',
  staff.list.length === 1 && staff.list[0].role === 'admin' && staff.list[0].uid === owner.uid && staff.list[0].name === 'Nadia');
check('Le proprietaire ecrit un planning (regles + essai vivant)', await allowed(setDoc(doc(owner.db, `orgs/${orgId}/weeks/2026-09-13`), WEEK)));
check('Un inconnu NE LIT PAS ce restaurant', !(await allowed(getDoc(doc(stranger.db, `orgs/${orgId}/weeks/2026-09-13`)))));
await owner.call('createOrg', { name: 'Deux' }); await owner.call('createOrg', { name: 'Trois' });
await expectCode('Quatrieme restaurant pour le meme compte refuse', owner.call('createOrg', { name: 'Quatre' }), 'resource-exhausted');
const claims3 = await owner.refresh();
check('Trois restaurants cumules dans le meme jeton', Object.keys(claims3.orgs).length === 3 && claims3.orgs[orgId] === 'admin');

// ---------------------------------------------------------------------------
console.log('\n--- acceptInvite ---');
const emp = await person(mail('emp'));
const unverified = await person(mail('unverif'), { verified: false });
// L'admin cree l'invitation depuis l'app : c'est une ecriture soumise aux regles.
const inviteFor = async (email, role, extra = {}) => {
  const token = 'tok' + Math.random().toString(16).slice(2);
  await setDoc(doc(owner.db, `orgs/${orgId}/invites/${token}`), { email, role, createdAt: 'x', createdBy: owner.uid, ...extra });
  return token;
};
// Fiche preexistante sans compte, pour le rattachement par staffId.
await adb.doc(`orgs/${orgId}/settings/staff`).update({
  list: [...staff.list, { id: 'fiche-emp', name: 'Karim', email: '', color: '#22c55e', role: 'staff' }],
});
const tokEmp = await inviteFor(mail('emp'), 'staff', { staffId: 'fiche-emp' });

check('Avant acceptation, l employe NE LIT PAS le planning', !(await allowed(getDoc(doc(emp.db, `orgs/${orgId}/weeks/2026-09-13`)))));
await expectCode('Mauvais compte pour cette invitation refuse', stranger.call('acceptInvite', { orgId, token: tokEmp }), 'permission-denied');
const tokUnv = await inviteFor(mail('unverif'), 'staff');
await expectCode('Adresse non verifiee refusee', unverified.call('acceptInvite', { orgId, token: tokUnv }), 'failed-precondition');
await expectCode('Jeton inconnu refuse', emp.call('acceptInvite', { orgId, token: 'nexistepas' }), 'not-found');
await expectCode('Identifiant de restaurant malforme refuse', emp.call('acceptInvite', { orgId: '../x', token: tokEmp }), 'invalid-argument');
const acc = await emp.call('acceptInvite', { orgId, token: tokEmp });
check('Invitation acceptee avec le role prevu', acc.role === 'staff');
check('L employe a le role dans son jeton', (await emp.refresh()).orgs?.[orgId] === 'staff');
check('L employe LIT le planning', await allowed(getDoc(doc(emp.db, `orgs/${orgId}/weeks/2026-09-13`))));
check('L employe N ECRIT PAS le planning', !(await allowed(setDoc(doc(emp.db, `orgs/${orgId}/weeks/2026-09-13`), WEEK))));
check('L employe NE LIT PAS les couts', !(await allowed(getDoc(doc(emp.db, `orgs/${orgId}/settings/rates`)))));
const staffAfter = (await adb.doc(`orgs/${orgId}/settings/staff`).get()).data().list;
check('Compte rattache a la fiche designee (Karim)', staffAfter.find(s => s.id === 'fiche-emp')?.uid === emp.uid);
check('L invitation est consommee', !(await adb.doc(`orgs/${orgId}/invites/${tokEmp}`).get()).exists);
await expectCode('La meme invitation ne sert pas deux fois', emp.call('acceptInvite', { orgId, token: tokEmp }), 'not-found');

// ---------------------------------------------------------------------------
console.log('\n--- setMemberRole ---');
await expectCode('Un employe ne change pas les roles', emp.call('setMemberRole', { orgId, uid: emp.uid, role: 'admin' }), 'permission-denied');
await expectCode('Un inconnu ne change pas les roles', stranger.call('setMemberRole', { orgId, uid: emp.uid, role: 'admin' }), 'permission-denied');
await expectCode('Le proprietaire ne peut pas etre retrograde', owner.call('setMemberRole', { orgId, uid: owner.uid, role: 'staff' }), 'failed-precondition');
await expectCode('Role inconnu refuse', owner.call('setMemberRole', { orgId, uid: emp.uid, role: 'dieu' }), 'invalid-argument');
await expectCode('Changer le role d un non-membre refuse', owner.call('setMemberRole', { orgId, uid: stranger.uid, role: 'admin' }), 'not-found');
await owner.call('setMemberRole', { orgId, uid: emp.uid, role: 'admin' });
check('Promu admin : le jeton le dit', (await emp.refresh()).orgs?.[orgId] === 'admin');
check('Promu admin : il ecrit le planning', await allowed(setDoc(doc(emp.db, `orgs/${orgId}/weeks/2026-09-13`), WEEK)));
check('Promu admin : il lit les couts', await allowed(getDoc(doc(emp.db, `orgs/${orgId}/settings/rates`))));
await owner.call('setMemberRole', { orgId, uid: emp.uid, role: 'staff' });
check('Retrograde : n ecrit plus', (await emp.refresh(), !(await allowed(setDoc(doc(emp.db, `orgs/${orgId}/weeks/2026-09-13`), WEEK)))));

// ---------------------------------------------------------------------------
console.log('\n--- removeMember ---');
await expectCode('Un employe ne retire personne', emp.call('removeMember', { orgId, uid: owner.uid }), 'permission-denied');
await expectCode('Le proprietaire ne peut pas etre retire', owner.call('removeMember', { orgId, uid: owner.uid }), 'failed-precondition');
await owner.call('removeMember', { orgId, uid: emp.uid });
check('Retire : le role disparait du profil', !(await adb.doc(`users/${emp.uid}`).get()).data().orgs?.[orgId]);
const empClaims = (await aauth.getUser(emp.uid)).customClaims;
check('Retire : le role disparait du jeton', !empClaims?.orgs?.[orgId], JSON.stringify(empClaims));
// Session revoquee : se reconnecter donne un jeton neuf, sans le restaurant.
await signInWithEmailAndPassword(emp.auth, mail('emp'), 'test1234');
check('Retire, reconnecte : NE LIT PLUS le planning', !(await allowed(getDoc(doc(emp.db, `orgs/${orgId}/weeks/2026-09-13`)))));
const staffRemoved = (await adb.doc(`orgs/${orgId}/settings/staff`).get()).data().list;
check('Retire : sa fiche reste (historique), detachee du compte', staffRemoved.some(s => s.id === 'fiche-emp' && !s.uid));

// ---------------------------------------------------------------------------
console.log('\n--- deleteOrg ---');
const tokBack = await inviteFor(mail('emp'), 'staff');
await emp.call('acceptInvite', { orgId, token: tokBack });
await expectCode('Un membre non proprietaire ne supprime pas', emp.call('deleteOrg', { orgId, confirmName: 'Le Petit Zinc' }), 'permission-denied');
await expectCode('Nom de confirmation faux : rien supprime', owner.call('deleteOrg', { orgId, confirmName: 'le petit zinc' }), 'failed-precondition');
check('Apres refus, le restaurant existe toujours', (await adb.doc(`orgs/${orgId}`).get()).exists);
const del = await owner.call('deleteOrg', { orgId, confirmName: 'Le Petit Zinc' });
check('Supprime : la fiche du restaurant a disparu', !(await adb.doc(`orgs/${orgId}`).get()).exists);
check('Supprime : les plannings ont disparu', (await adb.collection(`orgs/${orgId}/weeks`).get()).empty);
check('Supprime : les deux membres detaches', del.membersDetached === 2, JSON.stringify(del));
check('Supprime : plus dans le jeton du proprietaire', !(await owner.refresh()).orgs?.[orgId]);
check('Supprime : ses deux autres restaurants restent', Object.keys((await owner.refresh()).orgs).length === 2);

console.log('\n--- appel sans connexion ---');
{
  const app = initializeApp({ apiKey: 'fake', projectId: PROJECT }, 'anon');
  const fns = getFunctions(app, 'europe-west1'); connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  await expectCode('createOrg sans connexion refuse', httpsCallable(fns, 'createOrg')({ name: 'X' }), 'unauthenticated');
  await deleteApp(app);
}

console.log(`\n${failed === 0 ? `TOUT EST CONFORME (${n} cas)` : failed + ' CAS EN ECHEC sur ' + n}`);
process.exit(failed === 0 ? 0 : 1);
