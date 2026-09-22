# Audit des calculs — heures, coûts, paie, congés, alertes légales
> Last update: 2026-09-22

Objectif : recenser tout ce qui entre dans un calcul, chaque endroit où l'app calcule, l'écart avec la règle comptable ou légale, puis proposer **un système de calcul unique**. Aucun code n'est modifié par ce document.

Méthode : lecture du code (`utils/`, `App.tsx`, `components/`), 12 scénarios exécutés contre le vrai moteur (`scratchpad/scenarios.mjs`), 1 vérification dans l'interface.

---

## 0. Décisions de Serge (22/09/2026)

1. Deux shifts qui se chevauchent : les heures communes comptent **une fois**, partout ; le signalement rouge reste.
2. Un shift peut finir **jusqu'à 6 h du matin**, rattaché au jour où il commence.
3. Les heures d'ouverture ne limitent plus la saisie : un shift peut déborder l'ouverture.
4. Repos hebdomadaire : une semaine voisine vide ou non planifiée **compte comme du repos**.
5. Trois alertes ajoutées, informatives : 48 h/semaine, pause 20 min dès 6 h continues (une coupure vaut pause), remplaçant qui chevauche son propre shift.
5 bis. Un shift peut contenir une **pause** (début + durée), glissable par le manager ; la pause est **déduite** des heures travaillées, de la paie et du coût.
6. Contrat mensuel : **une décimale à l'écran**, deux décimales dans l'export de paie.
7. Jeu de vérité : réponses calculées par Claude, contre-vérifiées par des agents indépendants, relues et validées par Serge.
8. Moyenne de 44 h sur 12 semaines (46 h en HCR) : **non codée**, jugée trop rare (Serge, 22/09/2026). Amplitude journalière : non codée, aucune source officielle trouvée.

---

## 1. Les entrées (ce qui alimente les calculs)

| Donnée | Où elle est saisie | Unité / contrainte | Remarque |
|---|---|---|---|
| Shift : personne, jour, début, fin | Formulaire Shift, glisser-déposer | Demi-heure, **fin ≤ minuit**, **bornes = heures d'ouverture** | Un service qui finit à 1 h du matin est **impossible à saisir** (contournement 18-24 + 0-1 → fausse alerte repos). |
| Shift couvert (`coverageBy`) | Fiche du shift | Remplaçant = celui qui fait les heures | Deux écrans ne le lisent pas pareil (§ 2.B). |
| Extra (`extraName`, taux propre ou taux par défaut) | Formulaire Shift, fiche extra, Réglages | €/h, absent = inconnu (jamais 0) | Exclu des règles légales et du contrat. |
| Contrat hebdo + avenants datés | Fiche équipe | h/semaine, à une date | Lu au **lundi** de la semaine, partout. Cohérent. |
| Jours travaillés par semaine | Fiche équipe | 1 à 6, défaut 5 | Ne sert qu'à estimer les heures d'une absence sur semaine non planifiée. |
| Dates d'entrée / sortie | Fiche équipe | ISO | Tolérance 21 jours après sortie. |
| Absence : motif, du/au, demi-journée, heures perdues (proposées puis modifiables), jour par jour | Formulaire Absence | Heures figées à l'enregistrement | Demi-journée seulement si l'absence tient sur **un** jour. |
| Solde de congés lu sur bulletin (ancre) | Écran congés | Jours, à une date | Le compteur repart de là. |
| Convention (1501, 1979, aucune) | Réglages | Seuils : repos 11 h, repos hebdo 35 h, journée 10 h ou 11 h, 6 jours | Une seule table, chiffres datés. Bien. |
| Unité de décompte des congés | Réglages | Ouvrables (lun-sam) ou ouvrés (lun-ven) | |
| Fériés fermés, fermetures décidées | Réglages | Dates | Fermeture : aucun effet sur les congés (choix documenté). |
| Heures d'ouverture | Réglages | Demi-heure, 0-24 | **Limite aussi les shifts** (voir ligne 1). |
| Taux horaires | Réglages (admins) | €/h | |
| Fuseau | Réglages | Europe/Paris | Le moteur de règles calcule **en UTC** : le changement d'heure (25/10, 29/03) fausse le repos d'une heure ces deux nuits. |

---

## 2. Les grandeurs calculées et leurs définitions concurrentes

### A. « Combien d'heures cette personne a-t-elle travaillé ? » — **8 définitions**

