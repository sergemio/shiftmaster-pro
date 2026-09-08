# ShiftMaster Pro — Changelog

**Regle** : chaque modif doit etre documentee ici AVANT de passer a autre chose.
Format : date, ce qui a change, pourquoi, fichiers touches.

---

## 2026-09-08 — Colonne de droite : trois corrections demandees par Serge

**Le bloc de vigilance se replie.** Cinq points deplies poussaient les boutons du planning vers le
bas et occupaient la hauteur utile en permanence. Il tient desormais sur une ligne — le nombre et
la convention — avec un chevron qui ouvre le detail. Le nombre suffit a savoir s'il y a quelque
chose a regarder ; le detail se demande.

**Le bouton d'ajout dit « + Shift ».** Ce qui cassait l'alignement n'etait pas le texte mais le
`py-4` avec un libelle sur deux lignes : le bouton etait plus haut que ses voisins. Hauteur fixee a
56 px comme les deux autres, verifie par mesure. Seul le verbe « Add » disparait — il repetait ce
que l'icone disait deja. *(Premier essai le 08/09 : j'avais retire le mot entier, Serge a demande
de garder « Shift ».)*

**L'export part dans les reglages.** Quelques usages par an ne justifiaient pas une place
permanente dans la colonne du planning. Le code est deplace tel quel dans
`components/ExportDataButton.tsx`, sous une section « Donnees » de la fenetre de reglages.

**Un vrai defaut au passage : le bloc deplie etait coupe net.** La barre laterale est une colonne
flex ; le bloc heritait de `flex-shrink: 1` et se faisait comprimer, et l'`overflow-hidden` ajoute
pour arrondir les coins tranchait le contenu — 189 px affiches pour 347 px de contenu, mesure au
navigateur. `flex-shrink-0` regle ca : la barre laterale defile, le bloc garde sa taille. Verifie
aussi que les six autres blocs de la colonne ne sont pas comprimes.

Verifie au navigateur : 11 controles, dont l'egalite des trois hauteurs, l'absence du bloc
deplie au chargement et le fait que le contenu deplie n'est plus coupe. Les 6 suites de calcul et les 4 suites de non-regression passent.

`components/Sidebar.tsx`, `components/SettingsModal.tsx`, `components/ExportDataButton.tsx` (nouveau)

---

## 2026-09-06 — Regles de duree du travail : l'app previent, elle ne bloque jamais

Cadrage donne par Serge : « les gens qui font les schedules ne connaissent pas toutes ces regles.
C'est en faisant les shifts que l'application lui apporte l'information. » Et : « je veux laisser
l'utilisateur libre de placer des shifts comme il veut. »

### Le badge arrive trop tard — l'endroit qui apprend, c'est la saisie

Un badge sur une carte se lit quand le shift est deja pose et qu'on est passe a autre chose.
L'avertissement s'affiche donc **pendant** qu'on choisit la personne, le jour et les horaires,
dans la meme fenetre, et disparait si on recule l'heure. La cause et l'effet sont dans le meme
ecran, a la meme seconde : c'est ce qui apprend la regle a quelqu'un qui ne l'a jamais lue.

Trois points de contact, chacun pour un cas different :
- **la fenetre de saisie** : la consequence avant de valider ;
- **le badge ambre sur la carte** : pour les infractions creees en deplacant un AUTRE shift,
  la ou personne n'a rien saisi ;
- **le recapitulatif de semaine** : pour verifier l'ensemble avant d'envoyer, sans chasser les
  badges a l'oeil.

Ambre et non rouge (R5.2) : le rouge reste pris par le chevauchement, qui est une erreur de
saisie. Depasser 10 h est une decision que l'employeur a le droit de prendre.

### Formulation : on dit ce qui est, puis ce qui devrait etre

« Seulement 8 h 30 de repos apres jeudi 18:00–23:30 — 11 h minimum. » Jamais « infraction
L3131-1 » : celui qui fait le planning ne connait pas les articles et n'a pas a les apprendre.
Et le message **nomme l'autre shift** — sans ca, « 8 h 30 de repos » n'est pas actionnable, il
faut chercher le coupable a l'oeil.

### Architecture : une regle porte un calcul, une convention porte des chiffres

`utils/laborRules.ts`. « Repos entre deux journees » se calcule pareil partout ; seul le seuil
compare change. Ajouter une convention = ajouter une ligne dans `CONVENTIONS`, pas ecrire du code.
Chaque convention porte sa `source` et sa `checkedOn` : les conventions changent par avenants,
sans ces deux champs la table pourrit en silence. Le nom de la convention est affiche dans
l'application — sans lui, un seuil n'est pas verifiable.

Le moteur ignore les semaines et les `dayIndex` : il travaille sur une liste plate de shifts
dates. C'est ce qui lui permet de voir le repos entre dimanche soir et lundi matin, qui traverse
deux documents Firestore. Les semaines voisines sont chargees pour le calcul mais ne declenchent
pas d'alerte : on ne signale pas les problemes d'une semaine que l'utilisateur ne regarde pas.

### Quatre regles, convention Restauration rapide (IDCC 1501)

| Regle | Seuil |
|---|---|
| Repos entre deux journees | 11 h |
| Repos hebdomadaire | 35 h (24 h + 11 h) |
| Duree quotidienne | 10 h |
| Jours consecutifs | 6 |

Le repos hebdomadaire est celui qu'un planificateur ne peut pas deviner : finir vendredi a 23 h 30,
samedi off, reprendre dimanche a 9 h fait 33 h 30 — le samedi est vide et pourtant ce n'est pas
conforme. Il n'a pas de badge : il ne designe aucune carte en particulier, l'accrocher a une carte
choisie au hasard induirait en erreur. Recapitulatif seulement.

### La ligne partagee

« Extra » est utilisee par plusieurs personnes reelles. Les regles individuelles y produiraient une
fausse alerte par jour, et on cesserait de lire les avertissements des la premiere semaine. Case
« Shared row » sur la fiche (`isPool`), et le moteur exclut ces lignes.

### Un vrai bug trouve par les tests

La boucle des jours consecutifs lisait `dates[-1]` au premier tour et plantait. Les 20 cas de
`scripts/test-labor-rules.mjs` figent le comportement, dont l'exemple du vendredi soir.

