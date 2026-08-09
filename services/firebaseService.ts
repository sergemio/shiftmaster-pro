import { Shift, Staff, LogEntry } from '../types';

// Use the Official Google Firebase ESM CDN to ensure total compatibility
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, addDoc, query, orderBy, limit, runTransaction, where, getDocs } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

// Import the Firebase configuration
import firebaseConfig from '../firebase-applet-config.json';

/**
 * ✅ FIREBASE CONFIGURATION
 */
// Initialize App (Singleton Pattern)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Services with the confirmed app instance
// Use the firestoreDatabaseId from the config if it exists
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || '(default)');
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
 * Saves a week's shifts.
 *
 * The whole `shifts` array is replaced, so a plain setDoc means last-write-wins:
 * with three admins, one person's afternoon of work could vanish under another's
 * save, silently. The transaction compares `updatedAt` against what the caller
 * last saw and refuses the write if the document moved underneath them.
 *
 * @param baseUpdatedAt the `updatedAt` the caller loaded, or null when the week
 *                      did not exist yet. Pass undefined to force the write.
 */
export const saveShiftsToFirebase = async (
  weekId: string,
  shifts: Shift[],
  baseUpdatedAt?: string | null
): Promise<string> => {
  if (!auth.currentUser) return '';
  const path = `weeks/${weekId}`;
  const weekRef = doc(db, 'weeks', weekId);
  const cleanShifts = sanitizeData(shifts);
  const stamp = new Date().toISOString();

  try {
    await runTransaction(db, async (tx) => {
      if (baseUpdatedAt !== undefined) {
        const snap = await tx.get(weekRef);
        const theirs = snap.exists() ? (snap.data().updatedAt ?? null) : null;
        if (theirs !== baseUpdatedAt) throw new WeekConflictError(weekId, theirs);
      }
      tx.set(weekRef, { shifts: cleanShifts, updatedAt: stamp });
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
  const path = 'settings/staff';
  try {
    const staffRef = doc(db, 'settings', 'staff');
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

    await setDoc(staffRef, {
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
  const path = 'logs';
  try {
    const logsCol = collection(db, 'logs');
    await addDoc(logsCol, {
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
 * @param callback receives the shifts and the document's `updatedAt`, which the
 *                 caller must hand back to saveShiftsToFirebase for conflict
 *                 detection. null means the week does not exist yet.
 */
export const subscribeToShifts = (
  weekId: string,
  callback: (shifts: Shift[], updatedAt: string | null) => void
) => {
  if (!auth.currentUser) return () => {};
  const path = `weeks/${weekId}`;
  const weekRef = doc(db, 'weeks', weekId);
  return onSnapshot(weekRef, (snap) => {
    if (!snap.exists()) return callback([], null);
    const data = snap.data();
    // `as Shift[]` would be a lie if the field were missing or malformed.
    callback(Array.isArray(data.shifts) ? data.shifts as Shift[] : [], data.updatedAt ?? null);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  });
};

export const subscribeToStaff = (callback: (staff: Staff[], guests: string[]) => void) => {
  if (!auth.currentUser) return () => {};
  const path = 'settings/staff';
  const staffRef = doc(db, 'settings', 'staff');
  return onSnapshot(staffRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      callback(data.list as Staff[], data.guests || []);
    } else {
      callback([], []);
    }
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  });
};

export const subscribeToGlobalSettings = (callback: (settings: { timezone?: string, language?: string }) => void) => {
  if (!auth.currentUser) return () => {};
  const path = 'settings/global';
  const settingsRef = doc(db, 'settings', 'global');
  return onSnapshot(settingsRef, (snap) => {
    if (snap.exists()) {
      callback(snap.data() as { timezone?: string, language?: string });
    }
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  });
};

export const loadLogs = async (months = 2, cap = 3000): Promise<LogEntry[]> => {
  if (!auth.currentUser) {
    return JSON.parse(localStorage.getItem('sandbox_logs') || '[]');
  }
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const path = 'logs';
  try {
    const q = query(
      collection(db, 'logs'),
      where('timestamp', '>=', since.toISOString()),
      orderBy('timestamp', 'desc'),
      limit(cap)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as LogEntry));
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, path);
    return [];
  }
};

export const loadShiftsFromFirebase = async (weekId: string): Promise<Shift[] | null> => {
  if (!auth.currentUser) return null;
  const path = `weeks/${weekId}`;
  try {
    const weekRef = doc(db, 'weeks', weekId);
    const snap = await getDoc(weekRef);
    if (snap.exists()) {
      return snap.data().shifts as Shift[];
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, path);
  }
  return null;
};

export const exportWeeksData = async (weekIds: string[]): Promise<Record<string, any>> => {
  if (!auth.currentUser) return {};
  const result: Record<string, any> = {};
  for (const wid of weekIds) {
    try {
      const snap = await getDoc(doc(db, 'weeks', wid));
      if (snap.exists()) result[wid] = snap.data();
    } catch (e) { /* skip */ }
  }
  return result;
};

export const loadStaffFromFirebase = async (): Promise<{ staff: Staff[], guests: string[] } | null> => {
  if (!auth.currentUser) return null;
  const path = 'settings/staff';
  try {
    const staffRef = doc(db, 'settings', 'staff');
    const snap = await getDoc(staffRef);
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