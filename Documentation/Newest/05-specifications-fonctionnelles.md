# 05 — Spécifications fonctionnelles détaillées

Ce document spécifie chaque zone fonctionnelle et chaque composant clé. C'est le guide d'implémentation le plus précis.

## 1. Zone : Entrée workspace → module

### 1.1. Bouton *Analyser juridiquement* dans l'accueil workspace

**Emplacement** : ligne des boutons d'amorçage, à côté de *Rédiger un canvas*, *Générer une checklist*, *Démarrer un workflow*. Pill rounded, icône balance/document légal.

**Au clic** → dialog modal avec :
- Sélection des documents du workspace (cases à cocher + filtre)
- Zone de dépôt pour nouveaux documents
- Les 4 cartes d'amorçage
- Validation → création analyse + redirection, indexation 2 en arrière-plan

### 1.2. Action *Extract legal clauses* dans le doc viewer

**Emplacement** : barre d'actions du doc viewer, cohérent avec les actions existantes. Bouton + icône balance.

**Au clic** :
- Si pas d'analyse pour ce doc : création analyse *"Analyse - [doc]"* + lancement indexation 2 + bandeau de progression non bloquant + notification *"Ouvrir dans Legal Extraction ?"*
- Si analyse(s) existante(s) : menu déroulant *Créer une nouvelle / Ajouter à [analyse]*

### 1.3. Statut d'extraction dans la liste des documents

Colonne discrète *Legal Extraction* :
- Aucun icône : jamais extrait
- ⚖ plein : extrait
- ⚖ avec pulse : en cours
- ⚖ avec ⚠ : échec

Tooltip au survol avec détails.

## 2. Zone : Conversation (colonne gauche)

### 2.1. Composant `ConversationPanelComponent`

**État** (signals) :
- `messages` : historique
- `currentInput` : saisie en cours
- `isAssistantTyping` : indicateur
- `suggestedPrompts` : suggestions contextuelles

### 2.2. Affichage des messages

**Messages utilisateur** : alignés droite, bulle primary claire, avatar, horodatage.

**Messages assistant** : alignés gauche, bulle neutre, icône module. Contenu formaté (markdown simple). Chips de citation inline pour affirmations sourcées. Cartes de livrables en pied de message si l'opération a produit des livrables.

Exemple de carte de livrable dans un message :
```
┌──────────────────┐
│ 📝 Note compar.  │
│ Version 1        │
│ Il y a 2s        │
│ [Voir →]         │
└──────────────────┘
```

**Chips de citation** : clic → ouvre panneau citation ; survol → tooltip avec extrait.

### 2.3. Champ de saisie

- Textarea auto-grow (1-6 lignes max)
- Bouton envoyer (avion papier)
- Suggestions au-dessus : *"Explique ce point"*, *"Propose une reformulation"*, etc.
- Raccourcis : `Enter` envoyer, `Shift+Enter` nouvelle ligne, `Esc` annuler

### 2.4. Flux d'envoi

1. Message user apparaît immédiatement
2. `POST /api/analyses/:id/messages`
3. Backend : NLU → interprétation intention → opération lancée
4. Indicateur *"assistant écrit..."*
5. Message assistant arrive (avec cartes livrables si applicable)
6. Bascule automatique vers l'onglet du livrable principal produit

### 2.5. Clarification en cas d'ambiguïté

Si `clarificationNeeded` non-null, l'assistant répond en demandant précision avec suggestions cliquables :

> *"À quel document comparer ce NDA ? Plusieurs standards dispos dans la base :"*
> - NDA mutuel standard FR (v2)
> - NDA unilatéral entrant (v1)
> - Ou *parcourir un document du workspace*

### 2.6. Scroll et focus

- Scroll auto bas à l'arrivée d'un message
- Bouton *Aller en bas* si user a remonté
- Focus auto sur champ de saisie à l'ouverture de l'analyse

## 3. Zone : Vue objet juridique (onglet document)

### 3.1. Composant `LegalObjectViewComponent`

**État** :
- `legalObject` : objet complet
- `selectedClauseId` : focus
- `filterMode` : `all` | `uncertain` | `modified`
- `editingClauseId`

### 3.2. Panneau structure (gauche 50%)

Sections repliables : **Métadonnées / Clauses / Termes définis / Renvois**.