### Reporte, et pourquoi

La pause de 20 min : l'application ne modelise pas les pauses, on ne peut que constater qu'un shift
depasse 6 h. La moyenne sur 12 semaines : demande de charger 12 semaines. Le « je sais, c'est
voulu » : un avertissement est calcule, pas stocke — le memoriser demande de lui donner une
identite stable et un champ dans le document de semaine, donc une regle Firestore et une ligne
dans `saveWeekToFirebase`, faute de quoi la premiere modification l'effacerait.

`utils/laborRules.ts` (nouveau), `utils/violationText.ts` (nouveau),
`scripts/test-labor-rules.mjs` (nouveau), `App.tsx`, `components/ShiftModal.tsx`,
`components/EditShiftModal.tsx`, `components/ShiftCard.tsx`, `components/Calendar.tsx`,
`components/Sidebar.tsx`, `components/StaffModal.tsx`, `types.ts`, `utils/translations.ts`,
`services/firebaseService.ts`

---

## 2026-09-06 — Chargement mobile : Firestore sort du premier ecran, et cache local

Serge : « a chaque fois que j'essaie de charger le site sur un mobile, ca prend beaucoup, beaucoup
de temps », avant ET apres la connexion. Mesure sur un profil telephone (4G lente 1,6 Mb/s,
150 ms de latence, CPU bride x4) :

| | 1re visite | revisite |
|---|---|---|
| 4G lente + telephone bas de gamme | 4,48 s | 0,59 s |
| 4G lente + telephone correct | 2,36 s | 0,11 s |
| Bonne 4G + bas de gamme | 1,67 s | 0,53 s |

### Avant la connexion — le SDK Firestore etait telecharge pour rien

Le paquet faisait 226 ko, dont 75 % de Firebase, et **Firestore est la plus grosse piece**. Importe
en haut de `firebaseService.ts`, il etait telecharge et execute AVANT que l'ecran de connexion
puisse s'afficher — alors que cet ecran n'a besoin que de l'authentification.

Il se charge desormais a la demande. Le premier paquet passe de **258 ko a 156 ko compresses
(−40 %)** ; les 450 ko de Firestore partent dans un fichier separe qui se charge pendant que Google
verifie la session. Le temps est passe en parallele au lieu d'etre passe en serie.

Verifie sur le site construit : l'ecran de connexion ne charge qu'un seul script, et le bac a
sable monte toute l'interface **sans jamais demander le fichier Firestore**.

### Apres la connexion — cache local persistant

