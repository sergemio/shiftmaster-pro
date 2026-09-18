
export type Language = 'en' | 'fr';

/** 'me' = « ma semaine », l'ecran que l'equipe ouvre sur son telephone. */
export type ViewType = 'day' | 'employee' | 'me';

/**
 * Un client du produit. Toutes ses donnees vivent sous `orgs/{orgId}/...`
 * (voir SAAS-PLAN.md). Le role d'une personne dans une org vient de son jeton
 * d'authentification, pas de ce document.
 */
export type OrgRole = 'admin' | 'staff';

/** Etats Stripe conserves tels quels ; `trialing` expire de lui-meme via trialEndsAt. */
export type OrgStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

/** Convention collective appliquee par le moteur de regles du travail. */
export type LaborConvention = 'hcr' | 'none';

export interface OrgSettings {
  timezone?: string;
  language?: Language;
  openHour?: number;
  closeHour?: number;
  convention?: LaborConvention;
  /** Unite de decompte des conges payes. Defaut legal : jours ouvrables. */
  leaveUnit?: LeaveUnit;
  /**
   * Jours feries ou le restaurant FERME, chaque annee (`HolidayKey` de
   * utils/helpers). Absent = ouvert tous les feries, le cas courant en
   * restauration. Un ferie ferme bloque les shifts et sort du decompte des CP.
   */
  closedHolidays?: string[];
}

export interface Org {
  id: string;
  name: string;
  ownerUid: string;
  status: OrgStatus;
  /** ISO, ou null hors essai. Compare par les regles Firestore a l'heure du serveur. */
  trialEndsAt: string | null;
  settings: OrgSettings;
  createdAt: string;
  updatedAt: string;
}

/** `orgs/{orgId}/invites/{token}` : l'id du document est le jeton du lien. */
export interface Invite {
  email: string;
  role: OrgRole;
  /** Fiche Staff a rattacher a la personne quand elle accepte. */
  staffId?: string;
  createdAt: string;
  createdBy: string;
}

/** `users/{uid}` : miroir des claims, tenu par les Cloud Functions. */
export interface UserProfile {
  email: string;
  orgs: Record<string, OrgRole>;
  createdAt?: string;
}

/**
 * Informations de paie d'un extra. **Aucune n'est obligatoire** (decision de
 * Serge du 17/09/2026) : le produit offre le moyen d'etre en regle, il ne
 * l'impose pas. Lisibles des seuls admins.
 */
export interface ExtraPayroll {
  birthDate?: string;
  birthPlace?: string;
  address?: string;
  /** Numero de securite sociale. */
  ssn?: string;
  nationality?: string;
}

/**
 * Un extra : une vraie personne qui vient a la mission, hors contrat.
 *
 * Vit dans `orgs/{orgId}/extras/{id}`, **lisible des seuls admins** parce que
 * le telephone, l'email et les informations de paie sont des donnees
 * personnelles. Le planning, lui, n'affiche que le prenom, recopie sur le
 * shift (`Shift.extraName`) : c'est ce qui permet a l'equipe de voir « Monique »
 * sans avoir acces a sa fiche.
 */
export interface Extra {
  id: string;
  /** Ce qui s'affiche sur le planning. « Extra 1 » tant que personne n'est nomme. */
  firstName: string;
  lastName?: string;
  phone?: string;
  email?: string;
  /** Cout horaire charge. Absent = inconnu, jamais zero. */
  rate?: number;
  /** L'admin a demande a garder cette personne pour les prochaines fois. */
  retained: boolean;
  payroll?: ExtraPayroll;
  createdAt: string;
  /** Date de remplissage du formulaire par la personne. null = en attente. */
  filledAt?: string | null;
  /** Dernier jour travaille, pour trier le vivier. */
  lastMission?: string;
}

