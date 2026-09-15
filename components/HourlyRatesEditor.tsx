import React, { useState, useEffect } from 'react';
import { Language, Staff } from '../types';
import { isFormerStaff, formatMoney } from '../utils/helpers';

interface HourlyRatesEditorProps {
  staff: Staff[];
  rates: Record<string, number>;
  onChange: (rates: Record<string, number>) => void;
  language?: Language;
}

/**
 * Saisie des couts horaires charges, un par salarie.
 *
 * Trois choix qui meritent d'etre dits :
 *
 * 1. **Cout CHARGE, pas salaire brut.** Le libelle l'ecrit noir sur blanc, et
 *    la phrase d'aide le repete. Un brut saisi ici afficherait des couts
 *    inferieurs de vingt-cinq a quarante pour cent a ce que le restaurant
 *    decaisse — un chiffre faux dans le bon sens est plus dangereux que pas de
 *    chiffre du tout, parce qu'on decide dessus.
 *
 * 2. **Un ecran a part, pas un champ de plus dans la fiche d'equipe.** La fiche
 *    d'equipe s'enregistre dans `settings/staff`, que TOUTE l'equipe peut lire.
 *    Les montants vivent dans `settings/rates`, que seuls les admins peuvent
 *    lire. Deux documents, deux permissions : c'est la separation qui protege,
 *    pas le fait de cacher le champ.
 *
 * 3. **Vide veut dire « inconnu », jamais « zero ».** Un champ laisse vide
 *    retire la cle. Le planning affiche alors un shift sans montant plutot
 *    qu'un shift a zero euro qui se totaliserait en silence.
 */
const HourlyRatesEditor: React.FC<HourlyRatesEditorProps> = ({ staff, rates, onChange, language = 'en' }) => {
  const fr = language === 'fr';
  // Brouillon local : on tape « 1 », puis « 8 », puis « ,5 ». Remonter chaque
  // frappe au parent ecrirait en base a chaque caractere — et « 1 » serait
  // sauvegarde comme un vrai taux le temps de taper le reste.
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    setDraft(Object.fromEntries(Object.entries(rates).map(([id, v]) => [id, String(v)])));
  }, [rates]);

  const commit = (id: string, raw: string) => {
    const value = parseFloat(raw.replace(',', '.'));
    const next = { ...rates };
    if (Number.isFinite(value) && value > 0) next[id] = Math.round(value * 100) / 100;
    else delete next[id];
    onChange(next);
  };

  // Les anciens salaries en dernier : on renseigne le taux de gens qui
  // travaillent, la liste ne doit pas s'ouvrir sur ceux qui sont partis.
  const ordered = [...staff].sort((a, b) => {
    const fa = isFormerStaff(a) ? 1 : 0, fb = isFormerStaff(b) ? 1 : 0;
    return fa - fb || a.name.localeCompare(b.name);
  });

  const missing = ordered.filter(s => !isFormerStaff(s) && !rates[s.id]).length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 leading-snug">
        {fr
          ? 'Coût employeur par heure, charges patronales comprises — pas le salaire brut. Visible des seuls administrateurs.'
          : 'Employer cost per hour, payroll taxes included — not the gross wage. Visible to administrators only.'}
      </p>

      <div className="space-y-1.5">
        {ordered.map(person => {
          const former = isFormerStaff(person);
          return (
            <div key={person.id} className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: person.color }}
                aria-hidden="true"
              />
              <span className={`flex-1 text-sm font-semibold truncate ${former ? 'text-slate-400' : 'text-slate-700'}`}>
                {person.name}
                {former && (
                  <span className="ml-1 text-xs font-medium text-slate-400">
                    {fr ? '· parti' : '· former'}
                  </span>
                )}
              </span>
              <div className="relative w-24 flex-shrink-0">
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft[person.id] ?? ''}
                  placeholder="—"
                  onChange={e => setDraft(d => ({ ...d, [person.id]: e.target.value }))}
                  onBlur={e => commit(person.id, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  aria-label={`${person.name} — ${fr ? 'coût horaire chargé' : 'loaded hourly cost'}`}
                  /* 16px minimum : en dessous, iOS Safari zoome la page au focus
                     et n'en revient pas (R4.6). */
                  className="w-full text-base text-right tabular-nums pr-7 pl-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-slate-400">
                  €
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {missing > 0 && (
        /* Ambre et non rouge : un taux manquant n'est pas une panne, c'est un
           travail pas encore fait — et il explique pourquoi un total sera
           annonce partiel (R5.3). */
        <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 leading-snug">
          {fr
            ? `${missing} personne${missing > 1 ? 's' : ''} sans taux : leurs services s'afficheront sans montant.`
            : `${missing} ${missing > 1 ? 'people' : 'person'} without a rate: their shifts show no amount.`}
        </p>
      )}

      {/* Un exemple chiffre vaut mieux qu'une explication : il dit d'un coup
          l'unite attendue et ce que le chiffre produira sur le planning. */}
      <p className="text-xs text-slate-400 leading-snug">
        {fr
          ? `Exemple : 18 € de l'heure, un service de 6 h coûte ${formatMoney(108, 'fr')}.`
          : `Example: at €18/hour, a 6-hour shift costs ${formatMoney(108, 'en')}.`}
      </p>
    </div>
  );
};

export default HourlyRatesEditor;
