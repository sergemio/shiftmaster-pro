/**
 * Lignes d'extras reconstituees depuis les shifts, et nom par defaut.
 *
 *   node scripts/test-extras.mjs
 *
 * Code recopie de `utils/helpers.ts` (convention du depot : les tests ne
 * compilent pas le TypeScript, ils rejouent la meme logique).
 */
const EXTRA_COLOR = '#94a3b8';

const extraStaffRows = (shifts, extras = {}) => {
  const rows = new Map();
  for (const s of shifts) {
    if (!s.extraName || rows.has(s.staffId)) continue;
    const known = extras[s.staffId];
    const identified = !!known?.filledAt;
    rows.set(s.staffId, {
      id: s.staffId,
      name: known?.firstName || s.extraName,
      email: '',
      color: EXTRA_COLOR,
      role: 'staff',
      isExtra: true,
      isPool: !identified,
    });
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
};

const nextExtraName = (shifts) => {
  let max = 0;
  for (const s of shifts) {
    const m = /^Extra (\d+)$/.exec((s.extraName || '').trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Extra ${max + 1}`;
};

let failed = 0, n = 0;
const check = (label, ok, extra = '') => {
  n++; if (!ok) failed++;
  console.log((ok ? 'OK     ' : 'ECHEC  ') + label + (!ok && extra ? `  [${extra}]` : ''));
};

const S = (staffId, extraName) => ({ id: 's' + Math.random(), staffId, extraName, dayIndex: 1, startTime: 10, endTime: 15 });

// --- lignes reconstituees ---------------------------------------------------
check('Un planning sans extra ne cree aucune ligne',
  extraStaffRows([{ staffId: '2', dayIndex: 1 }]).length === 0);

const rows1 = extraStaffRows([S('x1', 'Monique'), { staffId: '2', dayIndex: 0 }]);
check('Un shift d extra cree une ligne portant son prenom',
  rows1.length === 1 && rows1[0].name === 'Monique' && rows1[0].id === 'x1');
check('La ligne est marquee extra et grisee',
  rows1[0].isExtra === true && rows1[0].color === EXTRA_COLOR);

check('Deux shifts du meme extra ne font qu une ligne',
  extraStaffRows([S('x1', 'Monique'), S('x1', 'Monique')]).length === 1);
check('Deux extras differents font deux lignes',
  extraStaffRows([S('x1', 'Monique'), S('x2', 'Karim')]).length === 2);
check('Les lignes sont triees par prenom',
  extraStaffRows([S('x1', 'Zoe'), S('x2', 'Ana')]).map(r => r.name).join(',') === 'Ana,Zoe');

// La fiche du vivier fait foi quand on y a acces : c'est le prenom que la
// personne a elle-meme saisi via le lien.
const rows2 = extraStaffRows([S('x1', 'Extra 1')], { x1: { firstName: 'Monique', filledAt: '2026-09-17' } });
check('Le prenom du vivier remplace celui du shift', rows2[0].name === 'Monique');

// --- exclusion des regles de duree du travail -------------------------------
check('Un extra pas encore identifie est exclu des regles (isPool)',
  extraStaffRows([S('x1', 'Extra 1')])[0].isPool === true);
check('Un extra identifie N EST PAS exclu des regles',
  extraStaffRows([S('x1', 'Monique')], { x1: { firstName: 'Monique', filledAt: '2026-09-17T10:00:00Z' } })[0].isPool === false);
check('Une fiche connue mais formulaire non rempli reste exclue',
  extraStaffRows([S('x1', 'Monique')], { x1: { firstName: 'Monique', filledAt: null } })[0].isPool === true);

// --- nom par defaut ---------------------------------------------------------
check('Premier extra sans nom : « Extra 1 »', nextExtraName([]) === 'Extra 1');
check('Le numero suit le plus grand deja pose',
  nextExtraName([S('x1', 'Extra 1'), S('x2', 'Extra 2')]) === 'Extra 3');
check('Un trou ne se rebouche pas (pas de doublon avec un shift efface)',
  nextExtraName([S('x1', 'Extra 3')]) === 'Extra 4');
check('Les prenoms n influencent pas la numerotation',
  nextExtraName([S('x1', 'Monique'), S('x2', 'Extra 1')]) === 'Extra 2');
check('« Extra » seul n est pas numerote', nextExtraName([S('x1', 'Extra')]) === 'Extra 1');

console.log(`\n${failed === 0 ? `TOUT PASSE (${n} cas)` : failed + ' ECHEC(S) sur ' + n}`);
process.exit(failed === 0 ? 0 : 1);
