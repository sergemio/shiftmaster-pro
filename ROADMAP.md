# ShiftMaster Pro — Feuille de route
> Last update: 2026-09-06

Etabli le 2026-09-06 apres audit UX de l'existant. Cadrage donne par Serge :

> « Le focus est avant tout par rapport aux employes et a l'employeur, plutot que sur les
> contraintes de la loi. Ca, eventuellement, on le fera aussi, mais dans un second temps. La,
> je veux juste que l'application soit le mieux qu'elle puisse etre pour ceux qui creent les
> emplois du temps et ceux qui les recoivent. »

**Methode** : un lot a la fois sur la branche `dev`, visible sur
https://sergemio.github.io/shiftmaster-pro/preview/ — fusion dans `master` seulement apres
validation de Serge. Detail de ce qui est fait : `CHANGELOG.md`.

---

## Etat

| | Lot | Statut |
|---|---|---|
| 0 | Fondations typo et tactiles | ✅ fait |
| 1 | Absences et jours feries | ✅ fait |
| 8 | Heures contractuelles et avenants | ✅ fait |
| 2 | Compteur mensuel | ✅ fait |
| 7 | Alerte de chevauchement | ✅ fait |
| 5 | Effectif par heure | ✅ fait |
| 6 | Copier la semaine precedente (semaine vide seulement) | ✅ fait |
| 3 | Vue personnelle de l'employe | ✅ fait |
| 9 | Confort de saisie — multi-jours + raccourcis | ✅ fait |
| 9b | Selection multiple et actions en bloc | ✅ fait |
| 4 | Publication et notification | 🔒 **demande une decision de Serge** |
| 6b | Semaine type et shifts types | ⬜ a faire |
| — | Contraintes legales | ⬜ explicitement remis a plus tard |

---

## ✅ Regles Firestore : deployees le 2026-09-06

La production accepte les absences et les jours feries. Les deux champs sont optionnels, donc la
version en ligne continue de fonctionner telle quelle. 24 tests passes dans l emulateur sur le
fichier exact publie, puis relecture depuis l API pour verifier.

Outil : `node scripts/rules-deploy.mjs --show | --diff | --publish`.

**Il reste a fusionner `dev` dans `master`** pour que l equipe recoive les dix lots — a faire
apres validation de Serge sur la preview.

---

## Ce qui reste

### Lot 6b — Semaine type et shifts types
Au-dela de la copie de la semaine precedente : enregistrer une trame de reference, et des shifts
types (« midi 11h30-16h ») a poser en un clic. Petite question ouverte : la trame appartient-elle
au restaurant ou a chaque personne ?

### Lot 4 — Publication et notification 🔒
Etat **brouillon / publie** par semaine, et notification a la publication ou a la modification
d'un shift a moins de 7 jours. Aujourd'hui un changement du jeudi pour le samedi n'est vu que si
la personne rouvre l'application.

**Demande une decision de Serge** : c'est de l'envoi de messages a de vraies personnes. Canal
(WhatsApp ou email), qui recoit quoi, texte exact. L'envoi WhatsApp est gate chez lui, et l'API
Cloud de Meta se facture au message. Tout peut etre construit jusqu'au bouton, pas au-dela.

Option a chiffrer separement : lien d'abonnement calendrier (ICS) pour voir ses shifts dans
l'agenda du telephone.

---

## Six choses a ne pas oublier

**Un ancien salarie qui garde des shifts n'est pas une anomalie.** Confirme par Serge le
2026-09-06 : plusieurs personnes dont la date de sortie est passee prennent encore des shifts en
extra. Le badge ambre signale une situation normale. Consequence : un export de paie **ne doit
pas exclure** quelqu'un au motif que sa date de sortie est passee.

**Une donnee agregee cache ce qu'elle resume.** Le 06/09, la bande d'effectif comptait par heure
et additionnait des gens qui ne se croisaient pas — le creux disparaissait dans la moyenne. Toute
vue de synthese doit etre calee sur le pas reel de la donnee, ici la demi-heure.

**Une action de masse ne se propose pas sur un planning deja construit.** Le 06/09, « Copy
Previous Week » avait ete rendu permanent pour couvrir un cas d appoint ; Serge l a fait retirer
des les semaines remplies. Un cas d appoint ne justifie pas d exposer une action large la ou elle
n est pas attendue.

**Ne jamais masquer une information pour regler un cas rare.** Le 06/09, l'horaire a ete masque
dans les cartes etroites pour eviter un repli disgracieux a trois shifts simultanes ; le seuil
attrapait les colonnes ordinaires et Serge l'a signale, captures a l'appui. Une colonne etroite
est une contrainte a accepter, pas un defaut a corriger au prix du cas courant.

**Les lectures Firestore se paient au document.** Tout ecran qui charge plusieurs semaines le
fait **a la demande**, jamais a l'ouverture. Voir `feedback_firestore-quota-charger-a-la-demande`.

**La sauvegarde ecrit le document de semaine en entier.** Ajouter un champ a une semaine sans
l'inclure dans `saveWeekToFirebase` l'effacerait a la premiere modification de shift.

---

## Tests conserves dans le depot

| Fichier | Ce qu'il verrouille |
|---|---|
| `scripts/test-lazy-subscribe.mjs` | 8 cas du chargement differe de Firestore |
| `scripts/test-rules.mjs` | 24 cas des regles Firestore (emulateur requis) |
| `scripts/test-contract-hours.mjs` | 11 cas des avenants dates |
| `scripts/test-month-hours.mjs` | 7 cas du contrat mensuel |
| `scripts/test-overlaps.mjs` | 9 cas des chevauchements |
| `scripts/test-coverage.mjs` | 8 cas de l'effectif par heure |

Les quatre derniers tournent sans rien installer : `node scripts/test-<nom>.mjs`.
