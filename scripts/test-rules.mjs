/**
 * Exercises firestore.rules in the local emulator BEFORE publishing.
 *
 * Rules are the one change that can lock the whole team out of the app, and a
 * mistake only shows once nobody can work. Run inside the emulator so the real
 * database is never touched:
 *
 *   npx firebase emulators:exec --only firestore --project demo-shiftmaster "node scripts/test-rules.mjs"
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const STAFF = {
  list: [],
  admins: ['serge@x.com', 'tatiana@x.com', 'sinar@x.com'],
  staffEmails: ['serge@x.com', 'tatiana@x.com', 'sinar@x.com', 'omar@x.com', 'parthavi@x.com'],
  guests: ['invite@x.com'],
};

const VALID_WEEK = {
  updatedAt: '2026-08-09T12:00:00.000Z',
  shifts: [{ id: 'a1', staffId: '3', dayIndex: 2, startTime: 11, endTime: 17 }],
};

const env = await initializeTestEnvironment({
  projectId: 'demo-shiftmaster',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});

// Seed settings/staff with rules disabled, so get() has something to read.
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'settings/staff'), STAFF);
  await setDoc(doc(ctx.firestore(), 'weeks/2026-08-09'), VALID_WEEK);
  await setDoc(doc(ctx.firestore(), 'logs/x1'), {
    userId: 'u', userName: 'n', action: 'a', details: 'd', timestamp: 't',
  });
});

const as = (email) =>
  email
    ? env.authenticatedContext('uid-' + email, { email, email_verified: true }).firestore()
    : env.unauthenticatedContext().firestore();

let failed = 0;
const check = async (label, promise) => {
  try { await promise; console.log('OK     ' + label); }
  catch (e) { failed++; console.log('ECHEC  ' + label + '  -> ' + e.message.slice(0, 90)); }
};

const SERGE = 'serge@x.com', OMAR = 'omar@x.com', GUEST = 'invite@x.com', STRANGER = 'nimporte@gmail.com';

await check('Serge (admin) lit un planning',        assertSucceeds(getDoc(doc(as(SERGE), 'weeks/2026-08-09'))));
await check('Serge (admin) ecrit un planning',      assertSucceeds(setDoc(doc(as(SERGE), 'weeks/2026-08-09'), VALID_WEEK)));
await check('Omar (staff) lit un planning',         assertSucceeds(getDoc(doc(as(OMAR), 'weeks/2026-08-09'))));
await check('Omar (staff) NE PEUT PAS ecrire',      assertFails(setDoc(doc(as(OMAR), 'weeks/2026-08-09'), VALID_WEEK)));
await check('Invite lit un planning',               assertSucceeds(getDoc(doc(as(GUEST), 'weeks/2026-08-09'))));
await check('INCONNU ne lit PAS les plannings',     assertFails(getDoc(doc(as(STRANGER), 'weeks/2026-08-09'))));
await check('INCONNU n ecrit PAS les plannings',    assertFails(setDoc(doc(as(STRANGER), 'weeks/2026-08-09'), VALID_WEEK)));
await check('INCONNU ne lit PAS les emails equipe', assertFails(getDoc(doc(as(STRANGER), 'settings/staff'))));
await check('Non connecte ne lit rien',             assertFails(getDoc(doc(as(null), 'weeks/2026-08-09'))));
await check('Equipe lit le journal',                assertSucceeds(getDoc(doc(as(OMAR), 'logs/x1'))));
await check('INCONNU ne lit PAS le journal',        assertFails(getDoc(doc(as(STRANGER), 'logs/x1'))));
await check('Equipe ecrit dans le journal',         assertSucceeds(setDoc(doc(as(OMAR), 'logs/new1'), {
  userId: 'uid-' + OMAR, userName: 'Omar', action: 'CREATE SHIFT', details: 'x', timestamp: 't' })));
await check('On ne peut pas signer un log au nom d un autre', assertFails(setDoc(doc(as(OMAR), 'logs/new2'), {
  userId: 'uid-' + SERGE, userName: 'Serge', action: 'X', details: 'x', timestamp: 't' })));
await check('Planning invalide refuse (jour 9)',    assertFails(setDoc(doc(as(SERGE), 'weeks/2026-08-09'), {
  updatedAt: 'x', shifts: [{ id: 'a', staffId: '3', dayIndex: 9, startTime: 11, endTime: 17 }] })));
await check('Planning invalide refuse (fin < debut)', assertFails(setDoc(doc(as(SERGE), 'weeks/2026-08-09'), {
  updatedAt: 'x', shifts: [{ id: 'a', staffId: '3', dayIndex: 2, startTime: 17, endTime: 11 }] })));
await check('Collection inconnue fermee',           assertFails(getDoc(doc(as(SERGE), 'autre/doc'))));

await env.cleanup();
console.log(`\n${failed === 0 ? 'TOUT EST CONFORME' : failed + ' CAS EN ECHEC'}`);
process.exit(failed === 0 ? 0 : 1);
