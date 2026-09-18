#!/usr/bin/env node
/**
 * Lance les emulateurs locaux (authentification, base, functions).
 *
 *   node scripts/emulators.mjs start          -> les garde ouverts
 *   node scripts/emulators.mjs exec "<cmd>"   -> les ouvre, lance la commande, les ferme
 *
 * Pourquoi un script plutot qu'une ligne npm : sous Windows, la lecture des
 * functions par l'emulateur depasse souvent le delai par defaut de 10 s et
 * echoue en silence (« Cannot determine backend specification »), puis chaque
 * appel repond « not-found ». Le delai se regle par variable d'environnement,
 * ce qu'une ligne npm ne sait pas faire de la meme facon sous Windows et ailleurs.
 */
import { spawn } from 'node:child_process';

const [mode, command] = process.argv.slice(2);
if (mode !== 'start' && mode !== 'exec') {
  console.error('Usage : node scripts/emulators.mjs start | exec "<commande>"');
  process.exit(2);
}
// Une seule chaine : avec `shell`, un tableau d'arguments perdrait les
// guillemets autour de la commande a executer.
let line = `npx firebase emulators:${mode} --only auth,firestore,functions --project demo-shiftmaster`;
if (mode === 'exec') line += ` "${String(command).replace(/"/g, '\\"')}"`;

const child = spawn(line, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, FUNCTIONS_DISCOVERY_TIMEOUT: '60' },
});
child.on('exit', (code) => process.exit(code ?? 1));