**Liste des clauses** : ordonnée, numéro + titre + type + badges (confiance, modifié, ajouté manuel). Clic → développement.

**Clause développée** affiche :
- Type + numéro
- Texte intégral
- Sous-attributs normalisés (nom : valeur + badge confiance)
- Citation (chip cliquable → citation panel)
- Termes liés, clauses liées
- Actions : `Modifier` / `Fusionner` / `Scinder` / `Supprimer`

**Footer sidebar** : compteur d'incertitudes cliquable (filtre), bouton *+ Ajouter clause*, bouton *Réextraire* (avec confirmation).

### 3.3. Panneau document source (droite 50%)

- pdf.js pour PDF, mammoth pour .docx
- Navigation pages, zoom
- **Surlignage synchronisé** : passage correspondant à la clause active mis en focus
- **Ajout de clause via sélection** : user sélectionne passage → popover *"Ajouter comme clause"* → dialog type + texte → création

### 3.4. Mode édition inline

Déclencheur : bouton *Modifier*.

Champs :
- Type : dropdown ontologie recherchable
- Texte : textarea
- Attributs : selon type (texte, nombre, enum, boolean, date, duration)
- Citation : read-only

Actions : `Enregistrer` (`PATCH /api/legal-objects/:id/clauses/:clauseId`) / `Annuler`.

### 3.5. Filtres et recherche

- Par confiance : Tous / Incertaines / Modifiées
- Recherche textuelle dans titre et texte
- Tri : ordre d'apparition (défaut) / type / confiance

## 4. Zone : Livrables (onglet livrable)

### 4.1. Wrapper commun `DeliverableViewComponent`

En-tête :
- Nom (éditable)
- Sélecteur de version : *Version 3 de 3 ▼*
- Bouton *Exporter* (non fonctionnel, menu *Word / PDF*)
- Menu *...* : `Renommer`, `Dupliquer`, `Archiver`, `Figer version`

Affiche le composant spécifique au type.

### 4.2. Versions

