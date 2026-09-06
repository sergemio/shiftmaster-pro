#!/usr/bin/env node
/**
 * Lit ou publie les regles Firestore de production, via l'API firebaserules.
 *
 *   node scripts/rules-deploy.mjs            -> affiche les regles EN PRODUCTION
 *   node scripts/rules-deploy.mjs --diff     -> compare la production au fichier local
 *   node scripts/rules-deploy.mjs --publish  -> publie firestore.rules
 *
 * Pourquoi pas `firebase deploy` : la CLI exige une session interactive ou une
 * variable d'environnement supplementaire, alors que la cle de service est deja
 * la. Surtout, cette voie permet de LIRE ce qui tourne reellement avant de le
 * remplacer — le fichier du depot n'est pas une preuve de ce qui est deploye.
 */
import { readFileSync } from 'fs';
import { GoogleAuth } from 'google-auth-library';

const PROJECT = 'shiftmaster-pro-9e20d';
const KEY = new URL('./service-account.json', import.meta.url).pathname.replace(/^\//, '');
const LOCAL = new URL('../firestore.rules', import.meta.url).pathname.replace(/^\//, '');

const auth = new GoogleAuth({
  keyFile: KEY,
  scopes: ['https://www.googleapis.com/auth/firebase.readonly',
           'https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();

const api = async (path, init = {}) => {
  const res = await client.request({
    url: `https://firebaserules.googleapis.com/v1/${path}`,
    method: init.method || 'GET',
    data: init.body,
  });
  return res.data;
};

/** Le contenu des regles actuellement SERVIES en production. */
const fetchLive = async () => {
  const releases = await api(`projects/${PROJECT}/releases`);
  const rel = (releases.releases || []).find(r => r.name.endsWith('/cloud.firestore'));
  if (!rel) throw new Error('aucune release cloud.firestore trouvee');
  const ruleset = await api(rel.rulesetName);
  const file = ruleset.source.files[0];
  return { rel, source: file.content, name: file.name };
};

const mode = process.argv[2] || '--show';

if (mode === '--show' || mode === '--diff') {
  const live = await fetchLive();
  if (mode === '--show') {
    console.log(`--- EN PRODUCTION (${live.rel.rulesetName.split('/').pop()}) ---`);
    console.log(live.source);
  } else {
    const local = readFileSync(LOCAL, 'utf8');
    const a = live.source.split('\n');
    const b = local.split('\n');
    const same = live.source.trim() === local.trim();
    console.log(`production : ${a.length} lignes`);
    console.log(`local      : ${b.length} lignes`);
    console.log(same ? '\nIDENTIQUES — rien a publier.' : '\nDIFFERENTES.');
    if (!same) {
      const setA = new Set(a.map(l => l.trim()));
      const setB = new Set(b.map(l => l.trim()));
      const added = b.filter(l => l.trim() && !setA.has(l.trim()));
      const removed = a.filter(l => l.trim() && !setB.has(l.trim()));
      console.log(`\n+ ${added.length} lignes ajoutees :`);
      added.slice(0, 40).forEach(l => console.log('  + ' + l.trim().slice(0, 100)));
      console.log(`\n- ${removed.length} lignes retirees :`);
      removed.slice(0, 40).forEach(l => console.log('  - ' + l.trim().slice(0, 100)));
    }
  }
  process.exit(0);
}

if (mode === '--publish') {
  const local = readFileSync(LOCAL, 'utf8');
  const before = await fetchLive();
  if (before.source.trim() === local.trim()) {
    console.log('Les regles en production sont deja identiques au fichier local. Rien a faire.');
    process.exit(0);
  }
  console.log(`Ruleset actuel : ${before.rel.rulesetName.split('/').pop()}`);

  const created = await api(`projects/${PROJECT}/rulesets`, {
    method: 'POST',
    body: { source: { files: [{ name: 'firestore.rules', content: local }] } },
  });
  console.log(`Nouveau ruleset : ${created.name.split('/').pop()}`);

  await api(`projects/${PROJECT}/releases/cloud.firestore`, {
    method: 'PATCH',
    body: { release: { name: `projects/${PROJECT}/releases/cloud.firestore`, rulesetName: created.name } },
  });

  const after = await fetchLive();
  const ok = after.source.trim() === local.trim();
  console.log(ok ? '\nPUBLIE ET VERIFIE : la production sert bien le fichier local.'
                 : '\nATTENTION : ce qui est servi ne correspond pas au fichier local.');
  process.exit(ok ? 0 : 1);
}

console.error('Usage: node scripts/rules-deploy.mjs [--show|--diff|--publish]');
process.exit(2);
