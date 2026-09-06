
export type Language = 'en' | 'fr';

/** 'me' = « ma semaine », l'ecran que l'equipe ouvre sur son telephone. */
export type ViewType = 'day' | 'employee' | 'me';

export interface Staff {
  id: string;
  name: string;
  email: string; // Added for RBAC mapping
  color: string;
  /**
   * Heures du contrat EN COURS, par semaine. Ancien nom : targetHours — ce
   * n'etait pas un objectif fixe par le manager mais ce que dit le contrat.
   * L'ancien champ est encore lu en repli tant que la fiche n'a pas ete
   * reenregistree, donc aucune migration de donnees n'est necessaire.
   */
  contractHours?: number;
  /** @deprecated Remplace par contractHours. Conserve pour les fiches non migrees. */
  targetHours?: number;
  /**
   * Avenants. Chaque entree dit « a partir de cette date, le contrat passe a N
   * heures ». Un meme salarie peut avoir 24h en septembre et 30h en octobre
   * apres signature d'un avenant : sans historique, le nouveau chiffre
   * reecrirait retroactivement tous les mois passes.
   * Une date future est permise — un avenant se signe avant de prendre effet.
   */
  contractChanges?: { from: string; weeklyHours: number }[];
  role: 'admin' | 'staff';
  jobTitle?: string;
  startDate?: string; // YYYY-MM-DD, employment start
  endDate?: string | null; // YYYY-MM-DD or null = still employed (CDI)
}

export interface Shift {
  id: string;
  staffId: string;
  dayIndex: number; // 0 (Mon) to 6 (Sun)
  startTime: number; // Decimal hours (e.g., 9.5 = 09:30)
  endTime: number;
  coverageBy?: string; // staffId of someone covering
  notes?: string;
}

/**
 * Une absence n'a ni heure de debut ni heure de fin : elle ne peut donc pas
 * etre un Shift avec des horaires bidons. Elle vit dans sa propre bande, sous
 * l'en-tete du jour — sinon elle sous-entendrait une plage horaire.
 */
export type AbsenceKind = 'conge' | 'maladie' | 'repos';

export interface Absence {
  id: string;
  staffId: string;
  dayIndex: number; // 0 (Lun) a 6 (Dim), meme convention que Shift
  kind: AbsenceKind;
  /**
   * Demi-journee. Absent = journee entiere. Le champ existe des maintenant pour
   * ne pas avoir a migrer les donnees le jour ou on en aura besoin ; l'interface
   * ne le propose pas encore.
   */
  half?: 'am' | 'pm';
  note?: string;
}

/**
 * Tout ce que porte un document de semaine, hors `updatedAt`. Regroupe pour que
 * la sauvegarde soit atomique : ecrire les shifts seuls effacerait les absences,
 * puisque Firestore remplace le document entier.
 */
export interface WeekData {
  shifts: Shift[];
  absences: Absence[];
  /** dayIndex des jours feries : un etat du JOUR, pas l'absence d'une personne. */
  holidays: number[];
}

export const EMPTY_WEEK: WeekData = { shifts: [], absences: [], holidays: [] };

export type DragType = 'move' | 'resize-top' | 'resize-bottom';

export interface DragState {
  shiftId: string;
  initialX: number;
  initialY: number;
  currentX: number;
  currentY: number;
  originalDay: number;
  originalStart: number;
  originalEnd: number;
  dragType: DragType;
}

export interface LogEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  timestamp: string;
  /**
   * Who the entry is ABOUT (as opposed to userName, who did it). Absent on the
   * 3600+ entries written before this field existed — the journal falls back to
   * reading the name out of `details` for those.
   */
  targetStaffName?: string;
  targetStaffId?: string;
  /** Week the action touched, for future filtering. */
  weekId?: string;
}
