import React, { useState } from 'react';
import { Language } from '../types';
import { getTranslation } from '../utils/translations';
import { CONVENTIONS, conventionLabel } from '../utils/laborRules';

interface OnboardingScreenProps {
  email: string;
  /** Renvoie un message d'erreur, ou null une fois le restaurant cree. */
  onCreate: (name: string, convention: string) => Promise<string | null>;
  onLogout: () => void;
  language?: Language;
}

/**
 * Premier ecran d'un compte sans restaurant : creer le sien (essai de 14 jours,
 * sans carte), ou attendre l'invitation de son responsable. Deux questions
 * seulement — le nom, et la convention qui fixe les seuils des alertes ; le
 * reste se regle plus tard dans les Parametres.
 */
const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ email, onCreate, onLogout, language = 'fr' }) => {
  const t = getTranslation(language);
  const [name, setName] = useState('');
  const [convention, setConvention] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canCreate = name.trim().length > 0 && !!convention && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    setBusy(true); setError(null);
    const err = await onCreate(name.trim(), convention!);
    if (err) { setError(err); setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-slate-50">
      <div className="max-w-md w-full flex flex-col gap-4">
        <form onSubmit={submit} className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 flex flex-col gap-5" data-testid="onboarding">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight text-balance">{t('onbTitle')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('onbSubtitle')}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="onb-name" className="text-xs font-black uppercase tracking-widest text-slate-400">{t('onbName')}</label>
            <input id="onb-name" value={name} onChange={e => setName(e.target.value)} maxLength={80} autoFocus
              placeholder={t('onbNamePlaceholder')}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-base font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="flex flex-col gap-2">
            <span id="onb-conv" className="text-xs font-black uppercase tracking-widest text-slate-400">{t('conventionTitle')}</span>
            <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby="onb-conv">
              {['1501', '1979', 'none'].map(id => (
                <button key={id} type="button" role="radio" aria-checked={convention === id} onClick={() => setConvention(id)}
                  className={`text-left px-4 py-3 rounded-xl border text-sm font-bold transition-all ${convention === id ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {conventionLabel(CONVENTIONS[id])}
                  <span className="block text-xs font-medium text-slate-500 mt-0.5">{t('onbConvHint_' + id)}</span>
                </button>
              ))}
            </div>
          </div>
          {error && <p role="alert" className="text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          <button type="submit" disabled={!canCreate}
            className="w-full py-3.5 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-40 transition-all">
            {busy ? t('loading') : t('onbCreate')}
          </button>
          <p className="text-xs text-slate-400 text-center">{t('onbTrial')}</p>
        </form>
        <div className="bg-white rounded-3xl border border-slate-200 p-5 text-sm text-slate-600 flex flex-col gap-2">
          <p><b className="text-slate-800">{t('onbInvitedTitle')}</b> {t('onbInvitedBody').replace('{email}', email)}</p>
          <button type="button" onClick={onLogout} className="self-start text-sm font-semibold text-slate-500 hover:text-slate-800">{t('signOut')}</button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingScreen;
