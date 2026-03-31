#!/usr/bin/env node
/**
 * ShiftMaster Pro — Firestore reader
 * Usage:
 *   node scripts/read-firebase.js --month 2026-03
 *   node scripts/read-firebase.js --week 2026-03-29
 *   node scripts/read-firebase.js --staff
 *   Add --out filename.json to write to file instead of stdout
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SA_PATH = join(__dirname, 'service-account.json');

// --- Init Firebase ---
if (!existsSync(SA_PATH)) {
  console.error(`\nERROR: Service account key not found at:\n  ${SA_PATH}\n`);
  console.error('To get it:');
  console.error('  1. Go to https://console.firebase.google.com/project/shiftmaster-pro-9e20d/settings/serviceaccounts/adminsdk');
  console.error('  2. Click "Generate new private key"');
  console.error('  3. Save the downloaded JSON as scripts/service-account.json\n');
  process.exit(1);
}

const app = initializeApp({ credential: cert(JSON.parse(readFileSync(SA_PATH, 'utf8'))) });
const db = getFirestore(app);

// --- Args ---
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}
const hasFlag = (name) => args.includes(name);

const monthArg = getArg('--month');
const weekArg = getArg('--week');
const staffOnly = hasFlag('--staff');
const outFile = getArg('--out');

if (!monthArg && !weekArg && !staffOnly) {
  console.error('Usage: node scripts/read-firebase.js [--month YYYY-MM] [--week YYYY-MM-DD] [--staff] [--out file.json]');
  process.exit(1);
}

// --- Helpers ---

/** Get the Sunday on or before a date */
function sundayOf(d) {
  const s = new Date(d);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

/** Format date as YYYY-MM-DD */
function iso(d) {
  return d.toISOString().slice(0, 10);
}

/** Return all Sunday-start weekIds that overlap with a given month */
function weekIdsForMonth(ym) {
  const [year, month] = ym.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0); // last day of month

  // First overlapping week: Sunday on or before the 1st
  let sunday = sundayOf(firstDay);
  const ids = [];
  while (sunday <= lastDay) {
    ids.push(iso(sunday));
    sunday.setDate(sunday.getDate() + 7);
  }
  return ids;
}

// --- Fetch ---

async function fetchStaff() {
  const snap = await db.doc('settings/staff').get();
  return snap.exists ? snap.data() : null;
}

async function fetchWeek(weekId) {
  const snap = await db.doc(`weeks/${weekId}`).get();
  return snap.exists ? { weekId, ...snap.data() } : null;
}

async function main() {
  const result = {};

  if (staffOnly) {
    result.staff = await fetchStaff();
  } else if (weekArg) {
    // Normalize to the Sunday of that week
    const sunday = iso(sundayOf(new Date(weekArg + 'T00:00:00')));
    result.week = await fetchWeek(sunday);
    if (!result.week) console.error(`No data found for week starting ${sunday}`);
  } else if (monthArg) {
    const ids = weekIdsForMonth(monthArg);
    console.error(`Fetching ${ids.length} weeks overlapping ${monthArg}: ${ids.join(', ')}`);
    const weeks = await Promise.all(ids.map(fetchWeek));
    result.weeks = weeks.filter(Boolean);
    result.staff = await fetchStaff();
    console.error(`Got ${result.weeks.length} weeks with data`);
  }

  const json = JSON.stringify(result, null, 2);

  if (outFile) {
    writeFileSync(outFile, json, 'utf8');
    console.error(`Written to ${outFile}`);
  } else {
    console.log(json);
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
