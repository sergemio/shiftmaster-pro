#!/usr/bin/env node
/**
 * Restaurant « Jeu de verite » dans les EMULATEURS locaux : les plannings de
 * scripts/test-verite.mjs, un employe par scenario (« V3 Omar »), pour les
 * relire dans l'application elle-meme. Jamais la production.
 *
 *   node scripts/seed-verite.mjs
 *   Connexion : verite@test.fr / test1234
 *
 * Semaine principale : lundi 21 -> dimanche 27 septembre 2026. Quelques
 * scenarios ont besoin d'autres semaines (V15, V19, V20, V24).
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
if (!/^(127\.0\.0\.1|localhost)/.test(process.env.FIRESTORE_EMULATOR_HOST)) {
  console.error('REFUS : FIRESTORE_EMULATOR_HOST ne vise pas la machine locale.');
  process.exit(2);
}
initializeApp({ projectId: 'demo-shiftmaster' });
const auth = getAuth();
const db = getFirestore();
const now = new Date().toISOString();
const ORG = 'verite';
const UID = 'uid-verite';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#14b8a6', '#84cc16', '#f97316'];
const staff = [];
const rates = {};
const person = (id, name, contractHours = 35, rate = 15) => {
  staff.push({ id, name, email: `${id}@verite.test`, color: COLORS[staff.length % COLORS.length], role: 'staff', contractHours, startDate: '2026-01-01' });
  if (rate) rates[id] = rate;
};
const weeks = {};
let n = 0;
const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4, SAT = 5, SUN = 6;
const put = (weekId, staffId, days, start, end, extra = {}) => {
  for (const dayIndex of days) (weeks[weekId] ||= []).push({ id: `w${++n}`, staffId, dayIndex, startTime: start, endTime: end, ...extra });
};
const W = '2026-09-20', PREV = '2026-09-13', NEXT = '2026-09-27';
const WEEKDAYS = [MON, TUE, WED, THU, FRI];
const pause = (breakStart, breakMinutes) => ({ breakStart, breakMinutes });

person('v1', 'V1 Omar');            put(W, 'v1', WEEKDAYS, 10, 17);
person('v2', 'V2 Omar');            put(W, 'v2', WEEKDAYS, 10, 18, pause(14, 30));
person('v3', 'V3 Omar');            put(W, 'v3', [MON], 10.5, 16.5); put(W, 'v3', [MON], 11.5, 17.5);
person('v4', 'V4 Omar');            put(W, 'v4', [MON], 11, 15); put(W, 'v4', [MON], 18, 23); put(W, 'v4', [TUE], 9, 14);
person('v5', 'V5 Omar');            put(W, 'v5', [MON], 18, 25); put(W, 'v5', [TUE], 10, 15);
person('v6a', 'V6 Alice', 35, 20);  person('v6b', 'V6 Bob', 35, 12);
put(W, 'v6a', [WED], 9, 13); put(W, 'v6b', [WED], 14, 20, { coverageBy: 'v6a' });
person('v7a', 'V7 Alice', 35, 20);  person('v7b', 'V7 Bob', 35, 12);
put(W, 'v7a', [WED], 10, 16); put(W, 'v7b', [WED], 14, 20, { coverageBy: 'v7a' });
person('v8', 'V8 Omar');            put(W, 'v8', [MON], 9, 17, pause(12.5, 20));
person('v9', 'V9 Julie', 24);       put(W, 'v9', [MON, TUE, WED, THU], 10, 17);
person('v11', 'V11 Omar');          put(W, 'v11', [TUE, WED, THU, FRI], 10, 17);
put(W, 'xmon', [MON], 12, 15, { extraName: 'Monique' }); put(W, 'xmon', [MON], 14, 18, { extraName: 'Monique' });
person('v13a', 'V13 avec pause');   put(W, 'v13a', [MON], 8, 20, pause(13, 60));
person('v13b', 'V13 sans pause');   put(W, 'v13b', [MON], 8, 20);
person('v14', 'V14 pause a glisser'); put(W, 'v14', [TUE], 10, 18, pause(14, 30));
person('v15', 'V15 Omar');          put(PREV, 'v15', [MON], 10, 17); put(W, 'v15', [MON], 10, 17);
person('v16a', 'V16 avec taux');    put(W, 'v16a', [MON], 10, 17);
person('v16b', 'V16 sans taux', 35, 0); put(W, 'v16b', [MON], 10, 17);
person('v17', 'V17 Omar');          put(W, 'v17', [MON, TUE, WED, THU, FRI, SAT], 9, 15);
person('v18', 'V18 Omar');          put(W, 'v18', [TUE, WED, THU, FRI, SAT, SUN], 9, 15);
person('v19', 'V19 Omar');          put(W, 'v19', WEEKDAYS, 10, 16); put(W, 'v19', [SAT], 15, 21); put(NEXT, 'v19', [MON], 6, 10);
person('v20', 'V20 Omar');          put(PREV, 'v20', WEEKDAYS, 10, 16); put(W, 'v20', [MON, TUE, WED, THU], 10, 16);
put(W, 'v20', [FRI], 17, 23); put(W, 'v20', [SUN], 9, 15);
person('v21a', 'V21 45 h');         put(W, 'v21a', [MON, TUE, WED, THU, FRI, SAT], 9, 17, pause(13, 30));
person('v21b', 'V21 51 h');         put(W, 'v21b', [MON, TUE, WED, THU, FRI, SAT], 9, 18, pause(13, 30));
person('v22a', 'V22 6 h pile');     put(W, 'v22a', [THU], 9, 15);
person('v22b', 'V22 6 h 30');       put(W, 'v22b', [THU], 9, 15.5);
person('v22c', 'V22 coupure 15 min'); put(W, 'v22c', [THU], 9, 13); put(W, 'v22c', [THU], 13.25, 17);
person('v22d', 'V22 coupure 20 min'); put(W, 'v22d', [THU], 9, 13); put(W, 'v22d', [THU], 13 + 1 / 3, 17);
person('v22e', 'V22 pause 20 min'); put(W, 'v22e', [THU], 9, 17, pause(13, 20));
person('v24a', 'V24 octobre');      put('2026-10-18', 'v24a', [SAT], 18, 23); put('2026-10-18', 'v24a', [SUN], 10, 14);
person('v24b', 'V24 mars');         put('2026-03-22', 'v24b', [SAT], 18, 23); put('2026-03-22', 'v24b', [SUN], 10, 14);

// V11 : 7 h de conges le lundi -> 28 h attendues.
const absence = {
  id: 'abs11', staffId: 'v11', kind: 'cp', start: '2026-09-21', end: '2026-09-21', daysCounted: 1, hoursLost: 7,
  hoursByDate: { '2026-09-21': 7 }, justificatif: 'none', weekIds: [W], createdAt: now, createdBy: UID, updatedAt: now,
};
const weekAbsences = { [W]: [{ id: 'abs11-2026-09-21', staffId: 'v11', dayIndex: 0, kind: 'conge', periodId: 'abs11', hours: 7 }] };

const base = db.collection('orgs').doc(ORG);
for (const sub of ['extras', 'weeks', 'absences', 'drafts', 'logs']) {
  const old = await base.collection(sub).get();
  await Promise.all(old.docs.map(d => d.ref.delete()));
}
await base.set({
  name: 'Jeu de vérité', ownerUid: UID, status: 'active', trialEndsAt: null,
  settings: { timezone: 'Europe/Paris', language: 'fr', openHour: 6, closeHour: 24, convention: '1501' },
  createdAt: now, updatedAt: now,
});
await base.collection('settings').doc('staff').set({ list: staff, guests: [] });
await base.collection('settings').doc('rates').set({ rates, updatedAt: now });
await base.collection('extras').doc('xmon').set({ id: 'xmon', firstName: 'Monique', retained: true, createdAt: now, filledAt: now, lastMission: '2026-09-21', rate: 15 });
await base.collection('absences').doc('abs11').set(absence);
for (const [id, shifts] of Object.entries(weeks)) {
  await base.collection('weeks').doc(id).set({ shifts, absences: weekAbsences[id] || [], holidays: [], updatedAt: now });
}

try { await auth.deleteUser(UID); } catch { /* absent */ }
await auth.createUser({ uid: UID, email: 'verite@test.fr', password: 'test1234', displayName: 'Jeu de verite', emailVerified: true });
await auth.setCustomUserClaims(UID, { orgs: { [ORG]: 'admin' } });
await db.collection('users').doc(UID).set({ email: 'verite@test.fr', orgs: { [ORG]: 'admin' }, createdAt: now });
await db.collection('users').doc(UID).collection('prefs').doc('ui').set({ tourSeen: true, checklistDone: true, updatedAt: now });

console.log(`Jeu de verite : ${staff.length} personnes, ${Object.values(weeks).flat().length} shifts, ${Object.keys(weeks).length} semaines.`);
console.log('Connexion : verite@test.fr / test1234');
