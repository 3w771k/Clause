# 02 — Architecture technique

## 1. Stack technique

### 1.1. Frontend

**Angular 17+** (ou plus récent stable) avec les caractéristiques modernes :

- **Standalone components** partout (pas de NgModules sauf nécessité)
- **Signals** pour l'état local et partagé
- **Control flow syntax** (`@if`, `@for`, `@switch`) au lieu des directives structurelles classiques
- **Routing standalone** avec lazy loading par feature
- **HTTP client** natif pour les appels backend
- **Pipes async** pour les observables / signals asynchrones

**Librairies frontend** :

| Librairie | Usage |
|---|---|
| **Tailwind CSS** | Styling utility-first, cohérent avec l'UX Sinequa observée |
| **CKEditor 5** | Éditeur riche pour livrables textuels et redline |
| **pdf.js** | Rendu des PDF dans le doc viewer et la vue objet juridique |
| **lucide-angular** | Iconographie (cohérente, moderne, lightweight) |
| **@angular/cdk** | Primitives (overlay, drag-drop, scrolling virtuel) |

### 1.2. Backend

**Node.js 20+** avec **Express.js** pour la simplicité de la pré-alpha. Alternative acceptable : **NestJS** si tu veux une structure plus rigoureuse.

**Librairies backend** :

| Librairie | Usage |
|---|---|
| **Express** (ou NestJS) | Serveur HTTP |
| **@anthropic-ai/sdk** | Appels API Claude |
| **better-sqlite3** | Base de données embarquée |
| **drizzle-orm** (ou Prisma) | ORM pour requêter SQLite |
| **multer** | Upload de fichiers |
| **pdf-parse** | Extraction de texte depuis PDF (côté backend) |
| **mammoth** | Extraction depuis .docx |
| **zod** | Validation des schémas d'entrée/sortie |

### 1.3. LLM

**API Anthropic Claude** en priorité. Modèle recommandé : `claude-opus-4-7` pour la qualité d'extraction, avec bascule `claude-sonnet-4-6` pour les tâches moins sensibles (ou selon latence).

**Clé d'API** via variable d'environnement `ANTHROPIC_API_KEY`.

**Fallback** : OpenAI GPT-4 ou Mistral Large si nécessaire (la couche de service de prompt doit être abstraite pour permettre la bascule).

### 1.4. Persistance

**SQLite** via `better-sqlite3` pour la pré-alpha. Avantages :
- Zéro configuration (un fichier `.db` dans le repo)
- Rapide pour les volumes de démo
- Portable, facile à partager

Le schéma de base doit être **compatible PostgreSQL** pour une migration future en production. Éviter les spécificités SQLite non portables.

### 1.5. Outillage

| Outil | Usage |
|---|---|
| **pnpm** ou **npm** | Gestion de paquets |
| **tsx** | Exécution TypeScript backend en dev |
| **Vite** | Si Angular, utiliser le builder moderne `esbuild`/`vite` |
| **concurrently** | Lancer front + back en parallèle |
| **dotenv** | Variables d'environnement |
| **ESLint + Prettier** | Qualité de code |

## 2. Architecture applicative

### 2.1. Vue d'ensemble

```
┌────────────────────────────────────────────────────────────┐
│ NAVIGATEUR                                                 │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Angular SPA                                            │ │
│ │                                                        │ │
│ │  ┌─────────┐  ┌──────────┐  ┌────────────────┐         │ │
│ │  │ Layout  │  │ Workspace│  │ Legal Extraction│         │ │
│ │  │ (chrome)│  │ feature  │  │ feature         │         │ │
│ │  └─────────┘  └──────────┘  └────────────────┘         │ │
│ │                                                        │ │
│ │  Services transverses :                                │ │
│ │   Auth (simulée), Toast, Modal, Store                  │ │
│ └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
                           │ HTTP/JSON
                           ▼
┌────────────────────────────────────────────────────────────┐
│ BACKEND NODE.JS                                            │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Controllers REST                                     │  │
│  │ /workspaces, /documents, /analyses,                  │  │
│  │ /legal-objects, /deliverables, /reference-base       │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Services métier                                      │  │
│  │ - IndexationService (couche 1 simulée)               │  │
│  │ - LegalExtractionService (couche 2, cœur du module)  │  │
│  │ - ConfrontationService (audit)                       │  │
│  │ - AggregationService (clausier)                      │  │
│  │ - AlignmentService (comparaison)                     │  │
│  │ - DeliverableService (génération livrables)          │  │
│  │ - ReferenceBaseService (gestion base)                │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                │
│  ┌──────────────────┐   ┌───────────────────────────────┐  │
│  │ LLM Gateway      │   │ Repository (ORM)              │  │
│  │ (Anthropic SDK)  │   │ (drizzle/prisma → SQLite)     │  │
│  └──────────────────┘   └───────────────────────────────┘  │
│           │                            │                   │
└───────────┼────────────────────────────┼───────────────────┘
            ▼                            ▼
    ┌──────────────┐            ┌──────────────┐
    │  Claude API  │            │   SQLite     │
    └──────────────┘            └──────────────┘
```

