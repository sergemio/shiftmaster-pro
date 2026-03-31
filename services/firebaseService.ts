import { Shift, Staff, LogEntry } from '../types';

// Use the Official Google Firebase ESM CDN to ensure total compatibility
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, addDoc, query, orderBy, limit, getDocFromServer } from 'firebase/firestore';
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

// Validate Connection to Firestore
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
    // Skip logging for other errors, as this is simply a connection test.
  }
}
testConnection();

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
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
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
export const saveShiftsToFirebase = async (weekId: string, shifts: Shift[]): Promise<void> => {
  if (!auth.currentUser) return;
  const path = `weeks/${weekId}`;
  try {
    const weekRef = doc(db, 'weeks', weekId);
    const cleanShifts = sanitizeData(shifts);
    await setDoc(weekRef, { 
      shifts: cleanShifts, 
      updatedAt: new Date().toISOString() 
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
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

    await setDoc(staffRef, { 
      list: cleanStaff,
      guests: guests.map(g => g.toLowerCase().trim()),
      admins: adminEmails
    }, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const saveGlobalSettingsToFirebase = async (settings: { timezone?: string, language?: string }): Promise<void> => {
  if (!auth.currentUser) return;
  const path = 'settings/global';
  try {
    const settingsRef = doc(db, 'settings', 'global');
    await setDoc(settingsRef, sanitizeData(settings), { merge: true });
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
export const subscribeToShifts = (weekId: string, callback: (shifts: Shift[]) => void) => {
  if (!auth.currentUser) return () => {};
  const path = `weeks/${weekId}`;
  const weekRef = doc(db, 'weeks', weekId);
  return onSnapshot(weekRef, (snap) => {
    if (snap.exists()) {
      callback(snap.data().shifts as Shift[]);
    } else {
      callback([]);
    }
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

export const subscribeToLogs = (callback: (logs: LogEntry[]) => void) => {
  if (!auth.currentUser) {
    const localLogs = JSON.parse(localStorage.getItem('sandbox_logs') || '[]');
    callback(localLogs);
    return () => {};
  }
  const path = 'logs';
  const logsCol = collection(db, 'logs');
  const q = query(logsCol, orderBy('timestamp', 'desc'), limit(50));
  return onSnapshot(q, (snap) => {
    const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as LogEntry));
    callback(logs);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  });
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