**Dropdown version** :
- Liste : n° + date + auteur + résumé + *Voir*
- Version active mise en évidence
- *Figer cette version* en bas (crée version figée à partir de l'actuelle)
- Sur une version antérieure : *Restaurer* (crée N+1 à partir de celle-ci)

**Création automatique** :
- Une nouvelle version par demande de modif via conversation
- L'édition CKEditor manuelle ne crée pas de version tant que user ne clique pas *Figer*

### 4.3. Note de revue — `ReviewNoteComponent`

CKEditor plein avec structure pré-remplie :
1. Synthèse exécutive (verdict + top priorités + position recommandée)
2. Caractéristiques du contrat (parties, durée, loi...)
3. Analyse clause par clause (blocs encadrés avec verdicts couleur)
4. Points transverses
5. Annexe citations

**Verdicts** : 🟢 conforme / 🟠 à négocier / 🔴 rouge / ⚪ absent.

**Citations** : chips numérotés cliquables.

### 4.4. Note comparative — `ComparativeNoteComponent`

CKEditor avec :
1. Synthèse (niveau global d'écart, top gaps, reco négociation)
2. **Tableau comparatif** (CKEditor table) : colonnes `Type | Doc A | Doc B | Écart | Commentaire`
3. Clauses unilatérales (présentes d'un seul côté)
4. Recommandations point par point
5. Annexe citations

### 4.5. Tableau DD — `DdTableComponent`

**Différent des autres** : vraie grille interactive, pas CKEditor.

- Header : métadonnées DD (périmètre, grille, dates)
- Grille virtualisée : 1 col ID/Nom + N cols questions + col *Annotations user*
- Footer : compteurs vert/orange/rouge/NA

**Cellules** :
- Valeur synthétique + fond couleur risque
- Survol : tooltip texte long
- Clic : drawer détail (citation, confiance, commentaire)

**Actions** : filtres par col (niveau risque, valeur), tri, recherche globale, export CSV (non fonctionnel).

### 4.6. Note de synthèse DD — `DdSynthesisComponent`

Note CKEditor :
- Périmètre DD
- Principaux risques identifiés
- Sections thématiques (CoC, exclusivités...)
- Recommandations
- Lien vers le tableau DD (lien interne onglet)

### 4.7. Redline — `RedlineViewComponent`

**Layout** :
- Header : nom doc cible, N suggestions, *Accepter tout / Rejeter tout*
- Corps : CKEditor avec track-changes (ou simulation)
- Panneau droit : liste commentaires

**Rendu modifications** :
- Insertions : souligné vert
- Suppressions : barré rouge
- Commentaires : bulles à droite (auteur, date, texte)

**Par modification** : `Accepter` / `Rejeter` / `Modifier avant accepter`.

**Panneau droit** : liste synchronisée avec corps, filtres (toutes / en attente / acceptées / rejetées).

**Fallback si plugin track-changes indispo** : spans `.ins` et `.del` colorés + overlays commentaires.

### 4.8. Clausier — `ClausierViewComponent`

CKEditor avec :
- Page de garde (titre, description, source, stats)
- Table des matières auto-générée
- Pour chaque section = type clause :
  - Titre + définition/enjeux
  - Liste variantes (blocs encadrés : label, fréquence, contexte, texte, commentaire)
- Annexe : contrats sources

**En-tête spécifique** : bouton *Publier dans la base de référence*.

## 5. Zone : Onglets (bande supérieure zone droite)

### 5.1. Composant `DeliverableTabsComponent`

**État** : `tabs`, `activeTabId`.

**Types d'onglets** :
```typescript
type ContentTab =
  | { type: 'document'; documentId: string; icon: '📄'; label: string }
  | { type: 'deliverable'; deliverableId: string; icon: DeliverableIcon; label: string }
  | { type: 'entry_screen'; icon: '➕'; label: 'Nouvelle opération' };
```

**Rendu** : onglets alignés scrollables, fond distinctif pour actif, icônes typées, menu `...` si débordement.

**Persistance** : onglet actif dans URL `?tab=...`.

### 5.2. Cycle de vie

**Ouverture auto** : nouveau doc extrait dans l'analyse, nouveau livrable généré.

**Pas de fermeture explicite** en pré-alpha : onglets persistent.

## 6. Zone : Base de référence

### 6.1. `ReferenceBaseViewComponent`

Accueil base : 4 cartes types implémentés (compteur d'actifs) + section *"Bientôt disponible"* (cartes grisées non interactives avec fiches descriptives).

### 6.2. `AssetListComponent`

Liste d'actifs d'un type :
- Header : breadcrumb, titre, *+ Nouveau*
- Filtres : recherche, tri (récents / alpha / plus utilisés)
- Cartes actifs : nom, version, date MAJ, auteur, métadonnées, actions (*Consulter* / *Modifier* / *Historique*)

### 6.3. `AssetDetailComponent`

Header commun : nom, type, version, actions (*Modifier* / *Figer version* / *Historique* / *Archiver*).

**Bloc gouvernance** sous le header : owner, approuveurs, contributeurs (avec avatars/initiales — utilisateur fictif unique en pré-alpha).

**Onglets** :
- *Contenu* — vue par défaut (édition selon type)
- *Amendements proposés* — file d'attente (cf. §6.5) avec badge numérique
- *Historique des versions* — liste des versions figées
- *Analyses qui consomment* — liste des analyses référençant cet actif

Corps onglet *Contenu* selon type :
- **Playbook** : arbre clauses gauche, édition positions (idéale/fallback/red flag) droite
- **Standard** : vue 2 panneaux comme vue objet juridique
- **DD grid** : questions groupées par catégorie, édition réponses attendues + règles risque
- **Clausier** : sections + variantes comme livrable clausier

### 6.4. Import d'actif `AssetImportComponent` (dialog)

Parcours :
1. Upload fichier (.docx / .pdf)
2. Type d'actif
3. Ontologie, langue, juridiction
4. Nom, description
5. Indexation 2 spécifique au type (playbook : sections par clause + positions ; standard : clauses comme contrat ; DD grid : questions ; clausier : types + variantes)
6. Prévisualisation structure extraite, édition possible
7. Validation → actif créé

### 6.5. `AssetAmendmentQueueComponent` (onglet amendements)

Liste des amendements pendants sur l'actif. Pour chaque amendement (cf. interface `AssetAmendment` dans `03-modele-de-donnees.md` §6.5) :

- Auteur, date, lien vers analyse d'origine
- Portée (tag : *Position de fallback / Red flag / Argumentaire / Nouvelle clause*)
- Chemin cible dans l'actif (ex : `clauses.liability_cap.fallback`)
- **Diff visuel** entre `currentValue` et `proposedValue` (rendu côte à côte, surlignage des changements)
- Justification fournie par le contributeur

Trois actions disponibles à l'utilisateur en rôle owner ou approuveur :
- *Accepter* → applique la modification à la version courante de l'actif. Si l'amendement a une portée structurante (`red_flag`, `new_clause`), suggérer de figer une nouvelle version après acceptation
- *Rejeter* → demande un commentaire de rejet
- *Différer* → conserve l'amendement en file avec un commentaire

**État** : pré-alpha, le même utilisateur fictif joue tous les rôles. La file d'attente est matérialisée mais résolue par cet utilisateur.

### 6.6. `AssetAmendmentDialogComponent` (proposition d'amendement)

Dialog déclenché depuis un verdict d'audit dans une analyse, ou depuis un livrable consultable.

Champs (correspond à `AssetAmendment`) :
- *Actif concerné* — pré-rempli, verrouillé
- *Portée* — dropdown (`clause_position` / `fallback` / `red_flag` / `argumentaire` / `new_clause` / `other`)
- *Chemin cible* — pré-rempli depuis le contexte de la confrontation, modifiable
- *Valeur actuelle* — lecture seule, extraite de l'actif courant
- *Valeur proposée* — textarea
- *Justification* — textarea (obligatoire)

Validation → `POST /api/reference-assets/:id/amendments` → toast confirmant + lien direct vers la file d'attente de l'actif.

## 7. Zone : Panneau de citation (drawer)

### 7.1. `CitationPanelComponent`

Drawer droite, ouverture au clic sur citation.

**État** : `visibleCitation: Signal<Citation | null>`.

**Contenu** :
- Titre : nom doc source
- Passage cité surligné + contexte (paragraphes avant/après)
- Bouton *Ouvrir le document* (bascule vue objet juridique)
- Bouton *Fermer*

Width 400-500px, superposition partielle, fermeture : clic dehors / Esc / X.

## 8. Service backend : NLU

### 8.1. Rôle

Message user + contexte analyse → intention structurée.

### 8.2. Prompt système (extrait)

```
Tu es l'interpréteur d'intention du module Legal Extraction. Identifie :
1. OPÉRATION : confrontation | aggregation | alignment | query | unclear
2. DOCUMENTS concernés (parmi ceux de l'analyse)
3. ACTIFS DE RÉFÉRENCE à utiliser
4. LIVRABLES attendus : review_note | comparative_note | redline | dd_table+dd_synthesis | clausier
5. CLARIFICATION si ambigu

Retourne UNIQUEMENT un JSON :
{
  "operation": "...",
  "targetDocuments": [...],
  "referenceAssets": [...],
  "deliverableTypes": [...],
  "clarificationNeeded": "..." | null,
  "confidence": "high" | "medium" | "low"
}
```

### 8.3. Post-traitement

- Si `clarificationNeeded` → message assistant avec question (pas d'opération)
- Sinon → lance l'opération (`ConfrontationService` / `AlignmentService` / `AggregationService`)
- L'opération produit livrables + message assistant synthétique avec cartes

## 9. Services backend : Opérations métier

### 9.1. `ConfrontationService` (audit)

**Input** : `legalObjectId` cible, `playbookId` ou `ddGridId`, types livrables.

**Logique** :
1. Charge objet juridique + référentiel
2. Pour chaque clause playbook / question grille :
   - Matching de la clause cible (par type)
   - Évaluation écart (prompt LLM spécifique)
   - Verdict : conforme / à négocier / rouge / absent
3. Compile dans livrable(s) : note de revue, redline (si demandé), ou tableau+synthèse DD

### 9.2. `AlignmentService` (comparaison)

**Input** : `targetLegalObjectId`, `referenceLegalObjectId` (peut être un standard de la base), types livrables.

**Logique** :
1. Charge les deux objets
2. **Alignement clause à clause** par typage :
   - Pour chaque type commun : pair de clauses A/B
   - Types uniquement dans A : clauses unilatérales A
   - Types uniquement dans B : clauses unilatérales B
3. Pour chaque pair : évaluation d'écart (prompt LLM)
4. Compilation : note comparative + redline (du doc cible)

### 9.3. `AggregationService` (clausier)

**Input** : liste `legalObjectIds` homogènes, configuration clausier (types à inclure, granularité variantes).

**Logique** :
1. Charge tous les objets
2. Pour chaque type de clause souhaité :
   - Extrait toutes les occurrences
   - **Regroupe en variantes** (clustering sémantique via prompt LLM) — une clause par cluster = variante
   - Calcule fréquences
   - Identifie texte représentatif
   - Extrait sous-attributs distinctifs
3. Compile en livrable clausier structuré

### 9.4. `DeliverableService` (génération)

Orchestrateur qui appelle le bon service selon le type de livrable attendu, applique les prompts de rédaction, persiste le livrable avec sa version initiale.

Pour chaque type, un prompt de rédaction dédié :
- `prompts/deliverable-review-note.ts`
- `prompts/deliverable-comparative-note.ts`
- `prompts/deliverable-redline.ts`
- `prompts/deliverable-dd-synthesis.ts`
- `prompts/deliverable-clausier.ts`

Les prompts génèrent du **HTML structuré compatible CKEditor** (sauf tableau DD qui est structuré JSON pur).

### 9.5. Itération sur un livrable existant

Quand l'utilisateur demande une modification via la conversation (*"Ajoute une reco sur la juridiction"*) :
1. NLU identifie : opération de modification sur un livrable existant
2. Backend charge le livrable courant
3. Prompt de modification qui reçoit l'état actuel + la demande + le contexte
4. Produit une nouvelle version avec le changement ciblé
5. Persiste version N+1, notifie via conversation

## 10. Services backend : Indexation 2

### 10.1. `LegalExtractionService`

Pipeline complet en 6 étapes (cf. doc 02 §3.2).

Pour chaque étape, un prompt dédié + validation zod du retour :
- `classifyDocumentPrompt` → type + sous-type + confiance
- `extractMetadataPrompt` → métadonnées métier selon type
- `identifyClausesPrompt` → liste clauses avec type + passages + texte
- `extractClauseAttributesPrompt` → pour chaque clause, extraction attributs selon type
- `extractDefinitionsPrompt` → termes définis
- `extractCrossReferencesPrompt` → renvois internes

**Optimisations** :
- Étape 3 peut être itérée par chunks si le document est long (tokens limités)
- Étape 4 est parallélisable par clause

**Persistance** : à la fin, création d'un `LegalObject` complet lié au `Document`.

**Gestion d'échec** : si une étape échoue, le document reste en `legalExtractionStatus: 'failed'` avec un message d'erreur stocké. User peut relancer.

### 10.2. Gestion des scores de confiance

Chaque prompt retourne un niveau de confiance. Règles simples :
- `high` : le LLM est très sûr (texte clair, non ambigu)
- `medium` : texte un peu ambigu ou besoin d'interprétation
- `low` : extraction par déduction, signalée pour revue

Les éléments `low` sont ceux que l'UI met en avant via les badges ⚠.

## 11. Services backend : Base de référence

### 11.1. `ReferenceBaseService`

CRUD complet sur les actifs. Gestion du versioning :
- Création actif → version 1
- Modification → mise à jour current content (pas de nouvelle version)
- *Figer version* → snapshot courant devient nouvelle version N+1
- *Restaurer version* → content courant = snapshot de la version N, incrément currentVersion

### 11.2. Ingestion d'un document de référence

Pipeline spécifique différent de l'indexation 2 standard :
- Pour un playbook : identifier sections par clause, extraire positions (idéale/fallback/red flag)
- Pour un standard : indexation 2 normale, stockage comme objet juridique
- Pour une DD grid : identifier questions, catégories, formats de réponse, règles risque
- Pour un clausier : identifier structure par type, extraire variantes

Chaque type a son prompt d'extraction dédié.

### 11.3. Publication d'un clausier livrable vers la base

`POST /api/deliverables/:id/publish-to-base` :
1. Vérifie que le livrable est bien de type `clausier`
2. Crée un `ReferenceAsset` de type `clausier` avec le contenu du livrable
3. Lie le livrable à l'actif (badge *Publié dans la base* sur le livrable)
4. Retourne l'actif créé

## 12. Zone : Tabular Review *(NOUVEAU)*

### 12.1. Composant `TabularReviewComponent`

**État** (signals) :
- `tabularReview` : objet `TabularReview` courant
- `selectedWorkflowId` : workflow OOTB sélectionné
- `runningColumns` : set de columnIds en cours d'extraction
- `chatPanelOpen` : toggle panneau chat
- `filterQuery` : filtre appliqué depuis le chat SQL

**Rendu** : grille HTML native (pas CKEditor). Colonnes fixes + dynamiques. Virtualisation des lignes si > 50 documents.

### 12.2. Composant `TabularColumnEditorComponent`

Popin d'ajout/édition de colonne libre.
- Champ *Libellé de la colonne* (label affiché)
- Champ *Question pour l'extraction* (instruction pour le LLM)
- Sélecteur *Type attendu* (`text | date | number | boolean | enum`)
- Si `enum` : champ pour saisir les valeurs autorisées
- Validation → `POST /api/analyses/:id/tabular-reviews/:trId` (ajout de colonne)

### 12.3. Composant `TabularCellComponent`

Rendu d'une cellule unique.
- Valeur affichée (tronquée à 60 chars, tooltip pour le texte complet)
- Chip ⓒ si `citation` présente (cliquable → citation panel)
- Badge ⚠ si `confidence === 'low' | 'absent'`
- Badge bleu *Modifié* si `isUserEdited`
- Menu clic droit : *Relancer cette cellule* / *Modifier manuellement* / *Voir la valeur brute*

### 12.4. Composant `TabularChatPanelComponent`

Panneau latéral droit de chat text-to-SQL.

**État** :
- `question` : saisie en cours
- `result` : résultat de la dernière requête (liste de documentIds)
- `generatedSql` : SQL généré (affiché si expanded)
- `isLoading` : pendant la traduction + exécution

**Flux** :
1. User tape une question → `POST /api/analyses/:id/tabular-reviews/:trId/query`
2. Backend : LLM (Claude Haiku) traduit en SQL → exécute sur `tabular_cells` → retourne résultats + SQL
3. Frontend affiche résultats + bouton *Filtrer le tableau* + lien *Voir requête SQL*
4. *Filtrer le tableau* → `filterQuery.set(result.documentIds)` → grille filtrée

### 12.5. Service `TabularReviewService` (frontend)

```typescript
interface TabularReviewService {
  list(analysisId: string): Observable<TabularReview[]>;
  create(analysisId: string, opts: { workflowId?: string; name: string }): Observable<TabularReview>;
  addColumn(trId: string, column: Partial<TabularColumn>): Observable<TabularReview>;
  removeColumn(trId: string, columnId: string): Observable<TabularReview>;
  run(trId: string): Observable<void>;
  rerunColumn(trId: string, columnId: string): Observable<void>;
  rerunCell(trId: string, rowId: string, columnId: string): Observable<void>;
  query(trId: string, question: string): Observable<{ results: string[]; sql: string }>;
}
```

### 12.6. Gestion des cellules vides / incertaines

| Confidence | Affichage | Action disponible |
|---|---|---|
| `high` | Valeur + ⓒ | Re-run |
| `medium` | Valeur + ⓒ + ⚠ jaune | Re-run + modifier |
| `low` | Valeur partielle + ⚠ orange | Re-run + modifier |
| `absent` | `—` + ⚠ gris | Re-run + saisir manuellement |

## 13. Zone : Création de contrat depuis template *(NOUVEAU)*

### 13.1. Composant `ContractDraftFormComponent`

**Étapes** :
1. Sélection du Standard (liste des Standards de la base avec filtre par type de doc)
2. Formulaire de variables (généré dynamiquement depuis les métadonnées du Standard)
3. Bouton *Générer* → `POST /api/analyses/:id/contract-drafts`
4. Affichage du Redline dans CKEditor

**État** : `selectedStandardId`, `variables` (`Record<string, string>`), `generating`, `resultRedlineId`

### 13.2. Données de démo

En l'absence de vrais Standards fournis, le seed crée 2 Standards fictifs :
- `standard-nda-fr` : NDA mutuel standard FR (parties, durée, juridiction)
- `standard-msa-fr` : MSA de services IT standard FR (scope, prix, SLA, responsabilité)

Variables simulées : `party_a`, `party_b`, `effective_date`, `governing_law`, `liability_cap`.

## 14. Zone : Multi-document redline *(NOUVEAU)*

### 14.1. Composant `MultiDocRedlineComponent`

**État** : `selectedDocumentIds`, `decision`, `generating`, `result` (`MultiDocRedline`)

**Flux** :
1. Sélection des documents cibles (checkboxes sur les analysisDocuments)
2. Saisie de la décision en NL (textarea)
3. `POST /api/analyses/:id/multi-doc-redline`
4. Backend : structuration de la décision via LLM → N appels RedlineEngineService en parallèle
5. Affichage : liste des N résultats avec statut (*Redline généré* / *Non applicable + raison*)
6. Clic sur un résultat → ouverture du Redline dans CKEditor

### 14.2. Comportement des résultats

- Documents avec redline : bouton *Voir le redline* + compteur de modifications
- Documents sans redline (*Non applicable*) : badge gris + raison fournie par le LLM

## 15. Zone : Flux de capitalisation *(NOUVEAU)*

### 15.1. Déclenchement

Après chaque acceptation d'une `RedlineProposal` (endpoint `PATCH /api/deliverables/:id/changes/:changeId` avec `status: 'accepted'`) :
- Le backend vérifie si l'analyse a un `referenceAssetId` de type `playbook`
- Si oui : émet un signal WebSocket / SSE (ou retourne dans la réponse HTTP un flag `capitalizationAvailable: true`)
- Le frontend déclenche le toast non-bloquant

### 15.2. Composant `CapitalizationToastComponent`

- Auto-dismiss après 10 secondes (countdown visible)
- 3 boutons : *Créer un playbook dérivé* / *Enrichir le playbook existant* / *Ignorer*
- Action *Enrichir* → pré-remplit le dialog d'amendement (`AmendmentDialogComponent`) avec `triggerSource: 'redline_acceptance'`, `triggerRedlineId`, et le diff de la modification acceptée
- Action *Créer dérivé* → ouvre le même dialog avec un nouveau nom suggéré (*"[Playbook commercial] - dérivé [date]"*)

### 15.3. Modification du service `AmendmentRequest`

Ajout du champ `triggerSource: 'redline_acceptance' | 'manual'` et `triggerRedlineId?: string` à l'entité backend.

```typescript
// Backend : créer un amendement depuis une acceptation de redline
function createCapitalizationAmendment(
  assetId: string,
  redlineProposal: RedlineProposal,
  mode: 'derive' | 'enrich'
): AmendmentRequest {
  return {
    scope: 'clause_position',
    targetPath: redlineProposal.clauseContext,
    currentValue: redlineProposal.oldText ?? '',
    proposedValue: redlineProposal.newText ?? '',
    rationale: `Décision acceptée lors de l'analyse (${redlineProposal.rationale})`,
    triggerSource: 'redline_acceptance',
    triggerRedlineId: redlineProposal.id,
  };
}
```

## 16. Synthèse des décisions d'implémentation (v2)

| Zone | Composant clé | Approche |
|---|---|---|
| Workspace | Boutons d'amorçage | Réutilisation pattern Sinequa |
| Doc viewer | Action Extract | Nouveau bouton dans la barre actions |
| Shell module | Sidebar interne | Pattern Canvas |
| Analyse | Layout 30/70 | Conversation + contenu actif |
| Entry screen | **5 cartes** | Guide vers opérations (Tableau + Créer contrat nouveaux) |
| Objet juridique | Arbre + PDF | Synchronisation bidirectionnelle |
| Livrables | CKEditor | Plugins standards, structure HTML |
| Tableau DD | Grille native | Pas CKEditor, grille interactive |
| **Redline** | **CKEditor avec tracked changes** | **Intégration CKEditor 5 complète** |
| **Tabular Review** | Grille native + chat SQL | Composant custom + SQLite text-to-SQL |
| **Contract Draft** | Formulaire + Redline CKEditor | Standards mockés en seed |
| **Multi-doc Redline** | Liste + Redline CKEditor | N appels parallèles au moteur |
| **Capitalisation** | Toast + AmendmentDialog | Réutilise mécanisme existant |
| Base de référence | Type-specific | Vue adaptée par type d'actif |
| Citation | Drawer latéral | Overlay partiel |

Suite : [06-livrables.md](./06-livrables.md) pour le détail des 7 livrables.
