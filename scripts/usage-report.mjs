/**
 * Rapport d'usage des restaurants + remarques recues (10/10/2026).
 *
 * Pourquoi : un restaurant qui lache l'outil ne previent pas. Le signe le plus
 * simple, c'est qu'il ne prepare plus ses semaines. Ce rapport dit, restaurant
 * par restaurant, quelles semaines ont un planning, si la semaine prochaine est
 * prete, et depuis quand rien n'a ete ecrit. Il liste aussi les remarques
 * envoyees par le bouton « Une remarque ? ».
 *
 * LECTURE SEULE : aucune ecriture, nulle part. Firestore facture une lecture
 * par document : on ne lit que la fenetre utile (8 semaines passees, 2 a venir).
 *
 *   node scripts/usage-report.mjs              production (cle scripts/service-account-saas.json)
 *   node scripts/usage-report.mjs --emulator   emulateurs locaux
 *   options : --weeks 8   --since 2026-10-01 (remarques ; 30 jours par defaut)
 *
 * La cle de production se cree dans la console Firebase du projet
 * saas-planning-resto : Parametres du projet, Comptes de service, « Generer une
 * nouvelle cle privee ». Elle ne doit JAMAIS etre commitee (.gitignore).
 */
import { readFileSync, existsSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const EMULATOR = args.includes('--emulator');
const WEEKS = Number(opt('--weeks', 8));
const KEY = new URL('./service-account-saas.json', import.meta.url);

if (EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  initializeApp({ projectId: 'demo-shiftmaster' });
} else {
  if (!existsSync(KEY)) {
    console.error('Cle absente : scripts/service-account-saas.json (voir l\'en-tete du script).');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(readFileSync(KEY, 'utf8'))) });
}
const db = getFirestore();

// --- dates : la semaine est identifiee par son dimanche (convention de l'app) ---
const parisToday = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`);
};
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);
const today = parisToday();
const thisWeek = addDays(today, -today.getUTCDay());           // dimanche de cette semaine
const weekIds = Array.from({ length: WEEKS + 3 }, (_, i) => iso(addDays(thisWeek, 7 * (i - WEEKS))));
const nextWeek = iso(addDays(thisWeek, 7));
const since = opt('--since', iso(addDays(today, -30)));
const daysAgo = (stamp) => stamp ? Math.floor((Date.now() - Date.parse(stamp)) / 86400000) : null;
const frDate = (s) => s && !Number.isNaN(Date.parse(s)) ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';

// --- lecture ---
const orgs = await db.collection('orgs').get();
const rows = [];
const remarks = [];
for (const o of orgs.docs) {
  const org = o.data();
  const ref = o.ref;
  const [weeks, drafts, members, fb] = await Promise.all([
    ref.collection('weeks').where(FieldPath.documentId(), '>=', weekIds[0]).where(FieldPath.documentId(), '<=', weekIds.at(-1)).get(),
    ref.collection('drafts').where(FieldPath.documentId(), '>=', weekIds[0]).where(FieldPath.documentId(), '<=', weekIds.at(-1)).select('updatedAt').get(),
    db.collection('users').where(`orgs.${o.id}`, 'in', ['admin', 'staff']).select('email').get(),
    ref.collection('feedback').where('createdAt', '>=', since).get(),
  ]);
  const byWeek = Object.fromEntries(weeks.docs.map(w => [w.id, w.data()]));
  const stamps = [...weeks.docs, ...drafts.docs].map(d => d.data().updatedAt).filter(Boolean).sort();
  const lastWrite = stamps.at(-1) || null;
  const filled = (wid) => (byWeek[wid]?.shifts || []).length > 0;
  const past = weekIds.slice(0, WEEKS + 1);                     // 8 semaines passees + celle-ci
  const nbFilled = past.filter(filled).length;
  const created = org.createdAt?.toDate ? org.createdAt.toDate().toISOString() : org.createdAt;
  const age = daysAgo(created);
  const quiet = daysAgo(lastWrite);

  let etat;
  if (nbFilled === 0 && !filled(nextWeek)) etat = age !== null && age <= 3 ? 'Nouveau' : 'Jamais demarre';
  else if (quiet !== null && quiet > 14) etat = 'ARRETE';
  else if ((quiet !== null && quiet > 7) || !filled(nextWeek)) etat = 'A surveiller';
  else etat = 'Actif';

  rows.push({
    etat, name: org.name || o.id, id: o.id, status: org.status, members: members.size,
    trail: past.map(w => (filled(w) ? '■' : '□')).join('') + ' → ' + (filled(nextWeek) ? '■' : '□'),
    lastWrite, quiet, created,
  });
  for (const f of fb.docs) remarks.push({ org: org.name || o.id, ...f.data() });
}

// --- sortie ---
const order = { 'ARRETE': 0, 'A surveiller': 1, 'Jamais demarre': 2, 'Nouveau': 3, 'Actif': 4 };
rows.sort((a, b) => order[a.etat] - order[b.etat] || (b.quiet ?? 1e9) - (a.quiet ?? 1e9));
const count = (e) => rows.filter(r => r.etat === e).length;

console.log(`# Usage des restaurants — ${frDate(today.toISOString())}${EMULATOR ? ' (EMULATEURS)' : ''}\n`);
console.log(`${rows.length} restaurants : ${count('Actif')} actifs, ${count('A surveiller')} a surveiller, ${count('ARRETE')} arretes, ${count('Jamais demarre')} jamais demarres, ${count('Nouveau')} nouveaux.\n`);
console.log(`Semaines : les ${WEEKS} dernieres, celle-ci, puis après la flèche la semaine prochaine. ■ = au moins un shift, □ = vide.\n`);
console.log('| Etat | Restaurant | Abonnement | Comptes | Semaines | Derniere ecriture | Cree le |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) {
  const last = r.lastWrite ? `${frDate(r.lastWrite)} (il y a ${r.quiet} j)` : '—';
  console.log(`| ${r.etat} | ${r.name} | ${r.status || '—'} | ${r.members} | ${r.trail} | ${last} | ${frDate(r.created)} |`);
}

console.log(`\n## Remarques depuis le ${frDate(since)} (${remarks.length})\n`);
remarks.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
for (const f of remarks) {
  const who = [f.name, f.email, f.role].filter(Boolean).join(', ');
  console.log(`- **${frDate(f.createdAt)} · ${f.org}** (${who}) — ecran « ${f.screen || '?'} », semaine ${f.weekId || '?'}\n  > ${String(f.text).replace(/\n+/g, ' ')}`);
}
process.exit(0);
