import React, { useMemo, useState } from 'react';
import { Extra, Language } from '../types';
import { getTranslation } from '../utils/translations';
import { formatShortDate } from '../utils/helpers';
import DateField from './DateField';

interface ExtrasModalProps {
  isOpen: boolean;
  onClose: () => void;
  extras: Extra[];
  onSave: (extra: Extra) => void;
  language: Language;
  isReadOnly?: boolean;
}

/**
 * VIVIER D'EXTRAS — la fiche que l'admin remplit lui-meme.
 *
 * Pourquoi cet ecran existe. Un extra nait d'un shift : le manager tape un
 * prenom (ou rien, et le shift s'appelle « Extra 1 »), et la fiche est creee
 * vide. Restaient donc sans aucun endroit ou etre saisis le telephone, le taux
 * horaire et les informations de paie. Le lien envoye a la personne (chantier
 * suivant, il demande une Cloud Function) ne remplace pas cet ecran : le
 * manager a souvent le numero dans son telephone et va plus vite a le recopier
 * qu'a attendre que quelqu'un remplisse un formulaire.
 *
 * Un seul champ est obligatoire : le prenom, parce que c'est lui qui s'affiche
 * sur le planning. Tout le reste — y compris le numero de securite sociale —
 * peut rester vide et s'enregistre quand meme (decision de Serge du 17/09/2026 :
 * « si c'est pas rempli, il faut pas que ce soit bloquant »). Le produit offre
 * le moyen d'etre en regle, il ne l'impose pas.
 *
 * Confidentialite : ces donnees ne sortent jamais de `orgs/{orgId}/extras/`,
 * que la regle Firestore reserve aux admins. L'equipe ne voit que le prenom,
 * recopie sur le shift.
 */
