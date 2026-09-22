/**
 * Charge un fichier TypeScript de l'application pour un test en Node : compile
 * a la volee par esbuild, puis importe. Les tests importent ainsi le VRAI code.
 *
 * Pourquoi (audit du 22/09/2026) : quinze tests recopiaient la formule qu'ils
 * testaient ; la copie continuait de passer pendant que l'app se trompait.
 *
 *   import { loadTs } from './load-ts.mjs';
 *   const { contractHoursOn } = await loadTs('utils/helpers.ts');
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const loadTs = async (entry) => {
  const dir = mkdtempSync(join(tmpdir(), 'loadts-'));
  const out = join(dir, 'module.mjs');
  await build({ entryPoints: [join(ROOT, entry)], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  try { return await import(pathToFileURL(out).href); }
  finally { rmSync(dir, { recursive: true, force: true }); }
};
