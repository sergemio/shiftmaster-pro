#!/usr/bin/env node
/**
 * Homogeneise les shifts existants sur la regle de pause du 22/09/2026 :
 * un shift de plus de 6 h SANS pause recoit 20 min, au milieu du shift.
 *
 *   node scripts/migrate-auto-break.mjs                  # essai a blanc : compte, n'ecrit rien
 *   node scripts/migrate-auto-break.mjs --apply          # ecrit
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/migrate-auto-break.mjs --project demo-shiftmaster [--apply]
 *
 * GARDE-FOU : seul le projet SaaS (`saas-planning-resto`) ou un projet
 * d'emulateur (`demo-*`) est accepte. La base de Sezam (shiftmaster-pro-9e20d)
 * sert a la paie du restaurant : ce script la refuse, quoi qu'on lui passe.
 *
 * Semaines publiees (`weeks`) et brouillons (`drafts`) de chaque restaurant.
 * Ecriture sous condition : si la semaine a change depuis la lecture, elle est
 * sautee (et signalee), jamais ecrasee.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PROJECT = args.includes('--project') ? args[args.indexOf('--project') + 1] : 'saas-planning-resto';
// Compte de la CLI Firebase a utiliser (sinon celui connecte par defaut).
const ACCOUNT = process.env.FIREBASE_ACCOUNT || '';
if (PROJECT !== 'saas-planning-resto' && !PROJECT.startsWith('demo-')) {
  console.error(`Projet refuse : ${PROJECT}. Seuls saas-planning-resto et demo-* sont permis.`);
  process.exit(1);
}
const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
if (PROJECT.startsWith('demo-') !== EMULATOR) {
  console.error('Un projet demo-* se lit sur l\'emulateur (FIRESTORE_EMULATOR_HOST), et seulement lui.');
  process.exit(1);
}

// La regle de l'app elle-meme (utils/worktime.ts), pas une copie.
import { loadTs } from './load-ts.mjs';
const { autoBreak } = await loadTs('utils/worktime.ts');
const needs = (s) => !(s.breakMinutes > 0) && autoBreak(s.startTime, s.endTime).breakMinutes > 0;

// Jeton de la CLI Firebase (`firebase login`), pas de cle de service a stocker.
const accessToken = async () => {
  if (EMULATOR) return 'owner';
  const cfg = JSON.parse(readFileSync(join(homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8'));
  const acc = [{ user: cfg.user, tokens: cfg.tokens }, ...(cfg.additionalAccounts || [])].find(a => !ACCOUNT || a.user?.email === ACCOUNT);
  if (!acc) throw new Error(`Compte ${ACCOUNT} absent de la CLI Firebase.`);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: acc.tokens.refresh_token,
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Jeton refuse : ' + JSON.stringify(j));
  return j.access_token;
};
const TOKEN = await accessToken();
const BASE = (EMULATOR ? `http://${process.env.FIRESTORE_EMULATOR_HOST}` : 'https://firestore.googleapis.com')
  + `/v1/projects/${PROJECT}/databases/(default)/documents`;
const api = async (path, init = {}) => {
  const r = await fetch(BASE + path, { ...init, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' } });
  const j = await r.json();
  if (!r.ok) { const e = new Error(`${r.status} ${JSON.stringify(j).slice(0, 300)}`); e.status = r.status; throw e; }
  return j;
};
const list = async (path) => {
  const out = []; let tok = '';
  do {
    const j = await api(`${path}?pageSize=300${tok ? '&pageToken=' + tok : ''}`);
    out.push(...(j.documents || [])); tok = j.nextPageToken || '';
  } while (tok);
  return out;
};
// Valeurs Firestore <-> JS.
const dec = (v) => 'stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue)
  : 'doubleValue' in v ? v.doubleValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(dec)
  : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]))
  : 'timestampValue' in v ? { __ts: v.timestampValue } : v;
const enc = (x) => x === null ? { nullValue: null } : typeof x === 'string' ? { stringValue: x }
  : typeof x === 'boolean' ? { booleanValue: x }
  : typeof x === 'number' ? (Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x })
  : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } }
  : x.__ts ? { timestampValue: x.__ts }
  : { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, y]) => [k, enc(y)])) } };
const rel = (name) => name.slice(name.indexOf('/documents') + '/documents'.length);

let total = 0, changed = 0, skipped = 0;
for (const org of await list('/orgs')) {
  const orgName = org.fields?.name ? dec(org.fields.name) : rel(org.name).split('/')[2];
  let orgCount = 0;
  for (const coll of ['weeks', 'drafts']) {
    for (const d of await list(`${rel(org.name)}/${coll}`)) {
      const shifts = d.fields?.shifts ? dec(d.fields.shifts) : [];
      total += shifts.length;
      const todo = shifts.filter(needs);
      if (!todo.length) continue;
      orgCount += todo.length;
      if (!APPLY) continue;
      const next = shifts.map(s => needs(s) ? { ...s, ...autoBreak(s.startTime, s.endTime) } : s);
      const q = `?updateMask.fieldPaths=shifts&updateMask.fieldPaths=updatedAt&currentDocument.updateTime=${encodeURIComponent(d.updateTime)}`;
      try {
        await api(rel(d.name) + q, { method: 'PATCH', body: JSON.stringify({ fields: { shifts: enc(next), updatedAt: enc(new Date().toISOString()) } }) });
        changed += todo.length;
      } catch (e) {
        skipped += todo.length;
        console.log(`  saute : ${orgName} / ${coll}/${rel(d.name).split('/').pop()} (${e.message.slice(0, 80)})`);
      }
    }
  }
  if (orgCount) console.log(`${String(orgName).padEnd(32)} ${orgCount} shift(s) de plus de 6 h sans pause`);
}
console.log(`\n${PROJECT} : ${total} shifts lus, ` + (APPLY
  ? `${changed} mis a jour (pause de 20 min), ${skipped} sautes.`
  : `ESSAI A BLANC, rien n'est ecrit. Relancer avec --apply pour ecrire.`));
process.exit(0);
