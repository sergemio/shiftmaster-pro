#!/usr/bin/env node
/**
 * Full backup of the ShiftMaster Firestore database.
 *
 * Firestore on the free Spark plan has no point-in-time recovery, no automatic
 * export and no trash. This script is the only safety net: without it, a bad
 * write or a stray delete is permanent. That already happened once (2026-05-04,
 * staff roster overwritten) and was only recoverable because a stray JSON dump
 * happened to be lying around.
 *
 * Usage:
 *   node scripts/backup-firebase.js           # write today's backup
 *   node scripts/backup-firebase.js --dry-run # show what would happen, write nothing
 *   node scripts/backup-firebase.js --dest "D:\\somewhere"   # override destination
 *
 * Layout produced at the destination:
 *   daily/shiftmaster-YYYY-MM-DD.json    kept 30 days, then pruned
 *   monthly/shiftmaster-YYYY-MM.json     first backup of each month, kept forever
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, renameSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_DEST = 'G:\\My Drive\\2 - RH - SALAIRES EMPLOYÉS & Documents\\ShiftMaster - Backups';
const DAILY_RETENTION_DAYS = 30;
// Backups smaller than this almost certainly mean a partial read, not a real
// shrink of the database. Refuse to write rather than record a bad snapshot.
const MIN_EXPECTED_WEEKS = 1;
const MIN_EXPECTED_STAFF = 1;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERIFY = args.includes('--verify');
const destArg = args.indexOf('--dest');
const DEST = destArg !== -1 ? args[destArg + 1] : (process.env.SHIFTMASTER_BACKUP_DIR || DEFAULT_DEST);

const log = (...m) => console.log(...m);
const fail = (msg) => { console.error('BACKUP FAILED:', msg); process.exit(1); };

// --- Connect -----------------------------------------------------------------
const SA_PATH = join(__dirname, 'service-account.json');
if (!existsSync(SA_PATH)) fail(`no service account at ${SA_PATH}`);

const app = initializeApp({ credential: cert(JSON.parse(readFileSync(SA_PATH, 'utf8'))) });
const db = getFirestore(app);

// --- Read everything ---------------------------------------------------------
async function dumpCollection(name) {
  const snap = await db.collection(name).get();
  const out = {};
  snap.forEach(d => { out[d.id] = d.data(); });
  return out;
}

log(`Reading ${db.databaseId || '(default)'} ...`);

const weeks = await dumpCollection('weeks');
const logs = await dumpCollection('logs');
const settings = await dumpCollection('settings');

const weekCount = Object.keys(weeks).length;
const shiftCount = Object.values(weeks).reduce((n, w) => n + (w.shifts?.length || 0), 0);
const logCount = Object.keys(logs).length;
const staffCount = settings.staff?.list?.length || 0;

log(`  weeks    : ${weekCount} documents, ${shiftCount} shifts`);
log(`  logs     : ${logCount} documents`);
log(`  staff    : ${staffCount} people`);

// --- Verify mode: compare the newest backup on disk against the live database -
// A backup nobody ever checked is a guess, not a safety net.
if (VERIFY) {
  const dailyDir = join(DEST, 'daily');
  if (!existsSync(dailyDir)) fail(`no backups found at ${dailyDir}`);
  const files = readdirSync(dailyDir)
    .filter(f => /^shiftmaster-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (!files.length) fail(`no backup files in ${dailyDir}`);

  const newest = files[files.length - 1];
  const backup = JSON.parse(readFileSync(join(dailyDir, newest), 'utf8'));
  log(`\nVerifying ${newest} (taken ${backup.meta?.takenAt}) against the live database...`);

  const liveCols = { weeks, settings, logs };
  let compared = 0, diffs = 0;
  for (const [name, live] of Object.entries(liveCols)) {
    const saved = backup[name] || {};
    const liveKeys = Object.keys(live), savedKeys = Object.keys(saved);
    if (liveKeys.length !== savedKeys.length) {
      log(`  ! ${name}: ${liveKeys.length} live vs ${savedKeys.length} in backup`);
      diffs++;
    }
    for (const k of liveKeys) {
      compared++;
      if (JSON.stringify(live[k]) !== JSON.stringify(saved[k])) {
        if (diffs < 5) log(`  ! differs: ${name}/${k}`);
        diffs++;
      }
    }
  }
  log(`\n${compared} documents compared, ${diffs} difference(s).`);
  if (diffs === 0) {
    log('OK — the backup is a faithful copy of the database.');
  } else {
    log('Differences are expected if the database changed since the backup was taken.');
    log('Re-run without --verify to take a fresh one, then verify again.');
  }
  process.exit(diffs === 0 ? 0 : 2);
}

// --- Sanity gate -------------------------------------------------------------
// A backup that records an empty database is worse than no backup: it looks
// like a success and it rotates out a good one.
if (weekCount < MIN_EXPECTED_WEEKS) fail(`only ${weekCount} week documents read — refusing to write a backup that may be truncated`);
if (staffCount < MIN_EXPECTED_STAFF) fail(`only ${staffCount} staff read — refusing to write a backup that may be truncated`);

const now = new Date();
const pad = n => String(n).padStart(2, '0');
const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const month = day.slice(0, 7);

const payload = {
  meta: {
    takenAt: now.toISOString(),
    project: JSON.parse(readFileSync(SA_PATH, 'utf8')).project_id,
    counts: { weeks: weekCount, shifts: shiftCount, logs: logCount, staff: staffCount },
    schema: 'shiftmaster-backup/1',
  },
  weeks,
  settings,
  logs,
};
const json = JSON.stringify(payload, null, 1);
const sizeKb = (Buffer.byteLength(json, 'utf8') / 1024).toFixed(1);

if (DRY_RUN) {
  log(`\n[dry run] would write ${sizeKb} Ko to ${join(DEST, 'daily', `shiftmaster-${day}.json`)}`);
  process.exit(0);
}

// --- Write (atomically) ------------------------------------------------------
const dailyDir = join(DEST, 'daily');
const monthlyDir = join(DEST, 'monthly');
try {
  mkdirSync(dailyDir, { recursive: true });
  mkdirSync(monthlyDir, { recursive: true });
} catch (e) {
  fail(`cannot create ${DEST} — is Google Drive mounted? (${e.message})`);
}

// Write to a temp file first, then rename: an interrupted run can never leave a
// half-written file sitting where a valid backup is expected.
const dailyPath = join(dailyDir, `shiftmaster-${day}.json`);
const tmpPath = dailyPath + '.tmp';
writeFileSync(tmpPath, json, 'utf8');
renameSync(tmpPath, dailyPath);
log(`\nWrote ${sizeKb} Ko -> ${dailyPath}`);

const monthlyPath = join(monthlyDir, `shiftmaster-${month}.json`);
if (!existsSync(monthlyPath)) {
  writeFileSync(monthlyPath, json, 'utf8');
  log(`Wrote monthly archive -> ${monthlyPath}`);
}

// --- Prune old dailies -------------------------------------------------------
// Only ever touches files this script created, matched on its exact naming
// pattern, and only inside daily/. Monthly archives are never pruned.
const cutoff = Date.now() - DAILY_RETENTION_DAYS * 864e5;
const PATTERN = /^shiftmaster-\d{4}-\d{2}-\d{2}\.json$/;
let pruned = 0;
for (const f of readdirSync(dailyDir)) {
  if (!PATTERN.test(f)) continue;
  const p = join(dailyDir, f);
  if (statSync(p).mtimeMs < cutoff) { unlinkSync(p); pruned++; log(`  pruned ${f}`); }
}

const kept = readdirSync(dailyDir).filter(f => PATTERN.test(f)).length;
log(`\nDone. ${kept} daily backup(s) kept, ${pruned} pruned, ` +
    `${readdirSync(monthlyDir).length} monthly archive(s).`);
