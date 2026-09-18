
import React, { useState } from 'react';
import { Shift, Staff, Language, Absence } from '../types';

// Meme vocabulaire que la bande du calendrier : un motif porte le meme nom
// partout, sinon on croit lire deux choses differentes.
const ABSENCE_LABELS: Record<string, string> = {
  conge: 'absenceConge',
  maladie: 'absenceMaladie',
  absent: 'absenceAbsent',
};
import { getTranslation } from '../utils/translations';
import { isStaffActiveInWeek, contractHoursOn, monthlyContractHours, getShiftIsoDate, formatMoney, AbsenceDeduction, expectedNote, visibleAbsenceKind } from '../utils/helpers';

/**
 * Bloc repliable de la colonne de droite (version A de la maquette du 13/09/2026,
 * `maquettes/colonne-droite-3-versions.html`).
 *
 * Ouvert, il prend sa hauteur naturelle et NE SE COMPRIME qu'a court de place
 * (`flex: 0 1 auto`), son contenu defilant alors en interne ; ferme, il se reduit a
 * sa ligne de titre. L'ouverture s'anime en faisant passer la ligne du corps de 0fr
 * a 1fr, ce qui anime une hauteur inconnue a l'avance sans la mesurer.
 */
const SECTION_TONES = {
  plain: { box: 'bg-white border-slate-200', head: 'text-slate-500 hover:bg-slate-50', summary: 'text-slate-400' },
  amber: { box: 'bg-amber-50 border-amber-200', head: 'text-amber-700 hover:bg-amber-100/60', summary: 'text-amber-600/80' },
  slate: { box: 'bg-slate-50 border-slate-200', head: 'text-slate-500 hover:bg-slate-100', summary: 'text-slate-400' },
} as const;