| Écran / usage | Formule | Chevauchement de deux shifts | Fichier |
|---|---|---|---|
| Alertes légales (journée) | **union des plages** | ✅ compté une fois (corrigé le 22/09) | `utils/laborRules.ts` |
| Barre latérale, semaine | somme des durées | ❌ compté deux fois | `components/Sidebar.tsx` `getStats` |
| Barre latérale, mois | somme des durées | ❌ | `App.tsx` totaux du mois |
| Vue employé (tableau) | somme des durées | ❌ | `components/EmployeeView.tsx` |
| Ma semaine (téléphone) | somme des durées | ❌ | `components/MyWeekView.tsx` |
| Paie (heures travaillées, heures sup) | somme des durées | ❌ → **heures sup fictives** (scénario : 3 h sup pour 35 h réelles) | `utils/payroll.ts` |
| Coût de la semaine / du mois | somme × taux | ❌ → 180 € facturés pour 105 € réels (7 h à 15 €) | `utils/helpers.ts` `shiftCost` |
| Heures perdues d'une absence (base) | somme des durées | ❌ | `App.tsx` l. 1604 |

Un chevauchement est **signalé** sur la carte (rouge) mais **compté** partout sauf dans les alertes. Un utilisateur qui laisse le doublon une semaine a une paie fausse.

### B. « À qui vont les heures d'un shift couvert ? » — **3 comportements**

| Écran | Le shift compte pour… |
|---|---|
| Paie, mois, alertes, couverture du service, coût | le **remplaçant** ✅ |
| Barre latérale, semaine | le remplaçant (« extra ») **et** la personne absente (« leave »), séparés — affiché comme total du remplaçant ✅ |
| **Vue employé** | la **personne absente** ❌ (filtre sur `staffId` seul) |

### C. Contrat mensuel — **2 arrondis**

Base légale 35 h × 52 / 12 = **151,67 h**. La paie l'écrit 151,67 ; la barre latérale et Ma semaine affichent **152** (arrondi à l'entier avant soustraction des absences). Écart 0,33 h/mois visible par le salarié.

### D. Attendu (contrat − absences) — **2 copies du même calcul**

`Sidebar.tsx` et `MyWeekView.tsx` recopient chacun `max(0, arrondi(contrat − heures d'absence, 0,1))`. Même formule aujourd'hui ; rien ne garantit qu'elle le reste.

### E. Heures d'une absence — **2 bases selon l'état du planning**

- Semaine déjà planifiée : heures des shifts tombant sur les jours d'absence (somme, donc § A).
- Semaine non planifiée : contrat ÷ jours travaillés, par jour ouvrable, plafonné.
- Ancienne étiquette sans heures : estimation au contrat.

Règle correcte (heures réelles, sinon estimation), mais la première base hérite du double comptage.

### F. Heures supplémentaires / complémentaires (paie)

Par semaine civile lundi-dimanche, rattachée au mois de son dimanche, sur les heures **sommées** (§ A). Seuils temps partiel (dixième, 35 h atteintes) corrects. Absences non assimilées à du travail effectif : conforme (L3121-28).

### G. Congés payés

Décompte ouvrables/ouvrés, fériés fermés exclus, dimanche exclu, demi-journée : conforme. Acquisition 2,5 j/mois au prorata des jours, maladie non pro à 0,8, sans solde à 0 : conforme (loi du 22/04/2024). Solde = ancre + acquis − pris. **Aucun écart trouvé.**

### H. Coût

Durée × taux ; `null` (jamais 0) si taux inconnu ; extras au taux propre puis au taux par défaut. Hérite du double comptage § A. Sinon correct.

---

## 3. Alertes légales — état règle par règle

| Règle | Source | État | Constat |
|---|---|---|---|
| Repos quotidien 11 h | L3131-1 | ✅ | Mesuré depuis la fin la plus tardive. Faux positif uniquement via le contournement « après minuit » (§ 1) et le changement d'heure. |
| Repos hebdomadaire 35 h | L3132-2 | ❌ **faux positif fréquent** | Lun-sam 9-15, dimanche libre, semaine suivante vide → « 33 h de repos ». Le bord de la fenêtre (lundi 0 h) est pris pour une reprise. Un même planning est jugé différemment selon les semaines chargées. |
| Journée max 10 h / 11 h (HCR) | L3121-18, IDCC | ✅ | Union des plages. HCR : seuil unique 11 h alors que la convention distingue 11 h / 11 h 30 / 12 h par poste (choix documenté : le plus protecteur). |
| 6 jours consécutifs max | L3132-1 | ✅ | Série coupée par un jour sans shift. |
| **48 h / semaine max** | L3121-20 | ❌ **absente** | 60 h en 6 jours : aucune alerte. |
| **44 h en moyenne sur 12 semaines** | L3121-22 | ❌ absente | |
| **Pause 20 min dès 6 h** | L3121-16 | ❌ absente | L'app n'a pas de notion de pause ; 9-19 d'affilée passe. À décider : une coupure vaut pause, un shift continu > 6 h alerte. |
| Amplitude journalière | Convention (HCR : à sourcer) | ❌ absente | 8-12 + 20-24 = 16 h d'amplitude sans alerte. Seuil à vérifier dans l'IDCC avant de coder. |
| Travail de nuit, mineurs | L3122, L3162 | hors périmètre | À noter dans le produit comme non couvert. |
| Chevauchement remplaçant / propre shift | (saisie) | ❌ | Alice 10-16 + couvre Bob 14-20 : non signalé (détection sur `staffId`, pas sur `coverageBy`). |

