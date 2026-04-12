# ShiftMaster Pro — Changelog

**Regle** : chaque modif doit etre documentee ici AVANT de passer a autre chose.
Format : date, ce qui a change, pourquoi, fichiers touches.

---

## 2026-04-12 — Fix dimanche : highlight + navigation (session 4)

### Fix getWeekStart pour dimanche
- **Quoi** : Quand on etait dimanche, l'app naviguait vers la semaine **suivante** au lieu de la semaine courante. Le highlight "today" et la fleche rose apparaissaient sur le mauvais jour.
- **Pourquoi** : `getWeekStart(dimanche 12)` retournait dimanche 12 (weekId de la semaine Apr 13-19) au lieu de dimanche 5 (weekId de la semaine Apr 6-12 qui contient le dimanche 12).
- **Fix** : Si le jour est dimanche (`dayOfWeek === 0`), reculer de 7 jours pour retourner le dimanche precedent.
- **Fichiers modifies** : `utils/helpers.ts`

### Fix faux highlight Monday
- **Quoi** : Sur toutes les semaines qui ne contenaient pas "aujourd'hui", le lundi etait highlight par defaut.
- **Pourquoi** : `activeDayIndex` etait mis a 0 (Monday) quand `todayIndex = -1`. L'app se sentait obligee de highlight un jour.
- **Fix** : `activeDayIndex = -1` quand on n'est pas dans la semaine → aucun jour highlight.
- **Fichiers modifies** : `components/Calendar.tsx`

---

## 2026-04-06 — Acces Firebase Admin SDK operationnel

### Service account key installee
- **Quoi** : Service account key generee et stockee dans `scripts/service-account.json` (dans .gitignore)
- **Pourquoi** : Permet a Claude de lire la DB Firestore en direct sans passer par l'app ni demander un export a Serge
- **Usage** : `node scripts/read-firebase.js --month 2026-03` / `--week 2026-03-29` / `--staff`
- **Fix** : Corrige bug DST dans le script (`toISOString()` → format local) qui generait des weekIds decales d'un jour
- **Fichiers modifies** : `scripts/read-firebase.js`

---

## 2026-04-04 — Calendar Hardening (session 3, post-Codex audit)

Codex adversarial review a identifie des risques critiques dans le systeme calendrier. Corrections structurees en 4 phases independantes.

### Phase 1 — Fix commentaires menteurs
- **Quoi** : `types.ts` disait "ISO string for the Monday", `firestore.rules` disait "weekId (ISO Monday date)" — les deux faux, c'est un **Sunday**
- **Fix** : Commentaires corriges pour refleter la realite
- **Fichiers** : `types.ts`, `firestore.rules`

### Phase 2 — Rename getMonday → getWeekStart
- **Quoi** : La fonction `getMonday()` retourne un **dimanche**. Nom trompeur = bombe a retardement
- **Fix** : Renommage pur (meme logique, nouveau nom) dans tous les fichiers
- **Fichiers** : `utils/helpers.ts`, `App.tsx`, `components/Calendar.tsx`

### Phase 3 — Protection DST sur weekId
- **Quoi** : `toISOString().split('T')[0]` utilise UTC brut — peut deriver d'un jour autour des changements d'heure (mars/octobre)
- **Fix** : Nouveau helper `toWeekId(date, timezone)` qui passe par `Intl.DateTimeFormat` (timezone-safe). Remplace les 7 occurrences dans App.tsx et Sidebar.tsx
- **Fichiers** : `utils/helpers.ts`, `App.tsx`, `components/Sidebar.tsx`
- **Si ca casse** : Le weekId doit toujours etre un dimanche au format YYYY-MM-DD. Verifier avec `toWeekId(new Date())` dans la console

### Phase 4 — Firestore rules renforcees
- **Quoi** : `isValidShift` ne validait pas les bornes de dayIndex ni l'ordre des heures. `isValidWeeklyData` ne validait que `shifts[0]`
- **Fix** : Ajout `dayIndex >= 0 && dayIndex <= 6`, `endTime > startTime`, validation des 10 premiers shifts, cap a 100 shifts max
- **Fichier** : `firestore.rules`
- **Deploy** : `firebase deploy --only firestore:rules` (pas encore fait)

---

## 2026-04-04 — Fix day labels off-by-one + full audit (session 2)

### Fix day labels shifted by one
- **Quoi** : Tous les jours etaient decales d'un cran : Friday affichait les shifts de Saturday, etc. La semaine affichait Sunday-Saturday au lieu de Monday-Sunday.
- **Pourquoi** : Le fix de session 1 avait change DAYS arrays et getNowInTimezone pour commencer par Sunday, en assumant que dayIndex 0 = Sunday. En realite, dayIndex 0 = **Monday** dans la data Firebase. Le weekId est un dimanche, mais c'est juste la veille du vrai debut de semaine.
- **Convention finale (definitif)** :
  - `weekId` = date ISO du dimanche precedant le lundi de la semaine
  - `dayIndex 0` = **Monday**, `dayIndex 6` = **Sunday**
  - `DAYS_EN/DAYS_FR` = Monday-first
  - Tous les calculs de date font `weekStart + dayIndex + 1` pour compenser
- **Fix** : Revert DAYS arrays a Monday-first, revert getNowInTimezone a Mon=0, ajouter `+1` partout dans les date headers
- **Fichiers modifies** : `constants.ts`, `utils/helpers.ts`, `components/Calendar.tsx`, `components/EmployeeView.tsx`

### Audit complet dayIndex consistency
- **Quoi** : Audit de tous les fichiers pour trouver les endroits ou `dayIndex` est utilise sans le `+1` offset
- **Bugs trouves et fixes** :
  - `components/Sidebar.tsx` `getDateForDay` — manquait le `+1` (dates de coverage events decalees)
  - `App.tsx` line ~403 — filtrage mensuel des shifts manquait le `+1` (shifts mis sur le mauvais jour pour les rapports mensuels)
  - `services/geminiService.ts` — prompt Gemini ne documentait pas la convention dayIndex. Ajoute `0=Monday, 6=Sunday` dans le prompt
- **Fichiers modifies** : `components/Sidebar.tsx`, `App.tsx`, `services/geminiService.ts`
- **Si ca casse** : La regle d'or : `date = weekStart + dayIndex + 1`. Le weekStart est un dimanche, dayIndex 0 = lundi, donc il faut toujours ajouter 1.

### Add day name + date to log messages
- **Quoi** : Les System Logs affichent maintenant le jour complet : "Updated shift for Parthavi on Saturday, April 4 (20:00-23:30)" au lieu de juste les heures
- **Pourquoi** : Impossible de savoir quel jour etait concerne dans les anciens logs
- **Note** : Les anciens logs en Firebase ne sont pas retroactivement modifies
- **Fichiers modifies** : `App.tsx`

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
- **WeekId** : date ISO du dimanche precedant la semaine (ex: `2026-03-29` pour la semaine du lundi 30 mars)
- **dayIndex 0** = Monday, **dayIndex 6** = Sunday
- **Calcul date** : `date = weekStart + dayIndex + 1` (toujours ajouter 1)
- Ne JAMAIS modifier la data Firebase — le code s'adapte a la data

---

## TODO
- [ ] Service account key pour script Admin SDK (Serge doit generer depuis Firebase Console)
- [ ] Refactor App.tsx (41KB — trop gros, extraire logique en hooks custom)
- [ ] Supprimer `Sidebar.tsx` vide a la racine (doublon avec `components/Sidebar.tsx`)
- [ ] Passer le timezone en setting persistant au lieu de hardcoder `'Europe/Paris'`
