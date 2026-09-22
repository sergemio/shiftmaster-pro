import React, { useState } from 'react';
import { Language } from '../types';
import { getTranslation } from '../utils/translations';
import { exportOrgCall, deleteOrgCall } from '../services/firebaseService';

/**
 * Donnees du restaurant (RGPD, decision de Serge du 22/09/2026) :
 * - tout telecharger, pour un admin (droit d'acces et de portabilite) ;
 * - supprimer le restaurant, pour le proprietaire seul, en retapant son nom.
 *   Suppression immediate ; les sauvegardes de la nuit la gardent 30 jours.
 */
const AccountDataSection: React.FC<{
  language: Language;
  orgName: string;
  isOwner: boolean;
  onDeleted: () => void;
}> = ({ language, orgName, isOwner, onDeleted }) => {
  const t = getTranslation(language);
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');

  const download = async () => {
    setBusy('export'); setError('');
    const { data, error: err } = await exportOrgCall();
    setBusy(null);
    if (err || !data) { setError(t('orgExportFailed')); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const safe = orgName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    link.download = `${safe || 'restaurant'}-${new Date().toISOString().slice(0, 10)}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const remove = async () => {
    setBusy('delete'); setError('');
    const { ok, error: err } = await deleteOrgCall(typed);
    setBusy(null);
    if (!ok) { setError(err || t('orgDeleteFailed')); return; }
    onDeleted();
  };

  return (
    <section data-testid="account-data">
      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2.5">{t('orgDataTitle')}</h3>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={download}
          disabled={busy !== null}
          className="w-full py-3 px-6 bg-white text-slate-700 border border-slate-200 rounded-2xl font-semibold hover:bg-slate-50 transition-all duration-200 active:scale-95 text-sm disabled:opacity-50"
        >
          {busy === 'export' ? t('orgExporting') : t('orgExportAll')}
        </button>

        {isOwner && !confirming && (
          <button
            type="button"
            onClick={() => { setConfirming(true); setTyped(''); setError(''); }}
            className="w-full py-3 px-6 text-red-600 rounded-2xl font-semibold hover:bg-red-50 transition-colors text-sm"
          >
            {t('orgDelete')}
          </button>
        )}

        {isOwner && confirming && (
          <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 space-y-3">
            <p className="text-sm text-slate-700 leading-relaxed">{t('orgDeleteWarning')}</p>
            <label className="block">
              <span className="block text-xs font-bold text-slate-600 mb-1">
                {t('orgDeleteType').replace('{name}', orgName)}
              </span>
              <input
                id="org-delete-confirm"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 outline-none"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 py-2.5 border border-slate-200 bg-white text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={typed !== orgName || busy !== null}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy === 'delete' ? t('orgDeleting') : t('orgDeleteConfirm')}
              </button>
            </div>
          </div>
        )}

        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
    </section>
  );
};

export default AccountDataSection;