### 2.2. Organisation Angular (front)

```
src/app/
├── core/
│   ├── models/
│   │   ├── workspace.model.ts
│   │   ├── document.model.ts
│   │   ├── analysis.model.ts
│   │   ├── legal-object.model.ts
│   │   ├── clause.model.ts
│   │   ├── deliverable.model.ts
│   │   └── reference-asset.model.ts
│   ├── services/
│   │   ├── api/
│   │   │   ├── workspace-api.service.ts
│   │   │   ├── document-api.service.ts
│   │   │   ├── analysis-api.service.ts
│   │   │   └── ...
│   │   ├── state/
│   │   │   ├── workspace-store.ts
│   │   │   ├── analysis-store.ts
│   │   │   └── reference-base-store.ts
│   │   └── ui/
│   │       ├── toast.service.ts
│   │       └── modal.service.ts
│   └── utils/
│       └── citation.util.ts
│
├── layout/
│   ├── sinequa-shell.component.ts      # Chrome globale
│   ├── side-rail.component.ts          # Barre latérale ultra-fine
│   ├── breadcrumb.component.ts
│   └── action-bar.component.ts
│
├── features/
│   ├── workspace/
│   │   ├── workspace-home.component.ts       # Page d'accueil workspace
│   │   ├── document-list.component.ts
│   │   ├── document-viewer.component.ts
│   │   ├── threads-bar.component.ts          # Barre Threads (mock)
│   │   └── module-cards.component.ts         # Cartes d'amorçage modules
│   │
│   ├── legal-extraction/
│   │   ├── legal-extraction-shell.component.ts   # Point d'entrée module
│   │   ├── module-sidebar.component.ts           # Sidebar interne
│   │   │
│   │   ├── analysis/
│   │   │   ├── analysis-view.component.ts
│   │   │   ├── analysis-header.component.ts
│   │   │   ├── analysis-entry-screen.component.ts  # Écran amorçage (4 cartes)
│   │   │   ├── conversation-panel.component.ts
│   │   │   └── content-panel.component.ts          # Zone droite 70%
│   │   │
│   │   ├── legal-object-view/
│   │   │   ├── legal-object-view.component.ts
│   │   │   ├── structure-tree.component.ts
│   │   │   ├── clause-detail.component.ts
│   │   │   └── source-pdf-panel.component.ts
│   │   │
│   │   ├── deliverables/
│   │   │   ├── deliverable-tabs.component.ts
│   │   │   ├── review-note.component.ts
│   │   │   ├── comparative-note.component.ts
│   │   │   ├── dd-synthesis-note.component.ts
│   │   │   ├── dd-table.component.ts
│   │   │   ├── redline-view.component.ts
│   │   │   ├── clausier-view.component.ts
│   │   │   └── ck-editor-wrapper.component.ts
│   │   │
│   │   └── reference-base/
│   │       ├── reference-base-view.component.ts
│   │       ├── asset-list.component.ts
│   │       ├── asset-detail.component.ts
│   │       └── asset-import.component.ts
│   │
│   └── shared/
│       ├── citation-chip.component.ts
│       ├── confidence-badge.component.ts
│       ├── pdf-viewer.component.ts
│       └── ...
│
└── app.routes.ts
```

### 2.3. Organisation Node (back)

```
server/
├── src/
│   ├── index.ts                    # Point d'entrée Express
│   ├── routes/
│   │   ├── workspace.routes.ts
│   │   ├── document.routes.ts
│   │   ├── analysis.routes.ts
│   │   ├── legal-object.routes.ts
│   │   ├── deliverable.routes.ts
│   │   └── reference-base.routes.ts
│   ├── controllers/
│   │   └── ... (un par route)
│   ├── services/
│   │   ├── indexation.service.ts           # Couche 1 simulée
│   │   ├── legal-extraction.service.ts     # Couche 2 — cœur
│   │   ├── ontology.service.ts             # Gestion ontologie
│   │   ├── confrontation.service.ts        # Audit
│   │   ├── aggregation.service.ts          # Clausier
│   │   ├── alignment.service.ts            # Comparaison
│   │   ├── deliverable.service.ts          # Génération livrables
│   │   └── reference-base.service.ts
│   ├── llm/
│   │   ├── llm-gateway.ts                  # Abstraction LLM
│   │   ├── anthropic-provider.ts
│   │   ├── prompts/
│   │   │   ├── extraction.prompts.ts
│   │   │   ├── confrontation.prompts.ts
│   │   │   ├── aggregation.prompts.ts
│   │   │   ├── alignment.prompts.ts
│   │   │   └── deliverable.prompts.ts
│   │   └── nlu.service.ts                  # Compréhension demande utilisateur
│   ├── db/
│   │   ├── schema.ts                       # Drizzle schema
│   │   ├── migrations/
│   │   └── seed.ts                         # Données de démo
│   ├── ontologies/
│   │   ├── maison.json                     # Ontologie maison
│   │   └── marche.json                     # Ontologie de marché
│   └── utils/
│       ├── pdf-parser.ts
│       └── docx-parser.ts
├── data/
│   ├── legal-extraction.db                 # SQLite
│   └── uploads/                            # Documents uploadés
└── package.json
```

