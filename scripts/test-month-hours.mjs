// Regle du contrat MENSUEL, sans navigateur.
const contractHoursOn = (st, iso) => {
  const a = (st.contractChanges || []).filter(c => c.from <= iso).sort((x, y) => x.from.localeCompare(y.from));
  return a.length ? a[a.length - 1].weeklyHours : (st.contractHours ?? st.targetHours ?? 0);
};
const daysInMonth = (iso) => { const [y, m] = iso.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const monthlyContractHours = (st, iso) => {
  const [y, m] = iso.split('-').map(Number);
  const n = daysInMonth(iso);
  let t = 0;
  for (let d = 1; d <= n; d++) {
    t += contractHoursOn(st, `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`) * 52 / 12 / n;
  }
  return t;
};

let ko = 0;
const near = (label, got, want, tol = 0.05) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) ko++;
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${label.padEnd(56)} ${got.toFixed(2)} (attendu ${want})`);
};

near('35h/sem -> mensuel legal (fevrier, 28j)',  monthlyContractHours({contractHours:35}, '2026-02-10'), 151.67);
near('35h/sem -> mensuel legal (juillet, 31j)',  monthlyContractHours({contractHours:35}, '2026-07-10'), 151.67);
near('24h/sem -> mensuel',                        monthlyContractHours({contractHours:24}, '2026-09-10'), 104.00);
near('mois entierement avant l avenant',          monthlyContractHours(
  {contractHours:24, contractChanges:[{from:'2026-10-01',weeklyHours:30}]}, '2026-09-10'), 104.00);
near('mois entierement apres l avenant',          monthlyContractHours(
  {contractHours:24, contractChanges:[{from:'2026-10-01',weeklyHours:30}]}, '2026-11-10'), 130.00);
// avenant au 16 septembre : 15 jours a 24h, 15 a 30h
near('avenant en MILIEU de mois : proratise',     monthlyContractHours(
  {contractHours:24, contractChanges:[{from:'2026-09-16',weeklyHours:30}]}, '2026-09-10'),
  (24*15 + 30*15) / 30 * 52 / 12);
near('aucune donnee : zero',                      monthlyContractHours({}, '2026-09-10'), 0);

console.log(ko === 0 ? '\nTOUT PASSE' : `\n${ko} ECHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
