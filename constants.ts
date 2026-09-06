
import { Staff } from './types';

export const DAYS_EN = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
];

export const DAYS_FR = [
  'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'
];

// Version courte pour l'en-tete du calendrier sur telephone : a la taille de
// texte lisible au doigt, 'Wednesday' deborde d'une colonne de 60px et vient
// mordre sur ses voisines. Meme information, trois lettres.
export const DAYS_EN_SHORT = [
  'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
];

export const DAYS_FR_SHORT = [
  'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'
];

export const HOUR_HEIGHT = 50; // Increased from 40 to 50 (25px per 30-min unit)
export const START_HOUR = 8; // 8 AM
export const END_HOUR = 24; // Midnight
export const TOTAL_HOURS = END_HOUR - START_HOUR;


export const INITIAL_STAFF: Staff[] = [
  { id: '1', name: 'Serge', email: '', color: '#7c2d12', targetHours: 40, role: 'admin' },
  { id: '2', name: 'Tatiana', email: '', color: '#166534', targetHours: 36, role: 'staff' },
  { id: '3', name: 'Omar', email: '', color: '#ea580c', targetHours: 20, role: 'staff' },
  { id: '4', name: 'Chris', email: '', color: '#a855f7', targetHours: 18, role: 'staff' },
  { id: '5', name: 'Yasmine', email: '', color: '#1e3a8a', targetHours: 24, role: 'staff' },
  { id: '6', name: 'Sinar', email: '', color: '#bef264', targetHours: 24, role: 'staff' },
  { id: '7', name: 'Youssef', email: '', color: '#facc15', targetHours: 20, role: 'staff' },
  { id: '8', name: 'Adiba', email: '', color: '#f97316', targetHours: 20, role: 'staff' },
];
