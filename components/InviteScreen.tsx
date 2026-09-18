import React, { useState } from 'react';
import { Language } from '../types';
import { getTranslation } from '../utils/translations';

export type InviteState = 'working' | 'unverified' | 'wrongEmail' | 'notFound' | 'error';

interface InviteScreenProps {
  state: InviteState;
  email: string;
  /** Message du serveur, affiche tel quel pour une erreur imprevue. */
  detail?: string;
  /** L'adresse a-t-elle ete verifiee entre-temps ? Relance l'acceptation si oui. */
  onCheckVerified: () => Promise<boolean>;
  onResend: () => Promise<void>;
  onLogout: () => void;
  /** Abandonner l'invitation et continuer (creer son restaurant, par exemple). */
  onDismiss: () => void;
  language?: Language;
}

/**
 * Acceptation d'une invitation. Le serveur exige l'adresse invitee, verifiee :
 * cet ecran explique ce qui manque et comment le regler, sans cul-de-sac.
 */
const InviteScreen: React.FC<InviteScreenProps> = ({
  state, email, detail, onCheckVerified, onResend, onLogout, onDismiss, language = 'fr',
}) => {
  const t = getTranslation(language);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true); setNote(null);
    const ok = await onCheckVerified();
    if (!ok) setNote(t('invStillUnverified'));
    setBusy(false);
  };
  const resend = async () => {
    setBusy(true); setNote(null);
    try { await onResend(); setNote(t('invResent').replace('{email}', email)); }
    catch { setNote(t('authErrTooMany')); }
    setBusy(false);
  };

  const btn = 'w-full py-3 rounded-2xl font-bold transition-all disabled:opacity-50';
  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-slate-50">
      <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 flex flex-col gap-4" data-testid="invite-screen">
        <h1 className="text-xl font-black text-slate-900 text-balance">{t('invTitle')}</h1>
        {state === 'working' && <p className="text-slate-600">{t('invWorking')}</p>}
        {state === 'unverified' && (
          <>
            <p className="text-slate-600">{t('invUnverified').replace('{email}', email)}</p>
            <button type="button" onClick={check} disabled={busy} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}>{t('invVerifiedBtn')}</button>
            <button type="button" onClick={resend} disabled={busy} className={`${btn} bg-slate-100 text-slate-700 hover:bg-slate-200`}>{t('invResend')}</button>
          </>
        )}
        {state === 'wrongEmail' && <p className="text-slate-600">{t('invWrongEmail').replace('{email}', email)}</p>}
        {state === 'notFound' && <p className="text-slate-600">{t('invNotFound')}</p>}
        {state === 'error' && <p className="text-slate-600">{t('authErrUnknown')}{detail ? ` (${detail})` : ''}</p>}
        {note && <p role="status" className="text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{note}</p>}
        {state !== 'working' && (
          <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-slate-100 text-sm">
            <button type="button" onClick={onLogout} className="font-semibold text-slate-600 hover:text-slate-900">{t('invOtherAccount')}</button>
            <button type="button" onClick={onDismiss} className="text-slate-500 hover:text-slate-800">{t('invDismiss')}</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InviteScreen;
