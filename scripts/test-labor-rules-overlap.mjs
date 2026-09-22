/**
 * Shifts qui se chevauchent : les heures communes ne comptent qu'une fois.
 *
 * Pourquoi (22/09/2026) : Serge posait 11 h 30 - 17 h 30 sur un lundi qui avait
 * deja 10 h 30 - 16 h 30 ; l'alerte annoncait « 12 heures travaillees » pour une
 * presence reelle de 7 h. Ce test importe le VRAI `utils/laborRules.ts`
 * (compile a la volee par esbuild), pas une copie : une copie aurait continue
 * de passer pendant que l'app se trompait.
 *
 *   node scripts/test-labor-rules-overlap.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'labor-'));
const out = join(dir, 'laborRules.mjs');
await build({ entryPoints: ['utils/laborRules.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { violationsForStaff, CONVENTIONS } = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

let ko = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) ko++;
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${label.padEnd(66)} ${JSON.stringify(got)}`);
};
const code = CONVENTIONS.none; // 10 h max par jour, 11 h de repos, 35 h par semaine
const sh = (id, date, start, end) => ({ id, staffId: 'x', date, start, end });
const rule = (list, r, w) => violationsForStaff(list, code, w).filter(v => v.rule === r).map(v => v.actual);

// --- duree quotidienne ---------------------------------------------------------
check('10:30-16:30 + 11:30-17:30 : 7 h de presence, sous 10 h, rien',
  rule([sh('a', '2026-09-21', 10.5, 16.5), sh('b', '2026-09-21', 11.5, 17.5)], 'maxDaily'), []);
check('8-14 + 13-20 : 12 h de presence (et non 13), signale',
  rule([sh('a', '2026-09-21', 8, 14), sh('b', '2026-09-21', 13, 20)], 'maxDaily'), [12]);
check('coupure 10-15 + 18-23 : 10 h, conforme',
  rule([sh('a', '2026-09-21', 10, 15), sh('b', '2026-09-21', 18, 23)], 'maxDaily'), []);
check('shift inclus dans un autre (9-21 et 12-14) : 12 h, pas 14',
  rule([sh('a', '2026-09-21', 9, 21), sh('b', '2026-09-21', 12, 14)], 'maxDaily'), [12]);

// --- repos quotidien : depuis la fin la plus tardive ------------------------------
check('10-23 et 11-17 lundi, reprise mardi 8 h : 9 h de repos, signale',
  rule([sh('a', '2026-09-21', 10, 23), sh('b', '2026-09-21', 11, 17), sh('c', '2026-09-22', 8, 12)], 'dailyRest'), [9]);
check('10-17 et 11-15 lundi, reprise mardi 8 h : 15 h, conforme',
  rule([sh('a', '2026-09-21', 10, 17), sh('b', '2026-09-21', 11, 15), sh('c', '2026-09-22', 8, 12)], 'dailyRest'), []);

// --- repos hebdomadaire : un shift inclus ne cree pas un faux repos ---------------
const week = { from: '2026-09-21', to: '2026-09-27' };
const allWeek = [0, 1, 2, 3, 4, 5, 6].map(d => sh('d' + d, `2026-09-${21 + d}`, 9, 20));
check('7 jours 9-20 : repos le plus long 13 h, signale',
  rule(allWeek, 'weeklyRest', week), [13]);
check('meme semaine + un shift inclus 10-12 le jeudi : toujours 13 h',
  rule([...allWeek, sh('in', '2026-09-24', 10, 12)], 'weeklyRest', week), [13]);

console.log(ko === 0 ? '\nTOUT PASSE' : `\n${ko} ECHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
