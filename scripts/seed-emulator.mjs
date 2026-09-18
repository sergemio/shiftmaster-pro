#!/usr/bin/env node
/**
 * Remplit les EMULATEURS locaux avec deux faux restaurants, pour essayer
 * l'application multi-clients sans jamais toucher la production.
 *
 *   npm run emu        (terminal 1 : base + authentification locales)
 *   npm run emu:seed   (terminal 2 : ce script)
 *   npm run dev:emu    (terminal 3 : l'app sur http://localhost:3100/shiftmaster-pro/)
 *
 * Refuse de tourner si les emulateurs ne sont pas vises : l'Admin SDK ecrirait
 * sinon dans le vrai projet. Le projet `demo-*` ne peut de toute facon pas etre
 * relie a une vraie base.
 *
 * Comptes (mot de passe commun : test1234) :
 *   serge@test.fr    admin de « Sezam (demo) », abonnement actif
 *   omar@test.fr     employe de « Sezam (demo) »
 *   marc@test.fr     admin de « Le Bistro », essai en cours (10 jours)
 *   lea@test.fr      admin de « Chez Lea », essai TERMINE hier
 *   double@test.fr   employe chez Sezam ET admin du Bistro
 *   perdu@test.fr    compte valide, rattache a aucun restaurant
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
if (!process.env.FIRESTORE_EMULATOR_HOST.startsWith('127.0.0.1') && !process.env.FIRESTORE_EMULATOR_HOST.startsWith('localhost')) {
  console.error('REFUS : FIRESTORE_EMULATOR_HOST ne vise pas la machine locale.');
  process.exit(2);
}

initializeApp({ projectId: 'demo-shiftmaster' });
const auth = getAuth();
const db = getFirestore();
const PASSWORD = 'test1234';
const now = new Date().toISOString();
const DAY = 24 * 3600 * 1000;

// Semaine courante : identifiant = dimanche precedent (convention de l'app).
const sundayBefore = (d) => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); x.setUTCDate(x.getUTCDate() - (x.getUTCDay() === 0 ? 7 : x.getUTCDay())); return x; };
const weekId = sundayBefore(new Date()).toISOString().slice(0, 10);

const ORGS = {
  sezam: {
    doc: { name: 'Sezam (demo)', ownerUid: 'uid-serge', status: 'active', trialEndsAt: null },
    staff: [
      { id: 's1', uid: 'uid-serge', name: 'Serge', email: 'serge@test.fr', color: '#6366f1', role: 'admin', contractHours: 0 },
      { id: 's2', uid: 'uid-omar', name: 'Omar', email: 'omar@test.fr', color: '#22c55e', role: 'staff', contractHours: 35 },
      { id: 's3', uid: 'uid-double', name: 'Double', email: 'double@test.fr', color: '#f59e0b', role: 'staff', contractHours: 20 },
    ],
    rates: { s2: 16.5, s3: 15 },
    shifts: [
      { id: 'z1', staffId: 's2', dayIndex: 0, startTime: 11.5, endTime: 16 },
      { id: 'z2', staffId: 's2', dayIndex: 1, startTime: 18, endTime: 23 },
      { id: 'z3', staffId: 's3', dayIndex: 2, startTime: 12, endTime: 15 },
    ],
  },
  bistro: {
    doc: { name: 'Le Bistro', ownerUid: 'uid-marc', status: 'trialing', trialEndsAt: Timestamp.fromMillis(Date.now() + 10 * DAY) },
    staff: [
      { id: 'b1', name: 'Marc', email: 'marc@test.fr', color: '#ef4444', role: 'admin', contractHours: 0 },
      { id: 'b2', name: 'Julie', email: 'julie@test.fr', color: '#06b6d4', role: 'staff', contractHours: 24 },
    ],
    rates: { b2: 14 },
    shifts: [
      { id: 'y1', staffId: 'b2', dayIndex: 3, startTime: 9, endTime: 14 },
      { id: 'y2', staffId: 'b2', dayIndex: 4, startTime: 9, endTime: 14 },
    ],
  },
  chezlea: {
    doc: { name: 'Chez Lea', ownerUid: 'uid-lea', status: 'trialing', trialEndsAt: Timestamp.fromMillis(Date.now() - DAY) },
    staff: [{ id: 'l1', name: 'Lea', email: 'lea@test.fr', color: '#a855f7', role: 'admin', contractHours: 0 }],
    rates: {},
    shifts: [{ id: 'x1', staffId: 'l1', dayIndex: 5, startTime: 10, endTime: 18 }],
  },
};

const USERS = [
  { uid: 'uid-serge',  email: 'serge@test.fr',  name: 'Serge Demo', orgs: { sezam: 'admin' } },
  { uid: 'uid-omar',   email: 'omar@test.fr',   name: 'Omar Demo',  orgs: { sezam: 'staff' } },
  { uid: 'uid-marc',   email: 'marc@test.fr',   name: 'Marc Demo',  orgs: { bistro: 'admin' } },
  { uid: 'uid-lea',    email: 'lea@test.fr',    name: 'Lea Demo',   orgs: { chezlea: 'admin' } },
  { uid: 'uid-double', email: 'double@test.fr', name: 'Double Demo', orgs: { sezam: 'staff', bistro: 'admin' } },
  { uid: 'uid-perdu',  email: 'perdu@test.fr',  name: 'Perdu Demo', orgs: {} },
];

const SETTINGS = { timezone: 'Europe/Paris', language: 'fr', openHour: 9, closeHour: 23.5, convention: 'hcr' };

for (const [id, o] of Object.entries(ORGS)) {
  const base = db.collection('orgs').doc(id);
  // On efface d'abord les collections que les tests remplissent (extras,
  // invitations) : sinon un jeu de donnees « neuf » garde les fiches de la
  // veille, et on croit avoir un doublon la ou on a un reste.
  for (const sub of ['extras', 'invites', 'weeks', 'drafts', 'logs', 'absences', 'leaveBalances', 'leaveRequests']) {
    const old = await base.collection(sub).get();
    await Promise.all(old.docs.map(d => d.ref.delete()));
  }
  await base.set({ ...o.doc, settings: SETTINGS, createdAt: now, updatedAt: now });
  await base.collection('settings').doc('staff').set({ list: o.staff, guests: [] });
  await base.collection('settings').doc('rates').set({ rates: o.rates, updatedAt: now });
  await base.collection('weeks').doc(weekId).set({ shifts: o.shifts, absences: [], holidays: [], updatedAt: now });
}

for (const u of USERS) {
  try { await auth.deleteUser(u.uid); } catch { /* absent */ }
  await auth.createUser({ uid: u.uid, email: u.email, password: PASSWORD, displayName: u.name, emailVerified: true });
  await auth.setCustomUserClaims(u.uid, Object.keys(u.orgs).length ? { orgs: u.orgs } : {});
  await db.collection('users').doc(u.uid).set({ email: u.email, orgs: u.orgs, createdAt: now });
}

console.log(`Emulateurs remplis : ${Object.keys(ORGS).length} restaurants, ${USERS.length} comptes, semaine ${weekId}.`);
console.log(`Mot de passe de tous les comptes : ${PASSWORD}`);
