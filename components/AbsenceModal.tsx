import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Staff, AbsencePeriod, LeaveKind, LeaveUnit, Language, LeaveBalance } from '../types';
import { getTranslation } from '../utils/translations';
import {
  addDaysIso, periodDays, weekIdOfIso, isoDayIndex, countLeaveDays, absenceHoursByDate, spreadAbsenceHours,
  planAbsenceChange, AbsenceChange, AbsencePlan, HALF_DAY_KINDS, SUSPENDING_KINDS, leaveBalanceSummary, todayIso,
  contractHoursOn, formatShortDate, closedHolidayDates,
} from '../utils/helpers';
import DateField from './DateField';

/** Ce que l'app sait du planning de la personne sur la periode saisie. */
export interface PlannedInfo {
  /** Heures de SES shifts par jour, ISO -> heures. */
  byDate: Record<string, number>;
  /** Semaines ou elle a au moins un shift. */
  plannedWeekIds: string[];
  /** Ses shifts (non repris par un collegue) qui tombent pendant l'absence. */
  shiftsDuring: number;
}

interface AbsenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  staff: Staff[];
  /** Feries fermes par le restaurant : sortis du decompte des conges. */
  closedHolidays: string[];
  /** Periodes connues (admins : toutes). */
  periods: AbsencePeriod[];
  /** Periode a ouvrir directement en modification (clic sur la bande du calendrier). */
  editingPeriodId?: string | null;
  /** Lundi de la semaine affichee, ISO. */
  weekMonday: string;
  /** Premier jour propose : aujourd'hui s'il tombe dans la semaine affichee. */
  defaultStart: string;
  leaveUnit: LeaveUnit;
  /** Soldes lus sur les bulletins : rappel du solde a la saisie d'un conge. */
  leaveBalances?: Record<string, LeaveBalance>;
  loadPlanned: (staffId: string, start: string, end: string) => Promise<PlannedInfo>;
  /** Tout ce que la saisie ecrit d'un coup (elle-meme + conges raccourcis), et
   *  la periode dont on retire les shifts (null = on les garde). */
  onSaveChanges: (changes: AbsenceChange[], removeShiftsFor: AbsencePeriod | null) => void;
  onDeletePeriod: (period: AbsencePeriod) => void;
  language?: Language;
}

/**
 * Les motifs, dans l'ordre ou un manager les rencontre. Chacun est traite
 * differemment sur le bulletin (indemnite de conges, IJSS, retenue) : c'est
 * pour cela qu'ils sont distincts. Une pastille de couleur par motif, aucun
 * rouge (R5.2) ; l'ambre signale ce qui n'etait pas prevu.
 */
const KINDS: { kind: LeaveKind; dot: string }[] = [
  { kind: 'cp',                  dot: 'bg-sky-500' },
  { kind: 'maladie',             dot: 'bg-amber-500' },
  { kind: 'at_mp',               dot: 'bg-amber-700' },
  { kind: 'maternite_paternite', dot: 'bg-emerald-500' },
  { kind: 'famille',             dot: 'bg-violet-500' },
  { kind: 'sans_solde',          dot: 'bg-slate-400' },
  { kind: 'injustifiee',         dot: 'bg-slate-800' },
];

/**
 * Choix du motif : un bouton qui ouvre une liste, plutot que sept boutons
 * (demande de Serge, 18/09 : « le clic et la liste, c'est plus clean »). Chaque
 * ligne porte une phrase d'aide — la difference entre un arret maladie et un
 * accident du travail change la paie, le manager doit pouvoir la lire.
 *
 * Clavier : fleches, Entree, Echap (qui ferme la liste sans fermer la fenetre).
 */
