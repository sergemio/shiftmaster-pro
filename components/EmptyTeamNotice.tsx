import React from 'react';
import { Language } from '../types';
import { getTranslation } from '../utils/translations';

/**
 * Ce qu'on montre quand il n'y a personne a placer.
 *
 * Pourquoi : un restaurant qui vient d'etre cree n'a aucun equipier. Le
 * formulaire de shift s'ouvrait avec un menu deroulant vide et un bouton
 * « Ajouter Shift » qui ne faisait rien — l'utilisateur ne savait pas par ou
 * commencer (retour de Serge, 21/09/2026). Ce bloc dit ce qui manque et mene
 * directement a l'endroit ou l'ajouter.
 *
 * Deux cas distincts, parce que le remede n'est pas le meme :
 * - `teamEmpty` : personne n'a jamais ete ajoute -> « Ajouter un equipier » ;
 * - sinon : l'equipe existe, mais personne n'est en poste cette semaine (date
 *   d'entree plus tard, ou depart) -> « Gerer l'equipe » pour verifier les dates.
 */
interface Props {
  language: Language | string;
  teamEmpty: boolean;
  /** Ce que l'utilisateur voulait faire : change seulement la phrase d'explication. */
  purpose: 'planning' | 'shift' | 'absence';
  onAddStaff: () => void;
}

const EmptyTeamNotice: React.FC<Props> = ({ language, teamEmpty, purpose, onAddStaff }) => {
  const t = getTranslation(language as Language);
  const body = teamEmpty
    ? t(purpose === 'absence' ? 'emptyTeamBodyAbsence' : purpose === 'shift' ? 'emptyTeamBodyShift' : 'emptyTeamBodyPlanning')
    : t('noStaffThisWeekBody');
  return (
    <div data-testid="empty-team" className="flex flex-col items-center text-center gap-3 px-2 py-2">
      <span className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 grid place-items-center" aria-hidden="true">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      </span>
      <h3 className="text-base font-bold text-slate-800 text-balance">{t(teamEmpty ? 'emptyTeamTitle' : 'noStaffThisWeekTitle')}</h3>
      <p className="text-sm text-slate-500 max-w-xs text-balance">{body}</p>
      <button
        type="button"
        onClick={onAddStaff}
        className="mt-1 h-11 px-5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-2 shadow-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
        {t(teamEmpty ? 'emptyTeamAction' : 'manageStaff')}
      </button>
    </div>
  );
};

export default EmptyTeamNotice;
