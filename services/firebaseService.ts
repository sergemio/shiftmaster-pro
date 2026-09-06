import { Shift, Staff, LogEntry, Absence, WeekData, EMPTY_WEEK } from '../types';

// Use the Official Google Firebase ESM CDN to ensure total compatibility
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

// Import the Firebase configuration
import firebaseConfig from '../firebase-applet-config.json';

/**
 * ✅ FIREBASE CONFIGURATION
 */
// Initialize App (Singleton Pattern)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

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
        { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) },
        DATABASE_ID,
      );
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
const provider = new GoogleAuthProvider();

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
  if (!auth.currentUser) return '';
  const { fs, db } = await firestore();
  const path = `weeks/${weekId}`;
  const weekRef = fs.doc(db, 'weeks', weekId);
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
  const path = 'settings/staff';
  try {
    const staffRef = fs.doc(db, 'settings', 'staff');
    const cleanStaff = sanitizeData(staff);
    const adminEmails = staff
      .filter(s => s.role === 'admin')
      .map(s => (s.email || '').trim().toLowerCase())
      .filter(email => email !== '');

    // Security rules cannot look inside an array of objects, so the emails are
    // also stored flat. Without this, "is the caller on the team?" is not
    // expressible in rules and reads stay open to any Google account.
    const staffEmails = staff
      .map(s => (s.email || '').trim().toLowerCase())
      .filter(email => email !== '');

    await fs.setDoc(staffRef, {
      list: cleanStaff,
      guests: guests.map(g => g.toLowerCase().trim()),
      admins: adminEmails,
      staffEmails
    }, { merge: true });
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
  const path = 'logs';
  try {
    const logsCol = fs.collection(db, 'logs');
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
  callback: (week: WeekData, updatedAt: string | null) => void
) => {
  if (!auth.currentUser) return () => {};
  const path = `weeks/${weekId}`;
  return lazySubscribe(({ fs, db }) => fs.onSnapshot(fs.doc(db, 'weeks', weekId), (snap) => {
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

export const subscribeToStaff = (callback: (staff: Staff[], guests: string[]) => void) => {
  if (!auth.currentUser) return () => {};
  const path = 'settings/staff';
  return lazySubscribe(({ fs, db }) => fs.onSnapshot(fs.doc(db, 'settings', 'staff'), (snap) => {
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

export const subscribeToGlobalSettings = (callback: (settings: { timezone?: string, language?: string, convention?: string }) => void) => {
  if (!auth.currentUser) return () => {};
  const path = 'settings/global';
  return lazySubscribe(({ fs, db }) => fs.onSnapshot(fs.doc(db, 'settings', 'global'), (snap) => {
    if (snap.exists()) {
      callback(snap.data() as { timezone?: string, language?: string, convention?: string });
    }
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
  const path = 'logs';
  try {
    const q = fs.query(
      fs.collection(db, 'logs'),
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
  const path = `weeks/${weekId}`;
  try {
    const weekRef = fs.doc(db, 'weeks', weekId);
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
  if (!auth.currentUser) return {};
  const { fs, db } = await firestore();
  const out: Record<string, WeekData> = {};
  const snaps = await Promise.all(
    weekIds.map(async (wid) => {
      try {
        return { wid, snap: await fs.getDoc(fs.doc(db, 'weeks', wid)) };
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, `weeks/${wid}`);
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
  if (!auth.currentUser) return {};
  const { fs, db } = await firestore();
  const result: Record<string, any> = {};
  for (const wid of weekIds) {
    try {
      const snap = await fs.getDoc(fs.doc(db, 'weeks', wid));
      if (snap.exists()) result[wid] = snap.data();
    } catch (e) { /* skip */ }
  }
  return result;
};

export const loadStaffFromFirebase = async (): Promise<{ staff: Staff[], guests: string[] } | null> => {
  if (!auth.currentUser) return null;
  const { fs, db } = await firestore();
  const path = 'settings/staff';
  try {
    const staffRef = fs.doc(db, 'settings', 'staff');
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