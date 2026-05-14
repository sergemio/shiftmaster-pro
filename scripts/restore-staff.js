#!/usr/bin/env node
/**
 * Restore staff list from a snapshot file (settings/staff document).
 * Usage: node scripts/restore-staff.js <snapshot-file.json>
 * The file must contain { staff: { list: [...] } } structure.
 */

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SA_PATH = join(__dirname, 'service-account.json');

const sa = JSON.parse(readFileSync(SA_PATH, 'utf8'));
const app = initializeApp({ credential: cert(sa) });
const db = getFirestore(app);

const inputFile = process.argv[2];
if (!inputFile) {
  console.error('Usage: node scripts/restore-staff.js <snapshot-file.json>');
  process.exit(1);
}

const snapshot = JSON.parse(readFileSync(inputFile, 'utf8'));
const list = snapshot.staff?.list;
if (!Array.isArray(list) || list.length === 0) {
  console.error('No staff list found in snapshot');
  process.exit(1);
}

// Build admins array from staff with role === 'admin' and a real email
const admins = list
  .filter(s => s.role === 'admin')
  .map(s => (s.email || '').trim().toLowerCase())
  .filter(e => e);

console.log('Restoring', list.length, 'staff members:');
list.forEach(s => console.log(' ', s.id, '→', (s.name||'?').trim(), '|', s.role, '|', s.email));
console.log('Admins:', admins);

// Read current state first to back up
const current = await db.doc('settings/staff').get();
const currentData = current.exists ? current.data() : null;
console.log('\nCurrent DB has', currentData?.list?.length || 0, 'members');

// Set the doc (no merge — replace entirely to clean any stale data)
await db.doc('settings/staff').set({
  list,
  admins,
  guests: currentData?.guests || []
});

console.log('\n✓ Staff list restored');
process.exit(0);
