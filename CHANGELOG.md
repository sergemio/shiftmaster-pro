# ShiftMaster Pro — Changelog

**Regle** : chaque modif doit etre documentee ici AVANT de passer a autre chose.
Format : date, ce qui a change, pourquoi, fichiers touches.

---

## 2026-08-09 — Phases 1, 3, 4, 5, 6 de l'audit (robustesse + journal + cycle de vie)

### Bugs de perte de donnees corriges
- **Undo traversait les semaines** : `past`/`future` n'etaient jamais vides au changement de
  semaine. Editer la semaine A, naviguer vers B, cliquer Undo -> le planning de A **ecrasait**
  celui de B en base. (`App.tsx`, effet sur `weekId`)
- **Deux admins s'ecrasaient en silence** : `saveShiftsToFirebase` remplacait tout le tableau
  `shifts` avec un `setDoc` simple. Desormais `runTransaction` compare `updatedAt` a ce que
  l'appelant avait charge et **refuse** d'ecrire si le document a bouge -> message « quelqu'un
  d'autre a modifie cette semaine ». Les ecritures sont aussi **chainees** (`writeQueue`), sinon
  deux edits rapides du meme utilisateur se declaraient en conflit avec eux-memes.
- **Le badge « Saved » mentait** : les erreurs Firestore etaient avalees. `handleFirestoreError`
  ne **throw plus** (il etait appele depuis des callbacks `onSnapshot` -> rejet non capture) et
  remonte un message clair dans une banniere. Le badge affiche « Not saved ».
  L'email de l'utilisateur n'est plus serialise dans le message d'Error.
- **Fenetre d'ecriture au demarrage** : `staffList` vide etait lu comme « bootstrap » donc
  `isReadOnly = false` pour tout utilisateur connecte pendant les premieres secondes. Nouveau
  flag `staffLoaded` : aucun droit tant qu'on ne sait pas qui est qui.

### Cycle de vie employe (demande de Serge)
- **On ne supprime plus jamais un employe** : le bouton corbeille devient « marquer comme parti »
  (pose `endDate`), avec un dialogue aux couleurs de l'app qui dit explicitement que
  **l'historique est conserve**. Bouton « Reinstate » pour annuler. `onRemove` supprime.
- `StaffModal` : liste triee actifs -> anciens, avec separateur « Former Team » et mention
  « Left on <date> · history kept ».
- Les selecteurs de shift (`ShiftModal`, `EditShiftModal`) ne proposent que les employes actifs
  **sur la semaine affichee** ; l'assigne actuel reste selectionnable meme s'il est parti, sinon
  un ancien shift ne serait plus editable.
- Les shifts deja poses hors contrat ne sont **pas caches** (badge d'alerte) : cacher une donnee
  reelle serait pire que la signaler.

### Journal d'activite refondu
- Champs structures a l'ecriture : `targetStaffId`, `targetStaffName`, `weekId`. Les 3671 logs
  anterieurs n'en ont pas -> le nom est **relu depuis la phrase**. Verifie sur les donnees reelles :
  **1750 / 1750 logs de shift analyses avec succes (100 %)**.
- Ecran : recherche unique (employe **ou** auteur) avec bascule de role et compteurs, filtres de
  periode, case « masquer les ajustements » (80 % des logs sont des `UPDATE SHIFT`), jours
  **replies par defaut** et **tout deplie des qu'on cherche**.
- **Chargement a la demande** : le journal streamait 50 logs en permanence toute la session.
  Passer a 2 mois en streaming aurait multiplie les lectures Firestore par ~32. Il lit maintenant
  uniquement a l'ouverture (`loadLogs`). Requete verifiee sur la vraie base : 1783 documents,
  **aucun index composite requis**.

### Nettoyage
- Supprime : `Sidebar.tsx` vide a la racine, types `WeeklyData` et `Settings`, constante `DAYS`,
  `TIMEZONES` (jamais utilise) + son import mort, `testConnection()` (erreur console a chaque
  demarrage), `subscribeToLogs`, `saveGlobalSettingsToFirebase` (jamais appelee).
- **`settings/global` enfin branche** : le fuseau y etait stocke mais jamais lu — il etait code
  en dur a cinq endroits. `subscribeToGlobalSettings` alimente maintenant `Calendar`.

### Regles Firestore REECRITES mais PAS DEPLOYEES
`firestore.rules` corrige : `isValidLog` n'exige plus `data.id` (qui n'existe pas -> aurait
rejete tous les logs), `isTeamMember` remplace `isStaffOrGuest` (dont la clause
`list.size() > 0` etait toujours vraie, donc equivalente a « n'importe quel compte Google »),
bornes horaires 0..24, logs non modifiables, email de Serge garde en dur comme **anti-lockout**.

⚠️ **ORDRE DE DEPLOIEMENT OBLIGATOIRE** — verifie : le champ `staffEmails` **n'existe pas encore
en base**. Deployer les regles maintenant couperait la lecture a tout le monde sauf les 3 admins.
1. Deployer le code (le nouveau `saveStaffToFirebase` ecrit `staffEmails`)
2. Ouvrir Manage Staff et enregistrer un employe -> `staffEmails` est ecrit
3. Verifier sa presence en base
4. **Seulement ensuite** `firebase deploy --only firestore:rules`
5. Verifier la release via l'API (comme dans l'audit), pas seulement l'absence d'erreur
Les 9 employes ont tous un email : personne ne perdra l'acces une fois l'etape 2 faite.