---

## 4. Ce que les tests garantissent aujourd'hui

- **3 fichiers sur 18** de tests unitaires importent le vrai code (`test-payroll`, `test-extra-rates`, `test-labor-rules-overlap`). **Les 15 autres testent une copie** de la formule collée dans le test : ils passent quoi que fasse l'app.
- 21 suites navigateur (344 contrôles) vérifient l'interface, pas la vérité arithmétique d'un planning.
- Aucun test ne pose la question « ce planning donne-t-il le **même** chiffre sur tous les écrans ? ».

---

## 5. Proposition : un seul système de calcul

### Principe
Une grandeur = **une fonction**, dans un module de calcul pur, sans React ni Firestore. Tous les écrans, la paie, le coût et les alertes **lisent** ce module ; aucun ne recalcule.

### Le module (`utils/compute/`)
1. **Présence** : shifts → par personne (remplaçant si couvert) et par date, la **liste des plages fusionnées**. C'est la seule fonction qui lit `start`/`end`. Heures d'un jour = longueur de l'union.
2. **Agrégats** : heures par semaine, par mois, par période — sommes de la présence, jamais des shifts.
3. **Contrat et attendu** : contrat à une date, base mensuelle 52/12 non arrondie, attendu = contrat − heures d'absence (une seule fonction, utilisée par la barre latérale, Ma semaine, la paie).
4. **Règles légales** : prennent la présence (plages fusionnées, datées, en heure locale Europe/Paris). Repos hebdo recalculé sur les données **réellement chargées** (semaines voisines), l'inconnu vaut repos : plus de faux positif de bord. Ajout : 48 h/semaine, pause 20 min, amplitude (une fois le seuil sourcé), chevauchement remplaçant.
5. **Coût et paie** : présence × taux ; heures sup depuis les agrégats.
6. **Arrondi** : stockage exact, arrondi **uniquement à l'affichage** (2 décimales pour la paie, 1 pour les écrans), même règle partout.
7. **Saisie** : fin de shift autorisée jusqu'à 6 h du matin (shift qui traverse minuit rattaché au jour de début, comme la convention HCR), bornes de saisie indépendantes des heures d'ouverture.

### Le jeu de vérité
- Un dossier de **plannings réels en JSON** avec, pour chacun, les résultats attendus **calculés à la main** (heures par écran, coût, heures sup, alertes). Les 12 scénarios d'aujourd'hui en sont le départ ; Serge ou le comptable valident les valeurs attendues une fois.
- Un test qui importe le **vrai** module (esbuild) et compare ; il tourne avant chaque commit.
- Un test d'**invariant** : pour tout planning, barre latérale = vue employé = Ma semaine = paie.
- Les 15 tests-copies sont remplacés par des imports du vrai code.

### Ordre des chantiers
1. Module présence + branchement des 8 sites + jeu de vérité (corrige § 2.A, B, C, D, E, H d'un coup). **Fait le 22/09/2026** (`utils/worktime.ts`, `scripts/test-verite.mjs`, pause, fin après minuit ; voir CHANGELOG), non commité.
2. Repos hebdomadaire (§ 3, ligne 2). **Fait le 22/09/2026**, avec les règles du point 3 ci-dessous sauf amplitude.
3. Règles absentes : 48 h, pause, chevauchement remplaçant ; changement d'heure ; shifts après minuit.
4. Amplitude, après sourçage de l'IDCC 1979.

### Non vérifié
- Seuil d'amplitude HCR : je n'ai pas pu le vérifier en ligne.
- `MyWeekView` : je n'ai pas vérifié si `byDay` inclut les shifts couverts par la personne.
