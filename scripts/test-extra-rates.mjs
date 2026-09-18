/**
 * Taux appliques aux shifts : salaries, extras (fiche, sinon taux par defaut).
 *
 *   node scripts/test-extra-rates.mjs
 *
 * Compile le vrai `utils/helpers.ts` avec esbuild, comme test-payroll.mjs.
 */
import { buildSync } from 'esbuild';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'rates-')), 'helpers.mjs');
buildSync({ entryPoints: [join(root, 'utils/helpers.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const { costRates, totalCost, EXTRA_DEFAULT_RATE_KEY } = await import(pathToFileURL(out).href);

let fails = 0;
const check = (label, ok, extra = '') => {
  if (!ok) fails++;
  console.log((ok ? 'OK     ' : 'ECHEC  ') + label + (ok ? '' : `  [${JSON.stringify(extra)}]`));
};

const shifts = [
  { staffId: 's2', startTime: 10, endTime: 16 },                          // salarie, 6 h
  { staffId: 'x1', startTime: 12, endTime: 16, extraName: 'Monique' },    // extra avec taux sur sa fiche
  { staffId: 'x2', startTime: 18, endTime: 23, extraName: 'Extra 1' },    // extra sans taux
];
const extras = { x1: { rate: 20 }, x2: {} };

const noDefault = costRates({ s2: 16.5 }, extras, shifts);
check('Extra avec cout sur sa fiche : son taux (20 €)', noDefault.x1 === 20, noDefault);
check('Extra sans cout, pas de taux par defaut : non chiffre', !('x2' in noDefault), noDefault);
check('Total partiel : 1 shift non chiffre', totalCost(shifts, noDefault).missing === 1, totalCost(shifts, noDefault));

const withDefault = costRates({ s2: 16.5, [EXTRA_DEFAULT_RATE_KEY]: 14 }, extras, shifts);
check('Extra sans cout : taux par defaut (14 €)', withDefault.x2 === 14, withDefault);
check('Le taux de la fiche l\'emporte sur le defaut', withDefault.x1 === 20, withDefault);
check('Salarie inchange', withDefault.s2 === 16.5, withDefault);
const tot = totalCost(shifts, withDefault);
check('Total complet : 6 x 16,5 + 4 x 20 + 5 x 14 = 249 €', tot.total === 249 && tot.missing === 0, tot);

const onlyShift = costRates({ [EXTRA_DEFAULT_RATE_KEY]: 14 }, {}, [{ staffId: 'x9', startTime: 0, endTime: 1, extraName: 'Paul' }]);
check('Extra present sur le planning mais sans fiche chargee : taux par defaut', onlyShift.x9 === 14, onlyShift);
const zero = costRates({ [EXTRA_DEFAULT_RATE_KEY]: 0 }, { x2: {} }, []);
check('Taux par defaut a 0 ignore (jamais « zero euro »)', !('x2' in zero), zero);

console.log(fails ? `\n${fails} ECHEC(S)` : '\nTOUT PASSE');
process.exit(fails ? 1 : 0);