`initializeFirestore` avec `persistentLocalCache` (IndexedDB, `persistentMultipleTabManager` car le
planning s'ouvre souvent dans plusieurs onglets). Sans lui, chaque ouverture affiche un calendrier
vide le temps que la liaison s'etablisse ; avec lui, la semaine deja consultee s'affiche
immediatement depuis le telephone, puis le serveur la corrige s'il y a eu du changement.

Deux consequences a connaitre. Les lectures servies par le cache **ne sont pas facturees** : le
quota baisse, il ne monte pas. Et une donnee peut etre affichee brievement perimee — c'est deja
couvert, toute ecriture passe par une transaction qui compare `updatedAt` et refuse d'ecraser le
travail d'un autre.

### Le piege du chargement differe, et son test

React attend une fonction de desabonnement **tout de suite**, alors que le SDK n'est pas encore la.
Entre l'appel et l'arrivee du module, l'effet peut deja avoir ete demonte — un changement rapide de
semaine suffit. Sans garde, l'ecoute s'ouvrirait apres coup et personne ne la fermerait : une ecoute
Firestore qui survit, c'est de la facturation qui continue. D'ou `lazySubscribe`, et
`scripts/test-lazy-subscribe.mjs` qui fige les cas limites, dont le demontage avant l'arrivee du SDK.

### Une faiblesse trouvee en relisant, avant de pousser

La promesse de chargement est mise en cache pour ne charger le SDK qu'une fois — mais elle
memorisait aussi son **echec**. Une coupure reseau d'une seconde au mauvais moment aurait condamne
toute la session : plus aucune lecture ni sauvegarde jusqu'au rechargement de la page, sans que
rien ne l'explique. Le cache est desormais efface en cas d'echec, et le prochain appel retente.
Septieme cas ajoute au test.

### Une piste ecartee apres verification

GitHub Pages ne met les fichiers en cache que 10 minutes, ce qui laissait croire a un
retelechargement complet a chaque ouverture. Verification faite avec `If-None-Match` : le serveur
repond **304, zero octet**. Ca coute un aller-retour, pas 226 ko. Piste abandonnee.

### Reste a faire

La prod charge encore le CDN Tailwind (retire au lot 0, pas encore fusionne) : **3,03 s contre
2,21 s** pour la preview dans les memes conditions. Ce script telecharge, puis **compile le CSS
dans le navigateur a chaque ouverture**.

⚠️ **Ce qui n'a pas pu etre teste ici** : le chemin connecte — abonnements, sauvegardes,
transactions — demande un compte de l'equipe. A verifier sur la preview avant fusion : les shifts
s'affichent, une modification se sauvegarde, un rechargement la retrouve.

`services/firebaseService.ts`, `scripts/test-lazy-subscribe.mjs` (nouveau)

---

## 2026-09-06 — Lot 9 (2/2) : selection multiple et actions en bloc

Le lot 9 prevoyait un « deplacement en bloc » par glisser-deposer. Mauvaise forme pour cette
application : le glisser est un geste de souris, et l'outil sert surtout sur telephone — ou il est
d'ailleurs desactive volontairement pour eviter les deplacements accidentels. Une barre d'actions
marche au doigt comme a la souris, et surtout **elle ne touche pas au code de glisser-deposer**,
la partie la plus delicate du calendrier. Verifie : un glisser simple deplace toujours un shift,
et ne declenche pas de selection.

**Entrer en selection** : appui long (450 ms) sur telephone, Ctrl/Cmd+clic au bureau. Ensuite un
simple appui coche ou decoche, au lieu d'ouvrir la fiche. `Echap` sort. Un contour indigo et une
pastille cochee marquent les cartes retenues — un contour et non une bordure, pour ne pas decaler
les voisines dans la colonne.

**Actions** (`components/SelectionBar.tsx`) : −30 min, +30 min, deplacer vers un jour, supprimer.
Chacune part en un seul commit, donc **un seul Ctrl+Z rend le bloc entier**.

Le decalage horaire est **tout ou rien** : si un seul des shifts sortait de la journee, rien ne
bouge et un message le dit. Un bloc a moitie decale serait pire que pas de decalage — on croirait
le geste fait, et il faudrait rattraper a la main les shifts restes en place.

Trois details qui evitent des pieges : les poignees de redimensionnement disparaissent pendant une
selection (elles demarreraient un glisser au moment ou l'on cherche a cocher) ; le drapeau
d'appui long empeche le `click` de fin de geste de decocher aussitot ce que l'appui vient de
cocher ; la selection est videe des qu'on change de semaine, sinon la barre agirait sur des cartes
qui ne sont plus a l'ecran.

Verifie au navigateur : 13 controles au bureau, 7 sur telephone, plus le glisser simple et la
suppression (refus et acceptation de la confirmation, puis Ctrl+Z qui restaure). Zero erreur
JavaScript, aucune cible sous 44 px, aucun debordement horizontal.

`components/SelectionBar.tsx` (nouveau), `components/ShiftCard.tsx`, `components/Calendar.tsx`,
`App.tsx`, `utils/translations.ts`

---

## 2026-09-06 — Lot 9 (1/2) : poser un service sur plusieurs jours, et raccourcis clavier

### Un service, plusieurs jours

Poser le meme horaire du lundi au vendredi demandait cinq ouvertures de la fenetre « Add Shift »,
alors que c'est le geste le plus courant d'un planning de restaurant. La liste deroulante
« Day of Week » devient sept pastilles (`components/DayPicker.tsx`), cochables au doigt, et la
fenetre annonce ce qu'elle va faire : « 4 shifts seront crees ».

Meme selecteur dans la fenetre d'edition, sous « Repeter aussi sur », avec le jour du shift
verrouille — il reste affiche plutot que masque, sinon on ne verrait plus a quel jour appartient
le shift qu'on modifie. Les copies partent des valeurs **editees** : corriger l'horaire puis
cocher trois jours pose le bon horaire partout.

Point important : tout part en **un seul commit**. Une ecriture Firestore, et surtout **une seule
etape d'annulation** — devoir annuler cinq fois un geste unique aurait ete un piege. Verifie :
quatre shifts crees d'un coup, un Ctrl+Z les retire tous les quatre, un Ctrl+Shift+Z les remet.

### Raccourcis clavier (poste fixe)

`Ctrl+Z` / `Ctrl+Shift+Z` (ou `Ctrl+Y`) pour annuler et retablir, fleches gauche et droite pour
changer de semaine, `Echap` pour fermer la fenetre du dessus. Rien ne remplace un bouton existant :
les raccourcis doublent des actions deja accessibles, et les boutons portent desormais le rappel du
raccourci au survol.

Trois garde-fous : la frappe est ignoree si elle vise un champ de saisie (sinon `Ctrl+Z` annulerait
la semaine au lieu du texte tape), les fleches sont ignorees quand une fenetre est ouverte, et
`Echap` ferme la fenetre du dessus avant tout le reste.

Verifie au navigateur, neuf controles, zero erreur JavaScript. Sur telephone (390 px) : aucune
cible sous 44 px, aucun debordement horizontal.

`components/DayPicker.tsx` (nouveau), `components/ShiftModal.tsx`, `components/EditShiftModal.tsx`,
`components/Sidebar.tsx`, `App.tsx`, `utils/translations.ts`

---

## 2026-09-06 — Bande d'effectif : a la demi-heure, et non plus a l'heure

Signale par Serge, capture du vendredi 28 : l'infobulle annoncait « 17:00 — 3 » alors que le
planning montre Omar 11h30-15h30, Yasmine 12h00-17h30, Sepand et Parthavi 17h30-23h.

Ce n'etait pas une erreur de comptage mais une erreur d'echelle. La barre couvrait l'heure entiere
17h00-18h00 et comptait toute personne presente a un moment quelconque de cette heure : Yasmine,
qui part a 17h30, plus Sepand et Parthavi qui arrivent a 17h30. Trois personnes qui ne sont
**jamais ensemble**, additionnees en un seul nombre. Le maximum reellement simultane est 2, et a
17h00 pile il n'y a qu'une personne en service.

Le plus grave n'est pas le chiffre faux : l'agregation horaire **effacait le creux**, c'est-a-dire
exactement ce que cette bande existe pour montrer.

Tous les horaires de l'application tombent sur :00 ou :30 — les listes des formulaires avancent
par 30 minutes, le glisser-deposer s'aligne sur 0,5. Une barre par demi-heure est donc exacte :
chaque barre vaut un instant precis du planning, plus rien n'est agrege. `staffingPerHour` devient
`staffingPerSlot`, avec un pas parametrable (30 minutes par defaut).

Verifie au navigateur sur le vendredi de la capture, rejoue tel quel : « 16:30 — 1 », « 17:00 — 1 »,
« 17:30 — 2 », « 18:00 — 2 ». 32 barres par jour, 3,3 px chacune, aucun debordement horizontal.
Deux tests ajoutes qui figent ce cas precis.

`utils/helpers.ts`, `components/Calendar.tsx`, `scripts/test-coverage.mjs`

---

## 2026-09-06 — « Copy Previous Week » : retour au bouton reserve a une semaine vide

Demande de Serge, capture a l appui : sur la semaine du 31 aout deja remplie, le bouton etait
propose alors qu il n a de sens que sur une semaine vide. Le lot 6 l avait rendu permanent pour
couvrir « la trame est posee, il manque deux personnes le samedi » ; ce cas ne justifiait pas de
laisser une action de masse a portee de clic sur un planning deja construit.

Le bouton est de nouveau conditionne a `isEmpty && !isLoading`. La confirmation cote `App.tsx`
est conservee : deux administrateurs travaillant en meme temps, la semaine peut se remplir entre
l affichage du bouton et le clic — c est la seule voie qui reste vers ce cas, elle garde son garde-fou.

Verifie au navigateur (bac a sable, semaine courante) : semaine contenant un shift -> bouton
absent ; semaine vide -> bouton present.

`components/Sidebar.tsx`

---

## 2026-09-06 — Regles Firestore deployees en PRODUCTION

Le point bloquant est leve : la production accepte desormais les absences et les jours feries.

### Ce qui a change en production

19 lignes ajoutees, 1 remplacee. **Aucune regle d acces n a ete touchee** : ni `isAdmin`, ni
`isTeamMember`, ni `isOwner`, ni aucun `allow read/write`. Seule la validation de forme du
document de semaine est etendue :

- `absences` doit etre une liste de 100 elements au plus, chaque element ayant un `id`, un
  `staffId`, un `dayIndex` entre 0 et 6 et un motif parmi `conge`, `maladie`, `repos`.
- `holidays` doit etre une liste de 7 elements au plus.
- Les deux sont **optionnels**.

### Pourquoi l ordre comptait

Deployer AVANT de fusionner `dev` dans `master`. Les deux champs etant optionnels, la version
actuellement en ligne — qui n ecrit que `{shifts, updatedAt}` — continue de fonctionner sans
rien changer. L inverse aurait casse la saisie d absence pour toute l equipe.

### Verification

Les **24 cas** de `scripts/test-rules.mjs` passent dans l emulateur sur le fichier exact publie,
dont « Semaine SANS absences encore acceptee » qui garantit la compatibilite avec l existant et
avec une restauration de sauvegarde.

Apres publication, les regles servies ont ete **relues depuis l API** et comparees au fichier :
identiques. Donnees de production intactes (26 shifts sur la semaine courante, 9 personnes au
roster, 3 admins).

Ruleset `3ccb266c` remplace par `df592cd3`.

### Nouvel outil

`scripts/rules-deploy.mjs` : `--show` affiche ce qui tourne reellement, `--diff` le compare au
depot, `--publish` publie et **relit pour verifier**. Le fichier du depot n est pas une preuve de
ce qui est deploye — c est la lecon du 09/08, ou les regles servies n etaient pas celles du code.

---

## 2026-09-06 — Lot 3 : « ma semaine », la vue de l employe (branche `dev`)

L equipe recevait la **grille complete en lecture seule** : sept colonnes, tout le monde, a lire
sur un telephone pour y trouver ses deux shifts.

### Ce que l employe voit maintenant

En tete, **son prochain shift** en gros, aux couleurs de sa pastille — c est ce qu on ouvre
l application pour lire. Puis ses heures de la **semaine** et du **mois** face a son contrat.
Puis la semaine en liste, du lundi au dimanche.

**Les jours sans service restent affiches** (« Pas de service ») : « je ne travaille pas jeudi »
est une information, pas un vide a masquer. Les jours passes sont estompes, aujourd hui est
surligne.

Les conges, arrets et jours feries y apparaissent, et un shift pris en remplacement est marque
comme tel — dans les deux sens : ce que je couvre pour un autre m appartient, ce qu un autre
couvre pour moi ne m appartient plus.

### Qui suis-je ?

La fiche dont l email correspond au compte connecte. Un meme email pouvant figurer sur plusieurs
lignes (la ligne partagee « Extra » porte celui de Serge), on retient celle qui a des heures de
contrat. Sans fiche a son nom, la vue se retire d elle-meme et le planning complet reprend la
main plutot que d afficher un ecran vide.

Le choix se fait dans les reglages, a cote de « Day » et « Employee », et n apparait que si une
fiche porte l email de l utilisateur.

### Verification

Parcours joue au navigateur sur un telephone de 390px, avec shifts, conge, jour ferie,
remplacement et note. Compteurs coherents : **18h sur la semaine, 13,5h sur septembre** — le
lundi 31 aout compte dans la semaine mais pas dans le mois. Aucun debordement, aucun bouton sous
44px, aucune erreur JavaScript.

Le bac a sable prete la premiere fiche de l equipe pour que la vue y soit essayable sans compte.

`components/MyWeekView.tsx` (nouveau), `types.ts`, `App.tsx`, `components/Calendar.tsx`,
`components/SettingsModal.tsx`, `utils/translations.ts`

---

## 2026-09-06 — Lot 6 : copier la semaine precedente, meme sur une semaine remplie (branche `dev`)

Le bouton **Copy Previous Week** n apparaissait que sur une semaine **vide**, ce qui interdisait
le cas le plus courant : la trame est deja posee, il manque deux personnes le samedi.

Il est desormais toujours disponible. Les shifts repris **s ajoutent** a ceux en place — jamais
de remplacement, donc jamais de travail efface. Sur une semaine deja remplie, une confirmation
annonce le nombre exact de shifts ajoutes. Un doublon eventuel se signale de lui-meme via
l alerte de chevauchement livree juste avant.

Les absences et les jours feries ne sont pas repris : ils sont propres a une semaine donnee,
contrairement a une trame de service.

### Un bug silencieux corrige au passage

La copie lisait encore `sandbox_shifts_`, cle abandonnee en passant a `sandbox_week_` lors du lot
des absences. **La copie etait cassee dans le bac a sable depuis**, sans aucun message.

Verifie au navigateur : semaine contenant 1 shift, copie d une semaine precedente en contenant 2,
confirmation affichant bien « 2 », resultat 3 shifts. Aucune erreur JavaScript.

`App.tsx`, `components/Sidebar.tsx`, `utils/translations.ts`

---

## 2026-09-06 — Lot 5 : effectif par heure (branche `dev`)

L application montrait les heures **par employe**, jamais la couverture du service. Un trou a
20h un samedi restait invisible tant qu on ne relisait pas chaque carte une par une.

Une ligne **Effectif** sous la bande des absences : une barre par heure et par jour, hauteur
proportionnelle au nombre de personnes en poste. On voit la forme de la journee — les deux
services, et le creux entre les deux — sans lire un seul chiffre.

Les heures a zero sont laissees **en creux**, pas colorees en rouge : un service ferme n est pas
une anomalie (R5.3). C est le vide qui doit sauter aux yeux, pas une alerte.

Details qui comptent : une personne compte des qu elle couvre une partie de l heure (partir a
20h30, c est etre present sur la tranche de 20h) ; un shift couvert par quelqu un d autre compte
pour le remplacant ; une meme personne avec deux shifts dans l heure compte pour une.

8 cas testes (`scripts/test-coverage.mjs`, conserve).

Au passage : le badge de chevauchement n affichait que son pictogramme sur une carte etroite —
exactement le defaut signale par Serge quelques heures plus tot sur les horaires. Le mot est
court, il se replie desormais au lieu de disparaitre.

`utils/helpers.ts`, `components/Calendar.tsx`, `components/ShiftCard.tsx`,
`utils/translations.ts`, `scripts/test-coverage.mjs` (nouveau)

---

## 2026-09-06 — Lot 7 : alerte de chevauchement (branche `dev`)

Deux shifts au meme moment pour la meme personne : rien ne le signalait. L erreur se decouvrait
le jour meme, ou dans les heures de paie.

La carte concernee porte desormais un badge **rouge** — rouge assume, contrairement au badge de
periode d emploi : personne ne peut etre a deux endroits a la fois, c est une erreur de saisie et
non une situation normale (R5.2).

**Deux shifts qui se TOUCHENT ne se chevauchent pas** : 11h-15h puis 15h-19h est une coupure
normale, pas un conflit. La comparaison est stricte.

9 cas testes (`scripts/test-overlaps.mjs`, conserve) : chevauchement simple, shifts qui se
touchent, un shift inclus dans un autre, double saisie a l identique, personnes ou jours
differents, liste vide.

`utils/helpers.ts`, `components/Calendar.tsx`, `components/ShiftCard.tsx`,
`utils/translations.ts`, `scripts/test-overlaps.mjs` (nouveau)

---

## 2026-09-06 — Lot 2 : compteur mensuel (branche `dev`)

Le contrat, les heures supplementaires et la paie se raisonnent au mois. L'application ne savait
compter qu'a la semaine.

### Ce que ca donne

Un basculeur **Semaine / Mois** en tete des stats. Meme liste, memes barres, seule la periode
change. En mois, chaque ligne affiche les heures faites, le contrat mensuel, et **l'ecart** en
plus (vert) ou en moins (ambre).

### Deux regles a connaitre

**Chaque shift compte dans le mois de sa VRAIE DATE**, pas dans celui de sa semaine. La semaine
du 31 aout au 6 septembre appartient aux deux mois : le lundi 31 va en aout, le reste en
septembre. Verifie sur un jeu de donnees ou un shift du 31 aout est bien exclu du total de
septembre alors qu'il s'affiche dans la meme semaine a l'ecran.

**Le contrat mensuel suit la base legale francaise** : hebdomadaire × 52/12. 35h/semaine font
151,67h/mois, quel que soit le nombre de jours du mois. Le calcul se fait jour par jour, si bien
qu'un **avenant prenant effet en milieu de mois est proratise** sans cas particulier a ecrire :
un passage de 24h a 30h le 16 septembre donne 117h pour le mois.

### Quel mois pour une semaine a cheval ?

Celui de son **jeudi**, la regle ISO 8601. Sans ca, la semaine du 31 aout au 6 septembre
affichait « aout » un 6 septembre, parce que son lundi tombe en aout. Constate en testant.

### Cout en lectures — la contrainte de Serge

Le mois demande 5 ou 6 documents au lieu d'un. Ils ne sont charges **qu'au clic sur « Mois »**,
jamais a l'ouverture de l'application. Firestore facture une lecture par document : les charger
d'office ferait payer ce prix a toute l'equipe, en permanence, pour un ecran que personne
n'ouvre la plupart du temps. Regle du 2026-08-09 sur le quota.

Le mode bac a sable relit ses propres semaines depuis le navigateur, ce qui permet d'essayer la
fonction sans aucune lecture facturee.

### Verification

**7 cas testes** (`scripts/test-month-hours.mjs`, conserve) : equivalence legale sur un mois de
28 et de 31 jours, mois entierement avant ou apres un avenant, avenant en milieu de mois,
absence de donnee. Parcours joue au navigateur sur un jeu de deux semaines dont une a cheval :
totaux exacts, mois correctement identifie, aucune erreur JavaScript.

`utils/helpers.ts`, `services/firebaseService.ts`, `App.tsx`, `components/Sidebar.tsx`,
`utils/translations.ts`, `scripts/test-month-hours.mjs` (nouveau)

---

## 2026-09-06 — Lot 8 : heures contractuelles et avenants (branche `dev`)

Demande de Serge :

> « Tu peux changer "target hours" par "contract hours". Ce ne sont plus des heures qu'on met,
> mais celles du contrat. Attention, une nuance : parfois il y a des avenants signes avec
> l'employe, donc le meme employe peut avoir un certain nombre d'heures dans un mois et, le mois
> d'apres, un nombre different. Il faut l'integrer de maniere intuitive et comprehensible. »

### Le renommage

`targetHours` devient **`contractHours`**. Ce n'etait pas un objectif fixe par le manager mais ce
que dit le contrat, et le libelle disait le contraire. « Weekly Target (h) » devient
**« Contract hours / week »**, dans la fiche d'edition **et** dans le formulaire de creation.

**Aucune migration de donnees.** L'ancien champ est encore lu en repli : une fiche pas encore
reenregistree affiche le bon chiffre, et l'ancien nom reste ecrit en parallele tant que la
transition n'est pas finie. Une sauvegarde restauree continue donc de fonctionner.

### Les avenants

Nouveau champ `contractChanges` : une liste de « a partir de cette date, le contrat est de N
heures ». Sans elle, changer le chiffre du contrat **reecrirait retroactivement tous les mois
deja ecoules** — quelqu'un passe de 24h a 30h en octobre, et septembre serait soudain compte
face a 30h. C'est exactement le genre d'erreur qui fausse une paie.

`contractHoursOn(staff, date)` renvoie les heures **applicables a cette date** : le dernier
avenant dont la date d'effet est deja passee, sinon le contrat courant. Weekly Stats et la vue
employe l'appellent avec le **lundi de la semaine affichee**, pas avec aujourd'hui.

Une date d'effet **future** est acceptee : un avenant se signe avant de prendre effet.

### Ce que Serge voit

Dans la fiche d'un employe, sous les heures de contrat, une section **Amendments** : la liste des
avenants dates et triés, chacun supprimable, et une ligne de saisie « Effective from / Hours /
Add ». Une phrase explique la regle : *« Each week counts against the amendment in force that
week — past months keep the hours they were signed under. »*

Ressaisir la meme date d'effet **corrige** l'avenant au lieu d'en empiler deux.

### Verification

**11 cas de la regle testes** (`scripts/test-contract-hours.mjs`, conserve dans le depot), dont
le cas critique : un avenant signe en septembre ne change pas le chiffre applique en aout.
Egalement : fiche non migree, avenant futur, avenants saisis dans le desordre, absence totale de
donnee.

Parcours joue au navigateur : ouverture d'une fiche, ajout de deux avenants dans le desordre,
affichage trié chronologiquement. Aucune erreur JavaScript.

Au passage, les trois champs des avenants ont un `aria-label` — l'audit du 06/09 relevait **zero**
attribut d'accessibilite dans toute l'application.

`types.ts`, `utils/helpers.ts`, `constants.ts`, `components/StaffModal.tsx`,
`components/Sidebar.tsx`, `components/EmployeeView.tsx`, `scripts/test-contract-hours.mjs` (nouveau)

---

## 2026-09-06 — Correctif : les horaires etaient masques dans les cartes de shift

**Regression que j ai introduite le jour meme, signalee par Serge captures a l appui.**

En verifiant le cas de trois shifts qui se chevauchent (cartes de ~40px), l horaire s y repliait
sur trois lignes tronquees. J ai ajoute un masquage sous 104px de large. Deux erreurs :

1. Le seuil porte sur la largeur INTERIEURE de la carte. Avec 16px de padding et 4px de bordure,
   il attrapait toute carte de moins de 124px — soit une colonne de jour ordinaire.
2. Surtout : je reglais un cas rare en cassant le cas courant. L horaire est l information la
   plus utile apres le nom. Il se repliait sur deux lignes depuis toujours, et c est lisible.

**Masquage retire.** L horaire ne disparait plus jamais. Meme correction pour le badge de
periode d emploi, qui prend deja toute la largeur de la carte et se replie.

Mesure au navigateur, cartes de 63px (deux shifts qui se chevauchent) et 130px :
horaire absent avant, present apres, aux deux largeurs.

`components/ShiftCard.tsx`

---

## 2026-09-06 — Lot 1 : les absences (branche `dev`)

Maquette validee par Serge (« ok go »), puis codee. Repond au probleme de depart :
**une colonne vide voulait dire deux choses opposees** — la personne est en conge, ou on a
oublie de la placer. Le planning ne faisait pas la difference.

### Ou elles s'affichent

Une bande dediee, **sous l'en-tete du jour et au-dessus de la premiere heure**. Une absence n'a
ni debut ni fin : la poser dans la grille horaire lui inventerait une plage. Des hachures la
distinguent d'un shift plein avant meme qu'on lise l'etiquette. Plusieurs absences le meme jour
s'empilent. La bande n'existe que s'il y a quelque chose a montrer.

Un **jour ferie** n'est pas l'absence d'une personne mais un etat du jour : il teinte la colonne
entiere et vit dans `holidays`, pas dans la liste des absences.

### Trois motifs, aucun rouge (R5.2)

| Motif | Couleur | Pourquoi |
|---|---|---|
| Conges payes | bleu | Prevu de longue date. Une information, pas une alerte. |
| Arret maladie | ambre | **Seul motif non prevu**, seul qui oblige a recomposer un service. |
| Repos | gris | Present pour lever le doute, discret pour ne pas encombrer. |

Un conge n'est pas un incident : une interface qui crie pour une information normale finit
ignoree quand elle crie pour de vrai.

### Weekly Stats : un zero cesse d'etre ambigu

Une personne absente affiche son motif (« Conges payes · toute la semaine ») **a la place** de
la barre vide. La barre ne disait rien ; le motif repond a la question.

### Saisie

Bouton dedie a cote de « Add Shift ». Le formulaire prend **plusieurs jours d'un coup** — des
conges ne durent pas un jour. Une personne ne peut pas etre deux fois absente le meme jour :
saisir un nouveau motif remplace l'ancien au lieu d'empiler deux lignes contradictoires. Les
absences deja saisies se suppriment depuis la liste, ou en touchant la puce dans le calendrier.

### Trois choses qu'il a fallu reparer en chemin

1. **La sauvegarde aurait efface les absences.** Firestore remplace le document entier :
   `saveShiftsToFirebase` ecrivait `{shifts, updatedAt}` et aurait supprime les absences a chaque
   deplacement de shift. Devenu `saveWeekToFirebase`, qui ecrit la semaine entiere en une
   transaction — la detection de conflit entre admins reste intacte.
2. **Annuler aurait laisse un etat que personne n'a valide.** L'historique ne portait que les
   shifts : annuler apres avoir saisi une absence aurait remis les anciens shifts en gardant
   l'absence. Il porte desormais la semaine entiere.
3. **L'export PNG rognait la derniere heure.** La hauteur du conteneur etait une somme ecrite en
   dur ; la bande s'intercalait sans y etre comptee — **50px de debordement** avec deux absences
   le meme jour, mesures au navigateur. Passe en `minHeight`, chaque morceau portant deja sa
   hauteur. Une semaine sans absence garde exactement son allure d'avant (914px, verifie).

### Un defaut pre-existant corrige au passage

Sur telephone, la barre laterale est un tiroir en `z-[110]` et les fenetres modales etaient en
dessous : **« Add Shift » et « Manage Staff » ouvraient leur fenetre DERRIERE le tiroir**, hors
d'atteinte. Le tiroir se referme maintenant des qu'on choisit une action — les quatre fenetres
sont reparees d'un coup.

### Regles Firestore

`absences` et `holidays` sont **optionnels** : les ~38 semaines ecrites avant leur existence, et
toute restauration depuis une vieille sauvegarde, restent acceptees. Un motif inconnu, un jour
hors 0-6, une absence sans `staffId` ou plus de 7 feries sont refuses.

**24 tests passent dans l'emulateur**, dont 8 nouveaux. ⚠️ **Les regles ne sont PAS encore
deployees** — a faire avant de fusionner dans `master`, sinon les absences seront refusees en
production.

### Verification

Parcours complet joue au navigateur sur 390px et 1440px : ouverture, saisie multi-jours,
suppression, ferie, affichage de la bande, puce dans Weekly Stats. Aucune erreur JavaScript,
aucun debordement horizontal, aucun bouton sous 44px. **Aucune ecriture sur la base de
production** : le mode bac a sable ecrit dans le navigateur.

### Points laisses ouverts (les 4 questions de la maquette)

Tranches par defaut, en gardant les portes ouvertes :

1. **Trois motifs**, pas plus — chaque motif en plus est une couleur a retenir.
2. **Demi-journees** : le champ `half` existe dans le modele mais l'interface ne le propose pas.
   Pas de migration de donnees le jour ou on en voudra.
3. **Admins seulement**, comme pour les shifts. Ouvrir a l'equipe demanderait de changer les regles.
4. **Le repos est saisissable mais pas obligatoire.**

`types.ts`, `services/firebaseService.ts`, `App.tsx`, `components/Calendar.tsx`,
`components/Sidebar.tsx`, `components/AbsenceModal.tsx` (nouveau), `utils/translations.ts`,
`firestore.rules`, `scripts/test-rules.mjs`

---

## 2026-09-06 — Le badge « Ghost » dit maintenant POURQUOI

**Demande de Serge** apres avoir vu un badge « ⚠ Ghost » sur un shift d'Omar sans pouvoir en
deviner la raison. L'app connaissait pourtant la raison exacte : elle ne l'affichait pas.

### Avant / apres

| | |
|---|---|
| avant | `⚠ Ghost` |
| apres (fr) | `⚠ Parti le 3 sept 26` |
| apres (en) | `⚠ Left Sep 3, 26` |
| cas symetrique | `⚠ Arrivée le 15 sept 26` |

Un shift peut sortir de la periode d'emploi **des deux cotes** : avant l'arrivee ou apres le
depart. Les deux cas sont desormais distingues et dates.

### Une seule source de verite

`getOrphanReason(staff, isoDate)` renvoie la **raison** (`before-start` / `after-end` + la date)
plutot qu'un booleen. `isStaffActiveOnDate` est redefini a partir d'elle, pour que le test
« cette personne est-elle active » et le texte du badge ne puissent pas diverger.

Ajout de `formatShortDate` : « 3 sept 26 » / « Sep 3, 26 ». Le mois et l'annee sont toujours
presents — un numero de jour seul ne dit rien. Le jour de la semaine est omis faute de place
dans un badge de cette taille.

### Tenue dans l'espace disponible

Le libelle complet est plus large qu'une colonne de jour de 134px. Le badge occupe donc toute
la largeur de la carte et se replie sur deux lignes. Sous ~104px de large — une sous-colonne
quand plusieurs shifts se chevauchent — seul le pictogramme reste, l'explication passant par
l'infobulle. Verifie sur cinq cas : 134px fr, 134px en, cas « pas encore arrive », 44px, et la
largeur telephone. Aucun debordement hors du cas 44px, ou rien de textuel ne tient.

`utils/helpers.ts`, `utils/translations.ts`, `components/ShiftCard.tsx`, `components/Calendar.tsx`

### Ce n'etait PAS une incoherence — tranche par Serge le meme jour

Omar et Harshil ont bien une date de sortie au **2026-09-03** et des shifts posés apres, mais
c'est **normal** : ils sont sortis des effectifs et prennent encore **quelques shifts en extra**.

> « ne supprime pas et ne change rien […] leur date de sortie a expire. Cela dit, ils prennent
> encore quelques shifts en tant qu'extra, donc il n'y a rien a faire sur le sujet. »

**Rien n'a ete modifie dans la base, et il n'y a rien a y modifier.**

Ce que ca implique pour la suite :

- Le badge se declenche sur une situation **recurrente et legitime**. Il informe (« cette
  personne n'est plus dans l'effectif regulier »), il n'alerte pas. A surveiller : s'il devient
  du bruit visuel, le ton ambre sera a revoir (R5.3).
- Un futur **compteur mensuel** ou **export de paie** ne doit pas exclure quelqu'un au motif que
  sa date de sortie est passee : ses heures d'extra comptent.
- Idem pour l'idee, notee au plan, de « nettoyer les shifts futurs a la saisie d'une sortie » :
  elle devra **proposer**, jamais supprimer d'office.

---

## 2026-09-06 — Correctif : sur telephone, toute semaine autre que la courante etait vide

**Trouve par Serge en testant la preview sur son iPhone** : les shifts de la semaine
precedente et de la suivante n'apparaissaient pas. Bug **anterieur au lot 0**, introduit par
`5f379fd` (« Fix Sunday highlight and Jump to Today on wrong week »).

### Cause

```js
if (todayIndex !== -1) setActiveDayIndex(todayIndex);
else                   setActiveDayIndex(-1);   // <- ici
```

Le `-1` voulait dire « aucun jour a mettre en avant » quand la semaine affichee ne contient pas
aujourd'hui. Mais sur telephone une seule colonne est rendue, celle dont l'index vaut
`activeDayIndex` : a `-1`, **aucune colonne ne correspondait**. Les shifts etaient bien charges
depuis Firestore, il n'y avait simplement aucune colonne pour les accueillir.

Invisible sur ordinateur, ou les 7 colonnes s'affichent de toute facon — d'ou le fait que ca
n'ait jamais ete vu.

### Correctif

Retour au lundi (`index 0`) quand la semaine ne contient pas aujourd'hui. Le lundi est alors
marque comme jour affiche, et les autres jours restent accessibles d'un tap.

### Verification

Compte des colonnes visibles, mesure au navigateur :

| | avant | apres |
|---|---|---|
| Telephone, semaine courante | 1 | 1 |
| Telephone, semaine -1 | **0** | **1** |
| Telephone, semaine -2 | **0** | **1** |
| Bureau, semaine -1 | 7 | 7 |

`components/Calendar.tsx`

---

## 2026-09-06 — Lot 0 : fondations typographiques et tactiles (branche `dev`)

Premier lot du chantier UX. **Aucune fonctionnalite ajoutee** : on remet d'aplomb les
fondations sur lesquelles vont se poser les absences, le compteur mensuel et la vue
personnelle de l'equipe. Fait sur `dev`, visible sur
https://sergemio.github.io/shiftmaster-pro/preview/

### 1. L'app chargeait DEUX Tailwind (cause racine)

`index.html` chargeait `cdn.tailwindcss.com` — la version **3**, generee dans le navigateur —
en plus de la version **4** compilee par Vite. Le CDN passait apres et gagnait, ce qui
rendait toute redefinition de l'echelle typographique sans effet.

Retire, avec l'`importmap` React vers esm.sh qui l'accompagnait (verifie : aucune trace
d'`esm.sh` dans le bundle, React etait deja empaquete). Verifie aussi qu'aucune classe n'est
assemblee dynamiquement dans le code — le compilateur les voit donc toutes.

**Effet de bord traite** : en v4 une bordure sans couleur vaut `currentColor`, la ou la v3
donnait gris 200. 111 bordures du code sont dans ce cas, dont toute la grille du calendrier,
qui est passee au quasi-noir. Couche de compatibilite ajoutee dans `index.css`.

### 2. Echelle typographique fermee (R4.4 / R4.6 / R4.7)

11 tailles distinctes cohabitaient, dont 77 ecrites en dur (`text-[8px]` a `text-[20px]`).
Pire, le motif dominant etait `text-[8px] md:text-[10px]` : **le texte etait plus petit sur
telephone que sur ordinateur**, l'inverse de ce qu'il faut.

Mesure avant correction, sur un telephone de 390px : **25 elements rendus en 8px**.

Les 6 noms Tailwind sont redefinis dans `@theme`, et les 77 valeurs en dur remplacees par ces
noms. Une paire responsive s'effondre sur le cran du plus grand des deux.

| | souris | doigt |
|---|---|---|
| meta, badges | 12 | 13 |
| secondaire | 14 | 15 |
| texte courant | 16 | 17 |
| H3 | 18 | 19 |
| H2 | 20 | 22 |
| H1 | 24 | 26 |

Le basculement se fait par `@media (pointer: coarse)` sur les variables : **un seul endroit**
pour toute l'app. Seule taille hors echelle, assumee et documentee : le titre de l'ecran de
connexion (`--text-display`), qui suit desormais la largeur de l'ecran.

### 3. Plancher tactile de 44px (R7.5)

10 boutons sur 23 mesuraient entre 28 et 40px de haut sur telephone. Regle posee une fois dans
`index.css` sous `pointer: coarse`, plutot que classe par classe — un bouton ajoute demain en
herite. Les cartes de shift sont des `div`, leur hauteur reste proportionnelle a la duree.

Sur ordinateur a la souris, rien ne change : R7.5 vise le tactile.

### 4. Trois debordements provoques par le texte plus grand

Corriges apres mesure, pas au jugé :

- **Noms de jours** : « Wednesday » a 13px mordait sur ses voisins. Version courte
  (`Mon`/`Lun`) sur telephone, nom complet des qu'il y a la place.
- **Gouttiere des heures** : 40px ne contenait plus « 08:00 », coupe a gauche. Passee a 54px.
- **Badge de remplacement** : « COVERED BY: ABDELRAHMAN » coupait le prenom en plein milieu
  d'un mot. Passe sur deux lignes, nom tronque proprement.

### 5. Cartes de shift etroites (requete de conteneur)

Trois shifts simultanes se partagent une colonne de 134px, soit ~40px chacun — c'est le cas
d'un samedi, et **c'est ce que montre l'export PNG hebdomadaire**. A 13px l'horaire s'y
repliait sur trois lignes tronquees.

La carte devient un conteneur de requete : sous 104px de large elle masque l'horaire et garde
le nom et la duree (`5H`), qui portent l'information utile. Le choix depend de la largeur de
**la carte**, pas de celle de l'ecran.

**Limite connue, non traitee** : a 40px de large un nom reste illisible (« T… »). C'est une
contrainte de la vue jour, pas une regression ; la vue employe existe pour ce cas. A rouvrir
dans un lot ulterieur.

### 6. Jour actif hors champ sur telephone

La bande de jours defile horizontalement et n'en montre que cinq ou six. Un dimanche etait
donc selectionne sans etre visible : on regardait une colonne sans savoir laquelle. Elle se
recentre maintenant sur le jour actif a chaque changement de jour ou de semaine.

### Verification

Banc d'essai Playwright, trois gabarits (390 / 820 / 1440), mesures et non estimations.
Le banc de rendu des cartes etait temporaire et a ete supprime.

| | avant | apres |
|---|---|---|
| Boutons sous 44px (telephone) | 10 / 23 | **0** |
| Boutons sous 44px (tablette) | 9 / 22 | **0** |
| Plus petit texte (telephone) | 8px | **13px** |
| Tailles distinctes | 11 | **6 + 1 display** |
| Debordement horizontal | 0 | 0 |

⚠️ **Non verifie** : le rendu avec des shifts reels. Le mode « Developer Sandbox » n'est pas
authentifie, donc les regles Firestore refusent la lecture des semaines — l'app s'ouvre sur une
grille vide. Les cartes ont ete verifiees isolement sur donnees fabriquees. **Aucune ecriture
n'a ete faite sur la base.**

### Ce qui change a l'oeil pour l'equipe

Le texte est plus grand partout, nettement sur telephone. L'export PNG hebdomadaire sortira
donc avec un texte plus lisible qu'avant. C'est le seul changement d'apparence : aucune couleur,
aucun espacement, aucune mise en page n'a ete retouche.

### Fichiers

`index.css`, `index.html`, `constants.ts`, `App.tsx`, `components/Calendar.tsx`,
`components/ShiftCard.tsx`, `components/EmployeeView.tsx`, `components/LogHistoryModal.tsx`,
`components/SettingsModal.tsx`, `components/Sidebar.tsx`, `components/StaffModal.tsx`

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
