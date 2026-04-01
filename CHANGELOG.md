# ShiftMaster Pro — Changelog

**Regle** : chaque modif doit etre documentee ici AVANT de passer a autre chose.
Format : date, ce qui a change, pourquoi, fichiers touches.

---

## 2026-04-01 — Setup initial + Reconnexion Firebase + Bugfixes (session 1)

### Setup projet local
- **Quoi** : Import du code depuis zip Google AI Studio, install npm, creation repo GitHub
- **Pourquoi** : Gemini/AI Studio avait casse la connexion avec la DB Firebase. Besoin de reprendre le controle du code.
- **Repo** : github.com/sergemio/shiftmaster-pro (public)
- **GitHub Pages** active → URL live : sergemio.github.io/shiftmaster-pro/
- **Stack** : React 19 + TypeScript + Vite + Tailwind CSS 4 + Firebase + Gemini AI

### Reconnexion Firebase
- **Quoi** : Remplace `firebase-applet-config.json` qui pointait vers le projet auto-genere AI Studio (`gen-lang-client-0860093183`, database custom `ai-studio-a4897084-...`) par la vraie config du projet `shiftmaster-pro-9e20d` (database `(default)`).
- **Pourquoi** : L'app ne voyait plus la data existante (staff, shifts, logs). Google AI Studio avait cree son propre projet Firebase au lieu d'utiliser l'existant.
- **Fichiers modifies** : `firebase-applet-config.json`
- **Si ca casse** : Verifier que `projectId` est `shiftmaster-pro-9e20d` et qu'il n'y a PAS de `firestoreDatabaseId` dans la config (doit tomber sur `(default)`).

### Fix convention debut de semaine (Sunday-first)
- **Quoi** : L'app calculait le lundi comme debut de semaine (weekId), mais la data Firebase utilise le dimanche. Aligne `getMonday()` → retourne le dimanche. Aligne `DAYS_EN`/`DAYS_FR` → commencent par Sunday/Dimanche. Aligne `getNowInTimezone` → dayIndex 0 = Sunday.
- **Pourquoi** : Les shifts existants en DB (depuis janvier 2026) utilisent dimanche comme jour 0. L'app generait des weekId decales d'un jour → `exists: false` sur tous les documents.
- **Fichiers modifies** : `utils/helpers.ts` (getMonday, getNowInTimezone), `constants.ts` (DAYS_EN, DAYS_FR)
- **Si ca casse** : Verifier que `getMonday()` retourne bien un dimanche (pas un lundi). Les weekId en DB sont des dates de dimanche (ex: `2026-03-29` = dimanche 29 mars).
- **ATTENTION** : Ne jamais changer la data Firebase ! C'est le code qui s'adapte a la data, pas l'inverse.

### Fix Employee View table overflow
- **Quoi** : En Employee View, la semaine Mar 1-7 n'affichait que 4 colonnes sur 7 (Thursday/Friday/Saturday coupees).
- **Pourquoi** : Les notes longues dans les shifts (ex: "As a team work on refilling packaging & sodas; maximum of preps; deep cleaning...") forcaient les colonnes Sunday/Monday a s'elargir, poussant les autres hors ecran. Les autres semaines avaient des notes plus courtes.
- **Fix** : Ajout `table-fixed` sur la table dans EmployeeView.tsx pour forcer des colonnes de largeur egale.
- **Fichiers modifies** : `components/EmployeeView.tsx`

### Fix indicateur heure actuelle (timezone)
- **Quoi** : La fleche rose indiquant l'heure actuelle affichait 15h30 au lieu de 17h30 (2h de retard).
- **Pourquoi** : Le default timezone du composant `CurrentTimeIndicator` et du Calendar etait `'UTC'` au lieu de `'Europe/Paris'`. En CEST (heure d'ete), UTC+2 = 2h de decalage.
- **Fix** : Change le default timezone de `'UTC'` a `'Europe/Paris'` dans Calendar.tsx.
- **Fichiers modifies** : `components/Calendar.tsx`

### Fix scroll container
- **Quoi** : Le container principal avait `overflow-x-auto md:overflow-y-auto` et le container Employee View avait `overflow-x-auto` seulement.
- **Fix** : Les deux passes en `overflow-auto` pour permettre le scroll dans les deux axes.
- **Fichiers modifies** : `App.tsx`, `components/Calendar.tsx`

### Ajout Export Data
- **Quoi** : Bouton "Export Data" dans la Sidebar avec picker de mois. Telecharge un JSON self-contained (shifts + staff) pour le mois selectionne.
- **Pourquoi** : Pouvoir extraire la data Firebase facilement pour analyse (heures par employe, etc.) sans passer par la console Firebase.
- **Fichiers modifies** : `components/Sidebar.tsx`, `services/firebaseService.ts` (ajout `exportWeeksData`)

### Ajout script Firebase Admin
- **Quoi** : Script Node.js `scripts/read-firebase.js` pour lire Firestore directement via Admin SDK.
- **Usage** : `node scripts/read-firebase.js --month 2026-03`, `--week 2026-03-29`, `--staff`
- **Prerequis** : Service account key dans `scripts/service-account.json` (dans .gitignore)
- **Fichiers crees** : `scripts/read-firebase.js`
- **Fichiers modifies** : `.gitignore` (ajout service-account.json), `package.json` (ajout firebase-admin)

---

## Architecture

### Firebase
- **Projet** : `shiftmaster-pro-9e20d`
- **Database** : `(default)` (Firestore)
- **Collections** :
  - `weeks/{weekId}` — weekId = date ISO du dimanche (ex: `2026-03-29`). Contient `shifts[]` + `updatedAt`
  - `settings/staff` — `list[]` (Staff objects) + `guests[]` + `admins[]`
  - `settings/global` — `timezone`, `language`
  - `logs/{logId}` — activity logs
- **Auth** : Google Sign-In. Admin = email dans `settings/staff.admins` OU `sergemenassa@gmail.com`
- **Rules** : reads = authenticated, writes = admin only

### Staff IDs (en DB)
| ID | Nom |
|---|---|
| 1 | Serge |
| 2 | Tatiana |
| 3 | Omar |
| 4 | Chris |
| 5 | Yasmine |
| 6 | Sinar |
| 7 | Youssef |
| 8 | Adiba |
| l0kb2u4vb | Parthavi |
| oa6mu6n1z | Sepand |
| ti2jukwg1 | Harshil |

### Convention semaine
- **Debut** : Dimanche (dayIndex 0)
- **Fin** : Samedi (dayIndex 6)
- **WeekId** : date ISO du dimanche (ex: `2026-03-29`)

---

## TODO
- [ ] Service account key pour script Admin SDK (Serge doit generer depuis Firebase Console)
- [ ] Refactor App.tsx (41KB — trop gros, extraire logique en hooks custom)
- [ ] Supprimer `Sidebar.tsx` vide a la racine (doublon avec `components/Sidebar.tsx`)
- [ ] Passer le timezone en setting persistant au lieu de hardcoder `'Europe/Paris'`