---

## 2026-08-11 — Sauvegarde decalee a 08:30 UTC (suite de l'incident quota)

### Ce qui s'est passe
La sauvegarde du **2026-08-10 a echoue** sur `RESOURCE_EXHAUSTED` (mail d'alerte GitHub recu
par Serge). Celle du **11 a reussi** : le systeme n'etait pas casse.

### Cause — erreur de conception de l'horaire
Le creneau etait 02:15 UTC, choisi parce que « le restaurant est ferme la nuit ». Mais le quota
Firestore se reinitialise a **minuit heure du Pacifique** : 07:00 UTC l'ete, 08:00 l'hiver.
Un creneau nocturne tombe donc **toujours avant** la remise a zero et **herite du quota de la
journee ecoulee**. La soiree du 09/08 ayant epuise les lectures, la sauvegarde de la nuit
suivante etait condamnee d'avance. (GitHub avait en plus decale le run a 04:08 UTC.)

Ce n'etait donc pas un aleas : **toute journee chargee condamnait la sauvegarde suivante.**

### Correctif
Cron passe a **`30 8 * * *`** (08:30 UTC = 10:30 a Lyon l'ete, 09:30 l'hiver) : apres la remise
a zero dans les deux saisons, et avant l'ouverture du restaurant.

### Au passage — l'incremental est confirme en production
Run du 11/08 : `logs 3674 documents (+0 lus, le reste repris du cumul)`. Une sauvegarde coute
desormais **~40 lectures** au lieu de 3 711, et la copie reste complete.

---

## 2026-08-09 (nuit) — ⚠️ INCIDENT : quota de lectures Firestore epuise + optimisations

### Ce qui s'est passe
Les **50 000 lectures quotidiennes** du plan gratuit ont ete epuisees en une soiree de travail.
Symptome : `RESOURCE_EXHAUSTED: Quota exceeded` sur les grosses requetes. Les lectures unitaires
passaient encore — l'app restait utilisable, contrairement a ce qui a d'abord ete annonce a
Serge (annonce trop pessimiste, corrigee apres verification par une lecture unique).

### Cause
**Firestore facture une lecture PAR DOCUMENT, pas par requete.** Le journal fait 3 672
documents, donc chaque sauvegarde complete = 3 711 lectures. Sur la soiree :
~9 sauvegardes completes + 4 analyses du journal + 2 verifications d'integrite ≈ **56 000
lectures** — pour repondre a des questions dont la reponse etait deja sur le disque.

### Trois optimisations faites dans la foulee
1. **Sauvegarde incrementale des logs** (`shiftmaster-backup/backup.js`) : seuls les logs ecrits
   depuis la derniere copie sont lus (`where timestamp > dernier connu`), fusionnes avec le
   cumul sur disque. **3 711 -> 42 lectures** par sauvegarde, verifie en execution reelle
   (« +2 lus, le reste repris du cumul »). Sur parce que les regles deployees ce soir rendent
   `/logs` append-only : un log copie ne peut plus changer.
2. **Le journal ne charge que la fenetre affichee** : il s'ouvrait sur 2 mois (~1 800 documents)
   alors que l'ecran montre 30 jours par defaut. Il demande maintenant 1 mois et n'elargit que
   si l'utilisateur choisit une periode plus longue.
3. **Rappel de ce qui avait deja ete fait le soir meme** : le journal lisait en `onSnapshot`
   permanent pendant toute la session ; il ne lit plus qu'a l'ouverture.

### Regime normal apres corrections
Sauvegarde quotidienne ~42 lectures + usage de l'equipe ~500-2 000 = **environ 2 000 / 50 000
par jour**. Aucune marge a surveiller.

