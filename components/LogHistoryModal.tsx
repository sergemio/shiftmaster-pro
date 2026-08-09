import React, { useState, useMemo, useEffect } from 'react';
import { LogEntry, Language } from '../types';
import { loadLogs } from '../services/firebaseService';

interface LogHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: Language;
}

type Role = 'both' | 'author' | 'target';

const PALETTE = ['#4f46e5', '#0d9488', '#c2410c', '#7c3aed', '#be123c', '#0369a1'];

const LABELS: Record<string, { verb: string; verbFr: string; tone: string; tag: string }> = {
  'CREATE SHIFT':    { verb: 'added a shift for',    verbFr: 'a ajouté un shift pour',   tone: 'create', tag: 'New' },
  'UPDATE SHIFT':    { verb: 'changed the shift of', verbFr: 'a modifié le shift de',    tone: 'update', tag: 'Edit' },
  'DELETE SHIFT':    { verb: 'removed the shift of', verbFr: 'a supprimé le shift de',   tone: 'delete', tag: 'Del' },
  'DELETE WEEK':     { verb: 'cleared the week',     verbFr: 'a vidé la semaine',        tone: 'delete', tag: 'Week' },
  'COPY WEEK':       { verb: 'copied a week',        verbFr: 'a copié une semaine',      tone: 'other',  tag: 'Copy' },
  'UPDATE STAFF':    { verb: 'changed the team',     verbFr: "a modifié l'équipe",       tone: 'other',  tag: 'Team' },
  'EXPORT SNAPSHOT': { verb: 'exported the planning', verbFr: 'a exporté le planning',   tone: 'other',  tag: 'PNG' },
  'UNDO':            { verb: 'undid an action',      verbFr: 'a annulé une action',      tone: 'other',  tag: 'Undo' },
  'REDO':            { verb: 'redid an action',      verbFr: 'a refait une action',      tone: 'other',  tag: 'Redo' },
};

const TONE_CLASS: Record<string, string> = {
  create: 'bg-emerald-100 text-emerald-700',
  update: 'bg-indigo-100 text-indigo-700',
  delete: 'bg-red-100 text-red-700',
  other:  'bg-slate-100 text-slate-600',
};
const DOT_CLASS: Record<string, string> = {
  create: 'bg-emerald-500', update: 'bg-indigo-500', delete: 'bg-red-500', other: 'bg-slate-300',
};

/**
 * Name of the person an entry is ABOUT. New entries carry targetStaffName;
 * the thousands written before that field existed only have it inside the
 * English sentence, so it is read back out of there.
 */
