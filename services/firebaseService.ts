import { Shift, Staff, LogEntry, Absence, AbsencePeriod, LeaveBalance, LeaveRequest, WeekData, DraftData, EMPTY_WEEK, Org, OrgRole, OrgSettings, Extra } from '../types';
import { applyAbsenceChanges, shiftsWithoutAbsence, AbsenceChange } from '../utils/helpers';

// Use the Official Google Firebase ESM CDN to ensure total compatibility
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, signOut, onAuthStateChanged, connectAuthEmulator } from 'firebase/auth';

// Import the Firebase configuration
import firebaseConfig from '../firebase-applet-config.json';

/**
 * ✅ FIREBASE CONFIGURATION
 */
// Initialize App (Singleton Pattern)
/**
 * Mode emulateur (`npm run dev:emu`) : l'app parle a une base et a une
 * authentification LOCALES, jamais au projet de production. Le projectId est
 * force sur un projet `demo-*`, que Firebase refuse de relier a une vraie base :
 * meme une erreur de branchement ne peut pas atteindre les donnees de Sezam.
 */
export const USE_EMULATORS = (import.meta as any).env?.VITE_USE_EMULATORS === '1';
const EMULATOR_PROJECT = 'demo-shiftmaster';

const app = getApps().length === 0
  ? initializeApp(USE_EMULATORS ? { ...firebaseConfig, projectId: EMULATOR_PROJECT } : firebaseConfig)
  : getApp();

/**
 * Firestore AVEC cache local persistant (IndexedDB).
 *
 * Sans lui, chaque ouverture de l'application sur telephone affiche un calendrier
 * vide le temps que la liaison reseau s'etablisse et que les documents arrivent —
 * plusieurs secondes sur une 4G ordinaire. Avec lui, la semaine deja consultee
 * s'affiche immediatement depuis le telephone, puis le serveur la corrige s'il y a
 * eu du changement. C'est le meme mecanisme `onSnapshot` : rien a modifier ailleurs.
 *
 * Trois consequences a connaitre :
 * - Les lectures servies par le cache **ne sont pas facturees**. Le quota baisse,
 *   il ne monte pas.
 * - Une donnee peut etre affichee brievement perimee. C'est deja couvert : toute
 *   ecriture passe par une transaction qui compare `updatedAt` et refuse d'ecraser
 *   le travail de quelqu'un d'autre (voir saveWeekToFirebase).
 * - `persistentMultipleTabManager` : le planning s'ouvre souvent dans plusieurs
 *   onglets, et le gestionnaire mono-onglet ferait echouer le cache dans les autres.
 */
const DATABASE_ID = (firebaseConfig as any).firestoreDatabaseId || '(default)';

type FirestoreModule = typeof import('firebase/firestore');
let firestorePromise: Promise<{ fs: FirestoreModule; db: any }> | null = null;

/**
 * Charge le SDK Firestore A LA DEMANDE, et l'initialise avec un cache local.
 *
 * Pourquoi pas un import statique. Firestore est la plus grosse piece de
 * l'application — plus du tiers du code envoye au navigateur. Importe en haut de
 * ce fichier, il etait telecharge et execute AVANT que l'ecran de connexion
 * puisse s'afficher, alors que cet ecran n'a besoin que de l'authentification.
 * Sur une 4G ordinaire c'etait une seconde d'attente devant un ecran blanc, pour
 * du code dont on ne se sert qu'une fois connecte. Il se charge desormais pendant
 * que Google verifie la session : le temps est passe en parallele, plus en serie.
 *
 * Le cache local (IndexedDB) repond a l'autre moitie du probleme. Sans lui, chaque
 * ouverture affiche un calendrier vide le temps que la liaison s'etablisse ; avec
 * lui, la semaine deja consultee s'affiche immediatement depuis le telephone, puis
 * le serveur la corrige s'il y a eu du changement. Trois consequences a connaitre :
 *  - les lectures servies par le cache NE SONT PAS facturees : le quota baisse ;
 *  - une donnee peut etre affichee brievement perimee, ce qui est deja couvert —
 *    toute ecriture passe par une transaction qui compare `updatedAt` et refuse
 *    d'ecraser le travail d'un autre (voir saveWeekToFirebase) ;
 *  - `persistentMultipleTabManager` parce que le planning s'ouvre souvent dans
 *    plusieurs onglets, ou le gestionnaire mono-onglet desactiverait le cache.
 *
 * `initializeFirestore` refuse d'etre appele deux fois sur la meme base : ca
 * n'arrive pas en production, mais le rechargement a chaud du serveur de
 * developpement reevalue ce fichier, d'ou le repli sur `getFirestore`.
 */
