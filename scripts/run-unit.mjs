/**
 * Lance tous les tests unitaires (Node, sans navigateur ni emulateur) et
 * s'arrete au premier rouge. Branche avant chaque commit (.githooks/pre-commit) :
 * un calcul qui change de resultat ne passe pas.
 *
 *   npm test
 *
 * Exclus : test-rules et test-functions, qui ont besoin des emulateurs
 * (npm run test:rules, npm run test:functions).
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const NEEDS_EMULATOR = new Set(['test-rules.mjs', 'test-functions.mjs']);
const files = readdirSync(HERE).filter(f => /^test-.*\.mjs$/.test(f) && !NEEDS_EMULATOR.has(f)).sort();
let failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [join(HERE, f)], { cwd: join(HERE, '..'), encoding: 'utf8' });
  const ok = r.status === 0;
  if (!ok) failed.push(f);
  console.log(`${ok ? 'ok    ' : 'ECHEC '} ${f}`);
  if (!ok) console.log((r.stdout || '').split('\n').filter(l => /ECHEC|Error/.test(l)).slice(0, 10).join('\n') || r.stderr);
}
console.log(failed.length ? `\n${failed.length} fichier(s) en echec : ${failed.join(', ')}` : `\nTOUT PASSE (${files.length} fichiers)`);
process.exit(failed.length ? 1 : 0);