export interface Staff {
  id: string;
  name: string;
  email: string; // Added for RBAC mapping
  /** Compte Firebase rattache, pose a l'acceptation de l'invitation. */
  uid?: string;
  /**
   * Ligne d'extra reconstituee a partir des shifts de la semaine, pas une fiche
   * de `settings/staff`. Elle n'existe que le temps de l'affichage.
   */
  isExtra?: boolean;
  /**
   * Jours travailles par semaine selon le contrat (defaut 5). Sert a estimer
   * les heures d'absence d'une semaine qui n'est pas encore planifiee :
   * 3 pour un temps partiel a trois shifts.
   */
  workDaysPerWeek?: number;
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
  /**
   * Ligne partagee par plusieurs personnes reelles, comme « Extra ».
   *
   * Les regles de duree du travail sont individuelles : les appliquer a une
   * ligne ou deux extras differents s'enchainent produirait une fausse alerte
   * par jour, et on cesserait de lire les avertissements des la premiere
   * semaine. Le moteur exclut ces lignes.
   */
  isPool?: boolean;
  jobTitle?: string;
  startDate?: string; // YYYY-MM-DD, employment start
  endDate?: string | null; // YYYY-MM-DD or null = still employed (CDI)
}

export interface Shift {
  id: string;
  /** Fiche de l'equipe, OU identifiant d'extra (voir `extraName`). */
  staffId: string;
  dayIndex: number; // 0 (Mon) to 6 (Sun)
  startTime: number; // Decimal hours (e.g., 9.5 = 09:30)
  endTime: number;
  coverageBy?: string; // staffId of someone covering
  notes?: string;
  /**
   * Prenom de l'extra qui tient ce shift, recopie ici volontairement.
   *
   * La fiche complete (`orgs/{orgId}/extras/{staffId}`) est reservee aux admins ;
   * sans cette copie, l'equipe verrait un shift sans nom. Presence de ce champ =
   * ce shift est tenu par un extra, et `staffId` designe une fiche d'extra.
   */
  extraName?: string;
  /**
   * Extra dont la fiche n'est pas encore remplie : « Extra 1 » attend un nom, un
   * telephone. Pose sur le SHIFT et pas deduit de la fiche, parce que l'equipe
   * ne lit pas les fiches (donnees personnelles) : sans ce champ, un employe ne
   * pourrait pas distinguer un creneau encore incertain d'un extra confirme.
   */
  extraPending?: boolean;
}

/**
 * Une absence n'a ni heure de debut ni heure de fin : elle ne peut donc pas
 * etre un Shift avec des horaires bidons. Elle vit dans sa propre bande, sous
 * l'en-tete du jour — sinon elle sous-entendrait une plage horaire.
 */
export type AbsenceKind = 'conge' | 'maladie' | 'absent';

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
  /**
   * Jour issu d'une periode d'absence (`orgs/{orgId}/absences/{periodId}`).
   * Absent = etiquette posee a la main avant les periodes (anciennes donnees).
   */
  periodId?: string;
  /** Heures d'absence de ce jour, copiees de la periode : ce que l'attendu du
   *  contrat perd. Absent = ancienne etiquette, estimee au contrat. */
  hours?: number;
}

/**
 * Motif d'une absence au sens de la PAIE : chacun a un traitement different
 * sur le bulletin (indemnite de conges, IJSS et maintien de salaire, retenue).
 */
export type LeaveKind =
  | 'cp'                    // conge paye
  | 'maladie'               // arret maladie non professionnelle
  | 'at_mp'                 // accident du travail, de trajet, maladie professionnelle
  | 'maternite_paternite'
  | 'famille'               // evenement familial (mariage, naissance, deces...)
  | 'sans_solde'
  | 'injustifiee';

/**
 * Decompte des conges payes. `ouvrables` (lundi -> samedi, 30 j/an) est la
 * regle du Code du travail ; `ouvres` (lundi -> vendredi, 25 j/an) est admis
 * s'il n'est pas moins favorable au salarie.
 */
export type LeaveUnit = 'ouvrables' | 'ouvres';