const ExtrasModal: React.FC<ExtrasModalProps> = ({ isOpen, onClose, extras, onSave, language, isReadOnly = false }) => {
  const t = getTranslation(language);

  /** `null` = la liste ; sinon la fiche ouverte. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Extra | null>(null);
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Le plus recemment venu en tete : c'est celui qu'on cherche le plus souvent.
  // Les fiches a completer passent devant, elles attendent une action.
  const ordered = useMemo(
    () => [...extras].sort((a, b) => {
      const pa = a.filledAt ? 1 : 0, pb = b.filledAt ? 1 : 0;
      if (pa !== pb) return pa - pb;
      return (b.lastMission || b.createdAt || '').localeCompare(a.lastMission || a.createdAt || '');
    }),
    [extras],
  );

  if (!isOpen) return null;

  const open = (extra: Extra) => {
    setEditingId(extra.id);
    setForm({ ...extra, payroll: { ...(extra.payroll || {}) } });
    setPayrollOpen(!!extra.payroll && Object.values(extra.payroll).some(v => !!v));
    setJustSaved(false);
  };

  const backToList = () => { setEditingId(null); setForm(null); };

  const set = (patch: Partial<Extra>) => setForm(f => (f ? { ...f, ...patch } : f));
  const setPay = (patch: Partial<NonNullable<Extra['payroll']>>) =>
    setForm(f => (f ? { ...f, payroll: { ...(f.payroll || {}), ...patch } } : f));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || isReadOnly) return;
    const firstName = form.firstName.trim();
    if (!firstName) return;
    // `filledAt` marque le moment ou la fiche a cesse d'etre un simple prenom :
    // c'est ce qui fait disparaitre l'etiquette « a completer » et ce qui, plus
    // tard, rendra l'extra comptable dans les regles de duree du travail.
    const identified = !!(form.phone?.trim() || form.email?.trim() || form.lastName?.trim());
    onSave({
      ...form,
      firstName,
      lastName: form.lastName?.trim() || '',
      phone: form.phone?.trim() || '',
      email: form.email?.trim() || '',
      filledAt: form.filledAt || (identified ? new Date().toISOString() : null),
    });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const field = 'w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-all';
  const label = 'block text-sm font-bold text-slate-600 mb-2';

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl w-full max-w-md max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="flex-none p-6 md:p-8 pb-4 flex justify-between items-start gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {form && (
              <button type="button" onClick={backToList} className="text-slate-400 hover:text-slate-700 transition-colors -ml-1" aria-label={t('extrasTitle')}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
            )}
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 truncate">
              {form ? (form.firstName || t('extraNewTitle')) : t('extrasTitle')}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors p-1 flex-none">
            <svg className="w-6 h-6 md:w-7 md:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {!form ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8 pt-2 space-y-2">
            <p className="text-xs text-slate-400 font-medium mb-4">{t('extrasIntro')}</p>
            {ordered.length === 0 && (
              <p className="text-sm text-slate-400 italic text-center py-6">{t('extrasEmpty')}</p>
            )}
            {ordered.map(extra => (
              <button
                key={extra.id}
                type="button"
                onClick={() => open(extra)}
                className="w-full text-left p-4 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-2xl transition-colors flex items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-800 truncate">
                    {extra.firstName} {extra.lastName}
                    {!extra.retained && <span className="ml-2 text-xs font-semibold text-slate-400">{t('extraOneOff')}</span>}
                  </p>
                  <p className="text-xs font-medium text-slate-500 truncate">
                    {extra.phone || (extra.filledAt ? t('extraNoPhone') : t('extraPending'))}
                    {extra.lastMission && ` · ${t('extraLastMission')} ${formatShortDate(extra.lastMission, language)}`}
                  </p>
                </div>
                {!extra.filledAt && <span className="flex-none text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-lg">{t('extraToComplete')}</span>}
                <svg className="w-4 h-4 text-slate-300 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={submit} className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8 pt-2 space-y-4">
            <p className="text-xs text-slate-400 font-medium">{t('extraOnlyFirstNameRequired')}</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="ex-first">{t('extraFirstName')}</label>
                <input id="ex-first" className={field} value={form.firstName} onChange={e => set({ firstName: e.target.value })} required maxLength={60} disabled={isReadOnly} />
              </div>
              <div>
                <label className={label} htmlFor="ex-last">{t('extraLastName')}</label>
                <input id="ex-last" className={field} value={form.lastName || ''} onChange={e => set({ lastName: e.target.value })} disabled={isReadOnly} />
              </div>
            </div>

            <div>
              <label className={label} htmlFor="ex-phone">{t('extraPhone')}</label>
              <input id="ex-phone" type="tel" className={field} value={form.phone || ''} onChange={e => set({ phone: e.target.value })} disabled={isReadOnly} />
            </div>

            <div>
              <label className={label} htmlFor="ex-email">{t('extraEmail')}</label>
              <input id="ex-email" type="email" className={field} value={form.email || ''} onChange={e => set({ email: e.target.value })} disabled={isReadOnly} />
            </div>

            <div>
              <label className={label} htmlFor="ex-rate">{t('extraRate')}</label>
              <input
                id="ex-rate" type="number" min="0" step="0.01" className={field}
                value={form.rate ?? ''}
                onChange={e => set({ rate: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                disabled={isReadOnly}
              />
              <p className="mt-2 text-xs text-slate-400 font-medium">{t('extraRateHint')}</p>
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
              <input type="checkbox" checked={form.retained} onChange={e => set({ retained: e.target.checked })} className="w-4 h-4 rounded" disabled={isReadOnly} />
              {t('extraRetain')}
            </label>

            {/* Informations de paie : repliees par defaut. Elles servent a la
                declaration avant la venue, pas au planning — les ouvrir d'office
                donnerait a croire qu'il faut les remplir pour enregistrer. */}
            <div className="border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setPayrollOpen(o => !o)}
                aria-expanded={payrollOpen}
                className="w-full flex items-center justify-between text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors"
              >
                {t('extraPayrollSection')}
                <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${payrollOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>

              {payrollOpen && (
                <div className="mt-4 space-y-4">
                  <DateField
                    label={t('extraBirthDate')}
                    value={form.payroll?.birthDate || ''}
                    onChange={v => setPay({ birthDate: v })}
                    language={language}
                    labelClassName={label}
                    className={field}
                  />
                  <div>
                    <label className={label} htmlFor="ex-birthplace">{t('extraBirthPlace')}</label>
                    <input id="ex-birthplace" className={field} value={form.payroll?.birthPlace || ''} onChange={e => setPay({ birthPlace: e.target.value })} disabled={isReadOnly} />
                  </div>
                  <div>
                    <label className={label} htmlFor="ex-address">{t('extraAddress')}</label>
                    <input id="ex-address" className={field} value={form.payroll?.address || ''} onChange={e => setPay({ address: e.target.value })} disabled={isReadOnly} />
                  </div>
                  <div>
                    <label className={label} htmlFor="ex-ssn">{t('extraSsn')}</label>
                    <input id="ex-ssn" inputMode="numeric" className={field} value={form.payroll?.ssn || ''} onChange={e => setPay({ ssn: e.target.value })} disabled={isReadOnly} />
                  </div>
                  <div>
                    <label className={label} htmlFor="ex-nat">{t('extraNationality')}</label>
                    <input id="ex-nat" className={field} value={form.payroll?.nationality || ''} onChange={e => setPay({ nationality: e.target.value })} disabled={isReadOnly} />
                  </div>
                </div>
              )}
            </div>

            {!isReadOnly && (
              <div className="flex items-center gap-3 pt-2">
                <button type="submit" className="flex-1 h-12 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all active:scale-95">
                  {justSaved ? t('saved') : t('save')}
                </button>
                <button type="button" onClick={backToList} className="h-12 px-5 text-slate-500 font-bold hover:text-slate-700 transition-colors">
                  {t('close')}
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
};

export default ExtrasModal;
