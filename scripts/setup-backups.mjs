#!/usr/bin/env node
/**
 * Prepare les sauvegardes de nuit (function `nightlyBackup`), une seule fois
 * par projet ; relancer ne change rien si tout est deja en place.
 *
 *   node scripts/setup-backups.mjs            # projet SaaS
 *
 * 1. Bucket `<projet>-backups`, dans la region de la base, prive, qui efface
 *    tout fichier de plus de 30 jours (decision de Serge du 22/09/2026).
 * 2. Le service Firestore peut y ecrire (c'est lui qui fait la copie).
 * 3. Le compte des functions peut lancer une copie (role importExportAdmin).
 *
 * Jeton : celui de la CLI Firebase (`firebase login`) ; FIREBASE_ACCOUNT pour
 * choisir le compte. GARDE-FOU : seul `saas-planning-resto` est accepte.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT = 'saas-planning-resto';
const BUCKET = `${PROJECT}-backups`;
const KEEP_DAYS = 30;

const cfg = JSON.parse(readFileSync(join(homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8'));
const want = process.env.FIREBASE_ACCOUNT || '';
const acc = [{ user: cfg.user, tokens: cfg.tokens }, ...(cfg.additionalAccounts || [])].find(a => !want || a.user?.email === want);
const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'refresh_token', refresh_token: acc.tokens.refresh_token,
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
  }),
})).json();
const api = async (url, init = {}) => {
  const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${tok.access_token}`, 'content-type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
};

const db = await api(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)`);
const proj = await api(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`);
const region = db.j.locationId, number = proj.j.projectNumber;
if (!region || !number) throw new Error('Projet illisible : ' + JSON.stringify(db.j.error || proj.j.error));

// 1. bucket
const lifecycle = { rule: [{ action: { type: 'Delete' }, condition: { age: KEEP_DAYS } }] };
const b = await api(`https://storage.googleapis.com/storage/v1/b/${BUCKET}`);
if (b.status === 404) {
  const c = await api(`https://storage.googleapis.com/storage/v1/b?project=${PROJECT}`, {
    method: 'POST',
    body: JSON.stringify({
      name: BUCKET, location: region, storageClass: 'STANDARD', lifecycle,
      iamConfiguration: { uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: 'enforced' },
    }),
  });
  if (!c.ok) throw new Error('Bucket non cree : ' + JSON.stringify(c.j.error));
  console.log(`Bucket ${BUCKET} cree (${region}), copies effacees apres ${KEEP_DAYS} jours.`);
} else {
  await api(`https://storage.googleapis.com/storage/v1/b/${BUCKET}`, { method: 'PATCH', body: JSON.stringify({ lifecycle }) });
  console.log(`Bucket ${BUCKET} deja la ; regle des ${KEEP_DAYS} jours reappliquee.`);
}

// 2. le service Firestore ecrit dans le bucket
const firestoreAgent = `serviceAccount:service-${number}@gcp-sa-firestore.iam.gserviceaccount.com`;
const bp = await api(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/iam`);
const bRole = 'roles/storage.admin';
const bBinding = bp.j.bindings?.find(x => x.role === bRole);
if (!bBinding?.members?.includes(firestoreAgent)) {
  const bindings = [...(bp.j.bindings || []).filter(x => x.role !== bRole), { role: bRole, members: [...(bBinding?.members || []), firestoreAgent] }];
  const r = await api(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/iam`, { method: 'PUT', body: JSON.stringify({ ...bp.j, bindings }) });
  if (!r.ok) throw new Error('Droit du bucket refuse : ' + JSON.stringify(r.j.error));
}
console.log('Service Firestore : peut ecrire les copies.');

// 3. le compte des functions peut lancer une copie
const fnAccount = `serviceAccount:${number}-compute@developer.gserviceaccount.com`;
const pRole = 'roles/datastore.importExportAdmin';
const pp = await api(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:getIamPolicy`, { method: 'POST', body: '{}' });
const pBinding = pp.j.bindings?.find(x => x.role === pRole);
if (!pBinding?.members?.includes(fnAccount)) {
  const bindings = [...(pp.j.bindings || []).filter(x => x.role !== pRole), { role: pRole, members: [...(pBinding?.members || []), fnAccount] }];
  const r = await api(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:setIamPolicy`, {
    method: 'POST', body: JSON.stringify({ policy: { ...pp.j, bindings } }),
  });
  if (!r.ok) throw new Error('Droit du projet refuse : ' + JSON.stringify(r.j.error));
}
console.log('Functions : peuvent lancer une copie.');
