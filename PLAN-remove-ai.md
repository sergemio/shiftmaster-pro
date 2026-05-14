# Plan : Retrait des features AI/Gemini

## Objectif
Supprimer toutes les features qui utilisent Google Gemini. Garder le reste intact (navigation semaines/mois, CRUD shifts, gestion staff, export data, logs, drag & drop).

## Features a supprimer

| Feature | Description | Declenchee depuis |
|---|---|---|
| **AI Report** | Genere un rapport mensuel des heures via Gemini | Bouton `✨ AI` → menu → "Generate Report" |
| **Auto Schedule** | Genere automatiquement les shifts d'une semaine via Gemini | Bouton `✨ AI` → menu → "Auto Schedule" |
| **Ask AI** | Chat libre sur les donnees du planning | Bouton dans Sidebar (?) |

Au total : **~803 lignes de code AI** + dependance `@google/genai`.

## Fichiers a SUPPRIMER (purement et simplement)

| Fichier | Lignes |
|---|---:|
| `services/geminiService.ts` | 147 |
| `components/AiReportModal.tsx` | 116 |
| `components/AskAiModal.tsx` | 145 |
| `components/AutoScheduleModal.tsx` | 245 |
| **Total** | **653** |

## Fichiers a MODIFIER

### `App.tsx` (le plus de boulot)
A retirer :
- Imports lignes 11, 12, 15, 18 (AiReportModal, AskAiModal, AutoScheduleModal, geminiService)
- States : `isAiReportModalOpen`, `isAskAiModalOpen`, `isAiMenuOpen`, `isAutoScheduleModalOpen`, `aiInsight`, `aiRequestActive`, `isMonthlyAiLoading`, `reportLabel`
- Handlers : `stopAiGeneration`, `handleAutoSchedule`, `handleMonthlyReport` (et tout le bloc lignes 442-503), `setAiInsight` calls
- JSX : bouton AI rond avec menu deroulant (lignes ~720-748), overlay loading monthly AI (lignes 614-625), les 3 `<AiReportModal>`, `<AskAiModal>`, `<AutoScheduleModal>` (lignes ~810-812), props `aiInsight`/`onViewAiReport` passees a Sidebar

### `components/Sidebar.tsx`
- Retirer props et boutons `onAskAi`, `onViewAiReport`, `aiInsight` (a verifier dans le fichier)

### `utils/translations.ts`
- Retirer cles : `aiReport`, `askAi`, `autoSchedule`, etc. (clean up textes inutilises)

### `package.json`
- Retirer dependance `@google/genai`

### `vite.config.ts`
- Retirer `process.env.API_KEY` et `process.env.GEMINI_API_KEY` (defines)

### `.env.local`
- Retirer `GEMINI_API_KEY` (deja placeholder de toute facon)

### `index.html`
- Retirer eventuelle reference (a verifier)

## Ordre d'execution propose

1. **Couper les references dans App.tsx** d'abord : retirer JSX + handlers + states. A ce moment, le code references encore les fichiers `AiReportModal` etc dans les imports.
2. **Retirer les imports** d'App.tsx (les fichiers existent encore mais ne sont plus utilises).
3. **Retirer les references dans Sidebar.tsx**.
4. **Compiler/tester** : `npm run lint` (tsc --noEmit). A ce stade, plus aucun fichier ne reference geminiService ou les modals AI.
5. **Supprimer les 4 fichiers** : services/geminiService.ts + 3 modals.
6. **Nettoyer translations.ts** des cles AI inutilisees.
7. **Retirer la dep** `@google/genai` : `npm uninstall @google/genai`.
8. **Nettoyer vite.config.ts** et `.env.local`.
9. **Test final** : `npm run dev` → verifier sur localhost que toute l'app marche encore (navigation, shifts CRUD, staff, export, logs, drag&drop).

## Risques et mitigations

- **Risque** : casser un import en cascade → boucle de compile errors. **Mitigation** : faire les modifs dans l'ordre ci-dessus, et tester avec `tsc --noEmit` apres chaque etape majeure.
- **Risque** : un component utilise un type ou helper qui vient de geminiService. **Mitigation** : audit avant suppression — pour l'instant le seul export utilise dans App.tsx c'est `getScheduleInsights, interrogateData, generateAutoSchedule`. Tous lies aux 3 features qu'on supprime.
- **Risque** : casser le live → rappel : on est sur la **branche `dev`**. La live (`master`) ne bouge pas. Si tout casse : `git reset --hard origin/dev` ou checkout fresh dev branch.

## Rollback

```
git checkout dev
git reset --hard origin/dev   # revient au dernier push
# ou pour repartir de la prod :
git reset --hard origin/master
```

## Test final (checklist)

- [ ] L'app demarre sur localhost
- [ ] Login Google fonctionne
- [ ] Le calendrier affiche les shifts
- [ ] Naviguer semaine precedente/suivante OK
- [ ] Ajouter un shift OK
- [ ] Modifier un shift (drag & drop) OK
- [ ] Supprimer un shift OK
- [ ] Manage Staff OK
- [ ] Export Data OK
- [ ] Settings OK
- [ ] Log History OK
- [ ] Plus aucun bouton ✨ AI visible
- [ ] Plus de mention d'AI dans la sidebar
- [ ] `npm run build` reussit sans erreur
- [ ] Aucune erreur dans la console navigateur
