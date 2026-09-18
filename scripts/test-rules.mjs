/**
 * Exercise les regles Firestore MULTI-CLIENTS dans l'emulateur local.
 *
 * Les regles sont la seule chose qui garantit qu'un client ne voit pas les
 * donnees d'un autre, et qu'un employe ne voit ni les couts ni les brouillons.
 * Une erreur ne se voit qu'une fois quelqu'un enferme dehors, ou pire, chez le
 * voisin. Donc on les prouve ici, jamais en production :
 *
 *   npx firebase emulators:exec --only firestore --project demo-shiftmaster "node scripts/test-rules.mjs"
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, Timestamp, collection, query, where } from 'firebase/firestore';
import { readFileSync } from 'fs';

const DAY = 24 * 3600 * 1000;
const inDays = (n) => Timestamp.fromDate(new Date(Date.now() + n * DAY));

const SETTINGS = { timezone: 'Europe/Paris', language: 'fr', openHour: 9, closeHour: 23.5, convention: 'hcr' };

// Quatre clients, un par etat d'abonnement.
const ORGS = {
  sezam:   { name: 'Sezam',        ownerUid: 'uid-serge', createdAt: 't', updatedAt: 't', status: 'active',   trialEndsAt: null,        settings: SETTINGS },
  bistro:  { name: 'Le Bistro',    ownerUid: 'uid-marc',  createdAt: 't', updatedAt: 't', status: 'trialing', trialEndsAt: inDays(10),  settings: SETTINGS },
  fini:    { name: 'Essai fini',   ownerUid: 'uid-lea',   createdAt: 't', updatedAt: 't', status: 'trialing', trialEndsAt: inDays(-1),  settings: SETTINGS },
  parti:   { name: 'Parti',        ownerUid: 'uid-jo',    createdAt: 't', updatedAt: 't', status: 'canceled', trialEndsAt: null,        settings: SETTINGS },
  retard:  { name: 'En relance',   ownerUid: 'uid-ana',   createdAt: 't', updatedAt: 't', status: 'past_due', trialEndsAt: null,        settings: SETTINGS },
};

const RATES = { rates: { '3': 18, '5': 16.5 }, updatedAt: '2026-09-10T12:00:00.000Z' };
const VALID_WEEK = {
  updatedAt: '2026-08-09T12:00:00.000Z',
  shifts: [{ id: 'a1', staffId: '3', dayIndex: 2, startTime: 11, endTime: 17 }],
};
const STAFF = { list: [{ id: '3', name: 'Omar', email: 'omar@x.com', color: '#fff', role: 'staff' }] };

const env = await initializeTestEnvironment({
  projectId: 'demo-shiftmaster',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const [id, org] of Object.entries(ORGS)) {
    await setDoc(doc(db, `orgs/${id}`), org);
    await setDoc(doc(db, `orgs/${id}/weeks/2026-08-09`), VALID_WEEK);
    await setDoc(doc(db, `orgs/${id}/drafts/2026-08-09`), VALID_WEEK);
    await setDoc(doc(db, `orgs/${id}/settings/staff`), STAFF);
    await setDoc(doc(db, `orgs/${id}/settings/rates`), RATES);
    await setDoc(doc(db, `orgs/${id}/private/billing`), { stripeCustomerId: 'cus_x' });
    await setDoc(doc(db, `orgs/${id}/logs/x1`), { userId: 'u', userName: 'n', action: 'a', details: 'd', timestamp: 't' });
    await setDoc(doc(db, `orgs/${id}/invites/tok1`), { email: 'new@x.com', role: 'staff', createdAt: 't', createdBy: 'uid-serge' });
  }
  await setDoc(doc(db, 'users/uid-serge'), { email: 'serge@x.com', orgs: { sezam: 'admin' } });
  await setDoc(doc(db, 'users/uid-omar'),  { email: 'omar@x.com',  orgs: { sezam: 'staff' } });
});

// Le role vient du JETON, comme en production (claims poses par les functions).
const as = (uid, claims = {}) =>
  uid
    ? env.authenticatedContext(uid, { email: uid.replace('uid-', '') + '@x.com', email_verified: true, ...claims }).firestore()
    : env.unauthenticatedContext().firestore();

const SERGE   = as('uid-serge',  { orgs: { sezam: 'admin' } });          // admin de Sezam
const OMAR    = as('uid-omar',   { orgs: { sezam: 'staff' } });          // employe de Sezam
const MARC    = as('uid-marc',   { orgs: { bistro: 'admin' } });         // admin d'un client en essai
const LEA     = as('uid-lea',    { orgs: { fini: 'admin' } });           // admin, essai expire
const JO      = as('uid-jo',     { orgs: { parti: 'admin' } });          // admin, abonnement annule
const ANA     = as('uid-ana',    { orgs: { retard: 'admin' } });         // admin, paiement en relance
const DOUBLE  = as('uid-double', { orgs: { sezam: 'staff', bistro: 'admin' } }); // deux orgs, deux roles
const SUPPORT = as('uid-support', { support: true });
const NOBODY  = as('uid-nobody');                                        // connecte, aucun claim
const ANON    = as(null);

let failed = 0;
const check = async (label, promise) => {
  try { await promise; console.log('OK     ' + label); }
  catch (e) { failed++; console.log('ECHEC  ' + label + '  -> ' + e.message.slice(0, 90)); }
};
const W = (org) => `orgs/${org}/weeks/2026-08-09`;

console.log('\n--- isolation entre clients : LA garantie du produit ---');
await check('Serge (admin Sezam) lit le planning Sezam',          assertSucceeds(getDoc(doc(SERGE, W('sezam')))));
await check('Serge NE LIT PAS le planning du Bistro',             assertFails(getDoc(doc(SERGE, W('bistro')))));
await check('Serge N ECRIT PAS chez le Bistro',                   assertFails(setDoc(doc(SERGE, W('bistro')), VALID_WEEK)));
await check('Serge NE LIT PAS l equipe du Bistro',                assertFails(getDoc(doc(SERGE, 'orgs/bistro/settings/staff'))));
await check('Serge NE LIT PAS les couts du Bistro',               assertFails(getDoc(doc(SERGE, 'orgs/bistro/settings/rates'))));
await check('Serge NE LIT PAS la fiche org du Bistro',            assertFails(getDoc(doc(SERGE, 'orgs/bistro'))));
await check('Marc (admin Bistro) lit son planning',               assertSucceeds(getDoc(doc(MARC, W('bistro')))));
await check('Marc NE LIT PAS le planning Sezam',                  assertFails(getDoc(doc(MARC, W('sezam')))));
await check('Membre de deux orgs : staff chez Sezam lit',         assertSucceeds(getDoc(doc(DOUBLE, W('sezam')))));
await check('Membre de deux orgs : staff chez Sezam n ecrit pas', assertFails(setDoc(doc(DOUBLE, W('sezam')), VALID_WEEK)));
await check('Membre de deux orgs : admin du Bistro ecrit',        assertSucceeds(setDoc(doc(DOUBLE, W('bistro')), VALID_WEEK)));
await check('Connecte sans aucun claim ne lit rien',              assertFails(getDoc(doc(NOBODY, W('sezam')))));
await check('Non connecte ne lit rien',                           assertFails(getDoc(doc(ANON, W('sezam')))));
await check('Un claim sur une org inexistante ne donne rien',     assertFails(getDoc(doc(as('uid-x', { orgs: { fantome: 'admin' } }), W('sezam')))));

console.log('\n--- roles dans une org ---');
await check('Admin ecrit un planning',                     assertSucceeds(setDoc(doc(SERGE, W('sezam')), VALID_WEEK)));
await check('Staff lit un planning',                       assertSucceeds(getDoc(doc(OMAR, W('sezam')))));
await check('Staff N ECRIT PAS un planning',               assertFails(setDoc(doc(OMAR, W('sezam')), VALID_WEEK)));
await check('Staff lit l equipe (noms, couleurs)',         assertSucceeds(getDoc(doc(OMAR, 'orgs/sezam/settings/staff'))));
await check('Staff N ECRIT PAS l equipe',                  assertFails(setDoc(doc(OMAR, 'orgs/sezam/settings/staff'), STAFF)));
await check('Admin ecrit l equipe',                        assertSucceeds(setDoc(doc(SERGE, 'orgs/sezam/settings/staff'), STAFF)));
await check('Equipe mal formee refusee',                   assertFails(setDoc(doc(SERGE, 'orgs/sezam/settings/staff'), { list: 'oups' })));
await check('Staff lit la fiche org (nom, statut)',        assertSucceeds(getDoc(doc(OMAR, 'orgs/sezam'))));

console.log('\n--- couts horaires : le secret de l application ---');
await check('Admin lit les couts',                assertSucceeds(getDoc(doc(SERGE, 'orgs/sezam/settings/rates'))));
await check('Staff NE LIT PAS les couts',         assertFails(getDoc(doc(OMAR, 'orgs/sezam/settings/rates'))));
await check('Staff N ECRIT PAS les couts',        assertFails(setDoc(doc(OMAR, 'orgs/sezam/settings/rates'), RATES)));
await check('Admin ecrit les couts',              assertSucceeds(setDoc(doc(SERGE, 'orgs/sezam/settings/rates'), RATES)));
await check('Cout mal forme refuse',              assertFails(setDoc(doc(SERGE, 'orgs/sezam/settings/rates'), { rates: 'oups', updatedAt: 'x' })));
await check('Admin lit la facturation',           assertSucceeds(getDoc(doc(SERGE, 'orgs/sezam/private/billing'))));
await check('Staff NE LIT PAS la facturation',    assertFails(getDoc(doc(OMAR, 'orgs/sezam/private/billing'))));
await check('Admin N ECRIT PAS la facturation',   assertFails(setDoc(doc(SERGE, 'orgs/sezam/private/billing'), { stripeCustomerId: 'cus_moi' })));

console.log('\n--- brouillons : invisibles de l equipe ---');
await check('Admin lit un brouillon',             assertSucceeds(getDoc(doc(SERGE, 'orgs/sezam/drafts/2026-08-09'))));
await check('Staff NE LIT PAS un brouillon',      assertFails(getDoc(doc(OMAR, 'orgs/sezam/drafts/2026-08-09'))));
await check('Staff N ECRIT PAS un brouillon',     assertFails(setDoc(doc(OMAR, 'orgs/sezam/drafts/2026-08-09'), VALID_WEEK)));
await check('Admin ecrit un brouillon',           assertSucceeds(setDoc(doc(SERGE, 'orgs/sezam/drafts/2026-08-09'), VALID_WEEK)));
await check('Brouillon invalide refuse',          assertFails(setDoc(doc(SERGE, 'orgs/sezam/drafts/2026-08-09'), {
  updatedAt: 'x', shifts: [{ id: 'a', staffId: '3', dayIndex: 9, startTime: 11, endTime: 17 }] })));
await check('Staff NE SUPPRIME PAS un brouillon', assertFails(deleteDoc(doc(OMAR, 'orgs/sezam/drafts/2026-08-09'))));
await check('Admin supprime un brouillon',        assertSucceeds(deleteDoc(doc(SERGE, 'orgs/sezam/drafts/2026-08-09'))));

console.log('\n--- abonnement : ce que l etat de l org autorise ---');
await check('Essai en cours : admin ecrit',                   assertSucceeds(setDoc(doc(MARC, W('bistro')), VALID_WEEK)));
await check('Essai EXPIRE : admin lit encore',                assertSucceeds(getDoc(doc(LEA, W('fini')))));
await check('Essai EXPIRE : admin N ECRIT PLUS',              assertFails(setDoc(doc(LEA, W('fini')), VALID_WEEK)));
await check('Essai EXPIRE : plus de brouillon non plus',      assertFails(setDoc(doc(LEA, 'orgs/fini/drafts/2026-08-09'), VALID_WEEK)));
await check('Essai EXPIRE : plus d invitation non plus',      assertFails(setDoc(doc(LEA, 'orgs/fini/invites/tok9'), { email: 'a@b.fr', role: 'staff', createdAt: 't', createdBy: 'uid-lea' })));
await check('Annule : admin lit encore (export possible)',    assertSucceeds(getDoc(doc(JO, W('parti')))));
await check('Annule : admin lit encore l equipe',             assertSucceeds(getDoc(doc(JO, 'orgs/parti/settings/staff'))));
await check('Annule : admin N ECRIT PLUS',                    assertFails(setDoc(doc(JO, W('parti')), VALID_WEEK)));
await check('Paiement en relance : admin ecrit encore',       assertSucceeds(setDoc(doc(ANA, W('retard')), VALID_WEEK)));
await check('Admin NE CHANGE PAS le statut de son org',       assertFails(updateDoc(doc(JO, 'orgs/parti'), { status: 'active' })));
await check('Admin NE PROLONGE PAS son essai',                assertFails(updateDoc(doc(LEA, 'orgs/fini'), { trialEndsAt: inDays(30) })));
await check('Admin NE CHANGE PAS le proprietaire',            assertFails(updateDoc(doc(SERGE, 'orgs/sezam'), { ownerUid: 'uid-omar' })));

console.log('\n--- fiche org : nom et reglages ---');
await check('Admin renomme son org',                         assertSucceeds(updateDoc(doc(SERGE, 'orgs/sezam'), { name: 'Sezam & Co', updatedAt: 't2' })));
await check('Admin change les heures d ouverture',           assertSucceeds(updateDoc(doc(SERGE, 'orgs/sezam'), { settings: { ...SETTINGS, openHour: 8, closeHour: 24 } })));
await check('Admin passe en convention « aucune »',          assertSucceeds(updateDoc(doc(SERGE, 'orgs/sezam'), { settings: { ...SETTINGS, convention: 'none' } })));
await check('Staff NE RENOMME PAS l org',                    assertFails(updateDoc(doc(OMAR, 'orgs/sezam'), { name: 'Chez Omar' })));
await check('Nom vide refuse',                               assertFails(updateDoc(doc(SERGE, 'orgs/sezam'), { name: '' })));
await check('Fermeture avant ouverture refusee',             assertFails(updateDoc(doc(SERGE, 'orgs/sezam'), { settings: { ...SETTINGS, openHour: 20, closeHour: 19 } })));
await check('Heure hors demi-heure refusee',                 assertFails(updateDoc(doc(SERGE, 'orgs/sezam'), { settings: { ...SETTINGS, openHour: 9.25 } })));
await check('Convention IDCC 1979 (HCR) acceptee',              assertSucceeds(updateDoc(doc(SERGE, 'orgs/sezam'), { settings: { ...SETTINGS, convention: '1979' } })));
await check('Convention IDCC 1501 acceptee',                    assertSucceeds(updateDoc(doc(SERGE, 'orgs/sezam'), { settings: { ...SETTINGS, convention: '1501' } })));
await check('Convention inconnue refusee',                   assertFails(updateDoc(doc(SERGE, 'orgs/sezam'), { settings: { ...SETTINGS, convention: 'idcc9999' } })));
await check('Langue inconnue refusee',                       assertFails(updateDoc(doc(SERGE, 'orgs/sezam'), { settings: { ...SETTINGS, language: 'de' } })));
await check('Personne ne cree une org depuis l app',         assertFails(setDoc(doc(SERGE, 'orgs/nouvelle'), ORGS.sezam)));
await check('Personne ne supprime une org depuis l app',     assertFails(deleteDoc(doc(SERGE, 'orgs/sezam'))));

console.log('\n--- vivier d extras : donnees personnelles, admins seulement ---');
const EXTRA = { firstName: 'Monique', retained: true, createdAt: 't', phone: '0600000000', email: 'm@x.fr', rate: 15, filledAt: null };
await check('Admin cree une fiche d extra',                 assertSucceeds(setDoc(doc(SERGE, 'orgs/sezam/extras/x1'), EXTRA)));
await check('Admin lit le vivier',                          assertSucceeds(getDoc(doc(SERGE, 'orgs/sezam/extras/x1'))));
await check('Staff NE LIT PAS le vivier (telephone, paie)', assertFails(getDoc(doc(OMAR, 'orgs/sezam/extras/x1'))));
await check('Staff NE CREE PAS de fiche d extra',           assertFails(setDoc(doc(OMAR, 'orgs/sezam/extras/x2'), EXTRA)));
await check('Un autre restaurant NE LIT PAS ce vivier',     assertFails(getDoc(doc(MARC, 'orgs/sezam/extras/x1'))));
await check('Fiche sans prenom refusee',                    assertFails(setDoc(doc(SERGE, 'orgs/sezam/extras/x3'), { ...EXTRA, firstName: '' })));
await check('Taux negatif refuse',                          assertFails(setDoc(doc(SERGE, 'orgs/sezam/extras/x4'), { ...EXTRA, rate: -5 })));
await check('Fiche minimale acceptee (paie non remplie)',   assertSucceeds(setDoc(doc(SERGE, 'orgs/sezam/extras/x5'), { firstName: 'Karim', retained: false, createdAt: 't' })));
await check('Fiche avec informations de paie acceptee',     assertSucceeds(setDoc(doc(SERGE, 'orgs/sezam/extras/x6'), { ...EXTRA, payroll: { ssn: '1 85 05 75', address: 'Lyon' } })));
await check('Essai EXPIRE : plus de fiche d extra',         assertFails(setDoc(doc(LEA, 'orgs/fini/extras/x9'), EXTRA)));
await check('Admin supprime une fiche d extra',             assertSucceeds(deleteDoc(doc(SERGE, 'orgs/sezam/extras/x5'))));
// Le prenom recopie sur le shift EST lisible par l'equipe : c'est le but.
await check('Shift d extra ecrit avec le prenom',           assertSucceeds(setDoc(doc(SERGE, W('sezam')), {
  updatedAt: 'x', shifts: [{ id: 'e1', staffId: 'x1', dayIndex: 2, startTime: 18, endTime: 23, extraName: 'Monique' }] })));
await check('Staff lit ce shift d extra (donc le prenom)',  assertSucceeds(getDoc(doc(OMAR, W('sezam')))));

console.log('\n--- absences par periode : le motif d un arret est une donnee de sante ---');
const ABS = {
  staffId: '3', staffUid: 'uid-omar', kind: 'maladie', start: '2026-09-16', end: '2026-09-17',
  daysCounted: 2, hoursLost: 8, justificatif: 'received', weekIds: ['2026-09-13'],
  createdAt: 't', createdBy: 'uid-serge', updatedAt: 't',
};
const A = (id, org = 'sezam') => `orgs/${org}/absences/${id}`;
await check('Admin enregistre un arret maladie',                     assertSucceeds(setDoc(doc(SERGE, A('a1')), ABS)));
await check('Admin lit l arret',                                     assertSucceeds(getDoc(doc(SERGE, A('a1')))));
await check('La personne concernee lit SON arret',                   assertSucceeds(getDoc(doc(OMAR, A('a1')))));
await check('La personne concernee liste SES absences (filtre uid)', assertSucceeds(getDocs(query(collection(OMAR, 'orgs/sezam/absences'), where('staffUid', '==', 'uid-omar')))));
await check('Un employe NE LISTE PAS toutes les absences',           assertFails(getDocs(collection(OMAR, 'orgs/sezam/absences'))));
await check('Un collegue NE LIT PAS l arret d un autre',             assertFails(getDoc(doc(DOUBLE, A('a1')))));
await check('Un autre restaurant NE LIT PAS cet arret',              assertFails(getDoc(doc(MARC, A('a1')))));
await check('La personne NE MODIFIE PAS son arret',                  assertFails(updateDoc(doc(OMAR, A('a1')), { hoursLost: 0 })));
await check('Staff NE CREE PAS d absence',                           assertFails(setDoc(doc(OMAR, A('a2')), ABS)));
await check('Fin avant le debut refusee',                            assertFails(setDoc(doc(SERGE, A('a3')), { ...ABS, end: '2026-09-15' })));
await check('Motif inconnu refuse',                                  assertFails(setDoc(doc(SERGE, A('a4')), { ...ABS, kind: 'vacances' })));
await check('Heures negatives refusees',                             assertFails(setDoc(doc(SERGE, A('a5')), { ...ABS, hoursLost: -2 })));
await check('Demi-journee sur plusieurs jours refusee',              assertFails(setDoc(doc(SERGE, A('a6')), { ...ABS, kind: 'cp', half: 'am' })));
await check('Demi-journee sur un seul jour acceptee',                assertSucceeds(setDoc(doc(SERGE, A('a7')), { ...ABS, kind: 'cp', end: '2026-09-16', half: 'am', daysCounted: 0.5 })));
await check('Demi-journee d ARRET refusee (un arret se compte en jours)', assertFails(setDoc(doc(SERGE, A('a7m')), { ...ABS, kind: 'maladie', end: '2026-09-16', half: 'am', daysCounted: 0.5 })));
await check('Detail des heures par jour accepte',                    assertSucceeds(setDoc(doc(SERGE, A('a7h')), { ...ABS, hoursByDate: { '2026-09-16': 7 } })));
await check('Evenement familial SANS note refuse',                  assertFails(setDoc(doc(SERGE, A('a8')), { ...ABS, kind: 'famille' })));
await check('Evenement familial avec note accepte',                  assertSucceeds(setDoc(doc(SERGE, A('a9')), { ...ABS, kind: 'famille', note: 'Mariage' })));
await check('Essai EXPIRE : plus d absence enregistree',             assertFails(setDoc(doc(LEA, A('a1', 'fini')), ABS)));
await check('Admin supprime une absence',                            assertSucceeds(deleteDoc(doc(SERGE, A('a9')))));

// --- Solde de conges lu sur le bulletin : meme confidentialite que les absences ---
const LB = { staffId: 's2', staffUid: 'uid-omar', anchorDate: '2026-08-31', anchorBalance: 12.5, updatedAt: 't', updatedBy: 'uid-serge' };
const B = (id, org = 'sezam') => `orgs/${org}/leaveBalances/${id}`;
await check('Admin enregistre le solde d Omar',                      assertSucceeds(setDoc(doc(SERGE, B('s2')), LB)));
await check('Omar lit SON solde',                                    assertSucceeds(getDoc(doc(OMAR, B('s2')))));
await check('Un collegue NE LIT PAS le solde d Omar',                assertFails(getDoc(doc(DOUBLE, B('s2')))));
await check('Omar NE MODIFIE PAS son solde',                         assertFails(setDoc(doc(OMAR, B('s2')), { ...LB, anchorBalance: 99 })));
await check('Solde range sous un autre salarie refuse',              assertFails(setDoc(doc(SERGE, B('s3')), LB)));
await check('Solde absurde (500 j) refuse',                          assertFails(setDoc(doc(SERGE, B('s2')), { ...LB, anchorBalance: 500 })));
await check('Essai EXPIRE : plus de solde enregistre',               assertFails(setDoc(doc(LEA, B('l1', 'fini')), { ...LB, staffId: 'l1' })));
// L'equipe voit la projection anonymisee dans la semaine : « absent ».
await check('Semaine avec un jour « absent » acceptee',              assertSucceeds(setDoc(doc(SERGE, W('sezam')), {
  ...VALID_WEEK, updatedAt: 'y', absences: [{ id: 'a1-2026-09-16', staffId: '3', dayIndex: 2, kind: 'absent', periodId: 'a1' }] })));
await check('Reglage de decompte en jours ouvres accepte',           assertSucceeds(updateDoc(doc(SERGE, 'orgs/sezam'), { settings: { ...SETTINGS, leaveUnit: 'ouvres' }, updatedAt: 'z' })));
await check('Unite de decompte inconnue refusee',                    assertFails(updateDoc(doc(SERGE, 'orgs/sezam'), { settings: { ...SETTINGS, leaveUnit: 'heures' }, updatedAt: 'z' })));
await check('Feries fermes enregistres dans les reglages',            assertSucceeds(updateDoc(doc(SERGE, 'orgs/sezam'), { settings: { ...SETTINGS, closedHolidays: ['dec25', 'jan1'] }, updatedAt: 'z2' })));
await check('Feries fermes : une liste, pas autre chose',             assertFails(updateDoc(doc(SERGE, 'orgs/sezam'), { settings: { ...SETTINGS, closedHolidays: 'dec25' }, updatedAt: 'z3' })));
await check('Staff NE CHANGE PAS les feries fermes',                  assertFails(updateDoc(doc(OMAR, 'orgs/sezam'), { settings: { ...SETTINGS, closedHolidays: [] }, updatedAt: 'z4' })));

console.log('\n--- demandes de conge (le salarie propose, l admin tranche) ---');
const REQ = { staffId: 's2', staffUid: 'uid-omar', kind: 'cp', start: '2026-10-12', end: '2026-10-17', status: 'pending', createdAt: 't' };
const R = (id, org = 'sezam') => `orgs/${org}/leaveRequests/${id}`;
const FINI_STAFF = as('uid-fs', { orgs: { fini: 'staff' } });
await check('Omar demande des conges',                               assertSucceeds(setDoc(doc(OMAR, R('r1')), REQ)));
await check('Omar lit SA demande',                                   assertSucceeds(getDoc(doc(OMAR, R('r1')))));
await check('Un collegue NE LIT PAS la demande d Omar',              assertFails(getDoc(doc(DOUBLE, R('r1')))));
await check('Admin lit la demande',                                  assertSucceeds(getDoc(doc(SERGE, R('r1')))));
await check('Omar NE DEMANDE PAS au nom d un autre compte',          assertFails(setDoc(doc(OMAR, R('r2')), { ...REQ, staffUid: 'uid-double' })));
await check('Omar NE CREE PAS une demande deja acceptee',            assertFails(setDoc(doc(OMAR, R('r3')), { ...REQ, status: 'accepted' })));
await check('Un arret ne se demande pas (motif maladie refuse)',     assertFails(setDoc(doc(OMAR, R('r4')), { ...REQ, kind: 'maladie' })));
await check('Demi-journee sur plusieurs jours refusee',              assertFails(setDoc(doc(OMAR, R('r5')), { ...REQ, half: 'am' })));
await check('Reprise avant le depart refusee',                       assertFails(setDoc(doc(OMAR, R('r6')), { ...REQ, end: '2026-10-01' })));
await check('Omar NE S ACCORDE PAS sa demande',                      assertFails(updateDoc(doc(OMAR, R('r1')), { status: 'accepted' })));
await check('Admin NE CHANGE PAS les dates demandees',               assertFails(updateDoc(doc(SERGE, R('r1')), { start: '2026-10-13' })));
await check('Admin accepte la demande',                              assertSucceeds(updateDoc(doc(SERGE, R('r1')), { status: 'accepted', decidedAt: 't', decidedBy: 'uid-serge', absenceId: 'a1' })));
await check('Omar NE RETIRE PAS une demande deja tranchee',          assertFails(deleteDoc(doc(OMAR, R('r1')))));
await check('Omar retire une demande en attente',                    assertSucceeds(setDoc(doc(OMAR, R('r7')), REQ).then(() => deleteDoc(doc(OMAR, R('r7'))))));
await check('Admin refuse avec un motif',                            assertSucceeds(setDoc(doc(OMAR, R('r8')), REQ).then(() =>
  updateDoc(doc(SERGE, R('r8')), { status: 'refused', decidedAt: 't', decidedBy: 'uid-serge', reply: 'Semaine de rush' }))));
await check('Admin d un autre restaurant NE LIT PAS la demande',     assertFails(getDoc(doc(MARC, R('r8')))));
await check('Essai EXPIRE : plus de demande de conge',               assertFails(setDoc(doc(FINI_STAFF, R('f1', 'fini')), { ...REQ, staffUid: 'uid-fs' })));

console.log('\n--- invitations ---');
const INVITE = { email: 'nouveau@x.com', role: 'staff', createdAt: 't', createdBy: 'uid-serge' };
await check('Admin cree une invitation',                     assertSucceeds(setDoc(doc(SERGE, 'orgs/sezam/invites/tok2'), INVITE)));
await check('Admin lit ses invitations',                     assertSucceeds(getDoc(doc(SERGE, 'orgs/sezam/invites/tok1'))));
await check('Admin supprime une invitation',                 assertSucceeds(deleteDoc(doc(SERGE, 'orgs/sezam/invites/tok2'))));
await check('Staff NE CREE PAS d invitation',                assertFails(setDoc(doc(OMAR, 'orgs/sezam/invites/tok3'), { ...INVITE, createdBy: 'uid-omar' })));
await check('Staff NE LIT PAS les invitations',              assertFails(getDoc(doc(OMAR, 'orgs/sezam/invites/tok1'))));
await check('Invitation signee par un autre refusee',        assertFails(setDoc(doc(SERGE, 'orgs/sezam/invites/tok4'), { ...INVITE, createdBy: 'uid-omar' })));
await check('Role d invitation inconnu refuse',              assertFails(setDoc(doc(SERGE, 'orgs/sezam/invites/tok5'), { ...INVITE, role: 'dieu' })));
await check('L invite NE LIT PAS son invitation (function)', assertFails(getDoc(doc(NOBODY, 'orgs/sezam/invites/tok1'))));
await check('Invitation jamais modifiee',                    assertFails(updateDoc(doc(SERGE, 'orgs/sezam/invites/tok1'), { role: 'admin' })));

console.log('\n--- journal ---');
await check('Staff lit le journal',                          assertSucceeds(getDoc(doc(OMAR, 'orgs/sezam/logs/x1'))));
await check('Staff ecrit dans le journal en son nom',        assertSucceeds(setDoc(doc(OMAR, 'orgs/sezam/logs/new1'), {
  userId: 'uid-omar', userName: 'Omar', action: 'CREATE SHIFT', details: 'x', timestamp: 't' })));
await check('On ne signe pas un log au nom d un autre',      assertFails(setDoc(doc(OMAR, 'orgs/sezam/logs/new2'), {
  userId: 'uid-serge', userName: 'Serge', action: 'X', details: 'x', timestamp: 't' })));
await check('Le journal ne se modifie pas',                  assertFails(updateDoc(doc(SERGE, 'orgs/sezam/logs/x1'), { details: 'efface' })));
await check('Le journal ne s efface pas',                    assertFails(deleteDoc(doc(SERGE, 'orgs/sezam/logs/x1'))));
await check('Marc NE LIT PAS le journal Sezam',              assertFails(getDoc(doc(MARC, 'orgs/sezam/logs/x1'))));

console.log('\n--- validation du planning (inchangee) ---');
await check('Jour 9 refuse',                assertFails(setDoc(doc(SERGE, W('sezam')), { updatedAt: 'x', shifts: [{ id: 'a', staffId: '3', dayIndex: 9, startTime: 11, endTime: 17 }] })));
await check('Fin avant debut refusee',      assertFails(setDoc(doc(SERGE, W('sezam')), { updatedAt: 'x', shifts: [{ id: 'a', staffId: '3', dayIndex: 2, startTime: 17, endTime: 11 }] })));
await check('Semaine avec absences ok',     assertSucceeds(setDoc(doc(SERGE, W('sezam')), { ...VALID_WEEK, absences: [{ id: 'x1', staffId: '3', dayIndex: 2, kind: 'conge' }], holidays: [6] })));
await check('Motif d absence inconnu refuse', assertFails(setDoc(doc(SERGE, W('sezam')), { ...VALID_WEEK, absences: [{ id: 'x', staffId: '3', dayIndex: 2, kind: 'vacances' }] })));
await check('Plus de 7 feries refuse',      assertFails(setDoc(doc(SERGE, W('sezam')), { ...VALID_WEEK, holidays: [0,1,2,3,4,5,6,7] })));

console.log('\n--- profils users/ ---');
await check('Chacun lit son profil',             assertSucceeds(getDoc(doc(SERGE, 'users/uid-serge'))));
await check('Personne ne lit le profil d un autre', assertFails(getDoc(doc(SERGE, 'users/uid-omar'))));
await check('Personne n ecrit son profil (claims)', assertFails(setDoc(doc(SERGE, 'users/uid-serge'), { orgs: { bistro: 'admin' } })));

console.log('\n--- support : intervenir chez un client sans en etre membre ---');
await check('Support lit chez Sezam',                    assertSucceeds(getDoc(doc(SUPPORT, W('sezam')))));
await check('Support lit chez le Bistro',                assertSucceeds(getDoc(doc(SUPPORT, W('bistro')))));
await check('Support repare un client a l essai expire', assertSucceeds(setDoc(doc(SUPPORT, W('fini')), VALID_WEEK)));
await check('Support lit un profil',                     assertSucceeds(getDoc(doc(SUPPORT, 'users/uid-omar'))));
await check('Support NE CHANGE PAS un statut non plus',  assertFails(updateDoc(doc(SUPPORT, 'orgs/fini'), { status: 'active' })));
await check('Un faux claim support (string) ne passe pas', assertFails(getDoc(doc(as('uid-faux', { support: 'true' }), W('sezam')))));

await check('Collection inconnue fermee',        assertFails(getDoc(doc(SERGE, 'autre/doc'))));
await check('Ancien chemin plat ferme (weeks/)', assertFails(getDoc(doc(SERGE, 'weeks/2026-08-09'))));

await env.cleanup();
console.log(`\n${failed === 0 ? 'TOUT EST CONFORME' : failed + ' CAS EN ECHEC'}`);
process.exit(failed === 0 ? 0 : 1);
