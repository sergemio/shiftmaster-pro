
import React, { useState } from 'react';
import { Language, Staff, ViewType, Closure } from '../types';
import AccountDataSection from './AccountDataSection';
import ExportDataButton from './ExportDataButton';
import HourlyRatesEditor from './HourlyRatesEditor';
import { getTranslation } from '../utils/translations';
import { formatTime, halfHourSteps, DEFAULT_OPERATING_HOURS, OperatingHours, frenchPublicHolidays, formatShortDate, todayIso, timeZoneChoices } from '../utils/helpers';
import { CONVENTIONS, conventionLabel } from '../utils/laborRules';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  viewType: ViewType;
  canSeeMyWeek?: boolean;
  onViewTypeChange: (type: ViewType) => void;
  /** Les montants n'existent que pour un admin : `canSeeMoney` faux retire la
   *  section entiere, et l'app n'a de toute facon rien charge. */
  canSeeMoney?: boolean;
  staff?: Staff[];
  rates?: Record<string, number>;
  onRatesChange?: (rates: Record<string, number>) => void;
  /** Heures d'ouverture du planning, pour toute l'equipe. `onHoursChange`
   *  absent = pas admin, la section n'apparait pas. */
  hours?: OperatingHours;
  onHoursChange?: (hours: OperatingHours) => void;
  /** Feries ou le restaurant ferme. `onClosedHolidaysChange` absent = pas admin. */
  closedHolidays?: string[];
  onClosedHolidaysChange?: (keys: string[]) => void;
  /** Fermetures decidees par le restaurant. `onClosuresChange` absent = pas admin. */
  closures?: Closure[];
  onClosuresChange?: (next: Closure[]) => void;
  /** Decompte des conges payes. `onLeaveUnitChange` absent = pas admin. */
  leaveUnit?: 'ouvrables' | 'ouvres';
  onLeaveUnitChange?: (unit: 'ouvrables' | 'ouvres') => void;
  /** Convention collective appliquee aux regles de duree du travail. */
  convention?: string;
  /** Rendu en tiroir lateral (ordinateur) plutot qu'en fenetre. */
  asDrawer?: boolean;
  /** Qui est connecte, a quel restaurant, et la deconnexion (absente de l'en-tete sur tablette et telephone). */
  account?: { name: string; email: string; orgName: string; onLogout: () => void };
  /** Fuseau horaire du restaurant. `onTimezoneChange` absent = pas admin. */
  timezone?: string;
  onTimezoneChange?: (tz: string) => void;
  /** Section deja ouverte a l'arrivee (ex. « Heures d'ouverture » depuis la liste de demarrage). */
  initialSection?: string;
  onConventionChange?: (id: string) => void;
  /** Ouvre l'export des elements variables de paie. Absent = pas admin. */
  onOpenPayroll?: () => void;
  /** Relance la visite guidee (absent pour qui ne planifie pas). */
  onReplayTour?: () => void;
  /** Donnees du restaurant (RGPD) : absent = pas admin, la section n'apparait pas. */
  orgData?: { orgName: string; isOwner: boolean; onDeleted: () => void };
}

/**
 * Fermetures decidees par le restaurant : une periode (du, au) et un motif
 * facultatif. Les jours passes restent visibles jusqu'a ce que la paie du mois
 * soit faite : on ne les masque pas, on les range apres les prochaines.
 */