const KindSelect: React.FC<{ value: LeaveKind; onChange: (k: LeaveKind) => void; t: (k: string) => string; labelId: string }> = ({ value, onChange, t, labelId }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const current = KINDS.find(k => k.kind === value) || KINDS[0];

  // Un clic ailleurs referme la liste.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const pick = (k: LeaveKind) => { onChange(k); setOpen(false); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); setActive(KINDS.indexOf(current)); return; }
      setActive(i => (i + (e.key === 'ArrowDown' ? 1 : KINDS.length - 1)) % KINDS.length);
    } else if ((e.key === 'Enter' || e.key === ' ') && open) {
      e.preventDefault();
      pick(KINDS[active].kind);
    }
  };

  return (
    <div ref={root} className="relative" onKeyDown={onKey}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        onClick={() => { setOpen(o => !o); setActive(KINDS.indexOf(current)); }}
        className="w-full flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-left outline-none focus:ring-2 focus:ring-indigo-500 hover:bg-slate-100 transition-colors"
      >
        <span className={`w-2.5 h-2.5 rounded-full flex-none ${current.dot}`} aria-hidden="true" />
        <span className="flex-1 min-w-0">
          <span className="block text-base font-semibold text-slate-800">{t('leaveKind_' + current.kind)}</span>
          <span className="block text-xs font-medium text-slate-500 truncate">{t('leaveHint_' + current.kind)}</span>
        </span>
        <svg className={`w-4 h-4 text-slate-400 flex-none transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-labelledby={labelId}
          className="absolute z-20 mt-2 w-full bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 max-h-[min(27rem,60dvh)] overflow-y-auto animate-in fade-in zoom-in-95 duration-150"
        >
          {KINDS.map((k, i) => {
            const selected = k.kind === value;
            return (
              <li
                key={k.kind}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(k.kind)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${i === active ? 'bg-slate-100' : ''}`}
              >
                <span className={`w-2.5 h-2.5 rounded-full flex-none ${k.dot}`} aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm ${selected ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>{t('leaveKind_' + k.kind)}</span>
                  <span className="block text-xs font-medium text-slate-500">{t('leaveHint_' + k.kind)}</span>
                </span>
                {selected && (
                  <svg className="w-4 h-4 text-indigo-600 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/** Motifs pour lesquels un justificatif est attendu (arret, certificat). */
const NEEDS_PROOF: LeaveKind[] = ['maladie', 'at_mp', 'maternite_paternite'];

const AbsenceModal: React.FC<AbsenceModalProps> = ({
  isOpen, onClose, staff, closedHolidays,
  periods, editingPeriodId, weekMonday, defaultStart, leaveUnit, leaveBalances = {}, loadPlanned,
  onSaveChanges, onDeletePeriod, language = 'en',
}) => {
  const t = getTranslation(language as Language);
  // Decimales a la francaise dans le champ : « 9,5 », pas « 9.5 ».
  const fmtHours = (n: number) => (language === 'fr' ? String(n).replace('.', ',') : String(n));

  const [editing, setEditing] = useState<AbsencePeriod | null>(null);
  const [staffId, setStaffId] = useState('');
  const [kind, setKind] = useState<LeaveKind>('cp');
  const [start, setStart] = useState('');
  const [returnOn, setReturnOn] = useState('');
  const [half, setHalf] = useState<'' | 'am' | 'pm'>('');
  const [justificatif, setJustificatif] = useState(false);
  const [note, setNote] = useState('');
  const [hours, setHours] = useState('');
  const [hoursEdited, setHoursEdited] = useState(false);
  const [planned, setPlanned] = useState<PlannedInfo | null>(null);
  const [removeShifts, setRemoveShifts] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Identifiant d'une nouvelle saisie, stable d'un rendu a l'autre : le calcul
  // des chevauchements compare la saisie en cours aux periodes enregistrees.
  const newId = useRef('');
  // Le conflit ne s'affiche qu'une fois le formulaire touche : un formulaire
  // vierge dont les dates par defaut tombent sur une absence existante ne doit
  // pas accueillir le manager avec une erreur qu'il n'a pas commise.
  const [touched, setTouched] = useState(false);

  const person = staff.find(s => s.id === staffId);

  // Apres un enregistrement, une annulation ou une suppression, le formulaire
  // repart vierge MAIS reste sur la meme personne : revenir au premier de la
  // liste faisait saisir l'absence suivante au mauvais nom sans s'en apercevoir.
  const resetForm = (p: AbsencePeriod | null, keepStaffId?: string) => {
    setEditing(p);
    setTouched(!!p);
    setStaffId(p?.staffId || keepStaffId || staff[0]?.id || '');
    setKind(p?.kind || 'cp');
    setStart(p?.start || defaultStart);
    setReturnOn(p ? addDaysIso(p.end, 1) : addDaysIso(defaultStart, 1));
    setHalf(p?.half || '');
    setJustificatif(p?.justificatif === 'received');
    setNote(p?.note || '');
    setHours(p ? fmtHours(p.hoursLost) : '');
    setHoursEdited(!!p);
    setRemoveShifts(true);
    setConfirmDelete(false);
    newId.current = 'a' + Math.random().toString(36).slice(2, 11);
  };

  // Repartir d'un formulaire vierge a chaque ouverture : garder la selection
  // precedente fait saisir l'absence de quelqu'un d'autre sans s'en rendre compte.
  useEffect(() => {
    if (!isOpen) return;
    resetForm(editingPeriodId ? periods.find(p => p.id === editingPeriodId) || null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingPeriodId]);

  const end = returnOn ? addDaysIso(returnOn, -1) : '';
  const validRange = !!start && !!end && end >= start;
  const singleDay = validRange && start === end;
  // Un arret de travail se compte en jours entiers : la demi-journee n'existe
  // que pour les conges, le sans solde et l'absence injustifiee.
  const halfAllowed = singleDay && HALF_DAY_KINDS.includes(kind);
  const effectiveHalf = halfAllowed && half ? half : undefined;
  const nDays = periodDays(start, end).length;
  const tooLong = nDays >= 400;

  // Un ferie ou le restaurant est FERME ne se decompte pas des conges ; un
  // ferie travaille, si (Code du travail). Le reglage vient des parametres.
  const closedDates = validRange ? closedHolidayDates(start, end, closedHolidays) : [];
  const daysCounted = validRange ? countLeaveDays(start, end, leaveUnit, closedDates, effectiveHalf) : 0;

  // Le planning de la personne sur la periode : sert a proposer les heures
  // d'absence et a compter les shifts deja poses. Recharge a chaque changement
  // de personne ou de dates ; une reponse arrivee trop tard est ignoree.
  useEffect(() => {
    if (!isOpen || !staffId || !validRange || tooLong) { setPlanned(null); return; }
    let live = true;
    loadPlanned(staffId, start, end).then(info => { if (live) setPlanned(info); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, staffId, start, end]);

  // Detail jour par jour : il accompagne la periode, pour que chaque semaine et
  // chaque mois retranchent de l'attendu les heures qui y tombent.
  const plannedByDate = useMemo(() => {
    if (!planned || !person || !validRange) return null;
    return absenceHoursByDate(
      start, end, planned.byDate, new Set(planned.plannedWeekIds),
      (iso) => contractHoursOn(person, iso), person.workDaysPerWeek || 5, closedDates, effectiveHalf,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planned, person, start, end, validRange, effectiveHalf, closedHolidays]);
  // Jours deja portes par une periode enregistree : leurs heures viennent de
  // cette periode, pas du planning — le planning de ces jours a pu etre vide
  // par elle (shifts retires a la saisie du conge). Sans cela, un arret qui
  // remplace un jour de conge reprenait 0 h et l'attendu remontait.
  // - la periode en cours de modification (ses propres jours) ;
  // - les conges payes qu'un arret va raccourcir (les jours qu'il leur prend).
  const inheritedByDate = useMemo(() => {
    if (!person || !validRange) return {};
    const sources = periods.filter(p => p.staffId === person.id && p.end >= start && p.start <= end
      && (p.id === editing?.id || (SUSPENDING_KINDS.includes(kind) && p.kind === 'cp')));
    const out: Record<string, number> = {};
    for (const p of sources) {
      const perDay = p.daysCounted > 0 ? p.hoursLost / p.daysCounted : 0;
      for (const d of periodDays(p.start, p.end)) {
        if (d < start || d > end) continue;
        out[d] = p.hoursByDate ? (p.hoursByDate[d] || 0) : (isoDayIndex(d) <= 5 ? perDay : 0);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periods, person, start, end, validRange, kind, editing]);
  const proposedByDate = useMemo(() => {
    if (!plannedByDate) return null;
    const merged: Record<string, number> = { ...plannedByDate, ...inheritedByDate };
    return Object.fromEntries(Object.entries(merged).filter(([, h]) => h > 0));
  }, [plannedByDate, inheritedByDate]);
  const proposedHours = proposedByDate === null ? null
    : Math.round(Object.values(proposedByDate).reduce((a, b) => a + b, 0) * 100) / 100;

  // Les heures proposees suivent les dates tant que le manager ne les a pas
  // corrigees a la main ; une correction manuelle n'est jamais ecrasee.
  useEffect(() => {
    if (!hoursEdited && proposedHours !== null) setHours(fmtHours(proposedHours));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposedHours, hoursEdited]);

  const fromPlanning = !!planned && periodDays(start, end)
    .some(d => planned.plannedWeekIds.includes(weekIdOfIso(d)));

  if (!isOpen) return null;

  const hoursNum = parseFloat(hours.replace(',', '.'));
  const noteMissing = kind === 'famille' && !note.trim();
  const formOk = !!staffId && !!person && validRange && !tooLong && Number.isFinite(hoursNum) && hoursNum >= 0 && !noteMissing;

  const buildPeriod = (now: string): AbsencePeriod => {
    const hoursLost = Number.isFinite(hoursNum) ? Math.round(hoursNum * 100) / 100 : 0;
    return {
      id: editing?.id || newId.current,
      staffId,
      ...(person?.uid ? { staffUid: person.uid } : {}),
      kind,
      start,
      end,
      ...(effectiveHalf ? { half: effectiveHalf } : {}),
      daysCounted,
      hoursLost,
      // Le total retenu (corrige ou non), reparti comme le detail propose.
      hoursByDate: spreadAbsenceHours(proposedByDate || {}, hoursLost, start, end),
      ...(note.trim() ? { note: note.trim() } : {}),
      justificatif: justificatif ? 'received' : 'none',
      weekIds: [...new Set(periodDays(start, end).map(weekIdOfIso))],
      createdAt: editing?.createdAt || now,
      createdBy: editing?.createdBy || '',
      updatedAt: now,
    };
  };

  // Une personne n'a qu'une absence par jour, sauf un arret qui interrompt des
  // conges payes (ils sont alors raccourcis). Verifie a chaque frappe, contre
  // TOUTES ses periodes, pas seulement la liste affichee.
  const countDays = (a: string, b: string) => countLeaveDays(a, b, leaveUnit, closedHolidayDates(a, b, closedHolidays));
  const plan = validRange && !tooLong && person
    ? planAbsenceChange(buildPeriod(''), editing, periods, countDays, '')
    : null;
  const canSave = formOk && !!plan?.ok;
  const refused = plan && !plan.ok ? (plan as Extract<AbsencePlan, { ok: false }>) : null;

  const submit = () => {
    if (!canSave || !person) return;
    const now = new Date().toISOString();
    const period = buildPeriod(now);
    const fresh = planAbsenceChange(period, editing, periods, countDays, now);
    if (!fresh.ok) return;
    const dropShifts = removeShifts && !effectiveHalf && (planned?.shiftsDuring || 0) > 0;
    onSaveChanges(fresh.changes, dropShifts ? period : null);
    resetForm(null, period.staffId);
  };

  // Solde de conges une fois cette saisie prise en compte (tout ce qui est
  // pose, a venir compris). Seulement si un bulletin a ete saisi pour elle.
  const anchor = person ? leaveBalances[person.id] : undefined;
  const balanceAfter = anchor && plan?.ok && kind === 'cp'
    ? leaveBalanceSummary(
        { date: anchor.anchorDate, balance: anchor.anchorBalance },
        [...periods.filter(p => p.staffId === person!.id && !plan.changes.some(c => (c.period || c.previous)!.id === p.id)),
         ...plan.changes.filter(c => c.period).map(c => c.period!)],
        person!, todayIso(), leaveUnit, countDays).afterUpcoming
    : null;

  const rangeOf = (p: { start: string; end: string }) => t('absRange')
    .replace('{from}', formatShortDate(p.start, language as Language))
    .replace('{back}', formatShortDate(addDaysIso(p.end, 1), language as Language));

  // Premier et dernier jour, pour dire d'un conge raccourci ce qu'il devient.
  const spanOf = (p: { start: string; end: string }) => t('absCutSpan')
    .replace('{from}', formatShortDate(p.start, language as Language))
    .replace('{to}', formatShortDate(p.end, language as Language));

  // Conges raccourcis par la saisie : pour chacun, ce qu'il en reste.
  const cuts = plan?.ok ? plan.changes.slice(1).filter(c => c.previous).map(c => c.previous!) : [];
  const cutOriginals = [...new Map(cuts.map(o => [o.id, o])).values()];
  const keptOf = (orig: AbsencePeriod) => plan?.ok
    ? plan.changes.slice(1)
      .filter(c => c.period && (c.period.id === orig.id || c.period.id.startsWith(orig.id + '-')))
      .map(c => spanOf(c.period!))
    : [];

  const nameOf = (id: string) => staff.find(s => s.id === id)?.name || '?';
  // En cours et a venir, depuis le lundi affiche : l'historique complet vit
  // sur la fiche du salarie, pas ici.
  const current = periods
    .filter(p => p.end >= weekMonday)
    .sort((a, b) => a.start.localeCompare(b.start) || nameOf(a.staffId).localeCompare(nameOf(b.staffId)));

  const label = 'text-xs font-black uppercase tracking-widest text-slate-400';
  const field = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-base font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 md:p-6" onClick={onClose}>
      <div
        className="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex-none bg-white border-b px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900">{editing ? t('absEditTitle') : t('absences')}</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-700 rounded-lg" title={t('close')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 flex flex-col gap-6">

          {/* ---------------- saisie d'une periode ---------------- */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className={label} htmlFor="abs-who">{t('whoIsOff')}</label>
              <select id="abs-who" value={staffId} onChange={e => { setStaffId(e.target.value); setHoursEdited(false); setTouched(true); }}
                disabled={!!editing} className={field}>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <span className={label} id="abs-kind-label">{t('whichReason')}</span>
              <KindSelect value={kind} onChange={k => { setKind(k); setTouched(true); }} t={t} labelId="abs-kind-label" />
            </div>

            {/* La paie compte du premier jour d'absence a la VEILLE de la
                reprise. Demander la reprise plutot que le dernier jour colle a
                ce que le salarie annonce (« je reviens lundi ») et evite
                l'erreur classique du dernier jour compte deux fois. */}
            <div className="grid grid-cols-2 gap-3">
              <DateField label={t('absFirstDay')} value={start} language={language as Language}
                onChange={v => { setStart(v); setHoursEdited(false); setTouched(true); if (v && (!returnOn || returnOn <= v)) setReturnOn(addDaysIso(v, 1)); }}
                labelClassName={`${label} block mb-2`} className={field} />
              <DateField label={t('absReturn')} value={returnOn} language={language as Language}
                onChange={v => { setReturnOn(v); setHoursEdited(false); setTouched(true); }}
                labelClassName={`${label} block mb-2`} className={field} />
            </div>
            {kind === 'cp' && <p className="-mt-2 text-xs text-slate-400 font-medium">{t('absFirstDayHint')}</p>}
            {start && returnOn && !validRange && <p className="-mt-2 text-xs font-semibold text-red-700">{t('absReturnBeforeStart')}</p>}
            {tooLong && <p className="-mt-2 text-xs font-semibold text-red-700">{t('absTooLong')}</p>}

            {halfAllowed && (
              <div className="flex gap-2" role="group" aria-label={t('absHalf')}>
                {([['', 'absFullDay'], ['am', 'absHalfAm'], ['pm', 'absHalfPm']] as const).map(([v, k]) => (
                  <button key={v} type="button" onClick={() => { setHalf(v); setHoursEdited(false); setTouched(true); }} aria-pressed={half === v}
                    className={`flex-1 py-2 rounded-xl border text-sm font-bold transition-all ${half === v ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                    {t(k)}
                  </button>
                ))}
              </div>
            )}

            {refused && touched && (
              <div data-testid="abs-conflict" className="rounded-2xl bg-red-50 border border-red-200 p-4 flex flex-col gap-2">
                <p className="text-sm font-semibold text-red-800">
                  {t(refused.reason === 'leaveDuringSickness' ? 'absLeaveDuringSickness' : 'absConflict')
                    .replace('{name}', person?.name || '')
                    .replace('{kind}', t('leaveKind_' + refused.conflict.kind))
                    .replace('{range}', rangeOf(refused.conflict))}
                </p>
                <button type="button" onClick={() => resetForm(refused.conflict)}
                  className="self-start text-sm font-bold text-red-700 hover:text-red-900 underline underline-offset-2">
                  {t('absOpenConflict')}
                </button>
              </div>
            )}
            {cutOriginals.length > 0 && plan?.ok && (
              <div data-testid="abs-cut" className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 flex flex-col gap-1">
                <p className="font-semibold">{t('absCutIntro').replace('{name}', person?.name || '')}</p>
                <ul className="flex flex-col gap-0.5">
                  {cutOriginals.map(orig => {
                    const kept = keptOf(orig);
                    return (
                      <li key={orig.id}>
                        {kept.length === 0
                          ? t('absCutRemoved').replace('{range}', spanOf(orig))
                          : t('absCutKept').replace('{range}', spanOf(orig)).replace('{kept}', kept.join(t('absCutAnd')))}
                      </li>
                    );
                  })}
                </ul>
                <p>{plan.daysGivenBack === 1 ? t('absCutGivenBackOne')
                  : t('absCutGivenBack').replace('{n}', String(plan.daysGivenBack).replace('.', ','))}</p>
              </div>
            )}

            {validRange && !tooLong && (
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex flex-col gap-3">
                <p className="text-sm font-bold text-slate-800" data-testid="abs-days">
                  {t(leaveUnit === 'ouvres' ? 'absDaysOuvres' : 'absDays').replace('{n}', String(daysCounted).replace('.', ','))}
                </p>
                {balanceAfter !== null && (
                  <p data-testid="abs-balance-after" className={`-mt-2 text-xs font-semibold ${balanceAfter < 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                    {t('absBalanceAfter').replace('{n}', (Number.isInteger(balanceAfter) ? String(balanceAfter) : balanceAfter.toFixed(1)).replace('.', ','))}
                  </p>
                )}
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className={label} htmlFor="abs-hours">{t('absHours')}</label>
                    <input id="abs-hours" inputMode="decimal" value={hours}
                      onChange={e => { setHours(e.target.value); setHoursEdited(true); }}
                      className={`${field} mt-2`} />
                  </div>
                  {hoursEdited && proposedHours !== null && fmtHours(proposedHours) !== hours && (
                    <button type="button" onClick={() => setHoursEdited(false)}
                      className="h-12 px-3 text-xs font-bold text-indigo-600 hover:text-indigo-800">
                      {t('absHoursReset').replace('{n}', fmtHours(proposedHours))}
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  {planned === null ? t('loading') : t(fromPlanning ? 'absHoursFromPlanning' : 'absHoursFromContract')}
                </p>
              </div>
            )}

            {(planned?.shiftsDuring || 0) > 0 && !effectiveHalf && (
              <label className="flex items-start gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={removeShifts} onChange={e => setRemoveShifts(e.target.checked)} className="w-4 h-4 mt-0.5 rounded" />
                <span>{t('absRemoveShifts').replace('{n}', String(planned!.shiftsDuring))}</span>
              </label>
            )}

            {NEEDS_PROOF.includes(kind) && (
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={justificatif} onChange={e => setJustificatif(e.target.checked)} className="w-4 h-4 rounded" />
                {t('absJustif')}
              </label>
            )}

            <div className="flex flex-col gap-2">
              <label className={label} htmlFor="abs-note">{t('absNote')}</label>
              <input id="abs-note" value={note} onChange={e => setNote(e.target.value)} maxLength={500}
                placeholder={kind === 'famille' ? t('absNoteRequired') : ''} className={field} />
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={submit} disabled={!canSave}
                className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.99]">
                {editing ? t('absUpdate') : t('absSave')}
              </button>
              {editing && (
                <button type="button" onClick={() => resetForm(null, editing?.staffId)}
                  className="px-4 py-3 rounded-xl font-bold text-slate-500 hover:text-slate-800">{t('cancel')}</button>
              )}
            </div>
            {editing && (
              confirmDelete ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex-1 font-semibold text-slate-700">
                    {t('absDeleteConfirm')}
                    {SUSPENDING_KINDS.includes(editing.kind) && (
                      <span className="block text-xs font-medium text-slate-500">{t('absDeleteSickNote')}</span>
                    )}
                  </span>
                  <button type="button" onClick={() => { onDeletePeriod(editing); resetForm(null, editing.staffId); }}
                    className="px-3 py-2 rounded-lg bg-red-600 text-white font-bold">{t('yesDelete')}</button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="px-3 py-2 rounded-lg font-bold text-slate-500">{t('noKeep')}</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)}
                  className="self-start text-sm font-bold text-red-600 hover:text-red-800">{t('absDelete')}</button>
              )
            )}
          </div>

          {/* ---------------- absences en cours et a venir ---------------- */}
          <div className="flex flex-col gap-2 border-t pt-5">
            <span className={label}>{t('absList')}</span>
            {current.length === 0 ? (
              <p className="text-sm text-slate-400 italic">{t('absNone')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {current.map(p => (
                  <li key={p.id}>
                    <button type="button" onClick={() => resetForm(p)}
                      className={`w-full text-left bg-slate-50 hover:bg-slate-100 border rounded-xl px-3 py-2 transition-colors ${editing?.id === p.id ? 'border-indigo-400' : 'border-slate-200'}`}>
                      <span className="block text-sm text-slate-700 truncate">
                        <b className="font-bold text-slate-900">{nameOf(p.staffId)}</b>{' · '}{t('leaveKind_' + p.kind)}
                        {NEEDS_PROOF.includes(p.kind) && p.justificatif !== 'received' && (
                          <span className="ml-2 text-xs font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">{t('absNoProof')}</span>
                        )}
                      </span>
                      <span className="block text-xs text-slate-500 font-medium">
                        {t('absRange')
                          .replace('{from}', formatShortDate(p.start, language as Language))
                          .replace('{back}', formatShortDate(addDaysIso(p.end, 1), language as Language))}
                        {' · '}{String(p.daysCounted).replace('.', ',')}{t(p.daysCounted <= 1 ? 'daysShortOne' : 'daysShort')}{' · '}{String(p.hoursLost).replace('.', ',')} h
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default AbsenceModal;
