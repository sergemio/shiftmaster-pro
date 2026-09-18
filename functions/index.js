/**
 * ShiftMaster — actions reservees au serveur.
 *
 * Ce que l'application NE PEUT PAS faire elle-meme, parce que les regles
 * Firestore le lui interdisent (voir firestore.rules) :
 *   - creer ou supprimer un restaurant ;
 *   - donner, changer ou retirer un role (les roles vivent dans le JETON
 *     d'authentification, que seul l'Admin SDK peut modifier) ;
 *   - lire une invitation et l'accepter.
 *
 * Source de verite des roles : `users/{uid}.orgs`. Le jeton (custom claims)
 * en est une COPIE, reecrite en entier a chaque changement par `syncClaims`.
 * Ecrire le jeton a partir du document, dans la meme sequence que la
 * modification du document, evite qu'un changement en ecrase un autre.
 *
 * Delai a connaitre : un role retire disparait du jeton de la personne au
 * plus tard une heure apres (duree de vie d'un jeton Firebase), sauf si son
 * application le redemande avant. Les refresh tokens sont revoques a la
 * suppression d'un membre pour raccourcir ce delai sur les sessions ouvertes.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { randomBytes } from 'node:crypto';

initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 5 });

const db = getFirestore();
const auth = getAuth();

const TRIAL_DAYS = 14;
const MAX_OWNED_ORGS = 3;          // garde-fou contre la creation en boucle
// Convention : Code du travail seul tant que le restaurant n'a pas choisi la sienne
// (l'assistant de demarrage la demande) — ne jamais presumer une convention.
const DEFAULT_SETTINGS = { timezone: 'Europe/Paris', language: 'fr', openHour: 9, closeHour: 23, convention: 'none' };

// --- outils -----------------------------------------------------------------

const requireAuth = (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  return request.auth;
};

const cleanString = (v, field, max) => {
  if (typeof v !== 'string' || !v.trim()) throw new HttpsError('invalid-argument', `${field} manquant.`);
  const s = v.trim();
  if (s.length > max) throw new HttpsError('invalid-argument', `${field} trop long (${max} caracteres maximum).`);
  return s;
};

const cleanOrgId = (v) => {
  if (typeof v !== 'string' || !/^[a-z0-9-]{3,60}$/.test(v)) throw new HttpsError('invalid-argument', 'Restaurant invalide.');
  return v;
};

const slug = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'restaurant';

const newId = (bytes = 4) => randomBytes(bytes).toString('hex');

const nowIso = () => new Date().toISOString();

/** Role de l'appelant dans une org, d'apres son jeton. */
const callerRole = (authCtx, orgId) => authCtx.token?.orgs?.[orgId] ?? null;
const isSupport = (authCtx) => authCtx.token?.support === true;

const requireOrgAdmin = (authCtx, orgId) => {
  if (isSupport(authCtx) || callerRole(authCtx, orgId) === 'admin') return;
  throw new HttpsError('permission-denied', 'Reserve aux administrateurs de ce restaurant.');
};

/**
 * Recopie `users/{uid}.orgs` dans le jeton, en gardant le drapeau support.
 * Le jeton est limite a 1000 octets : environ 25 restaurants, largement assez.
 */
const syncClaims = async (uid) => {
  const [snap, user] = await Promise.all([db.doc(`users/${uid}`).get(), auth.getUser(uid)]);
  const orgs = snap.exists ? (snap.data().orgs || {}) : {};
  const claims = { orgs };
  if (user.customClaims?.support === true) claims.support = true;
  await auth.setCustomUserClaims(uid, claims);
  return orgs;
};

// --- createOrg ----------------------------------------------------------------

/**
 * Cree un restaurant pour la personne connectee, qui en devient proprietaire
 * et admin. Essai de 14 jours, sans carte. La fiche equipe contient d'emblee
 * la ligne de la personne, pour qu'elle puisse se planifier elle-meme.
 */
