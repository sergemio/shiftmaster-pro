import React, { useEffect, useRef, useState } from 'react';
import { Language } from '../types';
import { getTranslation } from '../utils/translations';
import { confirmEmailCode, checkResetCode, setNewPassword } from '../services/firebaseService';

/** Le lien recu par email porte `mode` et `oobCode` : on le traite ici. */
export const authActionFromUrl = (): { mode: string; code: string; next: string } | null => {
  const q = new URLSearchParams(window.location.search);
  const mode = q.get('mode'), code = q.get('oobCode');
  if (!mode || !code || !['verifyEmail', 'resetPassword'].includes(mode)) return null;
  // Retour prevu : la page d'ou l'email est parti (lien d'invitation compris),
  // seulement sur ce site.
  let next = window.location.origin + window.location.pathname;
  const cont = q.get('continueUrl');
  try { if (cont && new URL(cont).origin === window.location.origin) next = cont; } catch { /* lien abime */ }
  return { mode, code, next };
};

/**
 * Confirmation d'adresse et nouveau mot de passe, dans l'app et dans sa langue.
 * Avant (recette du 22/09/2026) la page generique de Firebase repondait
 * « The selected page mode is invalid » : une invitee ne pouvait pas entrer.
 */
const AuthActionPage: React.FC<{ mode: string; code: string; next: string }> = ({ mode, code, next }) => {
  // La langue du mail d'abord : le lien s'ouvre souvent sur un autre appareil.
  let lang: Language = 'fr';
  const fromLink = new URLSearchParams(window.location.search).get('lang');
  try { lang = (localStorage.getItem('shiftmaster_lang') as Language) || 'fr'; } catch { /* navigation privee */ }
  if (fromLink === 'en' || fromLink === 'fr') lang = fromLink;
  const t = getTranslation(lang);
  const [state, setState] = useState<'working' | 'done' | 'error' | 'form'>('working');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [formError, setFormError] = useState('');

  // Un code ne sert qu'une fois : ne jamais l'envoyer deux fois (le mode strict
  // de React rejoue les effets en developpement).
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (mode === 'verifyEmail') {
      confirmEmailCode(code).then(r => setState(r.error ? 'error' : 'done'));
    } else {
      checkResetCode(code).then(r => { if (r.error) setState('error'); else { setEmail(r.email || ''); setState('form'); } });
    }
  }, [mode, code]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 8) { setFormError(t('authErrWeak')); return; }
    const r = await setNewPassword(code, pwd);
    if (r.error) setFormError(t('actionLinkInvalid')); else setState('done');
  };

  const title = mode === 'verifyEmail' ? t('actionVerifyTitle') : t('actionResetTitle');
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4" data-testid="auth-action">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-8 space-y-4 shadow-sm">
        <h1 className="text-xl font-black text-slate-900">{title}</h1>
        {state === 'working' && <p className="text-sm text-slate-500">{t('actionWorking')}</p>}
        {state === 'error' && <p role="alert" className="text-sm text-red-600">{t('actionLinkInvalid')}</p>}
        {state === 'done' && (
          <p className="text-sm text-slate-700">{mode === 'verifyEmail' ? t('actionVerified') : t('actionPasswordChanged')}</p>
        )}
        {state === 'form' && (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm text-slate-600">{t('actionResetFor').replace('{email}', email)}</p>
            <label className="block">
              <span className="block text-xs font-bold text-slate-500 mb-1">{t('actionNewPassword')}</span>
              <input type="password" autoComplete="new-password" value={pwd} onChange={e => setPwd(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-base focus:ring-2 focus:ring-indigo-500 outline-none" />
            </label>
            {formError && <p role="alert" className="text-xs text-red-600">{formError}</p>}
            <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-semibold hover:bg-indigo-700">
              {t('actionSavePassword')}
            </button>
          </form>
        )}
        {(state === 'done' || state === 'error') && (
          <a href={next} className="block w-full text-center py-3 bg-slate-900 text-white rounded-2xl font-semibold hover:bg-slate-800">
            {t('actionContinue')}
          </a>
        )}
      </div>
    </div>
  );
};

export default AuthActionPage;
