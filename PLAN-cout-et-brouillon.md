# ShiftMaster Pro — Plan : coût par shift et mode brouillon
> Last update: 2026-09-13

Document de référence pour implémenter les deux décisions prises par Serge les 10 et 13 septembre 2026
après analyse de schedex.me. Se lit de haut en bas, s'exécute dans l'ordre. Deux lots, deux commits.

**Méthode** : branche `dev` → preview https://sergemio.github.io/shiftmaster-pro/preview/ → validation
de Serge → fusion dans `master`. Aucun push, aucun déploiement de règles sans son « go » explicite.
Historique détaillé : `CHANGELOG.md`. Contexte des lots précédents : `ROADMAP.md`.

---

## Invariants — valables pour les deux lots, à ne pas rediscuter

1. **`weekId` = date ISO du DIMANCHE qui précède la semaine** ; `dayIndex 0 = lundi` ;
   date d'un shift = `weekId + dayIndex + 1`. Semaine du lundi 14 sept 2026 → `2026-09-13`.
2. **Un seul point d'écriture par semaine** : `commitWeek` dans `App.tsx`. Toute modification (shifts,
   absences, fériés, annulation) passe par là. On ne crée jamais un second chemin d'écriture.
3. **Règles Firestore déployées AVANT le code qui en dépend**, jamais après. Ordre : `node
   scripts/rules-deploy.mjs --diff` → tests émulateur → `--publish` → `--diff` (doit dire IDENTIQUES).
   Une règle qui casse verrouille toute l'équipe : la publication est gatée par Serge.
4. **Les employés ne voient rien de financier, et rien d'un brouillon.** La protection est la règle de
   lecture Firestore, pas l'affichage. `settings/staff` est lisible par toute l'équipe : on n'y range
   jamais une donnée sensible.
5. **Dépôt public.** Jamais d'email, de taux, de nom de salarié dans un commit. `scripts/*.json` est
   ignoré par git et doit le rester.
6. **Tests avant de dire « fait »** : `npx tsc --noEmit`, `npx vite build`, `node scripts/test-*.mjs`
   (tous), règles : `npx firebase emulators:exec --only firestore --project demo-shiftmaster "node
   scripts/test-rules.mjs"`. Un scénario navigateur sur le bac à sable (bouton « Developer Sandbox »,
   données dans `localStorage`, clés `sandbox_staff`, `sandbox_week_<weekId>`, `sandbox_rates`).

---

## Lot 11 — Coût chargé sur chaque shift ✅ poussé sur `dev` le 13/09 (commit `f1c0ff5`)

**Ce que c'est.** Sur chaque carte de shift, une pastille grise « 108 € » à côté de « 6H », visible
des seuls admins. Le taux saisi est le **coût employeur chargé** (brut + charges patronales), un par
personne, dans Réglages → Coûts horaires. Taux manquant = aucun montant, jamais « 0 € ».

**État au 13/09/2026.** Code écrit et testé en local sur `dev` (non commité). Règles Firestore
`settings/rates` (lecture et écriture admin) **déjà en production** depuis le 10/09, ruleset
`7fff7f39`, ajout purement additif. Tests : `scripts/test-shift-cost.mjs` (14 cas), 7 cas de
permission dans `scripts/test-rules.mjs`, 6 scénarios navigateur. Fichiers : `utils/helpers.ts`
(`shiftCost`, `totalCost`, `formatMoney`), `services/firebaseService.ts` (`subscribeToRates`,
`saveRates`), `components/HourlyRatesEditor.tsx`, `ShiftCard.tsx`, `Calendar.tsx`,
`SettingsModal.tsx`, `App.tsx`, `firestore.rules`.

**Reste à faire, dans l'ordre :**
1. `git add` des fichiers du lot (pas `scripts/*.json`), un commit, push `dev` — sur « go » de Serge.
2. Vérifier la preview : admin connecté → Réglages → saisir un taux → le montant apparaît sur la
   carte ; recharger → il reste. Compte employé : aucune section « Coûts horaires », aucun montant.
3. Serge saisit les dix taux réels dans la preview (ils vont en base, donc valent aussi pour la prod).
4. Fusion `dev` → `master` (fast-forward) sur son « go ».

---

## Lot 12 — Mode brouillon ✅ règles déployées et code poussé sur `dev` le 13/09