export const createOrg = onCall(async (request) => {
  const caller = requireAuth(request);
  const name = cleanString(request.data?.name, 'Nom du restaurant', 80);
  const settings = { ...DEFAULT_SETTINGS };
  if (typeof request.data?.timezone === 'string' && request.data.timezone.length <= 60) settings.timezone = request.data.timezone;
  if (request.data?.language === 'en' || request.data?.language === 'fr') settings.language = request.data.language;
  if (['1501', '1979', 'none'].includes(request.data?.convention)) settings.convention = request.data.convention;

  const owned = await db.collection('orgs').where('ownerUid', '==', caller.uid).count().get();
  if (owned.data().count >= MAX_OWNED_ORGS) {
    throw new HttpsError('resource-exhausted', `Limite de ${MAX_OWNED_ORGS} restaurants par compte atteinte.`);
  }

  const user = await auth.getUser(caller.uid);
  const orgId = `${slug(name)}-${newId(3)}`;
  const stamp = nowIso();
  const orgRef = db.doc(`orgs/${orgId}`);

  await db.runTransaction(async (tx) => {
    tx.create(orgRef, {
      name, ownerUid: caller.uid, status: 'trialing',
      trialEndsAt: Timestamp.fromMillis(Date.now() + TRIAL_DAYS * 24 * 3600 * 1000),
      settings, createdAt: stamp, updatedAt: stamp,
    });
    tx.set(orgRef.collection('settings').doc('staff'), {
      list: [{
        id: newId(), name: user.displayName || (user.email || '').split('@')[0] || 'Moi',
        email: (user.email || '').toLowerCase(), color: '#6366f1', role: 'admin', uid: caller.uid,
      }],
      guests: [],
    });
    tx.set(orgRef.collection('settings').doc('rates'), { rates: {}, updatedAt: stamp });
    tx.set(db.doc(`users/${caller.uid}`), {
      email: (user.email || '').toLowerCase(), orgs: { [orgId]: 'admin' }, updatedAt: stamp,
    }, { merge: true });
  });

  await syncClaims(caller.uid);
  return { orgId };
});

// --- acceptInvite -------------------------------------------------------------

/**
 * Accepte une invitation. Le lien envoye par email porte `orgId` et `token`.
 *
 * L'adresse du compte connecte doit etre CELLE qui a ete invitee, et verifiee :
 * sans cette verification, quiconque intercepte le lien entrerait dans le
 * restaurant avec n'importe quel compte.
 */
export const acceptInvite = onCall(async (request) => {
  const caller = requireAuth(request);
  const orgId = cleanOrgId(request.data?.orgId);
  const token = cleanString(request.data?.token, 'Invitation', 100);
  const email = (caller.token.email || '').toLowerCase();
  if (!email || caller.token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Adresse email non verifiee. Verifiez-la puis rouvrez le lien.');
  }

  const inviteRef = db.doc(`orgs/${orgId}/invites/${token}`);
  const staffRef = db.doc(`orgs/${orgId}/settings/staff`);
  const userRef = db.doc(`users/${caller.uid}`);

  const role = await db.runTransaction(async (tx) => {
    const [invite, org, staff] = await Promise.all([tx.get(inviteRef), tx.get(db.doc(`orgs/${orgId}`)), tx.get(staffRef)]);
    if (!org.exists || !invite.exists) throw new HttpsError('not-found', 'Invitation introuvable ou deja utilisee.');
    const inv = invite.data();
    if ((inv.email || '').toLowerCase() !== email) {
      throw new HttpsError('permission-denied', `Cette invitation est destinee a une autre adresse que ${email}.`);
    }
    // Rattacher le compte a sa fiche : celle designee par l'invitation, sinon
    // celle qui porte la meme adresse. Rien a rattacher = simple invite.
    if (staff.exists) {
      const list = Array.isArray(staff.data().list) ? staff.data().list : [];
      const idx = inv.staffId ? list.findIndex(s => s.id === inv.staffId)
        : list.findIndex(s => (s.email || '').toLowerCase() === email && !s.uid);
      if (idx >= 0) {
        list[idx] = { ...list[idx], uid: caller.uid, email: list[idx].email || email };
        tx.update(staffRef, { list });
      }
    }
    tx.set(userRef, { email, orgs: { [orgId]: inv.role }, updatedAt: nowIso() }, { merge: true });
    tx.delete(inviteRef);
    return inv.role;
  });

  await syncClaims(caller.uid);
  return { orgId, role };
});

// --- setMemberRole ------------------------------------------------------------

