import React, { useState, useMemo } from 'react';
import { Staff, Language, AbsencePeriod, LeaveBalance, LeaveUnit, Invite } from '../types';
import { getTranslation } from '../utils/translations';
import LeaveCard from './LeaveCard';
import { isFormerStaff, todayIso, currentContractHours, formatShortDate } from '../utils/helpers';
import DateField from './DateField';

interface StaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffList: Staff[];
  guestEmails: string[];
  onAdd: (staff: Staff) => void;
  onUpdate: (staff: Staff) => void;
  onAddGuest: (email: string) => void;
  onRemoveGuest: (email: string) => void;
  language: string;
  /** Absences de toute l'equipe (admins) : historique et compteur de conges. */
  periods?: AbsencePeriod[];
  leaveBalances?: Record<string, LeaveBalance>;
  onSaveLeaveBalance?: (staffId: string, anchorDate: string, anchorBalance: number) => void;
  leaveUnit?: LeaveUnit;
  closedHolidays?: string[];
  /** Invitations en attente (jeton -> invitation). Absent = pas de gestion des acces. */
  invites?: Record<string, Invite>;
  /** Cree l'invitation d'une fiche ; renvoie le jeton du lien. */
  onInvite?: (staff: Staff) => Promise<string | null>;
  onCancelInvite?: (token: string) => void;
  inviteUrl?: (token: string) => string;
  orgName?: string;
}