## 3. Les deux indexations

### 3.1. Indexation 1 — Sinequa (simulée en pré-alpha)

**Réelle dans le produit Sinequa**. En pré-alpha, on la **simule** avec un service simple qui :

- Prend un fichier uploadé (PDF, .docx)
- Extrait le texte via `pdf-parse` ou `mammoth`
- Découpe en passages (paragraphes)
- Stocke le texte brut et les passages en base
- Stocke les métadonnées documentaires (nom, taille, date, type)
- Ne produit PAS d'embeddings (optionnel : si tu veux ajouter un chromadb embarqué pour le RAG conversationnel, bienvenue, mais pas obligatoire)

**Endpoint** : `POST /api/workspaces/:id/documents` (upload + indexation 1 automatique)

**Structure stockée** :

```typescript
interface IndexedDocument {
  id: string;
  workspaceId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  uploadedBy: string;

  extractedText: string;             // Texte brut
  passages: TextPassage[];           // Texte découpé en paragraphes
  conversionMode: 'standard' | 'ocr' | 'multimodal';

  legalExtractionStatus: 'none' | 'pending' | 'completed' | 'failed';
  // cf. indexation 2 ci-dessous
}

interface TextPassage {
  id: string;
  documentId: string;
  page: number;
  paragraph: number;
  text: string;
}
```

### 3.2. Indexation 2 — Legal Extraction

**Cœur du module**. Déclenchée explicitement par l'utilisateur (*Extract legal clauses*). Elle transforme un document indexé en objet juridique structuré.

**Pipeline** :

```
Document indexé (texte + passages)
         │
         ▼
1. Classification du type de document
   (LLM → contrat / politique / memo / autre)
         │
         ▼
2. Extraction des métadonnées métier
   (LLM → parties, dates, juridiction, etc.)
         │
         ▼
3. Identification et typage des clauses
   (LLM itératif passage par passage,
    typage selon ontologie active)
         │
         ▼
4. Extraction des sous-attributs par clause
   (LLM par clause, selon schéma du type)
         │
         ▼
5. Extraction des définitions et renvois
         │
         ▼
6. Calcul des scores de confiance
         │
         ▼
7. Persistance de l'objet juridique
   lié au document source
```

**Endpoint** : `POST /api/documents/:id/legal-extract`

**Retour** : l'objet juridique complet (cf. doc 03 pour le schéma).

### 3.3. Gestion de la progression et asynchronisme

L'indexation 2 peut être longue (30s à plusieurs minutes selon le document). Deux approches possibles :

**Option A — Synchrone avec polling** : l'endpoint démarre le traitement et retourne un `analysisId`. Le front polle `GET /api/analyses/:id` pour voir l'avancement. Simple, suffisant en pré-alpha.

**Option B — Websocket / SSE** : le backend pousse les événements de progression. Plus élégant mais plus complexe à mettre en place.

**Recommandation pré-alpha** : Option A (polling). Suffisant pour la démo.

### 3.4. Limites connues de l'extraction et stratégie de mitigation

L'indexation 2 est **le cœur du module**, et c'est aussi son **principal risque produit**. Cet encart formalise ce qui marche, ce qui marche moyennement, et ce qui ne marche pas — pour que l'équipe produit, le commerce et les clients aient le même cadre de référence honnête. Le pire scénario est qu'un client découvre les limites en pilote.

#### 3.4.1. Ce qui fonctionne bien

Sur ces familles de documents, l'extraction LLM (Claude `opus-4-7` avec prompts spécialisés et validation zod) donne des résultats utilisables avec un taux de correction manuelle faible (estimation pré-alpha à confirmer en alpha) :

- **NDA** standards et mutuels, en français et anglais
- **Contrats commerciaux** structurés : prestation de services, distribution, licence simple, achats indirects
- **Politiques** documentaires bien rédigées : DPA, codes de conduite, chartes
- Documents **nativement numériques** (Word ou PDF non scanné) en **langues principales** (FR, EN)
- Documents **mono-juridiction** avec terminologie standard
- Volumes **unitaires à modérés** (1 à 30 documents par analyse en pré-alpha)

Sur ces cas, le produit livre sa promesse : un objet juridique fidèle, des clauses correctement typées, des sous-attributs normalisés exploitables par les opérations métier.

#### 3.4.2. Ce qui fonctionne moyennement

Sur ces familles, l'extraction reste utile mais le taux de correction manuelle augmente significativement, et certaines opérations métier (notamment la confrontation à un playbook) peuvent produire des verdicts à challenger systématiquement :