/** Passer un membre admin ou employe. Le proprietaire reste admin. */
export const setMemberRole = onCall(async (request) => {
  const caller = requireAuth(request);
  const orgId = cleanOrgId(request.data?.orgId);
  const uid = cleanString(request.data?.uid, 'Membre', 128);
  const role = request.data?.role;
  if (role !== 'admin' && role !== 'staff') throw new HttpsError('invalid-argument', 'Role invalide.');
  requireOrgAdmin(caller, orgId);

  const org = await db.doc(`orgs/${orgId}`).get();
  if (!org.exists) throw new HttpsError('not-found', 'Restaurant introuvable.');
  if (org.data().ownerUid === uid && role !== 'admin') {
    throw new HttpsError('failed-precondition', 'Le proprietaire du restaurant reste administrateur.');
  }
  const userRef = db.doc(`users/${uid}`);
  const snap = await userRef.get();
  if (!snap.exists || !snap.data().orgs?.[orgId]) throw new HttpsError('not-found', 'Cette personne ne fait pas partie du restaurant.');

  await userRef.update({ [`orgs.${orgId}`]: role, updatedAt: nowIso() });
  await syncClaims(uid);
  return { orgId, uid, role };
});

// --- removeMember -------------------------------------------------------------

/**
 * Retire l'acces d'une personne au restaurant. Sa fiche et ses shifts passes
 * restent (historique, paie) : on detache seulement le compte.
 */
export const removeMember = onCall(async (request) => {
  const caller = requireAuth(request);
  const orgId = cleanOrgId(request.data?.orgId);
  const uid = cleanString(request.data?.uid, 'Membre', 128);
  requireOrgAdmin(caller, orgId);

  const org = await db.doc(`orgs/${orgId}`).get();
  if (!org.exists) throw new HttpsError('not-found', 'Restaurant introuvable.');
  if (org.data().ownerUid === uid) throw new HttpsError('failed-precondition', 'Le proprietaire ne peut pas etre retire.');

  const userRef = db.doc(`users/${uid}`);
  const staffRef = db.doc(`orgs/${orgId}/settings/staff`);
  await db.runTransaction(async (tx) => {
    const [user, staff] = await Promise.all([tx.get(userRef), tx.get(staffRef)]);
    if (!user.exists || !user.data().orgs?.[orgId]) throw new HttpsError('not-found', 'Cette personne ne fait pas partie du restaurant.');
    tx.update(userRef, { [`orgs.${orgId}`]: FieldValue.delete(), updatedAt: nowIso() });
    if (staff.exists && Array.isArray(staff.data().list)) {
      const list = staff.data().list.map(s => (s.uid === uid ? (({ uid: _, ...rest }) => rest)(s) : s));
      tx.update(staffRef, { list });
    }
  });
  await syncClaims(uid);
  await auth.revokeRefreshTokens(uid);
  return { orgId, uid };
});

// --- deleteOrg ----------------------------------------------------------------

/**
 * Supprime DEFINITIVEMENT un restaurant et toutes ses donnees. Proprietaire
 * seulement, et il doit retaper le nom exact : c'est irreversible.
 */
export const deleteOrg = onCall(async (request) => {
  const caller = requireAuth(request);
  const orgId = cleanOrgId(request.data?.orgId);
  const orgRef = db.doc(`orgs/${orgId}`);
  const org = await orgRef.get();
  if (!org.exists) throw new HttpsError('not-found', 'Restaurant introuvable.');
  if (org.data().ownerUid !== caller.uid && !isSupport(caller)) {
    throw new HttpsError('permission-denied', 'Seul le proprietaire peut supprimer le restaurant.');
  }
  if (request.data?.confirmName !== org.data().name) {
    throw new HttpsError('failed-precondition', 'Le nom saisi ne correspond pas. Rien n\'a ete supprime.');
  }

  const members = await db.collection('users').where(`orgs.${orgId}`, 'in', ['admin', 'staff']).get();
  await db.recursiveDelete(orgRef);
  for (const m of members.docs) {
    await m.ref.update({ [`orgs.${orgId}`]: FieldValue.delete(), updatedAt: nowIso() });
    await syncClaims(m.id);
  }
  return { orgId, membersDetached: members.size };
});