Écarts assumés par rapport au texte ci-dessous : « Valider » demande une confirmation (elle
remplace ce que voit l'équipe), et le brouillon garde la version officielle dont il est parti
pour prévenir si un autre admin a modifié la semaine entre-temps. Détail : `CHANGELOG.md`.

### Comportement (cahier des charges)

1. Un admin peut ouvrir un **brouillon** d'une semaine. Le brouillon part d'une **copie de la
   semaine officielle** (hypothèse par défaut, Serge n'a pas tranché ; une semaine future vide donne
   donc un brouillon vide, ce qui couvre les deux cas).
2. En mode brouillon, toutes les actions habituelles fonctionnent (créer, glisser, répéter, sélection
   multiple, absences, fériés, annuler/rétablir). Elles écrivent dans le brouillon, **jamais** dans la
   semaine officielle.
3. **Rien n'entre dans le journal** pendant le brouillon. Ce sont des essais.
4. L'équipe continue de voir la semaine officielle, intacte. Un employé ne peut ni voir ni lire un
   brouillon (règle Firestore).
5. Apparence du brouillon : bandeau en haut du calendrier « Brouillon — l'équipe ne voit pas cette
   version », cartes de shift en **rayures diagonales** légères et bordure en pointillés. Le reste de
   l'interface ne change pas.
6. Bouton **« Valider la semaine »** : le contenu du brouillon remplace la semaine officielle en une
   seule écriture, le brouillon est supprimé, **une seule ligne** entre au journal
   (« PUBLISH DRAFT — N shifts »). Les cartes reprennent leur apparence normale.
7. Bouton **« Abandonner »** : supprime le brouillon après confirmation. La semaine officielle n'a
   jamais bougé.
8. Le brouillon n'existe qu'en **vue jour**, pour un admin. Vue employé et « ma semaine » montrent
   toujours l'officiel.
9. Un brouillon laissé ouvert est **persistant** : on le retrouve en revenant sur la semaine, et
   depuis un autre appareil. Une seule version de brouillon par semaine (pas de brouillons
   concurrents).

### Conception technique (le minimum qui tient)

- **Stockage** : document `drafts/{weekId}`, **même forme** que `weeks/{weekId}` (`shifts`,
  `absences`, `holidays`, `updatedAt`). Pas de nouveau type : `WeekData` réutilisé tel quel.
- **Règles** : bloc `match /drafts/{weekId}` — `read` et `write` si `isAdmin()`, écriture validée par
  `isValidWeeklyData` (déjà existante), `delete` si `isAdmin()`. Ajouter les cas dans
  `scripts/test-rules.mjs` : employé, invité, inconnu → lecture refusée ; admin → lecture, écriture,
  suppression permises.
- **Service** (`firebaseService.ts`) : `subscribeToDraft(weekId, cb)` sur le modèle de
  `subscribeToWeek` (renvoie `null` si le document n'existe pas — c'est ce qui dit « pas de
  brouillon ») ; `saveDraft(weekId, week)` ; `deleteDraft(weekId)`. Bac à sable : clé
  `sandbox_draft_<weekId>` dans `localStorage`.
- **App** (`App.tsx`) : un état `draft: WeekData | null` (abonnement admin seulement, comme
  `rates`) et un booléen `draftMode`. Ce que le calendrier affiche = `draftMode ? draft : officiel`.
  `commitWeek` prend la décision en un seul endroit : si `draftMode`, il écrit via `saveDraft` ; sinon
  comportement actuel inchangé. `createLog` : `if (draftMode) return;` en première ligne. Undo/redo :
  réinitialisés quand on entre ou sort du brouillon, comme au changement de semaine.
  Actions : `startDraft` (copie l'officiel → `saveDraft`, puis `draftMode = true`), `publishDraft`
  (`saveWeekToFirebase(weekId, draft, weekVersion.current)` avec le contrôle de conflit existant, puis
  `deleteDraft`, puis un `createLog` explicite, puis `draftMode = false`), `discardDraft`
  (`window.confirm`, `deleteDraft`, `draftMode = false`). Changer de semaine sort du mode brouillon.
- **UI** : dans la colonne de droite (`Sidebar.tsx`), un bouton « Brouillon » quand aucun brouillon
  n'existe, sinon « Reprendre le brouillon » ; en mode brouillon, un bandeau ambre au-dessus du
  calendrier avec « Valider la semaine » (principal) et « Abandonner » (secondaire). `ShiftCard.tsx`
  reçoit `isDraft` et applique `background-image: repeating-linear-gradient(135deg, …)` sur la couleur
  de la personne et `border-style: dashed`. Neutre, pas rouge : un brouillon n'est pas une erreur.
- **Ce qui ne change pas** : semaines voisines pour les règles de repos (elles lisent l'officiel, c'est
  le bon comportement), copie de la semaine précédente, export, compteurs mensuels.

### Étapes, dans l'ordre

1. `firestore.rules` + cas dans `test-rules.mjs` → tests émulateur verts.
2. **Déployer les règles** (`--diff`, `--publish`, `--diff`) — sur « go » de Serge. Inerte tant que le
   code ne lit pas `drafts/`.
3. Service : les trois fonctions + bac à sable.
4. App : état, abonnement admin, aiguillage dans `commitWeek`, garde dans `createLog`, les trois
   actions, sortie du mode au changement de semaine.
5. UI : bouton, bandeau, rayures.
6. Vérifications : `tsc`, `build`, tous les `test-*.mjs`, puis un scénario navigateur sur le bac à
   sable — créer un brouillon, déplacer un shift, vérifier que `sandbox_week_<id>` n'a pas bougé et que
   `sandbox_draft_<id>` a changé, valider, vérifier que l'officiel a pris le contenu et que le brouillon
   a disparu ; abandonner un second brouillon et vérifier que l'officiel est intact.
7. `CHANGELOG.md` + `M/changelog.md`, un commit, push `dev` sur « go », test de la preview par Serge,
   fusion `master` sur « go ».

### Hors périmètre (décidé)

Notification de l'équipe à la validation (Lot 4, bloqué sur le canal), modèles de shift en un clic,
ligne des shifts à pourvoir, pointage géolocalisé, météo.

---

## Commandes

```
npm run dev                                   # serveur local, port 3000
npx tsc --noEmit && npx vite build
for f in scripts/test-*.mjs; do node "$f"; done        # sauf test-rules.mjs
npx firebase emulators:exec --only firestore --project demo-shiftmaster "node scripts/test-rules.mjs"
node scripts/rules-deploy.mjs --diff | --publish
```