- **Contrats fortement négociés** avec annexes croisées, amendements multiples, renvois en chaîne
- **Documents bilingues** ou mélangeant des extraits dans plusieurs langues
- **Contrats multi-juridictions** (clauses Common Law dans un contrat français, références à des régulations sectorielles spécifiques)
- **SPA et documents M&A complexes** : earn-outs, escrow, MAC clauses sophistiquées, garanties d'actif et de passif — la richesse sémantique dépasse l'ontologie générique
- **Politiques sectorielles spécifiques** (banque, assurance, santé, défense) avec terminologie réglementée
- Documents avec **structure non standard** (clauses en notes de bas de page, glossaire inversé, mise en page atypique)
- **Volumes intermédiaires** (30 à 100 documents) où la cohérence d'une analyse à l'autre devient un sujet

Sur ces cas, le produit reste utile mais son ROI dépend lourdement de la qualité du human-in-the-loop. La stratégie de mitigation passe par l'ontologie maison configurable (alpha) et l'entraînement sur précédents client (beta).

#### 3.4.3. Ce qui ne fonctionne pas (à ce stade)

Sur ces cas, l'extraction est non fiable et le produit ne doit pas être positionné. Les tenter dégrade la confiance globale dans l'outil :

- **Documents manuscrits** ou avec annotations manuscrites significatives
- **Scans de mauvaise qualité** (OCR illisible, taux d'erreur OCR > 10%)
- **Documents très longs** (au-delà de 200 pages) où la cohérence d'extraction sur le document entier est compromise par les fenêtres de contexte
- **Volumes massifs en une passe** (au-delà de 100 documents simultanés) — la pré-alpha ne couvre pas la scalabilité industrielle
- **Langues secondaires** : tout ce qui n'est ni FR ni EN à ce stade (l'allemand, l'espagnol, l'italien arrivent en GA)
- **Contrats audio/vidéo** ou autres formats non documentaires
- **Documents fortement structurés en tableaux** (matrices de prix, échelles de pénalités complexes) où la sémantique est portée par la structure visuelle et non par le texte courant

#### 3.4.4. Stratégie de mitigation transverse

Plusieurs mécanismes du module sont conçus précisément pour absorber ces limites :

| Mécanisme | Limite couverte |
|---|---|
| **Scores de confiance par élément** | Documents moyens : signaler à l'utilisateur ce qui mérite revue |
| **Citations obligatoires** | Hallucinations LLM : tout est rattaché à un passage source |
| **Vue objet juridique éditable** | Erreurs d'extraction : le juriste corrige, valide, complète |
| **Validation zod** | Sorties LLM malformées : on rejette et on relance |
| **Pipeline en étapes isolables** | Échec partiel : on relance l'étape qui a échoué, pas tout le pipeline |
| **Indication de couverture par juridiction** | Multi-juridictions : on dit ce qui est couvert et ce qui ne l'est pas |
| **Limite de volume documentée** | Volumes : on n'accepte pas un dépôt qui sort du cadre éprouvé |

Aucun de ces mécanismes ne supprime les limites. Ils les rendent **gérables** et **transparentes** pour l'utilisateur.

#### 3.4.5. Mesure et amélioration continue

Trois indicateurs à mettre en place dès l'alpha pour piloter la qualité d'extraction :

- **Taux de correction manuelle** : pourcentage d'éléments d'objet juridique modifiés par l'utilisateur après extraction (par type de document, par type de clause)
- **Taux de citations cliquées** : indicateur de confiance utilisateur — un livrable dont les citations sont peu cliquées est un livrable cru sur parole, ce qui est suspect
- **Taux d'abandon d'analyse** : pourcentage d'analyses ouvertes mais non poursuivies après extraction — signal fort d'un échec d'extraction perçu

Ces indicateurs alimentent l'itération de l'ontologie, des prompts, et de la stratégie de chunking.

| **Pourquoi cet encart est dans la doc technique et pas dans la doc commerciale** Parce que ces limites sont **techniques d'origine** (capacités du LLM, structure des prompts, ontologie). C'est aux équipes produit et engineering de les piloter. La doc commerciale (`09-positionnement-marche.md`) reformule ces mêmes limites en termes de positionnement et de promesse client. La doc des cas limites runtime (`07-cas-limites.md`) décrit le **comportement UX** lorsqu'un document concerné par ces limites arrive dans le module. |
| --- |

## 4. La couche LLM

### 4.1. LLM Gateway

Abstraction qui permet de changer de fournisseur sans toucher au code métier.

```typescript
interface LlmGateway {
  complete(
    messages: LlmMessage[],
    options?: LlmOptions
  ): Promise<LlmResponse>;

  completeStructured<T>(
    messages: LlmMessage[],
    schema: ZodSchema<T>,
    options?: LlmOptions
  ): Promise<T>;
}

interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LlmOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}
```

L'implémentation `AnthropicProvider` wraps l'SDK officiel. L'implémentation `OpenAIProvider` (si nécessaire) fait de même.