const firestore = () => (firestorePromise ??= import('firebase/firestore')
  .then(fs => {
    let db: any;
    try {
      db = fs.initializeFirestore(
        app,
        // En emulateur, cache en memoire : un cache IndexedDB sur localhost
        // melangerait les donnees de test d'une session a l'autre.
        { localCache: USE_EMULATORS ? fs.memoryLocalCache() : fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) },
        DATABASE_ID,
      );
      if (USE_EMULATORS) fs.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    } catch {
      db = fs.getFirestore(app, DATABASE_ID);
    }
    return { fs, db };
  })
  .catch(e => {
    // Un chargement rate ne doit pas etre memorise. La promesse est mise en cache
    // pour ne charger le SDK qu'une fois ; si on gardait aussi son echec, une
    // coupure reseau d'une seconde condamnerait toute la session — plus aucune
    // lecture ni sauvegarde jusqu'au rechargement de la page. On efface donc le
    // cache pour que le prochain appel retente.
    firestorePromise = null;
    throw e;
  }));

/**
 * Abonnement Firestore depuis un appelant synchrone.
 *
 * React attend une fonction de desabonnement TOUT DE SUITE, alors que le SDK
 * n'est pas encore charge. On rend donc un desabonnement qui couvre les deux cas :
 * si l'effet est demonte avant l'arrivee du module, `cancelled` empeche l'ecoute
 * de s'ouvrir dans le vide — sans lui, un changement rapide de semaine laissait
 * derriere lui des ecoutes que plus personne ne fermait.
 */
const lazySubscribe = (open: (ctx: { fs: FirestoreModule; db: any }) => () => void) => {
  let stop: (() => void) | null = null;
  let cancelled = false;
  firestore().then(ctx => {
    if (cancelled) return;
    stop = open(ctx);
  });
  return () => {
    cancelled = true;
    stop?.();
    stop = null;
  };
};

export const auth = getAuth(app);
if (USE_EMULATORS) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const provider = new GoogleAuthProvider();

/**
 * LE RESTAURANT COURANT.
 *
 * Toutes les donnees d'un client vivent sous `orgs/{orgId}/...`. Chaque lecture
 * et chaque ecriture de ce fichier construit son chemin a partir de lui, et
 * refuse de le faire tant qu'aucun restaurant n'est choisi : une donnee ne peut
 * pas atterrir a la racine, ni chez un autre client, par oubli.
 *
 * L'ISOLATION ne repose pas sur ce fichier : ce sont les regles Firestore qui
 * refusent a quiconque les donnees d'une org absente de son jeton. Ceci garantit
 * seulement que l'app demande le bon tiroir.
 */
let currentOrgId: string | null = null;
export const setCurrentOrg = (orgId: string | null) => { currentOrgId = orgId; };
export const getCurrentOrg = () => currentOrgId;

const requireOrg = (): string => {
  if (!currentOrgId) throw new Error('Aucun restaurant selectionne');
  return currentOrgId;
};
/** `orgs/{orgId}/a/b` en clair, pour les messages d'erreur. */
const orgPath = (...segments: string[]) => ['orgs', currentOrgId ?? '?', ...segments].join('/');

/**
 * Ce que le jeton de la personne connectee lui donne : ses restaurants et son
 * role dans chacun, poses par les Cloud Functions. `force` redemande un jeton
 * neuf (apres une invitation acceptee, le role n'apparait qu'au rafraichissement).
 */
export const loadMemberships = async (force = false): Promise<{ orgs: Record<string, OrgRole>; support: boolean }> => {
  const u = auth.currentUser;
  if (!u) return { orgs: {}, support: false };
  const { claims } = await u.getIdTokenResult(force);
  const raw = (claims.orgs && typeof claims.orgs === 'object') ? claims.orgs as Record<string, unknown> : {};
  const orgs: Record<string, OrgRole> = {};
  for (const [id, role] of Object.entries(raw)) if (role === 'admin' || role === 'staff') orgs[id] = role;
  return { orgs, support: claims.support === true };
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

/** Set by the app to show a real message instead of failing silently. */
let errorReporter: ((message: string, detail: string) => void) | null = null;
export const setFirestoreErrorReporter = (fn: typeof errorReporter) => { errorReporter = fn; };

function describe(error: unknown): string {
  const code = (error as any)?.code as string | undefined;
  if (code === 'permission-denied') return "You do not have permission to make this change.";
  if (code === 'unavailable' || code === 'failed-precondition') return "No connection to the server. Your change was not saved.";
  if (code === 'unauthenticated') return "Your session expired. Sign in again.";
  return "The change could not be saved.";
}

/**
 * Logs a Firestore failure and tells the app about it.
 *
 * Deliberately does NOT throw: it is called from onSnapshot error callbacks,
 * where a throw can be caught by nobody and becomes an unhandled rejection.
 * The auth details stay in the console object and are never serialised into an
 * Error message, which used to leak the signed-in user's email up the stack.
 */
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error:', errInfo);
  errorReporter?.(describe(error), `${operationType} ${path ?? ''}`.trim());
}

export interface AuthResult {
  user: any | null;
  error?: {
    code: string;
    message: string;
    domain: string;
    isSandbox: boolean;
  };
}