const Section: React.FC<{
  open: boolean;
  onToggle: () => void;
  title: string;
  summary?: string;
  /** Resume abrege, affiche a la place de `summary` quand la colonne est etroite (tiroir du telephone). */
  summaryShort?: string;
  tone: keyof typeof SECTION_TONES;
  children: React.ReactNode;
}> = ({ open, onToggle, title, summary, summaryShort, tone, children }) => {
  const style = SECTION_TONES[tone];
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)] min-h-0 rounded-2xl border overflow-hidden transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[auto_1fr]' : 'grid-rows-[auto_0fr]'} ${style.box}`}
      style={{ flex: open ? '0 1 auto' : '0 0 auto' }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`@container w-full min-h-11 px-3.5 py-2 flex items-center gap-2 text-left transition-colors ${style.head}`}
      >
        {/* Titre et resume retrecissent tous deux, avec points de suspension : sans
            `min-w-0`, un long titre francais elargissait le bloc au-dela de la colonne.
            Sous 270 px de contenu (tiroir du telephone, colonne de tablette), le resume
            abrege prend le relais ; la colonne de bureau (280 px de contenu) garde le complet. */}
        <span className="min-w-0 text-xs font-black uppercase tracking-wider truncate">{title}</span>
        {summary && (
          <span className={`ml-auto min-w-0 truncate text-xs font-semibold ${summaryShort ? '@max-[270px]:hidden' : ''} ${style.summary}`}>{summary}</span>
        )}
        {summaryShort && (
          <span className={`ml-auto hidden @max-[270px]:inline whitespace-nowrap text-xs font-semibold tabular-nums ${style.summary}`} title={summary}>{summaryShort}</span>
        )}
        <svg
          className={`w-4 h-4 flex-shrink-0 transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-180' : ''} ${summary ? '' : 'ml-auto'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {/* `inert` une fois ferme : le contenu reste monte mais sort du clavier et des lecteurs d'ecran. */}
      <div className={`min-h-0 ${open ? 'overflow-y-auto' : 'overflow-hidden'}`} inert={!open}>
        <div className="px-3.5 pb-3.5">{children}</div>
      </div>
    </div>
  );
};

interface SidebarProps {
  shifts: Shift[];
  staff: Staff[];
  currentWeek: Date;
  onAddClick: () => void;
  onAbsenceClick: () => void;
  absences?: Absence[];
  /** Heures du mois par employe, chargees a la demande. null = pas encore demande. */
  monthHours?: Record<string, number> | null;
  monthLoading?: boolean;
  /** Attendu perdu pour absence, par personne : semaine affichee, mois charge. */
  weekAbsence?: Record<string, AbsenceDeduction>;
  monthAbsence?: Record<string, AbsenceDeduction> | null;
  onPeriodChange?: (period: 'week' | 'month') => void;
  period?: 'week' | 'month';
  monthLabel?: string;
  /** Cout charge de la periode affichee (semaine ou mois). `null` = rien a
   *  montrer : pas admin, aucun taux, ou mois encore en chargement. */
  cost?: { total: number; missing: number } | null;
  onManageStaffClick: () => void;
  /** Vivier d'extras. Absent = compte sans acces aux fiches (employe, invite). */
  onManageExtrasClick?: () => void;
  onCopyLastWeek: () => void;
  /** Ouvre ou reprend le brouillon. Absent = pas propose (hors vue jour, ou deja dedans). */
  onStartDraft?: () => void;
  draftExists?: boolean;
  /** Depassements de duree du travail sur la semaine affichee. */
  compliance?: { who: string; text: string }[];
  /** Nom de la convention appliquee. L'utilisateur doit toujours savoir de
   *  quelle loi on lui parle : sans ca, un seuil affiche n'est pas verifiable. */
  conventionLabel?: string;
  onDeleteWeek: () => void;
  onOpenHistory: () => void;
  /** Absent = icone masquee (pendant un brouillon : l'image montrerait une
   *  version que l'equipe ne voit pas, et pourrait lui etre envoyee par erreur). */
  onExportSnapshot?: () => void;
  isReadOnly?: boolean;
  isLoading?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  language?: Language;
  isOpen?: boolean;
  onClose?: boolean | (() => void);
}

const Sidebar: React.FC<SidebarProps> = ({ 
  shifts, 
  staff, 
  currentWeek, 
  onAddClick,
  onAbsenceClick,
  absences = [],
  monthHours = null,
  monthLoading = false,
  weekAbsence = {},
  monthAbsence = null,
  onPeriodChange,
  period = 'week',
  monthLabel = '',
  cost = null,
  onManageStaffClick,
  onManageExtrasClick,
  onCopyLastWeek,
  onStartDraft,
  draftExists = false,
  compliance = [],
  conventionLabel = '',
  onDeleteWeek,
  onOpenHistory,
  onExportSnapshot,
  isReadOnly = false,
  isLoading = false,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  language = 'en',
  isOpen = false,
  onClose
}) => {
  // Fix: cast language to Language to avoid string assignability error during translation retrieval
  const t = getTranslation(language as Language);

  const getStats = () => {
    const worked: Record<string, number> = {};
    const extra: Record<string, number> = {};
    const leave: Record<string, number> = {};
    
    shifts.forEach(s => {
      const duration = s.endTime - s.startTime;
      if (s.coverageBy) {
        leave[s.staffId] = (leave[s.staffId] || 0) + duration;
        extra[s.coverageBy] = (extra[s.coverageBy] || 0) + duration;
      } else {
        worked[s.staffId] = (worked[s.staffId] || 0) + duration;
      }
    });
    return { worked, extra, leave };
  };

  const { worked, extra } = getStats();

  const getDateForDay = (weekStart: Date, dayIndex: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dayIndex + 1); // +1: weekStart is Sunday, dayIndex 0 = Monday
    const locale = language === 'fr' ? 'fr-FR' : 'en-US';
    return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });
  };

  const coverageEvents = shifts.filter(s => s.coverageBy).map(s => ({
    from: staff.find(st => st.id === s.staffId)?.name || 'Unknown',
    to: staff.find(st => st.id === s.coverageBy)?.name || 'Unknown',
    hours: s.endTime - s.startTime,
    dateInfo: getDateForDay(currentWeek, s.dayIndex)
  }));

  const isEmpty = shifts.length === 0;

  // Un seul bloc ouvert a la fois (version A). Les heures par defaut : c'est ce
  // qu'on regarde en construisant le planning. Rouvrir le bloc ouvert le referme.
  type SectionId = 'hours' | 'checks' | 'cover';
  const [openSection, setOpenSection] = useState<SectionId | null>('hours');
  const toggleSection = (id: SectionId) => setOpenSection(cur => (cur === id ? null : id));

  const isMonth = period === 'month';
  const rows = [...staff].filter(p => {
    // Option A: active during the week OR has any shift this week (orphan still pulls them in)
    const hasHours = period === 'month'
      ? (monthHours?.[p.id] ?? 0) > 0
      : (worked[p.id] || 0) + (extra[p.id] || 0) > 0;
    return hasHours || isStaffActiveInWeek(p, currentWeek);
  }).sort((a, b) => {
    const tot = (x: Staff) => period === 'month'
      ? (monthHours?.[x.id] ?? 0)
      : (worked[x.id] || 0) + (extra[x.id] || 0);
    const aTotal = tot(a);
    const bTotal = tot(b);
    return bTotal - aTotal; // desc
}).map(person => {
    // Heures du contrat A LA PERIODE AFFICHEE, jamais celles d'aujourd'hui :
    // un avenant signe en octobre ne doit pas reecrire le mois de septembre.
    const contractHours = isMonth
      ? Math.round(monthlyContractHours(person, getShiftIsoDate(currentWeek, 3)))
      : contractHoursOn(person, getShiftIsoDate(currentWeek, 0));
    // En mois, les heures viennent des semaines chargees a la demande, et
    // la reference est le contrat mensuel (52/12), pas l'hebdomadaire.
    const workedHours = isMonth ? (monthHours?.[person.id] ?? 0) : (worked[person.id] || 0);
    const extraHours = isMonth ? 0 : (extra[person.id] || 0);
    const totalWorked = workedHours + extraHours;
    // L'attendu, c'est le contrat MOINS les heures d'absence de la periode : une
    // personne en conge n'est pas « en dessous de son contrat ». C'est a cet
    // attendu que la barre, l'ecart et le resume se comparent.
    const deduction = person.isExtra ? undefined : (isMonth ? monthAbsence?.[person.id] : weekAbsence[person.id]);
    const expected = deduction && deduction.hours > 0
      ? Math.max(0, Math.round((contractHours - deduction.hours) * 10) / 10)
      : contractHours;

    // Un 0.0 ressemble a un oubli de planification. Quand la personne est
    // notee absente, on affiche le motif A LA PLACE de la barre vide : la
    // barre ne dirait rien, alors que le motif repond a la question.
    const myAbsences = absences.filter(a => a.staffId === person.id);
    const absenceLabel = (() => {
      if (isMonth || totalWorked > 0 || myAbsences.length === 0) return null;
      const kinds = [...new Set(myAbsences.map(a => visibleAbsenceKind(a.kind, !isReadOnly)))];
      const kindLabel = kinds.length === 1
        ? t(ABSENCE_LABELS[kinds[0]] ?? 'absenceAbsent')
        : t('absences');
      return myAbsences.length >= 5
        ? `${kindLabel} · ${t('allWeek')}`
        : `${kindLabel} · ${myAbsences.length}${t(myAbsences.length === 1 ? 'daysShortOne' : 'daysShort')}`;
    })();
    const note = deduction && deduction.hours > 0 && !absenceLabel
      ? expectedNote(t, expected, deduction, language) : null;
    return { person, contractHours: expected, workedHours, extraHours, totalWorked, absenceLabel, note };
  });

  // Resume du bloc ferme : combien de personnes au-dessus et en dessous de leur attendu.
  // Un extra n'a pas de contrat : le compter « sous son contrat » serait faux,
  // et ferait passer une semaine normale pour une semaine a rattraper.
  const withContract = rows.filter(r => r.contractHours > 0 && !r.person.isExtra);
  const overCount = withContract.filter(r => r.totalWorked > r.contractHours).length;
  const underCount = withContract.filter(r => r.totalWorked < r.contractHours).length;

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] md:hidden transition-opacity duration-300"
          onClick={() => typeof onClose === 'function' && onClose()}
        />
      )}

      {/* La colonne tient TOUJOURS dans la hauteur de l'ecran (retour de Serge le
          13/09/2026 : « Manage Staff » disparaissait sous le bord, et une equipe plus
          grande aurait aggrave le probleme). Les elements fixes ne retrecissent pas
          (`flex-none`) ; seul le bloc ouvert cede de la place et defile en interne. */}
      <aside className={`
        fixed md:relative top-0 right-0 h-full bg-white z-[110] md:z-auto
        w-[min(320px,85vw)] sm:w-[320px] md:w-[320px] lg:w-[340px] border-l flex flex-col gap-3.5 px-4 py-4 overflow-y-auto hide-scrollbar
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
      `}>
        {/* Dans le tiroir du telephone, titre + export + annuler/retablir + fermer ne
            tiennent pas sur une ligne : le titre etait ecrase en « S.. ». Sous 768 px
            les boutons passent a la ligne ; au-dela, rien ne change. */}
        <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-2 flex-none">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={onOpenHistory} title={t('systemLogs')} className="active:scale-95 transition-transform cursor-pointer p-1.5 hover:bg-slate-50 rounded-lg">
              <svg className="w-5 h-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </button>
            <h2 className="text-lg font-bold text-slate-800 truncate">
              {period === 'month' ? t('monthlyStats') : t('weeklyStats')}
            </h2>
            
            {onExportSnapshot && (
            <button onClick={onExportSnapshot} title={t('exportSnapshot')} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all active:scale-90 ml-1">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
               </svg>
            </button>
            )}
          </div>
          
          <div className="flex items-center gap-1.5 ml-auto">
            {!isReadOnly && (
              <div className="flex gap-1.5">
                <button 
                  onClick={onUndo}
                  disabled={!canUndo}
                  title={`${t('undo')} (Ctrl+Z)`}
                  className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all active:scale-90"
                >
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
                <button 
                  onClick={onRedo}
                  disabled={!canRedo}
                  title={`${t('redo')} (Ctrl+Shift+Z)`}
                  className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all active:scale-90"
                >
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
                  </svg>
                </button>
              </div>
            )}
            
            <button 
              onClick={() => typeof onClose === 'function' && onClose()}
              className="md:hidden p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

      {/* ------------------------------------------------------------------
          Semaine / Mois. Le contrat, les heures supplementaires et la paie se
          raisonnent au mois ; l'app ne savait compter qu'a la semaine.
          Le mois n'est charge QU'AU CLIC : 5 ou 6 documents de plus, a la
          demande et non a chaque ouverture de l'application.
          ------------------------------------------------------------------ */}
      {onPeriodChange && (
        <div className="relative flex p-0.5 bg-slate-100 rounded-xl flex-none">
          {/* Le fond blanc est UN element qui glisse d'un bouton a l'autre, au lieu
              de deux fonds qui s'allument et s'eteignent : l'oeil suit le passage. */}
          <div
            aria-hidden="true"
            className={`absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-lg bg-white shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none ${
              isMonth ? 'translate-x-full' : 'translate-x-0'
            }`}
          />
          {(['week', 'month'] as const).map(pKey => (
            <button
              key={pKey}
              type="button"
              onClick={() => onPeriodChange(pKey)}
              aria-pressed={period === pKey}
              className={`relative flex-1 py-2 rounded-lg text-xs font-bold transition-colors duration-300 ${
                period === pKey
                  ? 'text-slate-800'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {pKey === 'week' ? t('periodWeek') : t('periodMonth')}
            </button>
          ))}
        </div>
      )}

      {/* Cout de la periode, nomme en toutes lettres (16/09/2026) : dans la case
          de gauche du planning, rien ne disait que le montant etait la semaine.
          Sous la bascule, il suit Semaine / Mois. « ≥ » = des shifts sans taux,
          le montant est un minimum ; l'infobulle dit combien. */}
      {cost && (
        <div
          className="flex items-baseline justify-between gap-2 px-1 flex-none text-xs"
          title={cost.missing > 0 ? t('costMissing').replace('{n}', String(cost.missing)) : undefined}
        >
          <span className="font-semibold text-slate-500">{isMonth ? t('costMonthLabel') : t('costWeekLabel')}</span>
          <span className="font-bold text-slate-700 tabular-nums whitespace-nowrap">
            {cost.missing > 0 ? '≥ ' : ''}{formatMoney(Math.round(cost.total), language as Language)}
          </span>
        </div>
      )}

      <Section
        open={openSection === 'hours'}
        onToggle={() => toggleSection('hours')}
        tone="plain"
        title={isMonth && monthLabel ? monthLabel : t('hoursWeek')}
        summary={withContract.length > 0
          ? t('overUnder').replace('{over}', String(overCount)).replace('{under}', String(underCount))
          : undefined}
        summaryShort={withContract.length > 0 ? `${overCount}↑ · ${underCount}↓` : undefined}
      >
        <div className="space-y-2.5">
          {isMonth && monthLoading && (
            <p className="text-sm text-slate-400 italic">{t('loadingMonth')}</p>
          )}
          {rows.map(({ person, contractHours, workedHours, extraHours, totalWorked, absenceLabel, note }) => (
            <div key={person.id} className="space-y-1">
              <div className="flex justify-between text-xs font-medium">
                <span className="flex items-center gap-2 text-slate-700">
                  <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: person.color }} />
                  {person.name}
                </span>
                <span className="text-slate-400 font-bold tabular-nums">
                  {/* Un extra n'a pas d'heures de contrat : « 12.0 / 0h » se lirait
                      comme un depassement, alors qu'il n'y a rien a comparer. */}
                  {person.isExtra ? `${totalWorked.toFixed(1)}h` : `${totalWorked.toFixed(1)} / ${contractHours}h`}
                  {isMonth && contractHours > 0 && (
                    <span className={`ml-1.5 ${totalWorked >= contractHours ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {totalWorked >= contractHours ? '+' : '−'}
                      {Math.abs(totalWorked - contractHours).toFixed(1)}
                    </span>
                  )}
                </span>
              </div>
              {absenceLabel ? (
                <span
                  className="inline-block text-xs font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(-45deg, rgba(255,255,255,.55) 0 5px, transparent 5px 10px)',
                  }}
                >
                  {absenceLabel}
                </span>
              ) : (
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                {totalWorked > contractHours ? (
                  // Over target: target portion in person color + overtime in darker shade
                  <>
                    <div
                      className="h-full transition-all duration-500"
                      style={{ width: `${(contractHours / totalWorked) * 100}%`, backgroundColor: person.color }}
                    />
                    <div
                      className="h-full transition-all duration-500"
                      style={{ width: `${((totalWorked - contractHours) / totalWorked) * 100}%`, backgroundColor: person.color, filter: 'brightness(0.55)' }}
                    />
                  </>
                ) : totalWorked === contractHours && contractHours > 0 ? (
                  // Exact: full green bar
                  <div
                    className="h-full transition-all duration-500"
                    style={{ width: '100%', backgroundColor: '#22c55e' }}
                  />
                ) : (
                  // Under target: existing behavior (worked + indigo extra)
                  <>
                    <div
                      className="h-full transition-all duration-500"
                      style={{ width: `${(workedHours / contractHours) * 100}%`, backgroundColor: person.color }}
                    />
                    <div
                      className="h-full transition-all duration-500 bg-indigo-500"
                      style={{ width: `${(extraHours / contractHours) * 100}%` }}
                    />
                  </>
                )}
              </div>
              )}
              {note && (
                <p data-testid="expected-note" className="text-xs text-slate-400">{note}</p>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Boutons d'action ENTRE les heures et les points a verifier : c'est leur
          place habituelle, Serge l'a prefere a une position sous le titre. */}
      {!isReadOnly && (
        <div className="flex gap-2 flex-none">
          {/* « + Shift » : seul le verbe « Add » etait redondant avec l'icone.
              Ce qui cassait l'alignement n'etait pas le texte mais le `py-4`
              avec deux lignes ; la hauteur fixe a 56 px regle ca et garde le mot. */}
          <button 
            type="button"
            onClick={onAddClick}
            title={t('addShift')}
            aria-label={t('addShift')}
            className="flex-1 h-11 px-4 bg-[linear-gradient(135deg,#4f46e5,#7c3aed)] text-white rounded-xl font-bold shadow-md hover:-translate-y-0.5 transition-all duration-200 active:scale-95 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-base whitespace-nowrap">{t('shiftNoun')}</span>
          </button>
          <button
            type="button"
            onClick={onAbsenceClick}
            title={t('absences')}
            className="w-11 h-11 flex items-center justify-center bg-sky-50 text-sky-600 border border-sky-100 rounded-xl hover:bg-sky-100 transition-all active:scale-90 shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <button 
            type="button"
            onClick={() => {
              if (window.confirm(t('confirmDeleteWeek'))) {
                onDeleteWeek();
              }
            }}
            title={t('confirmDeleteWeek')}
            className="w-11 h-11 flex items-center justify-center bg-red-50 text-red-500 border border-red-100 rounded-xl hover:bg-red-100 transition-all active:scale-90 shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}

      {/* Brouillon et copie cote a cote, et SEULEMENT sur une semaine vide
          (decision de Serge le 13/09) : ce sont deux facons de commencer une
          semaine, pas de retravailler une semaine deja construite. Exception :
          un brouillon qui existe deja reste toujours accessible, sinon il
          deviendrait introuvable des que l'officiel se remplit.
          `!isLoading` : `shifts` vaut aussi [] pendant le chargement. */}
      {!isReadOnly && !isLoading && (isEmpty || (onStartDraft && draftExists)) && (
        <div className="flex gap-2 flex-none">
          {/* Explications au survol : infobulle commune de l'app (components/Tooltip). */}
          {onStartDraft && (
            <button
              type="button"
              onClick={onStartDraft}
              title={t('draftHint')}
              className="flex-1 min-h-11 px-3 py-2 border-2 border-dashed border-slate-300 text-slate-600 bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(100,116,139,0.08)_6px_12px)] rounded-xl font-semibold hover:border-indigo-300 hover:text-indigo-700 transition-all active:scale-[0.98] text-sm leading-tight"
            >
              {t(draftExists ? 'draftResume' : 'draftStart')}
            </button>
          )}
          {isEmpty && (
            <button
              type="button"
              onClick={onCopyLastWeek}
              title={t('copyLastWeekHint')}
              className="flex-1 min-h-11 px-3 py-2 border-2 border-dashed border-slate-200 text-slate-500 rounded-xl font-semibold hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all active:scale-[0.98] text-sm leading-tight"
            >
              {t('copyLastWeek')}
            </button>
          )}
        </div>
      )}

      {/* Duree du travail. Le bloc n'apparait que s'il a quelque chose a dire :
          un encart « rien a signaler » permanent prend de la place et finit
          ignore, ce qui est exactement ce qu'on veut eviter pour un avertissement.
          Ambre et non rouge : ce sont des decisions possibles, pas des erreurs. */}
      {compliance.length > 0 && (
        <Section
          open={openSection === 'checks'}
          onToggle={() => toggleSection('checks')}
          tone="amber"
          title={t(compliance.length > 1 ? 'compliancePointsPlural' : 'compliancePoints').replace('{n}', String(compliance.length))}
        >
          <div className="space-y-2">
            {conventionLabel && (
              <p className="text-xs text-amber-600/80 font-medium">{conventionLabel}</p>
            )}
            {compliance.map((c, idx) => (
              <div key={idx} className="text-xs bg-white p-2.5 rounded-xl border border-amber-100">
                <span className="font-bold text-slate-700 block">{c.who}</span>
                <span className="text-slate-500 font-medium leading-snug">{c.text}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section
        open={openSection === 'cover'}
        onToggle={() => toggleSection('cover')}
        tone="slate"
        title={t('leaveCoverage')}
        summary={coverageEvents.length > 0 ? String(coverageEvents.length) : undefined}
      >
        <div className="space-y-2">
          {coverageEvents.length > 0 ? coverageEvents.map((ev, idx) => (
            <div key={idx} className="flex justify-between text-xs items-center bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm">
               <div className="flex flex-col">
                 <span className="text-slate-500 font-bold text-xs uppercase mb-0.5">{ev.dateInfo}</span>
                 <span className="text-slate-400 font-medium truncate max-w-[120px]">Leave: <b className="text-slate-700">{ev.from}</b></span>
                 <span className="text-indigo-600 font-bold text-xs truncate max-w-[120px]">Cover: {ev.to}</span>
               </div>
               <span className="font-black text-slate-800 bg-slate-100 px-2 py-1 rounded-lg flex-shrink-0">{ev.hours}h</span>
            </div>
          )) : (
            <p className="text-xs text-slate-400 italic text-center py-1">{t('noCoverage')}</p>
          )}
        </div>
      </Section>

      <div className="mt-auto flex-none flex items-stretch gap-2">
        {/* Les deux boutons sur UNE ligne : la barre laterale se dispute la
            hauteur avec le planning, et une deuxieme ligne de 44 px se paye sur
            ce qui est reellement consulte. « Gerer l'equipe » garde la largeur
            et le fond noir — c'est le geste courant ; les extras sont un detour
            occasionnel, d'ou le bouton court et clair a cote. */}
        {!isReadOnly && (
          <button
            type="button"
            onClick={onManageStaffClick}
            className="flex-1 min-w-0 h-11 px-4 bg-slate-900 text-slate-100 rounded-xl font-bold border border-slate-800 hover:bg-slate-800 transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 shadow-sm"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span className="text-sm truncate">{t('manageStaff')}</span>
          </button>
        )}

        {!isReadOnly && onManageExtrasClick && (
          <button
            type="button"
            onClick={onManageExtrasClick}
            className="flex-none h-11 px-4 bg-white text-slate-700 rounded-xl font-bold border border-slate-200 hover:bg-slate-50 transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 shadow-sm"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-sm">{t('extrasTitle')}</span>
          </button>
        )}

        {isReadOnly && (
          <div className="flex-1 p-3 bg-slate-50 border border-slate-100 rounded-2xl text-center">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Status</p>
            <p className="text-sm font-bold text-slate-600 flex items-center justify-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              {t('readOnlyStatus')}
            </p>
          </div>
        )}
      </div>
    </aside>
  </>
);
};

export default Sidebar;