### 4.2. Prompts

Chaque opération a son fichier de prompts structuré. Exemple pour l'extraction :

```typescript
// extraction.prompts.ts
export const CLASSIFY_DOCUMENT_PROMPT = (text: string) => `
Tu es un expert en analyse de documents juridiques. Analyse le document ci-dessous
et classe-le parmi les catégories suivantes : CONTRAT, POLITIQUE, MEMO, AUTRE.

Retourne UNIQUEMENT un JSON de la forme :
{ "type": "CONTRAT", "subtype": "NDA_MUTUEL", "confidence": 0.95, "reasoning": "..." }

Document :
---
${text}
---
`;

export const EXTRACT_CLAUSES_PROMPT = (
  documentText: string,
  ontologyTypes: string[]
) => `
...
`;
```

### 4.3. Compréhension de la demande utilisateur (NLU)

Quand l'utilisateur formule une demande en langage naturel, le module doit :

1. Identifier l'**intention** (audit / comparaison / clausier / question générale)
2. Identifier les **documents concernés** (celui en cours, tous ceux de l'analyse, un de la base...)
3. Identifier le **référentiel** s'il y en a un (quel playbook, quel standard)
4. Identifier le **livrable attendu** (note, redline, les deux)

Un service dédié `NluService` prend en entrée la demande de l'utilisateur + le contexte de l'analyse (documents extraits, base de référence disponible) et produit une "intention structurée" :

```typescript
interface UserIntent {
  operation: 'confrontation' | 'aggregation' | 'alignment' | 'query' | 'unclear';
  targetDocuments: string[];          // IDs
  referenceAssets: string[];          // IDs
  deliverables: DeliverableType[];    // types demandés
  clarificationNeeded?: string;       // si ambigu
}
```

Si `clarificationNeeded` est non-null, le module répond à l'utilisateur en lui posant la question de clarification au lieu de lancer l'opération.

## 5. La base de référence

### 5.1. Modèle

Les actifs de la base de référence sont **persistés indépendamment des analyses**. Ils vivent dans une table dédiée, avec versioning basique.

```typescript
interface ReferenceAsset {
  id: string;
  type: 'playbook' | 'standard' | 'dd_grid' | 'clausier';
  name: string;
  description: string;
  createdBy: string;
  createdAt: Date;
  lastUpdatedAt: Date;
  lastUpdatedBy: string;

  ontologyId: string;                 // "maison" ou "marche"
  jurisdiction?: string;              // "FR", "EN", "US", "Multi", null
  language: 'fr' | 'en';

  currentVersion: number;
  versions: AssetVersion[];           // historique simple
  content: AssetContent;              // selon le type
}

interface AssetVersion {
  version: number;
  createdAt: Date;
  createdBy: string;
  summary: string;                    // commentaire de version
  contentSnapshot: AssetContent;      // copie du contenu à ce moment-là
}

// Le type du contenu dépend du type d'actif
type AssetContent =
  | PlaybookContent
  | StandardContent
  | DdGridContent
  | ClausierContent;
```

Voir [03-modele-de-donnees.md](./03-modele-de-donnees.md) pour le détail de chaque type.

### 5.2. Alimentation de la base

Deux voies :

**1. Import direct** : l'utilisateur dépose un document de référence (playbook Word, NDA standard .docx) depuis l'UI de la base. Le backend :
- Extrait le texte
- Applique une indexation 2 spécifique (plus exigeante sur la structure, parce que c'est un référentiel)
- Structure l'actif selon son type

**2. Publication depuis une analyse** : à la fin d'une analyse qui produit un clausier, l'utilisateur peut cliquer *Publier dans la base*. Le livrable clausier devient un actif `clausier` de la base, avec son ontologie, ses clauses structurées, ses sources.

### 5.4. Le moteur de redline transverse

**Entité `Redline` comme entité de premier rang** — réutilisable depuis plusieurs opérations (audit, comparaison, contract draft, multi-doc redline). Elle n'est plus un simple contenu de `Deliverable`.

**Service `RedlineEngineService`** (backend) :

```typescript
interface RedlineEngineService {
  produce(
    document: { legalObjectId: string; baseText: string },
    proposals: RedlineProposal[],
    metadata: { producedBy: 'audit' | 'comparison' | 'contract_draft' | 'multi_doc'; producedFromId: string }
  ): Promise<Redline>;
}
```

Entrées :
- Le document de base (texte structuré + LegalObject)
- Un tableau de propositions de modification (insertions, suppressions, remplacements) ancrées par offset
- Une justification + citation source par proposition

Sorties :
- Un objet `Redline` persisté (cf. `03-modele-de-donnees.md` §7)
- Un rendu HTML avec tracked changes simulés (`<span class="ins">`, `<span class="del">`) pour CKEditor
- Un export `.docx` matérialisé (bouton présent, génération à brancher si temps)

**Consommateurs** : `ConfrontationService` (audit), `AlignmentService` (comparaison), `ContractDraftService`, `MultiDocRedlineService`.

**Rendu CKEditor** : CKEditor 5 intégré avec tracked changes. Les spans `.ins`/`.del` sont injectés dans le contenu initial ; CKEditor les traite comme des suggestions acceptables/rejetables. L'export `.docx` reste matérialisé non fonctionnel dans le démonstrateur.

### 5.5. Le moteur de Tabular Review

**Entité `TabularReview`** (cf. `03-modele-de-donnees.md` §5) : un tableau N docs × M colonnes dont chaque cellule porte `value + citation + confidence`.

**Service `TabularReviewService`** (backend) :
- Création d'une Tabular Review (vide ou depuis un workflow OOTB)
- Ajout/retrait de colonnes
- Run global : extraction LLM pour toutes les cellules manquantes
- Re-run granulaire : une colonne ou une cellule spécifique
- Persistance des cellules en **table SQL normalisée** (`tabular_cells`) pour permettre le text-to-SQL

**Service `TabularQueryService`** (backend) :
- Prend une question en langage naturel
- La traduit en SQL via un appel LLM léger (Claude Haiku)
- Exécute la requête sur la table `tabular_cells` du `tabularReviewId` courant
- Retourne le résultat + la requête SQL générée (transparence, auditabilité)

**Table SQL des cellules** (utilisée pour le text-to-SQL) :

```sql
CREATE TABLE tabular_cells (
  id TEXT PRIMARY KEY,
  tabular_review_id TEXT NOT NULL,
  row_document_id TEXT NOT NULL,
  column_id TEXT NOT NULL,
  column_label TEXT NOT NULL,
  value TEXT,
  value_type TEXT,          -- 'text' | 'number' | 'boolean' | 'enum' | null
  confidence TEXT,          -- 'high' | 'medium' | 'low' | 'absent'
  citation_json TEXT,       -- JSON sérialisé
  is_user_edited INTEGER,
  last_run_at TEXT
);
```

### 5.6. Workflows out-of-the-box (OOTB)

Les workflows OOTB sont des **fichiers JSON chargés au démarrage du backend**. Ils ne sont pas modifiables dans le démonstrateur (lecture seule).

**Format de sérialisation** :

```json
{
  "id": "ddq-ma",
  "name": "Due diligence M&A",
  "description": "Grille DDQ standard pour opérations M&A",
  "kind": "tabular_review_preset",
  "applicableDocumentTypes": ["CONTRAT", "POLITIQUE"],
  "language": "fr",
  "definition": {
    "columns": [
      { "label": "Loi applicable", "question": "Quelle est la loi applicable au contrat ?", "expectedType": "text" },
      { "label": "Cap responsabilité", "question": "Quel est le plafond de responsabilité ?", "expectedType": "text" },
      { "label": "Change of control", "question": "Existe-t-il une clause de changement de contrôle ? Si oui, quel est le seuil ?", "expectedType": "text" },
      { "label": "Durée résiduelle", "question": "Quelle est la durée résiduelle du contrat ?", "expectedType": "text" },
      { "label": "Non-concurrence", "question": "Existe-t-il une clause de non-concurrence ? Durée et périmètre ?", "expectedType": "text" }
    ]
  }
}
```

**Workflows livrés dans le démonstrateur** :
- `clausier-msa-fr` — Clausier MSA français standard
- `clausier-nda-fr` — Clausier NDA français standard
- `clausier-msa-en` — Clausier MSA anglais standard
- `ddq-ma` — Due diligence M&A
- `ddq-real-estate` — Due diligence immobilière
- `conformite-rgpd` — Vérification de conformité RGPD sur DPA

**Chargement** : au démarrage du backend, lecture du dossier `server/src/workflows/`, stockage en mémoire. Exposition via `GET /api/workflows` (lecture seule, pas de POST ni DELETE).

### 5.3. Consommation par les opérations

Quand une opération métier est lancée :

- **Confrontation (audit)** : le module charge le `playbook` ou la `dd_grid` cité dans l'intent, le passe au service `ConfrontationService` avec l'objet juridique cible
- **Alignement (comparaison)** : le module charge le `standard` cité dans l'intent (s'il y en a un), le passe au service `AlignmentService` avec l'objet juridique cible
- **Agrégation (clausier)** : pas d'actif consommé, mais le clausier produit peut être publié dans la base

## 6. Conception des écrans et routing

### 6.1. Routes principales

```typescript
// app.routes.ts
export const routes: Routes = [
  { path: '', redirectTo: 'workspaces', pathMatch: 'full' },
  { path: 'workspaces', loadComponent: () => ... },
  { path: 'workspaces/:workspaceId', loadComponent: () => WorkspaceHomeComponent },
  { path: 'workspaces/:workspaceId/documents/:documentId', loadComponent: () => DocumentViewerComponent },
  {
    path: 'workspaces/:workspaceId/legal-extraction',
    loadComponent: () => LegalExtractionShellComponent,
    children: [
      { path: '', redirectTo: 'analyses', pathMatch: 'full' },
      { path: 'analyses', loadComponent: () => AnalysisListComponent },
      { path: 'analyses/:analysisId', loadComponent: () => AnalysisViewComponent },
      { path: 'reference-base', loadComponent: () => ReferenceBaseViewComponent },
      { path: 'reference-base/:type', loadComponent: () => AssetListComponent },
      { path: 'reference-base/:type/:assetId', loadComponent: () => AssetDetailComponent },
    ]
  }
];
```

### 6.2. Conventions de navigation

- Le breadcrumb Sinequa reflète la route : *Espaces de travail > [Workspace] > [Legal Extraction] > [Analyse]*
- L'URL est la source de vérité. Recharger la page doit rétablir l'état.
- Les transitions inter-modules passent par des routes, pas par de l'état interne.

## 7. Endpoints REST

### 7.1. Workspaces

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/workspaces` | Liste des workspaces |
| GET | `/api/workspaces/:id` | Détails d'un workspace |
| POST | `/api/workspaces` | Créer un workspace |

### 7.2. Documents

| Méthode | Endpoint | Description |
|---|---|---|
| POST | `/api/workspaces/:id/documents` | Upload + indexation 1 |
| GET | `/api/workspaces/:id/documents` | Liste des documents |
| GET | `/api/documents/:id` | Détails + contenu d'un document |
| POST | `/api/documents/:id/legal-extract` | Déclencher indexation 2 |
| GET | `/api/documents/:id/file` | Télécharger le fichier brut |

### 7.3. Analyses

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/workspaces/:id/analyses` | Liste des analyses d'un workspace |
| POST | `/api/workspaces/:id/analyses` | Créer une analyse |
| GET | `/api/analyses/:id` | Détails d'une analyse |
| POST | `/api/analyses/:id/documents` | Ajouter un doc à l'analyse |
| DELETE | `/api/analyses/:id/documents/:docId` | Retirer un doc |
| POST | `/api/analyses/:id/messages` | Envoyer un message (conversation) |
| GET | `/api/analyses/:id/messages` | Historique conversation |

### 7.4. Objets juridiques

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/legal-objects/:id` | Récupérer un objet juridique |
| PATCH | `/api/legal-objects/:id/clauses/:clauseId` | Modifier une clause |
| POST | `/api/legal-objects/:id/clauses` | Ajouter une clause manuelle |
| DELETE | `/api/legal-objects/:id/clauses/:clauseId` | Supprimer une clause |

### 7.5. Livrables

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/analyses/:id/deliverables` | Liste des livrables |
| GET | `/api/deliverables/:id` | Contenu d'un livrable |
| PATCH | `/api/deliverables/:id` | Modifier un livrable (édition user) |
| POST | `/api/deliverables/:id/versions` | Figer une version |
| GET | `/api/deliverables/:id/versions` | Historique de versions |

### 7.6. Base de référence

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/reference-base` | Vue d'ensemble |
| GET | `/api/reference-base/:type` | Liste des actifs d'un type |
| GET | `/api/reference-base/:type/:id` | Détails d'un actif |
| POST | `/api/reference-base/:type` | Créer un actif |
| PATCH | `/api/reference-base/:type/:id` | Modifier un actif |
| POST | `/api/reference-base/:type/:id/freeze-version` | Figer une nouvelle version |
| GET | `/api/reference-base/:type/:id/versions` | Historique des versions |
| POST | `/api/reference-base/:type/:id/archive` | Archiver l'actif |
| GET | `/api/reference-assets/:id/amendments` | Lister les amendements (pending et historique) |
| POST | `/api/reference-assets/:id/amendments` | Proposer un amendement |
| PATCH | `/api/reference-assets/:id/amendments/:amendmentId` | Accepter / rejeter / différer un amendement |
| GET | `/api/reference-assets/:id/consuming-analyses` | Analyses qui consomment cet actif |
| POST | `/api/deliverables/:id/publish-to-base` | Publier un clausier livrable vers la base |

### 7.7. Tabular Review (NOUVEAU)

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/analyses/:id/tabular-reviews` | Liste des Tabular Reviews de l'analyse |
| POST | `/api/analyses/:id/tabular-reviews` | Créer une Tabular Review (vide ou depuis workflow) |
| GET | `/api/analyses/:id/tabular-reviews/:trId` | Détails d'une Tabular Review |
| PATCH | `/api/analyses/:id/tabular-reviews/:trId` | Modifier (nom, colonnes) |
| DELETE | `/api/analyses/:id/tabular-reviews/:trId` | Supprimer |
| POST | `/api/analyses/:id/tabular-reviews/:trId/run` | Lancer le run global |
| POST | `/api/analyses/:id/tabular-reviews/:trId/columns/:colId/rerun` | Re-run granulaire colonne |
| POST | `/api/analyses/:id/tabular-reviews/:trId/rows/:rowId/cells/:colId/rerun` | Re-run granulaire cellule |
| POST | `/api/analyses/:id/tabular-reviews/:trId/query` | Chat text-to-SQL |

### 7.8. Workflows OOTB (NOUVEAU)

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/workflows` | Liste des workflows OOTB disponibles |
| GET | `/api/workflows/:id` | Détails d'un workflow |

### 7.9. Multi-doc redline (NOUVEAU)

| Méthode | Endpoint | Description |
|---|---|---|
| POST | `/api/analyses/:id/multi-doc-redline` | Lancer un multi-doc redline |
| GET | `/api/analyses/:id/multi-doc-redlines` | Liste des multi-doc redlines |
| GET | `/api/analyses/:id/multi-doc-redlines/:mdrId` | Détails |

### 7.10. Contract Draft (NOUVEAU)

| Méthode | Endpoint | Description |
|---|---|---|
| POST | `/api/analyses/:id/contract-drafts` | Créer un contract draft depuis un Standard |
| GET | `/api/analyses/:id/contract-drafts` | Liste des contract drafts |
| GET | `/api/analyses/:id/contract-drafts/:cdId` | Détails + redline associé |

### 7.11. Ontologie

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/ontologies` | Liste des ontologies disponibles |
| GET | `/api/ontologies/:id` | Détails d'une ontologie |
| GET | `/api/workspaces/:id/ontology` | Ontologie active du workspace |
| PUT | `/api/workspaces/:id/ontology` | Changer l'ontologie du workspace |

## 8. Gestion d'état frontend

### 8.1. Pattern store avec signals

Pour chaque domaine majeur, un service-store expose l'état via signals :

```typescript
@Injectable({ providedIn: 'root' })
export class AnalysisStore {
  private readonly _currentAnalysis = signal<Analysis | null>(null);
  private readonly _documents = signal<LegalObject[]>([]);
  private readonly _deliverables = signal<Deliverable[]>([]);
  private readonly _conversation = signal<ConversationMessage[]>([]);
  private readonly _activeContentTab = signal<ContentTab | null>(null);

  // Expose en readonly
  readonly currentAnalysis = this._currentAnalysis.asReadonly();
  readonly documents = this._documents.asReadonly();
  readonly deliverables = this._deliverables.asReadonly();
  readonly conversation = this._conversation.asReadonly();
  readonly activeContentTab = this._activeContentTab.asReadonly();

  // Computed
  readonly hasDocuments = computed(() => this._documents().length > 0);

  // Actions
  async loadAnalysis(id: string) { ... }
  async sendMessage(text: string) { ... }
  async extractLegalClauses(documentId: string) { ... }
  ...
}
```

### 8.2. Séparation UI / API

- Les **composants** n'appellent jamais directement l'API HTTP.
- Ils passent par les **stores** qui orchestrent les appels API et tiennent l'état.
- Les **services API** sont bêtes : un appel HTTP = un appel API service.

## 9. Démarrage

### 9.1. Setup

```bash
# Cloner le repo
git clone ...
cd legal-extraction

# Installer dépendances
pnpm install

# Variables d'environnement
cp .env.example .env
# Éditer .env :
#   ANTHROPIC_API_KEY=sk-ant-...
#   PORT=3000
#   FRONT_URL=http://localhost:4200

# Seed de la base de données (données de démo)
pnpm run db:seed

# Démarrer (front + back en parallèle)
pnpm run dev
```

### 9.2. Scripts npm/pnpm recommandés

```json
{
  "scripts": {
    "dev": "concurrently \"pnpm run dev:back\" \"pnpm run dev:front\"",
    "dev:back": "tsx watch server/src/index.ts",
    "dev:front": "ng serve",
    "build": "pnpm run build:back && pnpm run build:front",
    "build:back": "tsc -p server/tsconfig.json",
    "build:front": "ng build",
    "db:seed": "tsx server/src/db/seed.ts",
    "db:reset": "rm -f server/data/legal-extraction.db && pnpm run db:seed"
  }
}
```

## 10. Déploiement (optionnel en pré-alpha)

Pas requis. Si démo remote nécessaire :
- Front : build statique servable via Vercel / Netlify / Cloudflare Pages
- Back : conteneur Node.js (Railway, Fly.io, Render) avec SQLite en volume persistant
- Clé API LLM en variable d'env du back

Pas de HTTPS / auth / RBAC en pré-alpha. Protection simple par URL partageable si nécessaire.

## 11. Ce que cette architecture donne

Une application Angular + Node autonome, installable en 10 minutes, qui :
- Reproduit la chrome Sinequa
- Permet de déposer des documents et de les indexer
- Déclenche l'indexation 2 légale via l'API Claude
- Présente l'objet juridique extrait, éditable
- Accepte des demandes en langage naturel et produit des livrables
- Gère une base de référence persistante
- Est complètement indépendante du produit Sinequa réel

Prête à être démontrée, challengée, et ingérée par l'équipe produit.