const StaffModal: React.FC<StaffModalProps> = ({
  isOpen,
  onClose,
  staffList,
  guestEmails = [],
  onAdd,
  onUpdate,
  onAddGuest,
  onRemoveGuest,
  language,
  periods = [],
  leaveBalances = {},
  onSaveLeaveBalance,
  leaveUnit = 'ouvrables',
  closedHolidays = [],
  invites = {},
  onInvite,
  onCancelInvite,
  inviteUrl,
  orgName = '',
}) => {
  if (!isOpen) return null;

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newContractHours, setNewContractHours] = useState(35);
  const [newColor, setNewColor] = useState('#6366f1');
  const [newRole, setNewRole] = useState<'admin' | 'staff'>('staff');
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newGuestEmail, setNewGuestEmail] = useState('');
  const [isAddingGuest, setIsAddingGuest] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContractHours, setEditContractHours] = useState(0);
  // Avenants en cours d'edition. On travaille sur une copie : tant que Serge n'a
  // pas enregistre, la fiche d'origine n'est pas touchee.
  const [editChanges, setEditChanges] = useState<{ from: string; weeklyHours: number }[]>([]);
  const [newChangeFrom, setNewChangeFrom] = useState('');
  const [newChangeHours, setNewChangeHours] = useState(35);
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'staff'>('staff');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editIsPool, setEditIsPool] = useState(false);
  const [editWorkDays, setEditWorkDays] = useState(5);
  const t = getTranslation(language as Language);
  const [showSavedId, setShowSavedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ staff: Staff; action: 'leave' | 'reinstate' } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Invitation en attente pour une fiche (la plus recente).
  const inviteOf = (staff: Staff): [string, Invite] | undefined =>
    Object.entries(invites).filter(([, inv]) => inv.staffId === staff.id).sort((a, b) => b[1].createdAt.localeCompare(a[1].createdAt))[0];

  const copyLink = async (token: string) => {
    if (!inviteUrl) return;
    try { await navigator.clipboard.writeText(inviteUrl(token)); setCopiedToken(token); setTimeout(() => setCopiedToken(null), 2000); }
    catch { window.prompt(t('smInviteCopyPrompt'), inviteUrl(token)); }
  };

  // Email pre-rempli, envoye depuis la messagerie de l'admin : aucun service
  // d'envoi a payer, et l'employe recoit le lien d'une adresse qu'il connait.
  const mailtoFor = (staff: Staff, token: string) => {
    const subject = t('smInviteMailSubject').replace('{org}', orgName);
    const body = t('smInviteMailBody')
      .replace('{name}', staff.name.split(' ')[0])
      .replace('{org}', orgName)
      .replace('{email}', staff.email)
      .replace('{link}', inviteUrl ? inviteUrl(token) : '');
    return `mailto:${encodeURIComponent(staff.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // Active people first, then former ones (most recently gone at the top).
  const orderedStaff = useMemo(() => {
    return [...staffList].sort((a, b) => {
      const fa = isFormerStaff(a), fb = isFormerStaff(b);
      if (fa !== fb) return fa ? 1 : -1;
      if (fa && fb) return (b.endDate || '').localeCompare(a.endDate || '');
      return 0;
    });
  }, [staffList]);

  const applyConfirmed = () => {
    if (!confirming) return;
    const { staff, action } = confirming;
    onUpdate({ ...staff, endDate: action === 'leave' ? todayIso() : null });
    setConfirming(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) {
      alert(t('smNameEmailRequired'));
      return;
    }
    
    if (!newStartDate) {
      alert(t('smStartRequired'));
      return;
    }

    const newStaff: Staff = {
      id: Math.random().toString(36).substr(2, 9),
      name: newName,
      email: (newEmail || '').trim().toLowerCase(),
      color: newColor,
      contractHours: newContractHours,
      role: newRole,
      jobTitle: newJobTitle,
      startDate: newStartDate,
      endDate: newEndDate || null,
    };

    onAdd(newStaff);
    setNewName('');
    setNewEmail('');
    setNewContractHours(35);
    setNewRole('staff');
    setNewJobTitle('');
    setNewColor('#6366f1');
    setNewStartDate('');
    setNewEndDate('');
    setIsAddingNew(false);
  };

  const startEditing = (staff: Staff) => {
    setEditingId(staff.id);
    setEditContractHours(currentContractHours(staff));
    setEditChanges([...(staff.contractChanges || [])].sort((a, b) => a.from.localeCompare(b.from)));
    setNewChangeFrom('');
    setNewChangeHours(currentContractHours(staff) || 35);
    setEditEmail(staff.email || '');
    setEditRole(staff.role);
    setEditJobTitle(staff.jobTitle || '');
    setEditColor(staff.color);
    setEditStartDate(staff.startDate || '');
    setEditEndDate(staff.endDate || '');
    setEditIsPool(!!staff.isPool);
    setEditWorkDays(staff.workDaysPerWeek || 5);
    setIsAddingNew(false); // Hide add form if we start editing someone
  };

  const saveEdit = (e: React.MouseEvent, staff: Staff) => {
    e.stopPropagation(); 
    
    onUpdate({
      ...staff,
      contractHours: editContractHours,
      // Toujours ecrit, meme vide : sans ca, supprimer le dernier avenant
      // laisserait l'ancien tableau en base et le contrat resterait fige dessus.
      contractChanges: editChanges,
      // L'ancien nom reste synchronise le temps que toutes les fiches soient
      // reenregistrees : une sauvegarde restauree ou un onglet pas rafraichi
      // continue de lire un chiffre juste.
      targetHours: editContractHours,
      email: (editEmail || '').trim().toLowerCase(),
      role: editRole,
      jobTitle: editJobTitle,
      color: editColor,
      startDate: editStartDate || undefined,
      endDate: editEndDate || null,
      isPool: editIsPool,
      workDaysPerWeek: editWorkDays,
    });
    
    setShowSavedId(staff.id);
    setEditingId(null);
    
    setTimeout(() => {
      setShowSavedId(null);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      {confirming && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7 animate-in zoom-in-95 duration-150">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${confirming.action === 'leave' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={confirming.action === 'leave' ? 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1' : 'M3 8l4-4m0 0l4 4M7 4v9a3 3 0 003 3h8'} />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800 text-center">
              {confirming.action === 'leave'
                ? t('smConfirmLeave').replace('{name}', confirming.staff.name)
                : t('smConfirmBack').replace('{name}', confirming.staff.name)}
            </h3>
            <p className="text-sm text-slate-500 text-center mt-2 leading-relaxed">
              {confirming.action === 'leave' ? (
                <>{t('smLeaveBody1').replace('{date}', formatShortDate(todayIso(), language as Language))} <b className="text-slate-700">{t('smLeaveBody2')}</b> {t('smLeaveBody3')}</>
              ) : (
                <>{t('smBackBody')}</>
              )}
            </p>
            <div className="flex flex-col gap-2.5 mt-6">
              <button
                onClick={applyConfirmed}
                className={`w-full py-3.5 rounded-2xl font-bold text-white transition-all active:scale-95 shadow-lg ${confirming.action === 'leave' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-100' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'}`}
              >
                {confirming.action === 'leave' ? t('smYesLeft') : t('smYesBack')}
              </button>
              <button
                onClick={() => setConfirming(null)}
                className="w-full py-3.5 rounded-2xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all active:scale-95"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="bg-white rounded-t-[2rem] sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col h-[85vh] sm:h-auto sm:max-h-[90vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-800">{t('smTitle')}</h2>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">{t('smSubtitle')}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-white">
          <h3 className="text-xs md:text-xs font-bold text-slate-400 uppercase tracking-widest flex justify-between items-center">
            <span>{t('smCurrentTeam').replace('{n}', String(orderedStaff.filter(s => !isFormerStaff(s)).length))}</span>
          </h3>
          <div className="space-y-2">
            {orderedStaff.map((staff, idx) => {
              const isFormer = isFormerStaff(staff);
              // One list, sorted, with a divider before the first former member —
              // simpler than two lists and it keeps a single row rendering.
              const startsFormerSection = isFormer && !isFormerStaff(orderedStaff[idx - 1] ?? staff);
              return (
              <React.Fragment key={staff.id}>
              {startsFormerSection && (
                <div className="flex items-center gap-3 pt-4 pb-1">
                  <span className="text-xs md:text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                    {t('smFormerTeam').replace('{n}', String(orderedStaff.filter(s => isFormerStaff(s)).length))}
                  </span>
                  <span className="h-px flex-1 bg-slate-100" />
                </div>
              )}
              <div
                onClick={() => startEditing(staff)}
                className={`flex flex-col p-3 transition-all rounded-xl border group relative cursor-pointer ${editingId === staff.id ? 'bg-indigo-50 border-indigo-200 shadow-inner' : isFormer ? 'bg-white border-dashed border-slate-200 opacity-70 hover:opacity-100' : 'bg-slate-50 border-slate-100 hover:bg-slate-100 hover:border-slate-200'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold relative shadow-sm" style={{ backgroundColor: staff.color }}>
                      {staff.name.charAt(0)}
                      {staff.role === 'admin' && (
                        <div className="absolute -bottom-0.5 -right-0.5 bg-amber-400 rounded-full p-0.5 border border-white">
                          <svg className="w-2.5 h-2.5 text-amber-900" fill="currentColor" viewBox="0 0 20 20"><path d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" /></svg>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 flex items-center gap-1.5 leading-none">
                        {staff.name}
                        <span className={`text-xs px-1.5 py-0.5 rounded uppercase font-black tracking-widest ${staff.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>
                          {t(staff.role === 'admin' ? 'smRoleAdminShort' : 'smRoleStaffShort')}
                        </span>
                      </p>
                      <p className="text-xs text-slate-400 mt-1 font-medium truncate max-w-[200px]">{staff.email}</p>
                      {isFormer && (
                        <p className="text-xs text-amber-700 font-bold mt-0.5">
                          {t('smLeftOn').replace('{date}', formatShortDate(staff.endDate!, language as Language))}
                        </p>
                      )}
                      {/* Le pendant de « Left on » : une personne dont l'arrivee est
                          a venir n'apparait dans AUCUNE semaine avant cette date. Sans
                          cette ligne, une date d'arrivee fausse ne se manifeste que par
                          une absence — quelqu'un qu'on a cree et qu'on ne retrouve pas.
                          Vecu le 09/09/2026 : Stephanie enregistree au 9 decembre par
                          erreur, donc invisible en septembre, sans rien pour l'expliquer. */}
                      {/* Acces a l'app : compte relie, invitation en attente, ou a inviter. */}
                      {onInvite && !isFormer && !staff.isPool && (() => {
                        if (staff.uid) return <p className="text-xs font-bold text-emerald-700 mt-0.5" data-testid="access-linked">{t('smAccessLinked')}</p>;
                        const pending = inviteOf(staff);
                        if (pending) {
                          const [token, inv] = pending;
                          return (
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" onClick={e => e.stopPropagation()} data-testid="access-pending">
                              <span className="font-bold text-amber-700">{t('smInvitePending').replace('{date}', formatShortDate(inv.createdAt.slice(0, 10), language as Language))}</span>
                              <button type="button" onClick={() => copyLink(token)} className="font-bold text-indigo-600 hover:text-indigo-800">
                                {copiedToken === token ? t('payrollCopied') : t('smInviteCopy')}
                              </button>
                              <a href={mailtoFor(staff, token)} className="font-bold text-indigo-600 hover:text-indigo-800">{t('smInviteEmail')}</a>
                              <button type="button" onClick={() => onCancelInvite?.(token)} className="font-bold text-slate-400 hover:text-red-600">{t('smInviteCancel')}</button>
                            </div>
                          );
                        }
                        if (!staff.email) return <p className="text-xs text-slate-400 mt-0.5">{t('smInviteNoEmail')}</p>;
                        return (
                          <button type="button" onClick={async (e) => { e.stopPropagation(); await onInvite(staff); }}
                            className="mt-1 text-xs font-bold text-indigo-600 hover:text-indigo-800" data-testid="access-invite">
                            {t('smInvite')}
                          </button>
                        );
                      })()}
                      {!isFormer && staff.startDate && staff.startDate > todayIso() && (
                        <p className="text-xs text-sky-700 font-bold mt-0.5">
                          {t('smStarts').replace('{date}', formatShortDate(staff.startDate, language as Language))}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {editingId !== staff.id && (
                    <div className="flex items-center gap-2">
                      {showSavedId === staff.id && (
                        <span className="text-xs font-bold text-green-600 animate-in fade-in slide-in-from-right-2">{t('smSaved')}</span>
                      )}
                      {/* Nobody is ever deleted: an end date is set instead, so
                          their past shifts and hours stay usable for payroll. */}
                      {isFormer ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirming({ staff, action: 'reinstate' }); }}
                          title={t('smReinstateTitle')}
                          className="px-2.5 py-1.5 text-xs font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-all"
                        >
                          {t('smReinstate')}
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirming({ staff, action: 'leave' }); }}
                          title={t('smLeaveTitle')}
                          className="p-2 text-slate-300 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {editingId === staff.id && (
                  <div className="mt-3 pt-3 border-t border-indigo-100 animate-in slide-in-from-top-2 duration-200 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-indigo-700 uppercase mb-1">{t('smContractHours')}</label>
                        <input 
                          type="number"
                          value={editContractHours}
                          onChange={(e) => setEditContractHours(parseInt(e.target.value) || 0)}
                          className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-indigo-700 uppercase mb-1">{t('smAccessRole')}</label>
                        <select 
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value as 'admin' | 'staff')}
                          className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="staff">{t('smRoleStaff')}</option>
                          <option value="admin">{t('smRoleAdmin')}</option>
                        </select>
                      </div>
                    </div>
                    {/* Jours travailles par semaine : estime les heures d'une
                        absence quand la semaine n'est pas encore planifiee
                        (contrat / jours travailles, par jour d'absence). */}
                    <div>
                      <label className="block text-xs font-bold text-indigo-700 uppercase mb-1" htmlFor={`workdays-${staff.id}`}>{t('workDaysPerWeek')}</label>
                      <select id={`workdays-${staff.id}`} value={editWorkDays}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setEditWorkDays(parseInt(e.target.value) || 5)}
                        className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500">
                        {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <p className="text-xs text-slate-500 mt-1 leading-snug">{t('workDaysHint')}</p>
                    </div>
                    {/* --------------------------------------------------------
                        Avenants. Un salarie peut passer de 24h a 30h en cours
                        d'annee : sans dater le changement, le nouveau chiffre
                        reecrirait retroactivement tous les mois deja ecoules et
                        fausserait la paie. Chaque ligne dit « a partir de cette
                        date, le contrat est de N heures ».
                        Une date future est acceptee : un avenant se signe avant
                        de prendre effet.
                        -------------------------------------------------------- */}
                    <div className="pt-3 border-t border-indigo-100">
                      <label className="block text-xs font-bold text-indigo-700 uppercase mb-1.5">{t('smAmendments')}</label>

                      {editChanges.length > 0 && (
                        <ul className="flex flex-col gap-1 mb-2">
                          {editChanges.map((c, i) => (
                            <li key={i} className="flex items-center justify-between gap-2 bg-white border border-indigo-100 rounded px-2 py-1">
                              <span className="text-xs text-slate-700">
                                <b className="font-bold">{c.weeklyHours}h</b> {t('smFrom')} {formatShortDate(c.from, language as Language)}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditChanges(editChanges.filter((_, j) => j !== i)); }}
                                className="text-red-400 hover:text-red-600 p-1 flex-none"
                                title={t('smRemove')}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="flex gap-2 items-end">
                        <div className="flex-1" onClick={(e) => e.stopPropagation()}>
                          <DateField
                            label={t('smEffectiveFrom')}
                            labelClassName="block text-xs text-slate-500 mb-0.5"
                            value={newChangeFrom}
                            onChange={setNewChangeFrom}
                            language={language as Language}
                            className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div className="w-16">
                          <label className="block text-xs text-slate-500 mb-0.5">{t('smHours')}</label>
                          <input
                            type="number"
                            aria-label={t('smAmendHours')}
                            value={newChangeHours}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setNewChangeHours(parseInt(e.target.value) || 0)}
                            className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={!newChangeFrom}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!newChangeFrom) return;
                            // Une seule valeur par date d'effet : ressaisir la meme
                            // date corrige l'avenant au lieu d'en empiler deux.
                            const next = [
                              ...editChanges.filter(c => c.from !== newChangeFrom),
                              { from: newChangeFrom, weeklyHours: newChangeHours },
                            ].sort((a, b) => a.from.localeCompare(b.from));
                            setEditChanges(next);
                            setNewChangeFrom('');
                          }}
                          aria-label={t('smAddAmendment')}
                          className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-bold disabled:opacity-40 hover:bg-indigo-700 transition-all whitespace-nowrap"
                        >
                          {t('smAdd')}
                        </button>
                      </div>

                      <p className="text-xs text-slate-500 mt-1.5 leading-snug">
                        {editChanges.length > 0
                          ? t('smAmendHintSome')
                          : t('smAmendHintNone')}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-indigo-700 uppercase mb-1">{t('smEmail')}</label>
                      <input 
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder={t('smEmailPlaceholder')}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <DateField
                        label={t('smFirstDay')}
                        labelClassName="block text-xs font-bold text-indigo-700 uppercase mb-1"
                        value={editStartDate}
                        onChange={setEditStartDate}
                        language={language as Language}
                        className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <DateField
                        label={<>{t('smLastDay')} <span className="text-slate-400 normal-case font-medium">{t('smLastDayHint')}</span></>}
                        labelClassName="block text-xs font-bold text-indigo-700 uppercase mb-1"
                        value={editEndDate}
                        onChange={setEditEndDate}
                        language={language as Language}
                        className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    {/* Une ligne partagee — « Extra » — n'est pas une personne :
                        les regles de duree du travail y produiraient une fausse
                        alerte par jour. */}
                    <label className="flex items-start gap-2 cursor-pointer select-none py-1">
                      <input
                        type="checkbox"
                        checked={editIsPool}
                        onChange={(e) => setEditIsPool(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-indigo-600 cursor-pointer"
                      />
                      <span className="text-xs leading-snug">
                        <span className="font-bold text-indigo-700 uppercase">{t('smShared')}</span>
                        <span className="block text-indigo-500 font-medium">
                          {t('smSharedHint')}
                        </span>
                      </span>
                    </label>
                    <div>
                      <label className="block text-xs font-bold text-indigo-700 uppercase mb-1">{t('smColor')}</label>
                      <div className="flex gap-2">
                        <input 
                          type="color" 
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          className="w-10 h-8 p-1 bg-white border border-indigo-200 cursor-pointer rounded overflow-hidden shadow-sm"
                        />
                        <input 
                          type="text" 
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          className="flex-1 px-2 py-1 bg-white border border-indigo-200 rounded text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <LeaveCard
                      person={staff}
                      periods={periods}
                      balance={leaveBalances[staff.id]}
                      onSave={onSaveLeaveBalance}
                      leaveUnit={leaveUnit}
                      closedHolidays={closedHolidays}
                      language={language as Language}
                    />
                    <div className="flex gap-2 pt-1">
                      <button 
                        type="button"
                        onClick={(e) => saveEdit(e, staff)}
                        className="flex-1 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200 active:scale-95"
                      >
                        {t('smApply')}
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                        className="px-3 py-2 bg-white border border-indigo-200 text-indigo-600 text-xs font-bold rounded-lg hover:bg-indigo-50 transition-colors"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              </React.Fragment>
              );
            })}
          </div>

          {/* Guest Admins Section */}
          <div className="pt-6 border-t border-slate-100 space-y-4">
            <h3 className="text-xs md:text-xs font-bold text-slate-400 uppercase tracking-widest flex justify-between items-center">
              <span>{t('smGuests').replace('{n}', String(guestEmails.length))}</span>
            </h3>
            
            <div className="space-y-2">
              {guestEmails.map((email) => (
                <div key={email} className="flex items-center justify-between p-3 bg-amber-50/50 border border-amber-100 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center text-amber-900 font-bold shadow-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 leading-none">{email}</p>
                      <p className="text-xs text-amber-600 mt-1 font-black uppercase tracking-tighter">{t('smGuestAccess')}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      if (confirm(t('smRemoveGuest').replace('{email}', email))) onRemoveGuest(email);
                    }}
                    className="p-2 text-amber-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              ))}

              {isAddingGuest ? (
                <div className="p-3 bg-white border-2 border-dashed border-amber-200 rounded-xl animate-in slide-in-from-top-2 duration-200">
                  <div className="flex gap-2">
                    <input 
                      type="email"
                      value={newGuestEmail}
                      onChange={(e) => setNewGuestEmail(e.target.value)}
                      placeholder={t('smGuestPlaceholder')}
                      className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onAddGuest(newGuestEmail);
                          setNewGuestEmail('');
                          setIsAddingGuest(false);
                        }
                      }}
                    />
                    <button 
                      onClick={() => {
                        onAddGuest(newGuestEmail);
                        setNewGuestEmail('');
                        setIsAddingGuest(false);
                      }}
                      className="px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition-colors"
                    >
                      {t('smAdd')}
                    </button>
                    <button 
                      onClick={() => setIsAddingGuest(false)}
                      className="px-2 py-1.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => setIsAddingGuest(true)}
                  className="w-full py-2.5 border border-dashed border-amber-200 rounded-xl text-amber-600 text-xs font-bold hover:bg-amber-50 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  {t('smAddGuest')}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50">
          {!isAddingNew ? (
            <button 
              onClick={() => {
                setIsAddingNew(true);
                setEditingId(null); // Close any active editing if we're adding a new one
              }}
              className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all flex items-center justify-center gap-2 group active:scale-[0.98]"
            >
              <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              {t('smAddEmployee')}
            </button>
          ) : (
            <div className="animate-in slide-in-from-bottom-2 duration-300">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">{t('smAddEmployee')}</h3>
                <button 
                  onClick={() => setIsAddingNew(false)}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-tighter"
                >
                  {t('smHideForm')}
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 tracking-wider" htmlFor="new-staff-name">{t('smFullName')}</label>
                    <input 
                      id="new-staff-name"
                      required
                      type="text" 
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                      placeholder={t('smNamePlaceholder')}
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 tracking-wider" htmlFor="new-staff-email">{t('smEmailShort')}</label>
                    <input 
                      id="new-staff-email"
                      required
                      type="email" 
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                      placeholder={t('smEmailPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 tracking-wider">{t('smContractHours')}</label>
                    <input 
                      type="number" 
                      value={newContractHours}
                      onChange={(e) => setNewContractHours(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 tracking-wider">{t('smInitialRole')}</label>
                    <select 
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as 'admin' | 'staff')}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                    >
                      <option value="staff">{t('smRoleStaff')}</option>
                      <option value="admin">{t('smRoleAdmin')}</option>
                    </select>
                  </div>
                  <DateField
                    label={t('smFirstDay')}
                    labelClassName="block text-xs font-bold text-slate-500 uppercase mb-1 tracking-wider"
                    required
                    value={newStartDate}
                    onChange={setNewStartDate}
                    language={language as Language}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                  />
                  <DateField
                    label={<>{t('smLastDay')} <span className="text-slate-400 normal-case font-medium">{t('smLastDayHint')}</span></>}
                    labelClassName="block text-xs font-bold text-slate-500 uppercase mb-1 tracking-wider"
                    value={newEndDate}
                    onChange={setNewEndDate}
                    language={language as Language}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                  />
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 tracking-wider">{t('smColor')}</label>
                    <div className="flex gap-2">
                      <input 
                        type="color" 
                        value={newColor}
                        onChange={(e) => setNewColor(e.target.value)}
                        className="w-11 h-10 p-1 bg-white border border-slate-200 cursor-pointer rounded-xl overflow-hidden shadow-sm"
                      />
                      <input 
                        type="text" 
                        value={newColor}
                        onChange={(e) => setNewColor(e.target.value)}
                        className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-indigo-600 text-white font-black text-sm uppercase tracking-[0.15em] rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-[0.98]"
                  >
                    {t('smAddToTeam')}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsAddingNew(false)}
                    className="px-6 py-3 bg-white border border-slate-200 text-slate-500 font-bold rounded-xl hover:bg-slate-100 transition-all text-sm"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StaffModal;