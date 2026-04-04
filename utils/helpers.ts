
import { Language } from '../types';

export const formatTime = (hours: number): string => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export const getWeekRangeString = (date: Date, lang: Language = 'en'): string => {
  const start = new Date(date);
  start.setDate(start.getDate() + 1); // +1: weekStart is Sunday, display starts Monday
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  return `${start.toLocaleDateString(locale, options)} - ${end.toLocaleDateString(locale, options)}`;
};

export const getIsoDateString = (date: Date, timeZone: string = 'Europe/Paris'): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch (e) {
    const y = date.getUTCFullYear();
    const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const d = date.getUTCDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
};

export const getMonday = (d: Date, timeZone: string = 'Europe/Paris'): Date => {
  const iso = getIsoDateString(d, timeZone);
  const [y, m, day] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, day, 12, 0, 0);
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon...
  // Use Sunday as week start to match existing Firebase data
  const diff = date.getDate() - dayOfWeek;
  const sunday = new Date(y, m - 1, diff, 12, 0, 0);
  return new Date(Date.UTC(sunday.getFullYear(), sunday.getMonth(), sunday.getDate()));
};

/**
 * Returns the current time and day index in a specific timezone
 */
export const getNowInTimezone = (timeZone: string): { hour: number, minute: number, dayIndex: number, isoDate: string } => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short'
  });
  
  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
  
  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const hour = parseInt(getPart('hour'));
  const minute = parseInt(getPart('minute'));
  const weekday = getPart('weekday'); // Mon, Tue...
  
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayIndex = days.indexOf(weekday);
  
  return {
    hour,
    minute,
    dayIndex,
    isoDate: `${year}-${month}-${day}`
  };
};

export const getShiftDate = (weekStartIso: string, dayIndex: number, lang: Language = 'en'): string => {
  const d = new Date(weekStartIso);
  d.setDate(d.getDate() + dayIndex + 1); // +1 because weekStart is Sunday, dayIndex 0 = Monday
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
};