### Regle retenue (Serge)
Optimiser les appels **la ou c'est invisible pour l'utilisateur**, jamais au prix du temps reel
ni de l'exhaustivite de l'enregistrement. Et pour toute ANALYSE (qui a fait quoi, combien de
logs anciens...) : **lire le backup local, pas la base**. Detail : `M/feedback_firestore-quota-charger-a-la-demande.md`.

### A savoir
Le plan **Spark ne facture pas** : quota atteint = requetes refusees, rien n'est debite. Une
facturation supposerait un passage volontaire en Blaze. Reinitialisation a minuit heure du
Pacifique (~09:00 en France).

---

## 2026-08-09 (soir) — 🔒 REGLES FIRESTORE DEPLOYEES — la base n'est plus ouverte

### Ce qui a change
Les regles reellement en ligne etaient, depuis le **2026-02-24** :
`match /{document=**} { allow read, write: if request.auth != null; }` — n'importe quel
compte Google pouvait **lire et effacer** toute la base. C'est fini.

Desormais : lecture reservee a l'equipe et aux invites, ecriture aux seuls admins, journal
non modifiable, plannings valides a l'ecriture.

### Sequence exacte suivie
1. Sauvegarde fraiche prise **avant** toute ecriture
2. Champ `staffEmails` ajoute a `settings/staff` via l'Admin SDK — un `update()` qui n'a
   touche **que** ce champ ; `list`, `admins` et `guests` verifies identiques apres coup
3. Code deploye sur `master` (hash de l'asset servi compare au build local : identique)
4. Regles compilees **sans etre publiees**, puis testees
5. Publication, puis **relecture du contenu reellement en ligne** via l'API

### Teste dans l'emulateur avant publication — 16 cas sur 16
`npx firebase emulators:exec --only firestore --project demo-shiftmaster "node scripts/test-rules.mjs"`

L'API `:test` de Google a ete essayee d'abord : le compte de service n'a pas la permission
`firebaserules.rulesets.test`. L'emulateur local fait le meme travail sans toucher a la base.

Couvert : admin lit/ecrit, staff lit mais **n'ecrit pas**, invite lit, **inconnu ne lit ni
n'ecrit rien** (ni plannings, ni emails de l'equipe, ni journal), non connecte bloque, journal
non modifiable, impossible de signer un log au nom d'un autre, plannings invalides refuses
(dayIndex 9, fin avant debut), collection inconnue fermee.

### Verifie apres publication
`isTeamMember` present · `staffEmails` utilise · **ancien open bar absent** · email de Serge
en dur (anti-lockout) · `isValidLog` **sans** `data.id` (sinon tous les logs seraient rejetes).

### 🚨 Rollback d'urgence — a n'utiliser que si l'equipe est bloquee
Ancien ruleset : `projects/shiftmaster-pro-9e20d/rulesets/23d752dd-27bd-43dd-b584-f2897001bc3d`
PATCH sur `releases/cloud.firestore` avec ce `rulesetName`. **Attention : il rouvre la base a
tout compte Google.** A ne faire qu'en depannage, et a refermer aussitot.

---

## 2026-08-09 (soir) — La sauvegarde passe chez GitHub, la tache Windows est retiree

### Quoi
Nouveau depot **PRIVE** `sergemio/shiftmaster-backup` : workflow GitHub Actions quotidien a
**02:15 UTC**, 30 sauvegardes glissantes dans `snapshots/`, un fichier JSON par collection.
Meme principe que `sezam-prep-backup` (qui, lui, tourne depuis le 05/08 — verifie).

### Pourquoi le changement
La tache planifiee Windows ne s'executait **que les nuits ou le PC etait allume**. En
verifiant ses reglages on a trouve deux trous : aucun rattrapage d'une execution manquee, et
refus de demarrer sur batterie. Corriges d'abord, puis rendus inutiles : GitHub tourne quoi
qu'il arrive. **La tache Windows a ete supprimee**, ainsi que `scripts/run-backup.cmd`.

### Difference technique avec le Prep Manager
Le Prep Manager est sur Realtime Database avec des noeuds lisibles sans authentification.
ShiftMaster est sur **Firestore**, qui exige une identification : la cle de service est donc
stockee en **secret GitHub chiffre** (`FIREBASE_SERVICE_ACCOUNT`). Cette cle contourne les
regles de securite — d'ou le depot **prive**, obligatoire.

### Verifie le jour meme
- Execution reelle chez GitHub : 38 semaines / 964 shifts / 3672 logs / 2 reglages, commit
  `2d34436` pousse par le bot