/**
 * CRITICAL: Helper to strip undefined values which Firestore rejects
 */
const sanitizeData = (data: any): any => {
  return JSON.parse(JSON.stringify(data, (_, value) => (value === undefined ? null : value)));
};

/**
 * AUTHENTICATION METHODS
 */
export const loginWithGoogle = async (): Promise<AuthResult> => {
  try {
    const result = await signInWithPopup(auth, provider);
    return { user: result.user };
  } catch (error: any) {
    console.error("Firebase Login Error:", error);
    
    let currentHostname = window.location.hostname;
    if (!currentHostname && window.location.origin) {
        try {
            currentHostname = new URL(window.location.origin).hostname;
        } catch (e) {
            currentHostname = "unknown-origin";
        }
    }

    const isSandbox = currentHostname.includes('usercontent.goog') || currentHostname.includes('aistudio');
    
    return { 
      user: null, 
      error: {
        code: error.code,
        message: error.message,
        domain: currentHostname,
        isSandbox
      } 
    };
  }
};

export const loginWithEmail = async (email: string, password: string): Promise<AuthResult> => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return { user: result.user };
  } catch (error: any) {
    return { user: null, error: { code: error.code, message: error.message, domain: window.location.hostname, isSandbox: false } };
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Sign out error", error);
  }
};

export const subscribeToAuth = (callback: (user: any) => void) => {
  return onAuthStateChanged(auth, callback);
};

/**
 * FIRESTORE DATA METHODS (WRITE)
 */
/** Thrown when someone else saved the same week while you were editing it. */
export class WeekConflictError extends Error {
  constructor(public readonly weekId: string, public readonly theirUpdatedAt: string) {
    super(`Week ${weekId} was modified by someone else`);
    this.name = 'WeekConflictError';
  }
}

/**
 * Saves a week — shifts, absences and public holidays together.
 *
 * Ils partent dans la MEME ecriture parce que Firestore remplace le document
 * entier : sauvegarder les shifts seuls effacerait les absences du jour meme.
 *
 * The whole document is replaced, so a plain setDoc means last-write-wins:
 * with three admins, one person's afternoon of work could vanish under another's
 * save, silently. The transaction compares `updatedAt` against what the caller
 * last saw and refuses the write if the document moved underneath them.
 *
 * @param baseUpdatedAt the `updatedAt` the caller loaded, or null when the week
 *                      did not exist yet. Pass undefined to force the write.
 */
export const saveWeekToFirebase = async (
  weekId: string,
  week: WeekData,
  baseUpdatedAt?: string | null
): Promise<string> => {
  if (!auth.currentUser || !currentOrgId) return '';
  const { fs, db } = await firestore();
  const path = orgPath('weeks', weekId);
  const weekRef = fs.doc(db, 'orgs', requireOrg(), 'weeks', weekId);
  const payload = {
    shifts: sanitizeData(week.shifts),
    absences: sanitizeData(week.absences),
    holidays: [...week.holidays].sort((a, b) => a - b),
  };
  const stamp = new Date().toISOString();

  try {
    await fs.runTransaction(db, async (tx) => {
      if (baseUpdatedAt !== undefined) {
        const snap = await tx.get(weekRef);
        const theirs = snap.exists() ? (snap.data().updatedAt ?? null) : null;
        if (theirs !== baseUpdatedAt) throw new WeekConflictError(weekId, theirs);
      }
      tx.set(weekRef, { ...payload, updatedAt: stamp });
    });
    return stamp;
  } catch (e) {
    if (e instanceof WeekConflictError) throw e;
    handleFirestoreError(e, OperationType.WRITE, path);
    return '';
  }
};