const targetOf = (log: LogEntry): string | null => {
  if (log.targetStaffName) return log.targetStaffName;
  const m = log.details?.match(/shift for\s+([\p{L}'-]+)/u);
  return m ? m[1] : null;
};

/** "Saturday, April 4 (20:00-23:30)" out of the full sentence. */
const detailOf = (log: LogEntry): string => {
  const m = log.details?.match(/\son\s+(.+)$/);
  return m ? m[1] : (log.details || '');
};

const initials = (name: string) =>
  name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

const LogHistoryModal: React.FC<LogHistoryModalProps> = ({ isOpen, onClose, language = 'en' }) => {
  const fr = language === 'fr';
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [days, setDays] = useState(30);
  const [role, setRole] = useState<Role>('both');
  const [hideNoise, setHideNoise] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  // How many days are actually in `logs`. Firestore bills per document, so we
  // fetch the window being displayed — not the widest one on offer — and only
  // go back further when the reader asks for it.
  const [loadedDays, setLoadedDays] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    if (loadedDays >= days) return;   // already have this range in memory
    let cancelled = false;
    setLoading(true);
    loadLogs(Math.ceil(days / 30))
      .then(rows => {
        if (cancelled) return;
        setLogs(rows);
        setLoadedDays(days);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, days, loadedDays]);

  const colorFor = useMemo(() => {
    const map = new Map<string, string>();
    return (name: string) => {
      if (!map.has(name)) map.set(name, PALETTE[map.size % PALETTE.length]);
      return map.get(name)!;
    };
  }, [logs]);

  const q = query.trim().toLowerCase();

  const matches = (log: LogEntry, r: Role) => {
    const asAuthor = (log.userName || '').toLowerCase().includes(q);
    const t = targetOf(log);
    const asTarget = !!t && t.toLowerCase().includes(q);
    if (r === 'author') return asAuthor;
    if (r === 'target') return asTarget;
    return asAuthor || asTarget;
  };

  const { rows, days: dayKeys, groups, counts } = useMemo(() => {
    const from = new Date(Date.now() - days * 864e5).toISOString();
    let base = logs.filter(l => (l.timestamp || '') >= from);
    if (hideNoise) base = base.filter(l => l.action !== 'UPDATE SHIFT');

    const counts = q
      ? {
          both: base.filter(l => matches(l, 'both')).length,
          author: base.filter(l => matches(l, 'author')).length,
          target: base.filter(l => matches(l, 'target')).length,
        }
      : null;

    const rows = q ? base.filter(l => matches(l, role)) : base;
    const groups: Record<string, LogEntry[]> = {};
    rows.forEach(l => {
      const d = (l.timestamp || '').slice(0, 10);
      (groups[d] = groups[d] || []).push(l);
    });
    return { rows, days: Object.keys(groups).sort().reverse(), groups, counts };
  }, [logs, days, hideNoise, q, role]);

  // Searching expands everything: hiding a match behind a folded day would
  // defeat the point of searching at all.
  useEffect(() => {
    if (q) setOpen(new Set(dayKeys));
    else setOpen(new Set());
  }, [q, role, dayKeys.join(',')]);

  if (!isOpen) return null;

  const allOpen = dayKeys.length > 0 && dayKeys.every(d => open.has(d));
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const locale = fr ? 'fr-FR' : 'en-GB';

  const dayName = (day: string) => {
    if (day === today) return fr ? "Aujourd'hui" : 'Today';
    if (day === yesterday) return fr ? 'Hier' : 'Yesterday';
    return new Date(day + 'T12:00:00Z').toLocaleDateString(locale, {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
    });
  };

  const highlight = (text: string) => {
    if (!q) return text;
    const i = text.toLowerCase().indexOf(q);
    if (i === -1) return text;
    return (<>
      {text.slice(0, i)}
      <mark className="bg-yellow-200 rounded-sm px-0.5">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>);
  };

  const cap = query.trim().replace(/^./, c => c.toUpperCase());

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl w-full max-w-2xl flex flex-col h-[85vh] sm:h-[78vh] overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">

        <div className="px-5 md:px-6 pt-5 flex-none">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">
              {fr ? "Journal d'activité" : 'Activity journal'}
            </h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-all flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="relative mb-2">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setRole('both'); }}
              placeholder={fr ? 'Rechercher un employé ou une personne…' : 'Search an employee or a person…'}
              className="w-full pl-10 pr-3 py-3 border-2 border-slate-200 rounded-2xl text-sm outline-none focus:border-indigo-500 focus:bg-indigo-50/20 transition-all"
            />
          </div>

          {q && counts && (
            <div className="flex gap-2 flex-wrap mb-3">
              {([
                ['both', fr ? 'Tout' : 'All', counts.both],
                ['author', fr ? `Fait par ${cap}` : `Done by ${cap}`, counts.author],
                ['target', fr ? `Shifts de ${cap}` : `Shifts of ${cap}`, counts.target],
              ] as [Role, string, number][]).map(([key, label, n]) => (
                <button
                  key={key}
                  disabled={n === 0}
                  onClick={() => setRole(key)}
                  className={`px-3 py-1.5 rounded-xl border-2 text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-40 ${role === key ? 'bg-indigo-50 border-indigo-500 text-indigo-800' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200'}`}
                >
                  {label}
                  <span className={`text-[10px] font-black px-1.5 rounded-full ${role === key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{n}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-1.5 flex-wrap items-center pb-3 border-b border-slate-100">
            {[[1, fr ? "Aujourd'hui" : 'Today'], [7, fr ? '7 jours' : '7 days'], [30, fr ? '30 jours' : '30 days'], [60, fr ? '2 mois' : '2 months']].map(([d, label]) => (
              <button
                key={d as number}
                onClick={() => setDays(d as number)}
                className={`px-3 py-1.5 rounded-full border-[1.5px] text-xs font-bold transition-all ${days === d ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200'}`}
              >
                {label as string}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={hideNoise} onChange={e => setHideNoise(e.target.checked)} className="w-4 h-4 accent-indigo-600 cursor-pointer" />
              {fr ? 'Masquer les ajustements' : 'Hide time tweaks'}
            </label>
          </div>
        </div>

        <div className="px-5 md:px-6 pt-3 pb-1 flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-slate-400 flex-none">
          <span>
            {loading ? (fr ? 'Chargement…' : 'Loading…')
              : rows.length
                ? <><span className="text-indigo-600">{rows.length}</span> {fr ? 'action' : 'action'}{rows.length > 1 ? 's' : ''} · {dayKeys.length} {fr ? 'jour' : 'day'}{dayKeys.length > 1 ? 's' : ''}</>
                : (fr ? 'Aucun résultat' : 'No results')}
          </span>
          {dayKeys.length > 0 && (
            <button
              onClick={() => setOpen(allOpen ? new Set() : new Set(dayKeys))}
              className="text-indigo-600 hover:underline font-black uppercase tracking-widest"
            >
              {allOpen ? (fr ? 'Tout replier' : 'Collapse all') : (fr ? 'Tout déplier' : 'Expand all')}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 md:px-6 pb-6">
          {!loading && rows.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-14">
              {fr ? 'Rien ne correspond à cette recherche.' : 'Nothing matches this search.'}
            </p>
          )}

          {dayKeys.map(day => {
            const items = groups[day];
            const isOpen = open.has(day);
            const authors = [...new Set(items.map(l => l.userName || '?'))];
            const tones = [...new Set(items.map(l => LABELS[l.action]?.tone || 'other'))];
            return (
              <div key={day} className="mb-1">
                <button
                  onClick={() => setOpen(prev => {
                    const next = new Set(prev);
                    next.has(day) ? next.delete(day) : next.add(day);
                    return next;
                  })}
                  className={`w-full flex items-center gap-2.5 py-3 px-2 rounded-lg hover:bg-slate-50 transition-colors text-left border-b border-slate-100 ${isOpen ? 'sticky top-0 bg-white z-10' : ''}`}
                >
                  <svg className={`w-3.5 h-3.5 text-slate-400 flex-none transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-[13px] font-extrabold text-slate-800 capitalize flex-none">{dayName(day)}</span>
                  <span className="text-[11px] font-bold text-slate-400">
                    {items.length} {fr ? 'action' : 'action'}{items.length > 1 ? 's' : ''}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="flex gap-1">
                      {tones.map(t => <span key={t} className={`w-[7px] h-[7px] rounded-full ${DOT_CLASS[t]}`} />)}
                    </span>
                    <span className="flex">
                      {authors.map((a, i) => (
                        <span
                          key={a}
                          title={a}
                          className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-black text-white"
                          style={{ backgroundColor: colorFor(a), marginLeft: i ? -6 : 0 }}
                        >
                          {initials(a)}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div className="py-1">
                    {items.map(log => {
                      const meta = LABELS[log.action] || { verb: log.action, verbFr: log.action, tone: 'other', tag: log.action.slice(0, 5) };
                      const who = (log.userName || '?').replace(' Menassa', '');
                      const target = targetOf(log);
                      return (
                        <div key={log.id} className="flex gap-3 py-2 px-2 rounded-lg hover:bg-slate-50">
                          <span className="text-[11px] font-extrabold text-slate-400 w-10 flex-none pt-0.5 tabular-nums">
                            {new Date(log.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span
                            className="w-6 h-6 rounded-full flex-none flex items-center justify-center text-[9px] font-black text-white"
                            style={{ backgroundColor: colorFor(log.userName || '?') }}
                          >
                            {initials(log.userName || '?')}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] text-slate-800 leading-snug">
                              <span className={`inline-block text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded mr-1.5 align-[1px] ${TONE_CLASS[meta.tone]}`}>
                                {meta.tag}
                              </span>
                              <b className="font-extrabold">{highlight(who)}</b>{' '}
                              {fr ? meta.verbFr : meta.verb}
                              {target && <> <b className="font-extrabold">{highlight(target)}</b></>}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5 truncate">{detailOf(log)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LogHistoryModal;
