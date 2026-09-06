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
| 1 | Absences et jours feries | ✅ fait, **regles non deployees** |
| 2 | Compteur mensuel | ⬜ a faire |
| 3 | Vue personnelle de l'employe | ⬜ a faire |
| 4 | Publication et notification | ⬜ a faire |
| 5 | Effectif par heure | ⬜ a faire |
| 6 | Modeles de semaine | ⬜ a faire |
| 7 | Alertes chevauchement et contrat | ⬜ a faire |
| 8 | Contrat date et sortie propre | ⬜ a faire |
| 9 | Confort de saisie | ⬜ a faire |
| — | Contraintes legales | ⬜ explicitement remis a plus tard |

---

## ⛔ Bloquant avant toute mise en production

**Les regles Firestore acceptant les absences ne sont pas deployees.** Fusionner `dev` dans
`master` sans les deployer ferait refuser toute saisie d'absence en production. 24 tests passent
dans l'emulateur ; il reste a publier. Ordre : deployer les regles **puis** fusionner.

---

## Fait

### Lot 0 — Fondations typographiques et tactiles
Echelle fermee a 6 tailles avec un cran de plus au doigt, plancher tactile de 44px, retrait du
Tailwind v3 charge en double qui ecrasait tout. Le texte descendait a 8px sur telephone.

### Lot 1 — Absences et jours feries
Bande sous l'en-tete du jour, trois motifs (conges payes, arret maladie, repos), jour ferie qui
teinte la colonne. Weekly Stats affiche le motif a la place d'une barre vide.

Choix par defaut a rouvrir si besoin : trois motifs seulement, demi-journees prevues dans le
modele mais pas dans l'interface, saisie reservee aux admins, repos facultatif.

---

## A faire, par ordre de valeur

### Lot 2 — Compteur mensuel *(le plus rentable)*
Basculeur **Semaine / Mois** en tete de Weekly Stats. Meme liste, memes barres, seule la periode
change. Chaque ligne : heures faites sur le mois, contrat mensuel, ecart en plus ou en moins.

**Pourquoi en premier** : le contrat, les heures supplementaires et la paie se raisonnent au
mois, et l'app ne sait compter qu'a la semaine. Ca fermerait la boucle avec le skill
`fiches-de-paye`, qui deviendrait une simple lecture.

⚠️ Cout en lectures : 4 a 5 documents de semaine au lieu d'un — **seulement au clic sur « Mois »**,
jamais a l'ouverture (voir `feedback_firestore-quota-charger-a-la-demande`).

### Lot 3 — Vue personnelle de l'employe
Aujourd'hui l'equipe recoit la grille complete en lecture seule. Il lui faut « ma semaine » :
mes shifts, le prochain en tete, mes heures de la semaine et du mois face a mon contrat.

### Lot 4 — Publication et notification
Etat **brouillon / publie** par semaine. Notification (WhatsApp ou email) a la publication et a
toute modification d'un shift publie a moins de 7 jours. Aujourd'hui un changement du jeudi pour
le samedi n'est vu que si la personne rouvre l'app.

Option a chiffrer : lien d'abonnement calendrier (ICS) pour voir ses shifts dans l'agenda du
telephone.

### Lot 5 — Effectif par heure
Ligne au-dessus de la grille : combien de personnes presentes a 12h30, a 20h. On voit les heures
par employe, jamais la couverture du service. Un trou en plein rush est invisible.

### Lot 6 — Modeles de semaine
« Copier la semaine precedente » n'existe que sur une semaine vide. Il manque une semaine type,
des shifts types (« midi 11h30-16h »), et une copie possible en fusion sur une semaine non vide.

### Lot 7 — Alertes chevauchement et contrat
Deux shifts pour la meme personne au meme moment : rien ne le signale. Heures au-dessus du
contrat mises en evidence. **Le contrat, pas la loi** — les 11h de repos et les 6 jours
consecutifs sont explicitement remis au second temps.

### Lot 8 — Contrat date et sortie propre
`targetHours` est un chiffre unique : passer de 35h a 24h reecrit tout l'historique. Il faut un
contrat date. Et saisir une date de sortie doit **proposer** de retirer les shifts posterieurs —
jamais les supprimer d'office (voir ci-dessous).

### Lot 9 — Confort de saisie
Multi-selection et deplacement en bloc, duplication d'un shift sur plusieurs jours, raccourcis
clavier.

---

## Deux choses a ne pas oublier

**Un ancien salarie qui garde des shifts n'est pas une anomalie.** Confirme par Serge le
2026-09-06 : plusieurs personnes dont la date de sortie est passee prennent encore des shifts en
extra. Le badge ambre du calendrier signale une situation normale. Consequence : un compteur
mensuel ou un export de paie **ne doit pas exclure** quelqu'un au motif que sa date de sortie est
passee.

**Les colonnes etroites sont une contrainte, pas un bug.** Trois shifts simultanes donnent des
cartes de ~40px ou un nom reste illisible. La vue employe existe pour ce cas. Ne pas « regler »
ce cas rare en degradant le cas courant — c'est l'erreur faite le 06/09 avec les horaires.