- `restore.js` teste en mode simulation : 0 difference avec la base
- `backup.js` **refuse d'ecrire** si la lecture parait tronquee

### Ce qui reste en local
`scripts/backup-firebase.js` est conserve pour deux usages : une copie a la demande avant une
manipulation risquee, et `--verify` (comparer la derniere copie a la base). Le dossier Drive
`ShiftMaster - Backups` garde les copies du 09/08 ; il n'est plus alimente.

### A savoir
Il a fallu accorder le scope `workflow` au jeton `gh` (`gh auth refresh -h github.com -s workflow`) :
sans lui, GitHub refuse qu'un OAuth App cree un fichier dans `.github/workflows/`.

---

## 2026-08-09 — Backup automatique quotidien (Phase 0 de l'audit)

### Quoi
Sauvegarde complete quotidienne de la base Firestore vers Google Drive.
`scripts/backup-firebase.js` + `scripts/run-backup.cmd` + tache planifiee Windows
« ShiftMaster Backup » a **03:30** tous les jours.

### Pourquoi
Firestore en plan Spark n'a **ni PITR, ni export automatique, ni corbeille**. Un `setDoc`
malheureux ou un « Delete Week » de trop etait definitif. L'incident du 2026-05-04 n'a ete
reparable que parce qu'un dump JSON trainait **par hasard** en local. Le filet etait un
accident, pas un dispositif.

### Ou vont les fichiers
`G:\My Drive\2 - RH - SALAIRES EMPLOYÉS & Documents\ShiftMaster - Backups\`
- `daily/shiftmaster-YYYY-MM-DD.json` — garde 30 jours puis purge
- `monthly/shiftmaster-YYYY-MM.json` — premier backup du mois, **garde indefiniment**

Le Drive etant synchronise en local, chaque backup existe en local ET dans le cloud.

### Commandes
```
node scripts/backup-firebase.js             # backup du jour
node scripts/backup-firebase.js --dry-run   # simulation, n'ecrit rien
node scripts/backup-firebase.js --verify    # compare le dernier backup a la base live
node scripts/backup-firebase.js --dest "X"  # destination alternative
```

### Garde-fous integres
- **Refus d'ecrire un backup tronque** : si moins d'1 semaine ou moins d'1 employe est lu, le
  script s'arrete. Un backup qui enregistre une base vide est pire que pas de backup — il a
  l'air d'un succes et il fait tourner un bon backup hors retention.
- **Ecriture atomique** : ecriture dans `.tmp` puis renommage, donc une execution interrompue
  ne laisse jamais un fichier a moitie ecrit la ou on attend un backup valide.
- **Purge chirurgicale** : ne touche que les fichiers correspondant exactement au motif de
  nommage du script, uniquement dans `daily/`. Les archives mensuelles ne sont jamais purgees.
- **Log** : `scripts/backup.log` (dans .gitignore) avec le code de sortie de chaque execution.

### Verifie le jour meme
- Premier backup reel ecrit : 1 049 Ko (38 semaines / 964 shifts / 3 671 logs / 9 employes)
- `--verify` : **3 711 documents compares, 0 difference** — le backup est une copie fidele
- Tache planifiee declenchee manuellement de bout en bout : `exit=0`, fichier ecrit
- Aucun dossier parasite cree malgre l'accent dans le chemin (le log console affiche
  « EMPLOYÃ‰S » a cause du codepage de cmd, mais le disque est correct)

### Reste a faire
Le **test de restauration reelle** (reecrire un backup vers une base) n'a pas ete fait : il
suppose d'ecrire en base, ce qui ne se fait pas sans accord explicite et de preference sur un
projet de test. Tant qu'il n'est pas fait, on sait que le backup est fidele mais pas que la
procedure de remise en place fonctionne.

---

## 2026-08-09 — Header de marque sur l'export PNG + securisation .gitignore

### Header sur l'export PNG
- **Quoi** : Le PNG exporte (bouton "Export PNG" de la Sidebar) porte maintenant un bandeau en haut : logo Sezam&Co, surtitre "WEEKLY SCHEDULE", plage de dates complete, et "Sezam&Co / Week NN" a droite.
- **Pourquoi** : Le PNG ne contenait que les numeros de jour (10, 11, 12...). Sans mois ni annee, une capture partagee ou imprimee etait ambigue.
- **Texte toujours en anglais**, meme quand l'app est en francais — decision de Serge (le PNG circule hors de l'app).
- **Fichiers** :
  - `utils/brandLogo.ts` (nouveau) — logo en data URI base64 (160px, 26 Ko)
  - `utils/helpers.ts` — ajout `getWeekRangeLongEn()` et `getIsoWeekNumber()`. Aucune fonction existante modifiee.
  - `components/Calendar.tsx` — bandeau rendu si `isExporting`, hauteur ajoutee au conteneur capture
- **Deux pieges a connaitre si ca casse** :
  1. Le logo est **inline en base64**, pas un fichier de `public/`. `html-to-image` resout les `<img>` au moment de la capture : une requete reseau peut arriver apres le snapshot et produire un PNG sans logo. Ne pas "optimiser" en le sortant vers `public/`.
  2. Le conteneur `#calendar-grid-capture` a une **hauteur fixe** (`(TOTAL_HOURS + 1) * HOUR_HEIGHT + 64`). `EXPORT_HEADER_HEIGHT` (76) lui est ajoute quand `isExporting`. Changer la hauteur du bandeau sans mettre a jour cette constante rogne le bas de la grille.
