import React, { useState } from 'react';
import { Language } from '../types';
import { getTranslation } from '../utils/translations';

interface AuthFormProps {
  onSignIn: (email: string, password: string) => Promise<string | null>;
  onSignUp: (name: string, email: string, password: string) => Promise<string | null>;
  onReset: (email: string) => Promise<string | null>;
  /** Arrive par une invitation : on propose d'abord de creer le compte. */
  initialMode?: 'signin' | 'signup';
  language?: Language;
}

/** Les codes d'erreur Firebase, dits en clair : ce qui s'est passe et quoi faire. */
const ERROR_KEYS: Record<string, string> = {
  'auth/invalid-credential': 'authErrCredentials',
  'auth/wrong-password': 'authErrCredentials',
  'auth/user-not-found': 'authErrCredentials',
  'auth/invalid-email': 'authErrEmail',
  'auth/missing-email': 'authErrEmail',
  'auth/email-already-in-use': 'authErrInUse',
  'auth/weak-password': 'authErrWeak',
  'auth/missing-password': 'authErrWeak',
  'auth/too-many-requests': 'authErrTooMany',
  'auth/network-request-failed': 'authErrNetwork',
};

/**
 * Connexion, inscription et mot de passe oublie par email. La connexion Google
 * reste au-dessus, dans l'ecran d'accueil. Un seul formulaire, trois modes :
 * l'email saisi suit d'un mode a l'autre.
 */
const AuthForm: React.FC<AuthFormProps> = ({ onSignIn, onSignUp, onReset, initialMode = 'signin', language = 'fr' }) => {
  const t = getTranslation(language);
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const say = (code: string | null) => setError(code ? t(ERROR_KEYS[code] || 'authErrUnknown') : null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null);
    if (mode === 'signup' && password.length < 8) { setError(t('authErrWeak')); return; }
    setBusy(true);
    try {
      if (mode === 'signin') say(await onSignIn(email, password));
      else if (mode === 'signup') say(await onSignUp(name, email, password));
      else {
        const code = await onReset(email);
        // Meme message que l'adresse existe ou non : ne pas reveler qui a un compte.
        if (code && code !== 'auth/user-not-found') say(code);
        else setInfo(t('authResetSent').replace('{email}', email.trim()));
      }
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (m: typeof mode) => { setMode(m); setError(null); setInfo(null); };
  const input = 'rounded-xl px-3 py-2.5 bg-white text-slate-900 text-base placeholder:text-slate-400 border border-white/60 focus:outline-none focus:ring-2 focus:ring-lime-400';

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5 bg-white/10 border border-white/20 rounded-3xl p-5" data-testid="auth-form" noValidate>
      <h2 className="text-lg font-black text-white">
        {t(mode === 'signin' ? 'authSignInTitle' : mode === 'signup' ? 'authSignUpTitle' : 'authResetTitle')}
      </h2>
      {mode === 'signup' && (
        <input value={name} onChange={e => setName(e.target.value)} autoComplete="name"
          placeholder={t('authName')} aria-label={t('authName')} className={input} />
      )}
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email"
        placeholder={t('authEmail')} aria-label="Email" className={input} required />
      {mode !== 'reset' && (
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          placeholder={mode === 'signup' ? t('authPasswordNew') : t('authPassword')} aria-label={t('authPassword')}
          className={input} required />
      )}
      {error && <p role="alert" className="text-sm font-semibold text-red-100 bg-red-500/30 rounded-lg px-3 py-2">{error}</p>}
      {info && <p role="status" className="text-sm font-semibold text-lime-100 bg-lime-500/20 rounded-lg px-3 py-2">{info}</p>}
      <button type="submit" disabled={busy}
        className="bg-lime-400 text-emerald-950 font-bold rounded-xl py-2.5 disabled:opacity-60 hover:bg-lime-300 transition-colors">
        {t(mode === 'signin' ? 'authSignIn' : mode === 'signup' ? 'authSignUp' : 'authResetSend')}
      </button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        {mode === 'signin' ? (
          <>
            <button type="button" onClick={() => switchTo('signup')} className="font-semibold text-lime-200 hover:text-white">{t('authToSignUp')}</button>
            <button type="button" onClick={() => switchTo('reset')} className="text-emerald-100/80 hover:text-white">{t('authForgot')}</button>
          </>
        ) : (
          <button type="button" onClick={() => switchTo('signin')} className="font-semibold text-lime-200 hover:text-white">{t('authToSignIn')}</button>
        )}
      </div>
    </form>
  );
};

export default AuthForm;