const ClosuresEditor: React.FC<{ closures: Closure[]; onChange: (next: Closure[]) => void; language: Language }> = ({ closures, onChange, language }) => {
  const t = getTranslation(language);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const valid = !!start && !!end && end >= start;
  const today = todayIso();
  const sorted = [...closures].sort((a, b) => a.start.localeCompare(b.start));
  const add = () => {
    if (!valid) return;
    const c: Closure = { start, end };
    if (note.trim()) c.note = note.trim().slice(0, 80);
    onChange([...closures, c]);
    setStart(''); setEnd(''); setNote('');
  };
  const input = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-base sm:text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500';
  return (
    <div data-testid="closures">
      <p className="text-xs text-slate-500 leading-snug mb-3">{t('closuresHint')}</p>
      {sorted.length > 0 && (
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden mb-3">
          {sorted.map(c => (
            <li key={`${c.start}_${c.end}`} className={`flex items-center gap-3 px-4 py-2.5 bg-white ${c.end < today ? 'opacity-60' : ''}`} data-testid="closure-row">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-slate-800">
                  {c.start === c.end
                    ? formatShortDate(c.start, language)
                    : t('closureRange').replace('{from}', formatShortDate(c.start, language)).replace('{to}', formatShortDate(c.end, language))}
                </span>
                {c.note && <span className="block text-xs text-slate-500 truncate">{c.note}</span>}
              </span>
              <button type="button" onClick={() => onChange(closures.filter(x => x !== c))}
                className="text-xs font-bold text-slate-400 hover:text-red-600" aria-label={`${t('closureRemove')} — ${c.start}`}>
                {t('closureRemove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="min-w-0 text-xs font-semibold text-slate-600">
          {t('closureFrom')}
          <input type="date" value={start} onChange={e => { setStart(e.target.value); if (!end || e.target.value > end) setEnd(e.target.value); }} className={`${input} mt-1 block min-w-0 max-w-full appearance-none min-h-[2.5rem]`} />
        </label>
        <label className="min-w-0 text-xs font-semibold text-slate-600">
          {t('closureTo')}
          <input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} className={`${input} mt-1 block min-w-0 max-w-full appearance-none min-h-[2.5rem]`} />
        </label>
        <label className="col-span-2 text-xs font-semibold text-slate-600">
          {t('closureNote')}
          <input type="text" value={note} maxLength={80} onChange={e => setNote(e.target.value)} placeholder={t('closureNotePlaceholder')} className={`${input} mt-1`} />
        </label>
      </div>
      <button type="button" onClick={add} disabled={!valid}
        className="mt-2 w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        {t('closureAdd')}
      </button>
    </div>
  );
};

/* Reglages ranges en sections repliables (22/09/2026, maquette validee par
   Serge) : une ligne par sujet, fermee par defaut ; un clic la deplie. Les choix
   exclusifs restent des boutons de choix, les oui/non sont des interrupteurs. */
const ICONS: Record<string, string> = {
  display: 'M3 5h18v14H3zM3 10h18M9 10v9',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  book: 'M4 19V5a2 2 0 012-2h12v18H6a2 2 0 01-2-2zM8 7h6M8 11h6',
  leave: 'M3 17h18M6 17l3-9 3 5 3-3 3 7',
  calendar: 'M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM3 10h18M8 3v4M16 3v4',
  lock: 'M7 11h10a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6a2 2 0 012-2zM8 11V7a4 4 0 018 0v4',
  euro: 'M17 6a7 7 0 100 12M4 10h9M4 14h9',
  data: 'M4 6c0 1.7 3.6 3 8 3s8-1.3 8-3-3.6-3-8-3-8 1.3-8 3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z',
};

const Section: React.FC<{
  id: string; icon: string; title: string; open: Set<string>; onToggle: (id: string) => void; children: React.ReactNode;
}> = ({ id, icon, title, open, onToggle, children }) => {
  const isOpen = open.has(id);
  return (
    <section data-testid={`settings-${id}`}>
      <button type="button" onClick={() => onToggle(id)} aria-expanded={isOpen} aria-controls={`settings-${id}-body`}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-semibold transition-colors ${isOpen ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
        <svg className="w-[18px] h-[18px] flex-none text-slate-500" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={icon} /></svg>
        <span className="flex-1 min-w-0">{title}</span>
        <svg className={`w-4 h-4 flex-none text-slate-400 transition-transform duration-200 motion-reduce:transition-none ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
      </button>
      {/* Ouverture et fermeture en glissant (0,2 s) : la hauteur passe de 0 a
          celle du contenu. Fermee, la section est invisible et inerte. */}
      <div id={`settings-${id}-body`} inert={!isOpen}
        className={`grid transition-[grid-template-rows,visibility] duration-200 ease-out motion-reduce:transition-none ${isOpen ? 'grid-rows-[1fr] visible' : 'grid-rows-[0fr] invisible'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-2 pl-10 pr-2 pt-2 pb-3">{children}</div>
        </div>
      </div>
    </section>
  );
};

/** Un choix parmi plusieurs : pastilles cote a cote, ou lignes empilees pour les libelles longs. */
function Choices<T extends string>({ label, value, options, onChange, stacked = false }: {
  label: string; value: T; options: [T, string][]; onChange: (v: T) => void; stacked?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={stacked ? 'flex flex-col gap-1.5' : 'flex flex-wrap gap-1.5'}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`border rounded-lg text-sm transition-colors ${stacked ? 'text-left px-3 py-2' : 'px-3 py-1'} ${value === v ? 'bg-indigo-50 border-indigo-600 text-indigo-700 font-bold' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

const Switch: React.FC<{ on: boolean; label: string; onChange: () => void }> = ({ on, label, onChange }) => (
  // role="switch" : un lecteur d'ecran annonce « active / desactive » et le nom du reglage.
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange}
    className={`relative w-10 h-6 rounded-full before:absolute before:-inset-2.5 before:content-[''] flex-none transition-colors duration-200 motion-reduce:transition-none ${on ? 'bg-violet-600' : 'bg-slate-200'}`}>
    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none ${on ? 'translate-x-4' : 'translate-x-0'}`} />
  </button>
);

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  language, 
  onLanguageChange,
  viewType,
  canSeeMyWeek = false,
  onViewTypeChange,
  canSeeMoney = false,
  staff = [],
  rates = {},
  onRatesChange,
  orgData,
  hours = DEFAULT_OPERATING_HOURS,
  onHoursChange,
  closedHolidays = [],
  onClosedHolidaysChange,
  closures = [],
  onClosuresChange,
  leaveUnit = 'ouvrables',
  onLeaveUnitChange,
  onOpenPayroll,
  onReplayTour,
  convention = '1501',
  onConventionChange,
  asDrawer = false,
  initialSection,
  timezone = 'Europe/Paris',
  onTimezoneChange,
  account,
}) => {
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set(initialSection ? [initialSection] : []));
  const toggle = (id: string) => setOpenSet(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  if (!isOpen && !asDrawer) return null;
  const t = getTranslation(language);

  const viewChoices: [ViewType, string][] = [['day', t('viewDayShort')], ['employee', t('viewTeamShort')]];
  if (canSeeMyWeek) viewChoices.push(['me', t('myWeekView')]);
  const hint = 'text-xs text-slate-500 leading-snug';
  const select = 'w-24 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none';

  const content = (
    <div className="flex flex-col gap-1">
      <Section id="display" icon={ICONS.display} title={t('displayTitle')} open={openSet} onToggle={toggle}>
        <span className="text-xs font-semibold text-slate-600">{t('viewType')}</span>
        <Choices label={t('viewType')} value={viewType} options={viewChoices} onChange={v => onViewTypeChange(v)} />
        <span className="text-xs font-semibold text-slate-600 mt-1">{t('language')}</span>
        {/* Chaque langue ecrite dans sa propre langue : on la reconnait meme sans la lire. */}
        <Choices label={t('language')} value={language} options={[['fr', 'Français'], ['en', 'English']]} onChange={v => onLanguageChange(v)} />
      </Section>

      {/* Heures d'ouverture (16/09/2026) : la grille demarrait a 8 h pour un
          premier service a 9 h 30. Chaque etablissement regle sa plage ; un
          shift en dehors elargit quand meme la grille, il n'est jamais cache. */}
      {onHoursChange && (
        <Section id="hours" icon={ICONS.clock} title={t('hoursTitle')} open={openSet} onToggle={toggle}>
          <p className={hint}>{t('hoursHint')}</p>
          <label className="flex items-center justify-between gap-3 text-sm text-slate-600">
            {t('hoursFrom')}
            <select value={hours.start} className={select}
              onChange={e => { const start = parseFloat(e.target.value); onHoursChange({ start, end: Math.max(hours.end, start + 1) }); }}>
              {halfHourSteps(0, 23).map(v => <option key={v} value={v}>{formatTime(v)}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-sm text-slate-600">
            {t('hoursTo')}
            <select value={hours.end} className={select} onChange={e => onHoursChange({ start: hours.start, end: parseFloat(e.target.value) })}>
              {halfHourSteps(hours.start + 1, 24).map(v => <option key={v} value={v}>{formatTime(v)}</option>)}
            </select>
          </label>
        </Section>
      )}

      {/* Ou se trouve le restaurant (22/09/2026) : « aujourd'hui », la semaine en
          cours et le trait de l'heure suivent ce fuseau, pas celui de l'appareil. */}
      {onTimezoneChange && (
        <Section id="timezone" icon={ICONS.globe} title={t('tzTitle')} open={openSet} onToggle={toggle}>
          <p className={hint}>{t('tzHint')}</p>
          <select value={timezone} onChange={e => onTimezoneChange(e.target.value)} aria-label={t('tzTitle')}
            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none">
            {timeZoneChoices().map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
          </select>
          <p className="text-xs text-slate-600" data-testid="tz-now">
            {t('tzNow')} <b>{new Date().toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })}</b>
            {' · '}{formatShortDate(todayIso(timezone), language)}
          </p>
        </Section>
      )}

      {/* Convention collective : les seuils des alertes de duree du travail
          (repos, journee maximale) en dependent. */}
      {onConventionChange && (
        <Section id="convention" icon={ICONS.book} title={t('conventionTitle')} open={openSet} onToggle={toggle}>
          <Choices label={t('conventionTitle')} value={convention} stacked
            options={['1501', '1979', 'none'].map(id => [id, conventionLabel(CONVENTIONS[id], language)] as [string, string])}
            onChange={onConventionChange} />
          <p className={hint}>{t('conventionHint')}</p>
        </Section>
      )}

      {/* Decompte des conges : reglage du restaurant, une fois pour toutes. */}
      {onLeaveUnitChange && (
        <Section id="leave" icon={ICONS.leave} title={t('leaveUnitTitle')} open={openSet} onToggle={toggle}>
          <Choices label={t('leaveUnitTitle')} value={leaveUnit} stacked
            options={[['ouvrables', t('leaveUnitOuvrables')], ['ouvres', t('leaveUnitOuvres')]]}
            onChange={onLeaveUnitChange} />
          <p className={hint}>{t('leaveUnitHint')}</p>
        </Section>
      )}

      {/* Jours feries (18/09/2026) : ils etaient coches a la main, semaine par
          semaine, dans la fenetre des absences. L'app les calcule desormais ;
          le restaurant dit seulement lesquels il FERME, une fois pour toutes. */}
      {onClosedHolidaysChange && (
        <Section id="holidays" icon={ICONS.calendar} title={t('holidaysTitle')} open={openSet} onToggle={toggle}>
          <p className={hint}>{t('holidaysHint')}</p>
          <ul className="flex flex-col">
            {frenchPublicHolidays(Number(todayIso().slice(0, 4))).map(h => {
              const closed = closedHolidays.includes(h.key);
              const name = t('holiday_' + h.key);
              return (
                <li key={h.key} className="flex items-center gap-3 py-1.5">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-700">{name}</span>
                    <span className="block text-xs text-slate-500">
                      {new Date(h.date + 'T12:00:00Z').toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB',
                        { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
                      {' · '}<span className={closed ? 'font-bold text-violet-700' : ''}>{t(closed ? 'holidayClosed' : 'holidayOpen')}</span>
                    </span>
                  </span>
                  <Switch on={closed} label={`${name} — ${t('holidayClosed')}`}
                    onChange={() => onClosedHolidaysChange(closed ? closedHolidays.filter(k => k !== h.key) : [...closedHolidays, h.key])} />
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {onClosuresChange && (
        <Section id="closures" icon={ICONS.lock} title={t('closuresTitle')} open={openSet} onToggle={toggle}>
          <ClosuresEditor closures={closures} onChange={onClosuresChange} language={language} />
        </Section>
      )}

      {canSeeMoney && onRatesChange && (
        <Section id="rates" icon={ICONS.euro} title={t('ratesTitle')} open={openSet} onToggle={toggle}>
          <HourlyRatesEditor staff={staff} rates={rates} onChange={onRatesChange} language={language} />
        </Section>
      )}

      <div className="h-px bg-slate-200 my-2 mx-2" />

      {/* L'export vit ici depuis le 08/09/2026 : quelques usages par an ne
          justifiaient pas une place permanente dans la colonne du planning. */}
      <Section id="data" icon={ICONS.data} title={t('dataTitle')} open={openSet} onToggle={toggle}>
        {onOpenPayroll && (
          <button type="button" onClick={onOpenPayroll}
            className="w-full py-2.5 px-4 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors text-sm">
            {t('payrollOpen')}
          </button>
        )}
        <ExportDataButton language={language as Language} />
        {onReplayTour && (
          <button type="button" onClick={onReplayTour}
            className="w-full py-2.5 px-4 bg-white text-slate-600 border border-slate-200 rounded-xl font-semibold hover:bg-slate-50 transition-colors text-sm">
            {t('tourReplay')}
          </button>
        )}
      </Section>

      {orgData && (
        <Section id="org" icon={ICONS.shield} title={t('orgDataTitle')} open={openSet} onToggle={toggle}>
          <AccountDataSection language={language as Language} {...orgData} />
        </Section>
      )}

      {account && (
        <div className="mt-3 mx-2 pt-3 border-t border-slate-200 flex items-center gap-3" data-testid="settings-account">
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-slate-800 truncate">{account.name}</span>
            <span className="block text-xs text-slate-500 truncate">{[account.orgName, account.email].filter(Boolean).join(' · ')}</span>
          </span>
          <button type="button" onClick={account.onLogout}
            className="flex-none text-sm font-semibold text-red-600 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50">
            {t('signOut')}
          </button>
        </div>
      )}
    </div>
  );

  // Ordinateur (22/09/2026) : les memes reglages dans un tiroir a gauche, qui
  // pousse le planning au lieu de le recouvrir. Toujours monte, pour que
  // l'ouverture puisse glisser ; ferme, il est inerte.
  if (asDrawer) return (
    <div className="h-full w-[320px] lg:w-[340px] flex flex-col bg-slate-50" data-testid="settings-drawer">
      {/* Pas de croix : le bouton menu, juste a cote, ouvre ET ferme le tiroir
          (comme YouTube). Deux boutons pour la meme chose, c'etait un de trop. */}
      <div className="h-16 flex-none flex items-center justify-between px-5 border-b border-slate-100">
        <h2 className="text-lg font-black text-slate-800 tracking-tight">{t('settings')}</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-3 pb-8">
        {content}
      </div>
    </div>
  );

  return (
    // Clic sur le fond = fermer : tout ce qu'on regle ici s'enregistre au moment du changement.
    <div onClick={onClose} className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Jamais plus haut que l'ecran : titre et bouton OK fixes, seul le milieu defile. */}
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-sm max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="p-6 md:p-8 pb-4 flex justify-between items-start flex-none">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600">
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
            <h2 className="text-lg md:text-xl font-black text-slate-800 tracking-tight">{t('settings')}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 pt-2 pb-6">
          {content}
        </div>

        <div className="flex-none px-6 md:px-8 pt-4 pb-6 md:pb-8 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl shadow-lg hover:bg-slate-800 active:scale-95 transition-all text-sm uppercase tracking-widest"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