/**
 * Une absence telle que la paie la connait : une PERIODE, pas une liste de
 * jours. Vit dans `orgs/{orgId}/absences/{id}`, lisible des admins et de la
 * personne concernee seulement — le motif d'un arret est une donnee de sante.
 * L'equipe en voit une projection anonymisee dans chaque semaine
 * (`WeekData.absences`, `kind: 'absent'`).
 */
export interface AbsencePeriod {
  id: string;
  staffId: string;
  /** Compte de la personne, pour qu'elle lise ses propres absences. */
  staffUid?: string;
  kind: LeaveKind;
  /** Premier jour d'absence, ISO, inclus. */
  start: string;
  /** Dernier jour d'absence, ISO, inclus — la veille de la reprise. */
  end: string;
  /** Demi-journee, pour une absence d'un seul jour. */
  half?: 'am' | 'pm';
  /** Jours decomptes (ouvrables ou ouvres), fige a l'enregistrement. */
  daysCounted: number;
  /** Heures que la personne aurait travaillees, proposees puis modifiables. */
  hoursLost: number;
  /** `hoursLost` jour par jour (somme exacte), jours a 0 omis : l'attendu d'une
   *  semaine ou d'un mois, et la paie d'un mois, prennent ce qui y tombe. */
  hoursByDate?: Record<string, number>;
  note?: string;
  justificatif: 'none' | 'received';
  /** Semaines couvertes : charger les absences d'une semaine en une requete. */
  weekIds: string[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

/**
 * Solde de conges payes LU SUR UN BULLETIN, a une date : le point de depart du
 * compteur provisoire. `orgs/{orgId}/leaveBalances/{staffId}`, lisible des
 * admins et de la personne concernee seulement.
 */
export interface LeaveBalance {
  staffId: string;
  staffUid?: string;
  /** Date du bulletin (fin de la periode de paie), ISO. */
  anchorDate: string;
  /** Solde total restant a cette date (N-1 + N), en jours. */
  anchorBalance: number;
  updatedAt: string;
  updatedBy: string;
}

/** Motifs qu'un salarie peut demander lui-meme : un arret ne se demande pas. */
export type RequestableLeaveKind = 'cp' | 'sans_solde';

/**
 * Demande de conge faite par le salarie depuis « ma semaine ».
 * `orgs/{orgId}/leaveRequests/{id}` : creee par la personne (son `staffUid`),
 * lue par elle et les admins, tranchee par un admin. Acceptee, elle devient une
 * `AbsencePeriod` ordinaire (`absenceId`), saisie par l'admin avec les memes
 * controles que toute absence (chevauchements, heures, solde).
 */
export interface LeaveRequest {
  id: string;
  staffId: string;
  staffUid: string;
  kind: RequestableLeaveKind;
  /** Premier jour d'absence et dernier jour (veille de la reprise), ISO. */
  start: string;
  end: string;
  half?: 'am' | 'pm';
  note?: string;
  status: 'pending' | 'accepted' | 'refused';
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  /** Reponse de l'admin, surtout utile en cas de refus. */
  reply?: string;
  absenceId?: string;
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

/**
 * Un jour ferie tombant dans la semaine affichee, calcule (jamais saisi).
 * `closed` : le restaurant a declare fermer ce ferie dans ses parametres.
 */
export interface WeekHoliday {
  dayIndex: number;
  /** `HolidayKey` de utils/helpers : sert au libelle traduit. */
  key: string;
  date: string;
  closed: boolean;
}

export const EMPTY_WEEK: WeekData = { shifts: [], absences: [], holidays: [] };

/**
 * Brouillon d'une semaine (document `drafts/{weekId}`). `baseUpdatedAt` est la
 * version officielle dont il est parti : si la semaine a bouge depuis, valider
 * le brouillon ecraserait le travail d'un autre, et l'app le dit avant.
 */
export interface DraftData extends WeekData {
  baseUpdatedAt: string | null;
}

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