- **Verifie** : `tsc --noEmit` + `npm run build` OK. Format de dates teste sur les cas limites — chevauchement de mois (`Mon 31 Aug - Sun 6 Sep 2026`), chevauchement d'annee (`Mon 28 Dec 2026 - Sun 3 Jan 2027`), et les semaines de changement d'heure (mars / octobre) : pas de derive.

### Securisation .gitignore (repo PUBLIC)
- **Quoi** : Ajout de `attachments/`, `tmp-*.json`, `scripts/*.json`, `scripts/fix-emails.js` au `.gitignore`.
- **Pourquoi** : Le repo est public et ces fichiers n'etaient pas ignores. `attachments/` contenait une convention de stage signee, les dumps JSON contiennent noms/emails/plannings du staff, `fix-emails.js` a trois emails employes en dur. Un seul `git add .` les publiait.
- **Rien n'a jamais ete pousse** — verifie avant le commit.

### Cycle de vie employe (travail local de Serge, non documente jusqu'ici, inclus dans le meme commit)
- `startDate` / `endDate` sur `Staff` (`types.ts`), helpers `getShiftIsoDate` / `isStaffActiveOnDate` / `isStaffActiveInWeek`
- Champs "First / Last Day on the Job" dans `StaffModal` (start date obligatoire a la creation)
- Badge "⚠ Ghost" sur un shift pose hors periode de contrat (`ShiftCard`, `Calendar`)
- Masquage des employes inactifs sur la semaine s'ils n'ont aucune heure (`Sidebar`, `EmployeeView`)
- Barre de stats : 3 etats (sous l'objectif / pile dessus en vert / au-dessus avec la surcharge en teinte foncee)
- **A savoir** : tant que les `startDate` ne sont pas saisis en DB pour les 11 employes, le filtrage ne fait rien — l'absence de `startDate` est traitee comme "actif depuis toujours".

---

## 2026-05-04 — Incident : staff list ecrasee par INITIAL_STAFF + fix

### Quoi
Au login de Serge a 13:59:59 UTC, la doc `settings/staff` a ete ecrasee avec INITIAL_STAFF (8 staff defauts du code). Resultat :
- 3 staff supprimes du roster : Parthavi (l0kb2u4vb), Sepand (oa6mu6n1z), Harshil (ti2jukwg1)
- Tous les emails effaces
- Couleurs custom remplacees par defauts
- Sinar repassee admin → staff

Les **shifts dans `weeks/` etaient intacts** — ils referencent toujours les vrais staffIds. L'app n'arrivait juste plus a afficher les noms.

### Cause
Bug dans `App.tsx` subscribeToStaff callback : si le 1er snapshot arrivait vide (cache Firestore froid au login), le code ecrivait `INITIAL_STAFF` en DB via `saveStaffToFirebase(INITIAL_STAFF)`. Race condition latente depuis le debut.

### Fix
1. **Restauration** : `node scripts/restore-staff.js tmp-april-raw.json` — restaure les 11 staff depuis le snapshot du 3 mai (extraction April raw).
2. **Code** : suppression du `saveStaffToFirebase(INITIAL_STAFF)` dans le subscribe. INITIAL_STAFF reste utilise comme fallback **local uniquement** si la DB est vraiment vide. Aucune ecriture auto en DB.

### Detection
Logs Firestore (`logs/` collection) → `UPDATE STAFF | Modified staff roster details` par Serge a 2026-05-04T13:59:59.288Z.

### Fichiers modifies
- `App.tsx` (subscribeToStaff callback)
- `scripts/restore-staff.js` (nouveau)

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