export const saveStaffToFirebase = async (staff: Staff[], guests: string[] = []): Promise<void> => {
  if (!auth.currentUser) return;
  const { fs, db } = await firestore();
  const path = orgPath('settings', 'staff');
  try {
    const staffRef = fs.doc(db, 'orgs', requireOrg(), 'settings', 'staff');
    const cleanStaff = sanitizeData(staff);
    // Plus de listes plates `admins` / `staffEmails` : les droits viennent du
    // jeton (claims), les regles n'ont plus a lire ce document pour decider.
    // `guests` reste le temps que les invitations (lot 1e) le remplacent.
    await fs.setDoc(staffRef, {
      list: cleanStaff,
      guests: guests.map(g => g.toLowerCase().trim()),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

/**
 * LOGGING METHODS
 */
export const saveLogToFirebase = async (log: Omit<LogEntry, 'id'>): Promise<void> => {
  // Always allow logging even in sandbox (local storage used for logs if no user)
  if (!auth.currentUser) {
    const localLogs = JSON.parse(localStorage.getItem('sandbox_logs') || '[]');
    localLogs.unshift({ ...log, id: Math.random().toString(36).substr(2, 9) });
    localStorage.setItem('sandbox_logs', JSON.stringify(localLogs.slice(0, 50)));
    return;
  }
  const { fs, db } = await firestore();
  const path = orgPath('logs');
  try {
    const logsCol = fs.collection(db, 'orgs', requireOrg(), 'logs');
    await fs.addDoc(logsCol, {
      ...log,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
};

/**
 * FIRESTORE DATA METHODS (READ-TIME SUBSCRIPTIONS)
 */
/**
 * @param callback receives the week's content and the document's `updatedAt`,
 *                 which the caller must hand back to saveWeekToFirebase for
 *                 conflict detection. null means the week does not exist yet.
 *
 * `absences` et `holidays` sont absents des ~38 semaines ecrites avant leur
 * existence : on retombe sur une liste vide plutot que de faire confiance au
 * document, et l'ancien planning reste lisible tel quel.
 */
export const subscribeToWeek = (
  weekId: string,
  callback: (week: WeekData, updatedAt: string | null) => void,
  /** true = le contenu vient d'etre confirme par le serveur ; false = il ne sort
   *  que du cache du telephone (connexion perdue, ou pas encore etablie). C'est
   *  ce qui fait de la pastille verte une vraie mesure et non une decoration. */
  onServerConfirmed?: (confirmed: boolean) => void
) => {
  if (!auth.currentUser || !currentOrgId) return () => {};
  const orgId = currentOrgId;
  const path = orgPath('weeks', weekId);
  // includeMetadataChanges : on est prevenu aussi quand SEUL l'etat de connexion
  // change. Ces evenements-la ne sont pas des lectures facturees, et on ne
  // re-livre le contenu que s'il a reellement change.
  let lastDelivered: string | undefined;
  return lazySubscribe(({ fs, db }) => fs.onSnapshot(fs.doc(db, 'orgs', orgId, 'weeks', weekId), { includeMetadataChanges: true }, (snap) => {
    onServerConfirmed?.(!snap.metadata.fromCache);
    const signature = snap.exists() ? JSON.stringify(snap.data()) : '';
    if (signature === lastDelivered) return;
    lastDelivered = signature;
    if (!snap.exists()) return callback(EMPTY_WEEK, null);
    const data = snap.data();
    // `as Shift[]` would be a lie if the field were missing or malformed.
    callback({
      shifts: Array.isArray(data.shifts) ? data.shifts as Shift[] : [],
      absences: Array.isArray(data.absences) ? data.absences as Absence[] : [],
      holidays: Array.isArray(data.holidays) ? data.holidays.filter((d: unknown) => typeof d === 'number') : [],
    }, data.updatedAt ?? null);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  }));
};

/**
 * Brouillon de la semaine, ou null s'il n'y en a pas.
 *
 * La regle Firestore reserve la lecture aux admins : l'app ne s'abonne donc que
 * pour eux, sinon un employe declencherait un refus et un bandeau d'erreur.
 */
export const subscribeToDraft = (weekId: string, callback: (draft: DraftData | null) => void) => {
  if (!auth.currentUser || !currentOrgId) return () => {};
  const orgId = currentOrgId;
  const path = orgPath('drafts', weekId);
  return lazySubscribe(({ fs, db }) => fs.onSnapshot(fs.doc(db, 'orgs', orgId, 'drafts', weekId), (snap) => {
    if (!snap.exists()) return callback(null);
    const data = snap.data();
    callback({
      shifts: Array.isArray(data.shifts) ? data.shifts as Shift[] : [],
      absences: Array.isArray(data.absences) ? data.absences as Absence[] : [],
      holidays: Array.isArray(data.holidays) ? data.holidays.filter((d: unknown) => typeof d === 'number') : [],
      baseUpdatedAt: data.baseUpdatedAt ?? null,
    });
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  }));
};

/**
 * Ecriture directe, sans la transaction de saveWeekToFirebase : un brouillon n'a
 * qu'un auteur a la fois, et `setDoc` s'applique aussitot au cache local, dans
 * l'ordre des gestes — deux glisser rapides ne font donc pas clignoter l'ecran.
 */
export const saveDraft = async (weekId: string, draft: DraftData): Promise<void> => {
  if (!auth.currentUser) return;
  const { fs, db } = await firestore();
  const path = orgPath('drafts', weekId);
  try {
    await fs.setDoc(fs.doc(db, 'orgs', requireOrg(), 'drafts', weekId), {
      shifts: sanitizeData(draft.shifts),
      absences: sanitizeData(draft.absences),
      holidays: [...draft.holidays].sort((a, b) => a - b),
      baseUpdatedAt: draft.baseUpdatedAt,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const deleteDraft = async (weekId: string): Promise<void> => {
  if (!auth.currentUser) return;
  const { fs, db } = await firestore();
  const path = orgPath('drafts', weekId);
  try {
    await fs.deleteDoc(fs.doc(db, 'orgs', requireOrg(), 'drafts', weekId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const subscribeToStaff = (callback: (staff: Staff[], guests: string[]) => void) => {
  if (!auth.currentUser || !currentOrgId) return () => {};
  const orgId = currentOrgId;
  const path = orgPath('settings', 'staff');
  return lazySubscribe(({ fs, db }) => fs.onSnapshot(fs.doc(db, 'orgs', orgId, 'settings', 'staff'), (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      callback(data.list as Staff[], data.guests || []);
    } else {
      callback([], []);
    }
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  }));
};

/**
 * Couts horaires charges, par identifiant de salarie.
 *
 * Deux precautions, et ce sont des choix de securite, pas du detail :
 *
 * 1. Document SEPARE de `settings/staff`. Ce dernier est lisible par toute
 *    l'equipe — le planning a besoin des noms et des couleurs — donc un salaire
 *    range la serait lisible par n'importe quel employe dans l'onglet reseau.
 *    Ici la regle Firestore limite la lecture aux admins : ce n'est pas
 *    l'interface qui cache le chiffre, c'est la base qui refuse de l'envoyer.
 *
 * 2. On ne s'abonne QUE si l'utilisateur est admin. Un non-admin qui tenterait
 *    la lecture recevrait un refus, et le rapporteur d'erreur afficherait un
 *    bandeau rouge alarmant pour une situation parfaitement normale.
 */
export const subscribeToRates = (callback: (rates: Record<string, number>) => void) => {
  if (!auth.currentUser || !currentOrgId) return () => {};
  const orgId = currentOrgId;
  const path = orgPath('settings', 'rates');
  return lazySubscribe(({ fs, db }) => fs.onSnapshot(fs.doc(db, 'orgs', orgId, 'settings', 'rates'), (snap) => {
    callback(snap.exists() ? ((snap.data().rates || {}) as Record<string, number>) : {});
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  }));
};

/**
 * VIVIER D'EXTRAS — admins seulement.
 *
 * Meme raisonnement que les couts horaires : la regle Firestore refuse la
 * lecture a tout autre compte (telephone, email, informations de paie), et on
 * ne s'abonne donc que pour un admin, sinon un employe declencherait un refus
 * et un bandeau d'erreur pour une situation normale. L'equipe voit les prenoms
 * parce qu'ils sont recopies sur les shifts.
 */
export const subscribeToExtras = (callback: (extras: Record<string, Extra>) => void) => {
  if (!auth.currentUser || !currentOrgId) return () => {};
  const orgId = currentOrgId;
  const path = orgPath('extras');
  return lazySubscribe(({ fs, db }) => fs.onSnapshot(fs.collection(db, 'orgs', orgId, 'extras'), (snap) => {
    const out: Record<string, Extra> = {};
    snap.forEach((d: any) => { out[d.id] = { id: d.id, ...d.data() } as Extra; });
    callback(out);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  }));
};

/** Cree ou met a jour une fiche d'extra. Fusion : remplir la paie plus tard ne
 *  doit pas effacer le prenom, et l'inverse non plus.
 *
 *  Un champ absent (`undefined`) est EFFACE, pas ecrit a null : l'admin qui vide
 *  la case du taux horaire veut supprimer le taux, et un `rate: null` serait
 *  refuse par la regle Firestore (`rate is number`). Fusion + `deleteField` est
 *  la seule combinaison qui distingue « je ne touche pas a ce champ » de « je le
 *  retire ». `null` reste possible : c'est la valeur d'attente de `filledAt`. */
export const saveExtra = async (extra: Extra): Promise<void> => {
  if (!auth.currentUser || !currentOrgId) return;
  const { fs, db } = await firestore();
  const path = orgPath('extras', extra.id);
  const prune = (obj: any): any => Object.fromEntries(Object.entries(obj).map(([k, v]) => [
    k,
    v === undefined ? fs.deleteField()
      : v && typeof v === 'object' && !Array.isArray(v) ? prune(v)
      : v,
  ]));
  try {
    const { id, ...rest } = extra;
    await fs.setDoc(fs.doc(db, 'orgs', requireOrg(), 'extras', id), prune(rest), { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

/** Reglages du restaurant, ranges dans `orgs/{orgId}.settings`.
 *
 *  Ecrit champ par champ (`settings.openHour`...) : changer les heures d'ouverture
 *  ne doit pas effacer le fuseau ou la convention. La regle Firestore n'autorise
 *  un admin a modifier QUE `name`, `settings` et `updatedAt` de la fiche : le
 *  statut d'abonnement lui est inaccessible. */
export const saveGlobalSettings = async (partial: GlobalSettings): Promise<void> => {
  if (!auth.currentUser) return;
  const { fs, db } = await firestore();
  const path = orgPath();
  try {
    const fields: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const [k, v] of Object.entries(partial)) if (v !== undefined) fields[`settings.${k}`] = v;
    await fs.updateDoc(fs.doc(db, 'orgs', requireOrg()), fields);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const saveRates = async (rates: Record<string, number>): Promise<void> => {
  if (!auth.currentUser) return;
  const { fs, db } = await firestore();
  const path = orgPath('settings', 'rates');
  try {
    // Un taux vide ou a zero n'est pas « zero euro de l'heure », c'est « pas
    // renseigne » : on retire la cle plutot que d'ecrire un chiffre qui ferait
    // passer un cout inconnu pour un cout nul.
    const clean: Record<string, number> = {};
    for (const [id, value] of Object.entries(rates)) {
      if (Number.isFinite(value) && value > 0) clean[id] = value;
    }
    await fs.setDoc(fs.doc(db, 'orgs', requireOrg(), 'settings', 'rates'), {
      rates: clean,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

type GlobalSettings = OrgSettings;

/**
 * La fiche du restaurant : nom, statut d'abonnement, reglages. Lisible par toute
 * l'equipe : l'app doit savoir si l'essai est termine pour passer en lecture seule.
 */
export const subscribeToOrg = (callback: (org: Org | null) => void) => {
  if (!auth.currentUser || !currentOrgId) return () => {};
  const orgId = currentOrgId;
  const path = orgPath();
  return lazySubscribe(({ fs, db }) => fs.onSnapshot(fs.doc(db, 'orgs', orgId), (snap) => {
    if (!snap.exists()) return callback(null);
    const d = snap.data();
    // trialEndsAt est un Timestamp (les regles le comparent a l'heure du
    // serveur) : on le rend en ISO pour l'app.
    const trial = d.trialEndsAt?.toDate ? d.trialEndsAt.toDate().toISOString()
      : (typeof d.trialEndsAt === 'string' ? d.trialEndsAt : null);
    callback({
      id: snap.id,
      name: typeof d.name === 'string' ? d.name : '',
      ownerUid: d.ownerUid ?? '',
      status: d.status,
      trialEndsAt: trial,
      settings: (d.settings && typeof d.settings === 'object') ? d.settings as OrgSettings : {},
      createdAt: d.createdAt ?? '',
      updatedAt: d.updatedAt ?? '',
    });
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  }));
};

/**
 * Two deliberate limits, both because Firestore bills one read per document:
 *  - one-shot read, not a live subscription. The old code kept 50 log documents
 *    streaming for the whole session, for a screen almost nobody had open.
 *  - only the window about to be displayed. The journal opens on 30 days, so it
 *    asks for one month; widening the filter fetches more, on demand.
 * Two months is ~1800 documents — fetching that on every open is what drains a
 * free-tier daily quota.
 */
export const loadLogs = async (months = 1, cap = 3000): Promise<LogEntry[]> => {
  if (!auth.currentUser) {
    return JSON.parse(localStorage.getItem('sandbox_logs') || '[]');
  }
  const { fs, db } = await firestore();
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const path = orgPath('logs');
  try {
    const q = fs.query(
      fs.collection(db, 'orgs', requireOrg(), 'logs'),
      fs.where('timestamp', '>=', since.toISOString()),
      fs.orderBy('timestamp', 'desc'),
      fs.limit(cap)
    );
    const snap = await fs.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as LogEntry));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const loadShiftsFromFirebase = async (weekId: string): Promise<Shift[] | null> => {
  if (!auth.currentUser) return null;
  const { fs, db } = await firestore();
  const path = orgPath('weeks', weekId);
  try {
    const weekRef = fs.doc(db, 'orgs', requireOrg(), 'weeks', weekId);
    const snap = await fs.getDoc(weekRef);
    if (snap.exists()) {
      return snap.data().shifts as Shift[];
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, path);
  }
  return null;
};

/**
 * Charge plusieurs semaines d'un coup, pour le compteur mensuel.
 *
 * Appele UNIQUEMENT quand l'utilisateur bascule sur « Mois » — jamais a
 * l'ouverture. Firestore facture une lecture par document : 5 ou 6 lectures a
 * la demande, contre 5 ou 6 a chaque chargement de l'app si on le faisait
 * d'office. Voir la regle du 2026-08-09 sur le quota.
 */
export const loadWeeks = async (weekIds: string[]): Promise<Record<string, WeekData>> => {
  if (!auth.currentUser || !currentOrgId) return {};
  const orgId = currentOrgId;
  const { fs, db } = await firestore();
  const out: Record<string, WeekData> = {};
  const snaps = await Promise.all(
    weekIds.map(async (wid) => {
      try {
        return { wid, snap: await fs.getDoc(fs.doc(db, 'orgs', orgId, 'weeks', wid)) };
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, orgPath('weeks', wid));
        return { wid, snap: null };
      }
    })
  );
  for (const { wid, snap } of snaps) {
    if (!snap || !snap.exists()) continue;
    const d = snap.data();
    out[wid] = {
      shifts: Array.isArray(d.shifts) ? d.shifts as Shift[] : [],
      absences: Array.isArray(d.absences) ? d.absences as Absence[] : [],
      holidays: Array.isArray(d.holidays) ? d.holidays.filter((x: unknown) => typeof x === 'number') : [],
    };
  }
  return out;
};

export const exportWeeksData = async (weekIds: string[]): Promise<Record<string, any>> => {
  if (!auth.currentUser || !currentOrgId) return {};
  const orgId = currentOrgId;
  const { fs, db } = await firestore();
  const result: Record<string, any> = {};
  for (const wid of weekIds) {
    try {
      const snap = await fs.getDoc(fs.doc(db, 'orgs', orgId, 'weeks', wid));
      if (snap.exists()) result[wid] = snap.data();
    } catch (e) { /* skip */ }
  }
  return result;
};

export const loadStaffFromFirebase = async (): Promise<{ staff: Staff[], guests: string[] } | null> => {
  if (!auth.currentUser) return null;
  const { fs, db } = await firestore();
  const path = orgPath('settings', 'staff');
  try {
    const staffRef = fs.doc(db, 'orgs', requireOrg(), 'settings', 'staff');
    const snap = await fs.getDoc(staffRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        staff: data.list as Staff[],
        guests: data.guests || []
      };
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, path);
  }
  return null;
};

/**
 * ABSENCES PAR PERIODE — `orgs/{orgId}/absences/{id}`.
 *
 * Un admin lit tout ; un employe ne lit QUE ses propres periodes, et la regle
 * Firestore exige que la requete filtre sur son uid (sinon la liste entiere est
 * refusee). Le motif d'un arret est une donnee de sante : l'equipe n'en voit
 * que la projection anonymisee dans chaque semaine.
 */
/**
 * Soldes de conges lus sur les bulletins. Un admin les lit tous ; un salarie,
 * seulement le sien (meme filtre que les absences, sinon la regle refuse).
 */
export const subscribeToLeaveBalances = (
  isAdmin: boolean,
  callback: (balances: Record<string, LeaveBalance>) => void,
) => {
  const uid = auth.currentUser?.uid;
  if (!uid || !currentOrgId) return () => {};
  const orgId = currentOrgId;
  const path = orgPath('leaveBalances');
  return lazySubscribe(({ fs, db }) => {
    const col = fs.collection(db, 'orgs', orgId, 'leaveBalances');
    const q = isAdmin ? col : fs.query(col, fs.where('staffUid', '==', uid));
    return fs.onSnapshot(q, (snap) => {
      const out: Record<string, LeaveBalance> = {};
      snap.forEach((d: any) => { out[d.id] = d.data() as LeaveBalance; });
      callback(out);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
  });
};

export const saveLeaveBalance = async (balance: LeaveBalance): Promise<void> => {
  if (!auth.currentUser || !currentOrgId) return;
  const { fs, db } = await firestore();
  const orgId = requireOrg();
  const path = orgPath('leaveBalances', balance.staffId);
  try {
    await fs.setDoc(fs.doc(db, 'orgs', orgId, 'leaveBalances', balance.staffId),
      Object.fromEntries(Object.entries(balance).filter(([, v]) => v !== undefined && v !== null)));
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

/**
 * Demandes de conge. Un admin les lit toutes ; un salarie, seulement les
 * siennes (la regle exige le filtre sur son uid, sinon la liste est refusee).
 */
export const subscribeToLeaveRequests = (
  isAdmin: boolean,
  callback: (requests: Record<string, LeaveRequest>) => void,
) => {
  const uid = auth.currentUser?.uid;
  if (!uid || !currentOrgId) return () => {};
  const orgId = currentOrgId;
  const path = orgPath('leaveRequests');
  return lazySubscribe(({ fs, db }) => {
    const col = fs.collection(db, 'orgs', orgId, 'leaveRequests');
    const q = isAdmin ? col : fs.query(col, fs.where('staffUid', '==', uid));
    return fs.onSnapshot(q, (snap) => {
      const out: Record<string, LeaveRequest> = {};
      snap.forEach((d: any) => { out[d.id] = { id: d.id, ...d.data() } as LeaveRequest; });
      callback(out);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
  });
};

/** Cree la demande (salarie) ou enregistre la decision (admin) : meme document. */
export const saveLeaveRequest = async (request: LeaveRequest): Promise<void> => {
  if (!auth.currentUser || !currentOrgId) return;
  const { fs, db } = await firestore();
  const orgId = requireOrg();
  const path = orgPath('leaveRequests', request.id);
  const { id, ...rest } = request;
  try {
    await fs.setDoc(fs.doc(db, 'orgs', orgId, 'leaveRequests', id),
      Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== null)));
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const deleteLeaveRequest = async (id: string): Promise<void> => {
  if (!auth.currentUser || !currentOrgId) return;
  const { fs, db } = await firestore();
  const orgId = requireOrg();
  const path = orgPath('leaveRequests', id);
  try {
    await fs.deleteDoc(fs.doc(db, 'orgs', orgId, 'leaveRequests', id));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const subscribeToAbsencePeriods = (
  isAdmin: boolean,
  callback: (periods: Record<string, AbsencePeriod>) => void,
) => {
  const uid = auth.currentUser?.uid;
  if (!uid || !currentOrgId) return () => {};
  const orgId = currentOrgId;
  const path = orgPath('absences');
  return lazySubscribe(({ fs, db }) => {
    const col = fs.collection(db, 'orgs', orgId, 'absences');
    const q = isAdmin ? col : fs.query(col, fs.where('staffUid', '==', uid));
    return fs.onSnapshot(q, (snap) => {
      const out: Record<string, AbsencePeriod> = {};
      snap.forEach((d: any) => { out[d.id] = { id: d.id, ...d.data() } as AbsencePeriod; });
      callback(out);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
  });
};

/**
 * Ecrit un ensemble de periodes (creees, modifiees ou effacees) ET leur
 * projection dans chaque semaine concernee, dans UNE transaction : soit tout
 * est ecrit, soit rien. Un arret qui raccourcit des conges touche deux ou trois
 * periodes a la fois : une coupure reseau entre les deux laisserait un jour
 * decompte deux fois.
 *
 * Les BROUILLONS de ces semaines recoivent la meme projection : publier un
 * brouillon recopie ses absences dans la semaine officielle, et un brouillon
 * commence avant la saisie de l'arret l'effacerait. Leur `baseUpdatedAt` suit
 * le nouveau `updatedAt` de la semaine, puisque les deux documents ont recu la
 * meme modification — sinon la publication crierait a un conflit qui n'en est
 * pas un.
 *
 * @param changes       periodes a ecrire (`period`) ou a effacer (`period: null`),
 *                      avec leur etat enregistre (`previous`) pour retirer la
 *                      projection des semaines qu'elles ne couvrent plus
 * @param removeShiftsFor la periode dont les shifts (ceux que la personne tient
 *                      elle-meme) sont retires pendant l'absence, dans la meme transaction
 */
const writeAbsenceChanges = async (
  changes: AbsenceChange[],
  removeShiftsFor: AbsencePeriod | null = null,
): Promise<void> => {
  if (!auth.currentUser || !currentOrgId || changes.length === 0) return;
  const { fs, db } = await firestore();
  const orgId = requireOrg();
  const path = orgPath('absences', (changes[0].period || changes[0].previous)!.id);
  const weekIds = [...new Set(changes.flatMap(c => [...(c.period?.weekIds || []), ...(c.previous?.weekIds || [])]))];
  const stamp = new Date().toISOString();

  try {
    await fs.runTransaction(db, async (tx) => {
      // Toutes les lectures d'abord : Firestore l'impose dans une transaction.
      const weekRefs = weekIds.map(w => fs.doc(db, 'orgs', orgId, 'weeks', w));
      const draftRefs = weekIds.map(w => fs.doc(db, 'orgs', orgId, 'drafts', w));
      const weekSnaps = await Promise.all(weekRefs.map(r => tx.get(r)));
      const draftSnaps = await Promise.all(draftRefs.map(r => tx.get(r)));

      weekIds.forEach((weekId, i) => {
        const current = weekSnaps[i].exists() ? weekSnaps[i].data() : { shifts: [], holidays: [] };
        tx.set(weekRefs[i], {
          shifts: shiftsWithoutAbsence(current.shifts || [], weekId, removeShiftsFor),
          holidays: current.holidays || [],
          absences: sanitizeData(applyAbsenceChanges(current.absences || [], weekId, changes)),
          updatedAt: stamp,
        });
        if (draftSnaps[i].exists()) {
          const draft = draftSnaps[i].data();
          tx.set(draftRefs[i], {
            ...draft,
            shifts: shiftsWithoutAbsence(draft.shifts || [], weekId, removeShiftsFor),
            absences: sanitizeData(applyAbsenceChanges(draft.absences || [], weekId, changes)),
            baseUpdatedAt: stamp,
            updatedAt: stamp,
          });
        }
      });

      for (const c of changes) {
        const ref = fs.doc(db, 'orgs', orgId, 'absences', (c.period || c.previous)!.id);
        if (c.period) {
          const { id, ...rest } = c.period;
          // Champs absents OMIS, pas ecrits a null : la regle refuse
          // `staffUid: null` ou `half: null` (elle attend une chaine ou rien).
          tx.set(ref, Object.fromEntries(
            Object.entries({ ...rest, updatedAt: stamp }).filter(([, v]) => v !== undefined && v !== null)));
        } else {
          tx.delete(ref);
        }
      }
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const saveAbsenceChanges = (changes: AbsenceChange[], removeShiftsFor: AbsencePeriod | null = null) =>
  writeAbsenceChanges(changes, removeShiftsFor);

export const deleteAbsencePeriod = (period: AbsencePeriod) =>
  writeAbsenceChanges([{ period: null, previous: period }]);
