import React, { useEffect, useRef, useState } from 'react';
import { Language } from '../types';
import { getTranslation } from '../utils/translations';
import { useDismiss } from './useDismiss';
import { toast } from './Toast';

/**
 * « Une remarque ? » (10/10/2026) : un bug, une idee, un manque, ecrit en deux
 * lignes depuis n'importe quel ecran. La remarque part a l'editeur (Firestore
 * `orgs/{orgId}/feedback`, lisible par le support seulement), avec l'ecran et
 * la semaine affiches : sans ce contexte, « ca ne marche pas » ne se reproduit pas.
 */
interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Envoie la remarque ; false si l'ecriture a echoue. */
  onSend: (text: string) => Promise<boolean>;
  language: string;
}

const FeedbackModal: React.FC<FeedbackModalProps> = (props) => props.isOpen ? <FeedbackBody {...props} /> : null;

const FeedbackBody: React.FC<FeedbackModalProps> = ({ onClose, onSend, language }) => {
  const t = getTranslation((language || 'fr') as Language);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const backdrop = useDismiss(onClose);
  useEffect(() => { area.current?.focus(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    const ok = await onSend(text.trim());
    setSending(false);
    if (!ok) { toast(t('fbFailed'), { kind: 'error' }); return; }
    toast(t('fbSent'));
    onClose();
  };

  return (
    <div {...backdrop} className="fixed inset-0 z-[200] bg-slate-900/40 flex items-end sm:items-center justify-center p-0 sm:p-4" data-testid="feedback-modal">
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="fb-title"
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 flex flex-col gap-3">
        <h2 id="fb-title" className="text-lg font-bold text-slate-900">{t('fbTitle')}</h2>
        <p className="text-sm text-slate-600 leading-relaxed">{t('fbIntro')}</p>
        <label htmlFor="fb-text" className="sr-only">{t('fbTitle')}</label>
        <textarea id="fb-text" ref={area} value={text} onChange={e => setText(e.target.value)}
          rows={5} maxLength={2000} placeholder={t('fbPlaceholder')}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none resize-none placeholder:text-slate-400" />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="h-11 px-4 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors">
            {t('cancel')}
          </button>
          <button type="submit" disabled={!text.trim() || sending}
            className="h-11 px-5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {t('fbSend')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default FeedbackModal;
