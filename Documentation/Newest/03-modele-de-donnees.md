# 03 — Modèle de données

Ce document définit les structures de données du module — les objets métier, leur schéma, leurs relations. Il est le socle de l'implémentation : le backend expose ces structures via ses API, le frontend les consomme via ses stores et les affiche via ses composants.

## 1. Vue d'ensemble du modèle

```
Workspace
  │
  ├── Document (avec indexation 1 + indexation 2 = LegalObject)
  │
  ├── Analysis ← unité de travail, contient des opérations
  │     │
  │     ├── AnalysisDocument[] (LegalObjects utilisés)
  │     ├── ConversationMessage[]
  │     │
  │     ├── TabularReview[]            ← NOUVEAU (primitive)
  │     │     ├── columns[]            ← définies ad hoc ou via workflow
  │     │     ├── rows[]               ← un row par document
  │     │     └── cells[][]            ← une cell = valeur + citation
  │     │
  │     ├── ComparisonAnalysis[]       ← NOUVEAU OU REFONDU
  │     │     ├── target               ← doc
  │     │     ├── reference            ← playbook | standard | autre doc
  │     │     ├── deviations[]
  │     │     └── redline              ← Redline (cf. ci-dessous)
  │     │
  │     ├── ContractDraft[]            ← NOUVEAU (primitive)
  │     │     ├── template             ← Standard de la base
  │     │     ├── projectContext       ← variables instanciées
  │     │     └── output               ← Redline (cf. ci-dessous)
  │     │
  │     ├── MultiDocRedline[]          ← NOUVEAU (primitive)
  │     │     ├── targetDocuments[]
  │     │     ├── decision             ← description de la modif
  │     │     └── perDocumentRedlines[]← Redline[] cohérents
  │     │
  │     └── Deliverable[] (existant, conservé pour les notes textuelles)
  │
  ├── Workflow[]                       ← NOUVEAU (out-of-the-box uniquement)
  │     ├── id, name, description
  │     ├── kind: 'tabular_review_preset' | 'audit_preset'
  │     └── definition                 ← colonnes, prompts, format
  │
  └── ReferenceBase (global, partagé)
        │
        ├── Playbook                   ← consommé par audit + capitalisation
        ├── Standard                   ← consommé par comparaison + ContractDraft
        ├── DdGrid                     ← devient un Workflow tabular_review_preset
        ├── Clausier                   ← devient une sortie publiable de TabularReview
        └── Redline                    ← NOUVEAU type de sortie (réutilisable)
```

## 2. Entités principales

### 2.1. Workspace

Un workspace Sinequa. Porteur du contexte, contient des documents, des analyses, et utilise une ontologie active pour le module Legal Extraction.

```typescript
interface Workspace {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  createdBy: string;

  // Configuration Legal Extraction
  activeOntologyId: 'maison' | 'marche';
}
```

### 2.2. Document

Un document déposé dans un workspace. Produit par l'indexation 1.

```typescript
interface Document {
  id: string;
  workspaceId: string;

  // Métadonnées fichier
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  uploadedBy: string;

  // Contenu extrait
  extractedText: string;
  passages: TextPassage[];
  conversionMode: 'standard' | 'ocr' | 'multimodal';
  language?: 'fr' | 'en' | 'unknown';

  // État Legal Extraction
  legalExtractionStatus: 'none' | 'pending' | 'completed' | 'failed';
  legalObjectId?: string;        // Si extraction lancée
  lastExtractionAt?: Date;
}

interface TextPassage {
  id: string;
  documentId: string;
  page: number;           // 1-indexé
  paragraph: number;      // 1-indexé dans la page
  text: string;
  startOffset: number;    // Offset dans extractedText
  endOffset: number;
}
```

### 2.3. LegalObject — L'OBJET CENTRAL DU MODULE

**C'est l'entité la plus importante du module**. Produit par l'indexation 2, consommé par toutes les opérations métier.

```typescript
interface LegalObject {
  id: string;
  documentId: string;
  ontologyId: string;
  extractedAt: Date;
  extractionVersion: number;      // Incrémenté à chaque ré-extraction

  // Classification de haut niveau
  documentType: 'CONTRAT' | 'POLITIQUE' | 'MEMO' | 'AUTRE';
  documentSubtype?: string;       // Ex: "NDA_MUTUEL", "CONTRAT_PRESTATION"
  language: 'fr' | 'en';
  overallConfidence: ConfidenceLevel;

  // Métadonnées métier
  metadata: LegalMetadata;

  // Structure juridique
  clauses: Clause[];
  definedTerms: DefinedTerm[];
  crossReferences: CrossReference[];

  // Modifications utilisateur (historique léger)
  userEdits: UserEdit[];
}

type ConfidenceLevel = 'high' | 'medium' | 'low';
```

### 2.4. LegalMetadata

Les métadonnées métier extraites d'un document juridique. Structure enrichie pour les contrats, allégée pour politiques et memos.

```typescript
interface LegalMetadata {
  // Commun à tous les types
  title?: string;
  effectiveDate?: { date: Date; citation: Citation };
  signatureDate?: { date: Date; citation: Citation };
  documentVersion?: string;

  // Spécifique CONTRAT
  parties?: Party[];
  governingLaw?: { jurisdiction: string; citation: Citation };
  competentJurisdiction?: { jurisdiction: string; citation: Citation };
  contractTerm?: { value: string; unit: 'days' | 'months' | 'years'; citation: Citation };
  renewalTerms?: { description: string; citation: Citation };
  terminationNotice?: { value: string; unit: 'days' | 'months'; citation: Citation };
  totalValue?: { amount: number; currency: string; citation: Citation };

  // Spécifique POLITIQUE
  applicabilityScope?: { description: string; citation: Citation };
  policyAuthor?: string;

  // Générique extensible
  customFields?: Record<string, { value: unknown; citation: Citation; confidence: ConfidenceLevel }>;
}

interface Party {
  id: string;
  name: string;
  role: 'supplier' | 'customer' | 'partner' | 'licensor' | 'licensee' | 'other';
  legalForm?: string;                    // SA, SARL, Inc., GmbH...
  registrationNumber?: string;
  address?: string;
  representative?: string;
  citation: Citation;
  confidence: ConfidenceLevel;
}
```

### 2.5. Clause

Une clause identifiée dans le document. Porte son texte, son type, et potentiellement des sous-attributs normalisés selon son type.

```typescript
interface Clause {
  id: string;
  legalObjectId: string;

  // Identification
  type: ClauseType;                      // Issu de l'ontologie
  heading?: string;                       // Titre de la clause si présent
  sequenceNumber?: string;                // Numérotation dans le document
  order: number;                          // Ordre d'apparition

  // Contenu
  text: string;                           // Texte intégral
  citation: Citation;

  // Sous-attributs normalisés (selon le type, cf. ontologie)
  attributes: Record<string, ClauseAttribute>;

  // Méta
  confidence: ConfidenceLevel;
  isUserAdded: boolean;                   // Ajoutée manuellement par l'utilisateur
  isUserModified: boolean;                // Modifiée manuellement
  notes?: string;                         // Notes utilisateur

  // Référentiels
  linkedDefinedTerms: string[];           // IDs des DefinedTerm référencés
  linkedClauses: string[];                // IDs des clauses liées (renvois)
}

interface ClauseAttribute {
  value: unknown;                         // Type dépend du sous-attribut
  citation?: Citation;
  confidence: ConfidenceLevel;
  isUserEdited: boolean;
}

type ClauseType = string;                 // Valeurs définies par l'ontologie
```

### 2.6. DefinedTerm

Un terme défini dans le document (typiquement dans une section "Définitions" ou entre guillemets avec majuscule).

```typescript
interface DefinedTerm {
  id: string;
  legalObjectId: string;

  term: string;                           // Ex: "Information Confidentielle"
  definition: string;                     // Le texte de la définition
  citation: Citation;
  confidence: ConfidenceLevel;

  referencedInClauses: string[];          // IDs des clauses qui utilisent ce terme
}
```

### 2.7. CrossReference

Un renvoi interne au document (ex : "selon l'article 4.2", "conformément à l'annexe B").

```typescript
interface CrossReference {
  id: string;
  legalObjectId: string;

  sourceClauseId: string;                 // Clause qui fait le renvoi
  targetClauseId?: string;                // Clause renvoyée (résolue si possible)
  targetAnnex?: string;                   // Ou annexe
  rawText: string;                        // Texte du renvoi tel quel
  citation: Citation;
}
```

### 2.8. Citation

**Structure centrale** pour la traçabilité. Toute affirmation extraite pointe vers une citation.

```typescript
interface Citation {
  documentId: string;
  passageIds: string[];                   // 1 ou plusieurs passages
  startOffset: number;                    // Offset de début dans le passage
  endOffset: number;                      // Offset de fin
  extract: string;                        // Copie littérale du passage cité
  page: number;                           // Page dans le document source
  paragraph?: number;
}
```

### 2.9. UserEdit

Traçabilité des modifications utilisateur sur un objet juridique.

```typescript
interface UserEdit {
  id: string;
  timestamp: Date;
  userId: string;
  type: 'add_clause' | 'remove_clause' | 'modify_clause_type' |
        'merge_clauses' | 'split_clause' | 'edit_attribute';
  target: string;                         // ID de l'élément affecté
  before?: unknown;
  after?: unknown;
  reason?: string;
}
```

## 3. L'ontologie

### 3.1. Structure

Une ontologie définit les **types de clauses reconnus** et les **sous-attributs** à extraire pour chaque type.

```typescript
interface Ontology {
  id: 'maison' | 'marche';
  version: string;
  name: string;
  description: string;
  language: 'fr' | 'en' | 'multi';

  documentTypes: DocumentTypeDefinition[];
  clauseTypes: ClauseTypeDefinition[];
}

interface DocumentTypeDefinition {
  id: string;                             // Ex: "CONTRAT/NDA_MUTUEL"
  parent: 'CONTRAT' | 'POLITIQUE' | 'MEMO' | 'AUTRE';
  name: string;
  description: string;
  typicalClauseTypes: string[];           // Clauses attendues pour ce type de doc
}

interface ClauseTypeDefinition {
  id: string;                             // Ex: "LIMITATION_RESPONSABILITE"
  name: string;                           // Label lisible
  category: string;                       // Regroupement (responsabilité, IP, confid...)
  description: string;

  attributes: AttributeDefinition[];
  applicableDocumentTypes: string[];      // Types de docs où cette clause peut apparaître

  typicalKeywords: string[];              // Aide à l'extraction LLM
}

interface AttributeDefinition {
  id: string;                             // Ex: "cap_amount"
  name: string;
  type: 'number' | 'string' | 'date' | 'duration' | 'currency' | 'boolean' | 'enum';
  required: boolean;
  description: string;
  enumValues?: string[];                  // Si type = enum
}
```

### 3.2. Ontologie maison — aperçu

L'ontologie maison couvre les 50-100 types de clauses les plus fréquents. Elle est à implémenter en tant que **fichier JSON** chargé au démarrage du backend.

**Catégories principales** :

- **Identification & Parties** : parties, signataires, représentants
- **Périmètre & Définitions** : objet du contrat, définitions, annexes
- **Termes commerciaux** : prix, paiement, conditions financières
- **Durée & Résiliation** : durée, renouvellement, résiliation, préavis
- **Exécution & Livraison** : obligations, livrables, SLA, pénalités
- **Propriété intellectuelle** : titularité, licences, droits de propriété, code source
- **Confidentialité** : définition des informations confidentielles, obligations, durée, exceptions
- **Données & RGPD** : DPA, sous-traitance, transferts, sécurité
- **Responsabilité & Garanties** : cap de responsabilité, garanties, exclusions
- **Changement de contrôle** : change of control, cession, transmission
- **Non-concurrence & Exclusivité** : périmètre, durée, territoire
- **Force majeure** : définition, notification, conséquences
- **Loi & Juridiction** : loi applicable, juridiction compétente, arbitrage
- **Divers** : intégralité de l'accord, renonciation, nullité partielle, notifications

**Exemple de définition** (à compléter pour chaque type) :

```json
{
  "id": "LIMITATION_RESPONSABILITE",
  "name": "Limitation de responsabilité",
  "category": "Responsabilité & Garanties",
  "description": "Clause plafonnant ou excluant la responsabilité d'une partie",
  "attributes": [
    {
      "id": "cap_type",
      "name": "Type de plafond",
      "type": "enum",
      "enumValues": ["GLOBAL", "PAR_SINISTRE", "ANNUEL", "PAR_OCCURRENCE"],
      "required": false,
      "description": "Nature du plafond de responsabilité"
    },
    {
      "id": "cap_amount",
      "name": "Montant du cap",
      "type": "number",
      "required": false,
      "description": "Montant absolu du plafond de responsabilité"
    },
    {
      "id": "cap_reference",
      "name": "Référence du cap",
      "type": "enum",
      "enumValues": ["PRIX_CONTRAT", "PRIX_ANNUEL", "FIXE"],
      "required": false,
      "description": "Base de référence pour le calcul du cap"
    },
    {
      "id": "carve_outs",
      "name": "Exclusions",
      "type": "string",
      "required": false,
      "description": "Cas exclus du plafond (faute lourde, dol, RGPD, IP...)"
    },
    {
      "id": "indirect_damages_excluded",
      "name": "Dommages indirects exclus",
      "type": "boolean",
      "required": false
    }
  ],
  "applicableDocumentTypes": ["CONTRAT/*"],
  "typicalKeywords": ["limitation", "responsabilité", "plafond", "cap", "liability", "limited to", "maximum"]
}
```

### 3.3. Ontologie de marché

Mapping vers une taxonomie standard du marché (type EDGAR ou équivalent LEDES). À documenter en implémentation — l'idée est d'offrir l'alternative, pas de la perfectionner en pré-alpha.

## 4. Le modèle analyse

### 4.1. Analysis

Unité de travail dans le module. Regroupe des documents extraits, une conversation, et toutes les opérations produites.

```typescript
interface Analysis {
  id: string;
  workspaceId: string;
  name: string;                           // Éditable par l'utilisateur
  createdAt: Date;
  createdBy: string;
  lastActivityAt: Date;

  status: 'active' | 'archived';

  // Composition
  documents: AnalysisDocument[];

  // Interaction
  conversation: ConversationMessage[];

  // Productions v1 (conservées)
  deliverables: Deliverable[];

  // Productions v2 (nouvelles primitives)
  tabularReviews: TabularReview[];
  contractDrafts: ContractDraft[];
  multiDocRedlines: MultiDocRedline[];

  // Configuration (optionnel en pré-alpha)
  referenceAssetHints?: string[];         // Playbooks / standards suggérés
}

interface AnalysisDocument {
  legalObjectId: string;
  role: 'target' | 'reference' | 'context';
  addedAt: Date;
  addedBy: string;
  orderInAnalysis: number;
}
```

### 4.2. ConversationMessage

Les messages de la conversation en langage naturel.

```typescript
interface ConversationMessage {
  id: string;
  analysisId: string;
  timestamp: Date;

  role: 'user' | 'assistant';
  content: string;                        // Texte du message

  // Si assistant : peut porter des références à des livrables
  deliverableReferences?: string[];       // IDs des livrables générés
  citations?: Citation[];                 // Citations utilisées dans la réponse

  // Interprétation (pour les messages user)
  interpretedIntent?: UserIntent;
}

interface UserIntent {
  operation: 'confrontation' | 'aggregation' | 'alignment' | 'query' | 'unclear';
  targetDocuments: string[];
  referenceAssets: string[];
  deliverableTypes: DeliverableType[];
  clarificationNeeded?: string;
  confidence: ConfidenceLevel;
}
```

## 5. Les livrables

### 5.1. Deliverable

Un livrable produit par une opération métier.

```typescript
interface Deliverable {
  id: string;
  analysisId: string;
  type: DeliverableType;
  name: string;                           // Éditable
  createdAt: Date;
  createdBy: 'ai' | 'user';
  currentVersion: number;

  status: 'draft' | 'validated' | 'archived';

  // Contenu (structure dépend du type)
  content: DeliverableContent;

  // Documents source
  sourceDocumentIds: string[];
  referenceAssetIds: string[];

  // Opération d'origine
  sourceOperation: 'confrontation' | 'aggregation' | 'alignment';
  sourcePromptSnapshot?: string;

  // Versions
  versions: DeliverableVersion[];
}

type DeliverableType =
  | 'review_note'           // Note de revue (audit unitaire)
  | 'comparative_note'      // Note comparative
  | 'dd_synthesis'          // Note de synthèse DD
  | 'dd_table'              // Tableau DD
  | 'redline'               // Redline d'un document
  | 'clausier';             // Clausier
```

### 5.2. DeliverableContent par type

```typescript
type DeliverableContent =
  | ReviewNoteContent
  | ComparativeNoteContent
  | DdSynthesisContent
  | DdTableContent
  | RedlineContent
  | ClausierContent;

// Note de revue (audit unitaire)
interface ReviewNoteContent {
  type: 'review_note';
  executiveSummary: {
    verdict: 'acceptable' | 'to_negotiate' | 'to_refuse';
    topPriorityPoints: string[];
    recommendedPosition: string;
  };
  documentCharacteristics: {
    title: string;
    parties: string[];
    term: string;
    amounts: string;
    governingLaw: string;
    structure: string;
  };
  clauseAnalysis: ClauseAnalysisItem[];
  transversePoints: string[];
  annexCitations: Citation[];
}

interface ClauseAnalysisItem {
  clauseType: string;
  clauseTitle: string;
  verdict: 'conforme' | 'to_negotiate' | 'red_flag' | 'absent';
  playbookPosition: { text: string; citation: Citation };
  contractPosition?: { text: string; citation: Citation };
  gap: string;
  negotiationRecommendation: string;
}

// Note comparative
interface ComparativeNoteContent {
  type: 'comparative_note';
  synthesis: {
    overallGapLevel: 'minimal' | 'moderate' | 'significant' | 'major';
    topGaps: string[];
    negotiationRecommendation: string;
  };
  clauseComparison: ClauseComparisonRow[];
  onlyInA: ClauseReference[];
  onlyInB: ClauseReference[];
  pointByPointRecommendations: string[];
  annexCitations: Citation[];
}

interface ClauseComparisonRow {
  clauseType: string;
  documentA: { text: string; citation: Citation } | null;
  documentB: { text: string; citation: Citation } | null;
  gap: 'equivalent' | 'editorial' | 'substantive' | 'unfavorable' | 'red_flag';
  commentary: string;
}

// Note de synthèse DD
interface DdSynthesisContent {
  type: 'dd_synthesis';
  perimeter: {
    contractCount: number;
    documentTypes: string[];
    grid: string;                         // Nom de la grille utilisée
  };
  mainRisks: RiskItem[];
  transverseThemes: ThemeSection[];
  recommendations: string[];
  tableReference: string;                 // ID du livrable dd_table associé
}

interface RiskItem {
  riskNature: string;
  affectedContracts: string[];            // IDs des documents
  potentialImpact: string;
}

interface ThemeSection {
  theme: string;
  findings: string;
  affectedContracts: string[];
}

// Tableau DD
interface DdTableContent {
  type: 'dd_table';
  gridId: string;                         // Référence à la grille utilisée
  columns: DdTableColumn[];
  rows: DdTableRow[];
  summary: DdTableSummary;
}

interface DdTableColumn {
  id: string;
  header: string;
  questionType: string;                   // Venu de la grille
}

interface DdTableRow {
  documentId: string;
  documentName: string;
  cells: Record<string, DdTableCell>;     // columnId → cell
  userAnnotation?: string;
}

interface DdTableCell {
  value: string;                          // Synthèse de la valeur
  riskLevel: 'green' | 'orange' | 'red' | 'na';
  citation?: Citation;
  confidence: ConfidenceLevel;
  isUserEdited: boolean;
}

interface DdTableSummary {
  greenCount: number;
  orangeCount: number;
  redCount: number;
  unansweredCount: number;
}

// Redline
interface RedlineContent {
  type: 'redline';
  targetDocumentId: string;

  // Représentation du document avec modifications
  // En pré-alpha, on peut simuler avec une structure simple
  baseHtml: string;                       // HTML du doc avec spans .ins/.del
  changes: RedlineChange[];
  comments: RedlineComment[];
}

interface RedlineChange {
  id: string;
  type: 'insertion' | 'deletion' | 'replacement';
  originalText?: string;
  newText?: string;
  location: {
    startOffset: number;
    endOffset: number;
  };
  clauseContext: string;                  // Clause concernée
  rationale: string;                      // Pourquoi
  referenceSource: string;                // D'où vient la proposition
  status: 'pending' | 'accepted' | 'rejected';
}

interface RedlineComment {
  id: string;
  anchor: { startOffset: number; endOffset: number };
  author: 'ai' | 'user';
  authorName: string;
  text: string;
  createdAt: Date;
  thread?: RedlineComment[];
}

// Clausier
interface ClausierContent {
  type: 'clausier';
  title: string;
  description: string;
  sourceDocumentIds: string[];
  sourceContractCount: number;
  ontologyId: string;
  language: 'fr' | 'en';

  sections: ClausierSection[];
}

interface ClausierSection {
  id: string;
  clauseType: string;
  clauseTypeDefinition: string;            // Issue de l'ontologie
  stakes: string;                          // Enjeux de cette clause
  variants: ClausierVariant[];
}

interface ClausierVariant {
  id: string;
  label: string;                           // Libellé distinctif
  frequency: number;                       // Occurrences dans le corpus
  context?: string;                        // Deal size, secteur, juridiction
  representativeText: string;
  sourceCitations: Citation[];             // Contrats d'origine
  commentary?: string;
  attributes?: Record<string, unknown>;   // Sous-attributs agrégés
}
```

### 5.3. DeliverableVersion

```typescript
interface DeliverableVersion {
  version: number;
  createdAt: Date;
  createdBy: 'ai' | 'user';
  summary: string;                        // Description de la version
  contentSnapshot: DeliverableContent;    // Copie complète du contenu
}
```

## 6. La base de référence

### 6.1. Playbook

Un référentiel de positions de négociation.

```typescript
interface Playbook extends ReferenceAsset {
  type: 'playbook';
  content: PlaybookContent;
}

interface PlaybookContent {
  scope: string;                          // Ex: "Contrats commerciaux"
  applicableDocumentTypes: string[];

  sections: PlaybookSection[];
}

interface PlaybookSection {
  clauseType: string;
  stakes: string;

  positions: {
    ideal: {
      description: string;
      templateText?: string;
      attributes?: Record<string, unknown>;
    };
    fallback: {
      description: string;
      templateText?: string;
      conditions?: string;
      attributes?: Record<string, unknown>;
    };
    redFlag: {
      description: string;
      examples: string[];
      rationale: string;
    };
  };

  negotiationGuidance?: string;
}
```

### 6.2. Standard

Un document de référence (NDA standard, DPA standard, contrat-cadre maison, etc.) sous sa forme structurée.

```typescript
interface Standard extends ReferenceAsset {
  type: 'standard';
  content: StandardContent;
}

interface StandardContent {
  documentType: string;                   // Ex: "CONTRAT/NDA_MUTUEL"
  description: string;
  usageContext: string;

  structuredContent: LegalObject;         // Représentation structurée
  fullText: string;                       // Texte intégral
}
```

### 6.3. DdGrid

Une grille de due diligence.

```typescript
interface DdGrid extends ReferenceAsset {
  type: 'dd_grid';
  content: DdGridContent;
}

interface DdGridContent {
  operationType: string;                  // "M&A", "Refinancement", "JV"
  applicableDocumentTypes: string[];

  questions: DdQuestion[];
}

interface DdQuestion {
  id: string;
  category: string;                       // Ex: "Change of Control"
  question: string;                       // "Existe-t-il une clause de CoC ?"

  relatedClauseTypes: string[];           // Types de clauses à examiner

  answerFormat: {
    type: 'boolean' | 'text' | 'numeric' | 'enum';
    enumValues?: string[];
  };

  riskRules: DdRiskRule[];                // Règles de scoring
}

interface DdRiskRule {
  condition: string;                      // Ex: "Si seuil < 33%"
  level: 'green' | 'orange' | 'red';
  rationale: string;
}
```

### 6.4. Clausier (actif)

Un clausier constitué et publié dans la base (peut venir d'un livrable clausier).

```typescript
interface ClausierAsset extends ReferenceAsset {
  type: 'clausier';
  content: ClausierAssetContent;
}

interface ClausierAssetContent extends ClausierContent {
  // Même structure que ClausierContent dans les livrables
  // Avec en plus :
  publishedFrom?: {
    analysisId: string;
    deliverableId: string;
  };
}
```

### 6.5. ReferenceAsset (base commune)

```typescript
interface ReferenceAsset {
  id: string;
  type: 'playbook' | 'standard' | 'dd_grid' | 'clausier';
  name: string;
  description: string;

  createdAt: Date;
  createdBy: string;
  lastUpdatedAt: Date;
  lastUpdatedBy: string;

  ontologyId: string;
  jurisdiction?: string;
  language: 'fr' | 'en';

  currentVersion: number;
  versions: AssetVersionHistory[];

  // Statut (gouvernance basique)
  governanceStatus: 'draft' | 'under_review' | 'validated' | 'archived';

  // Gouvernance (rôles utilisateurs sur cet actif)
  governance: AssetGovernance;

  // File d'attente d'amendements proposés
  pendingAmendments: AssetAmendment[];

  tags?: string[];
}

interface AssetVersionHistory {
  version: number;
  createdAt: Date;
  createdBy: string;
  summary: string;
  contentSnapshot: unknown;               // Selon le type
}

interface AssetGovernance {
  ownerUserId: string;                    // Owner unique (Legal Ops, PSL)
  approverUserIds: string[];              // Approuveurs (GC, Managing Partner)
  contributorUserIds: string[];           // Contributeurs (proposent des amendements)
  // Lecteurs : tous les utilisateurs du workspace par défaut
}

interface AssetAmendment {
  id: string;
  proposedAt: Date;
  proposedBy: string;
  proposedFromAnalysisId?: string;        // Origine si proposé depuis une analyse
  scope: 'clause_position' | 'fallback' | 'red_flag' | 'argumentaire' | 'new_clause' | 'other';
  targetPath: string;                     // Ex : "clauses.liability.fallback"
  currentValue: string;                   // Valeur actuelle dans la version courante
  proposedValue: string;                  // Valeur proposée par le contributeur
  rationale: string;                      // Justification (négociation, jurisprudence, etc.)
  status: 'pending' | 'accepted' | 'rejected' | 'deferred';
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewerComment?: string;
}
```

**Pré-alpha** : un seul utilisateur fictif joue tous les rôles. Le mécanisme d'amendement est **matérialisé en UX** mais avec validation immédiate (pas de file d'attente multi-utilisateurs). L'objet `AssetAmendment` est persisté pour traçabilité et démonstration de la trajectoire complète, même résolue instantanément.

**Alpha et au-delà** : workflow multi-utilisateurs réel avec file d'attente et notifications. Voir `10-cycle-de-vie-actifs-reference.md` §4.2.

## 7. Relations et contraintes

### 7.1. Cardinalités

- 1 Workspace contient 0..n Documents
- 1 Document a 0..1 LegalObject (unique, remplacé à chaque ré-extraction)
- 1 LegalObject contient n Clauses, n DefinedTerms, n CrossReferences
- 1 Workspace contient 0..n Analyses
- 1 Analysis contient 1..n LegalObjects (via AnalysisDocument)
- 1 Analysis contient 0..n Deliverables
- 1 Deliverable a 1..n DeliverableVersions
- 1 ReferenceBase (globale) contient 0..n ReferenceAssets par type

### 7.2. Contraintes d'intégrité

- Une clause ne peut exister sans LegalObject parent
- Un deliverable doit référencer au moins un source document ou un reference asset
- Une citation doit pointer sur un Document existant et des passages existants
- La version courante d'un deliverable doit figurer dans ses versions
- L'ontologyId d'un LegalObject doit exister dans la liste des ontologies

### 7.3. Suppressions en cascade

- Supprimer un Workspace → supprime Documents, Analyses, LegalObjects, Deliverables
- Supprimer un Document → supprime LegalObject (si existant), retire de ses Analyses
- Supprimer un LegalObject → supprime Clauses, DefinedTerms, CrossReferences
- Supprimer une Analysis → supprime Conversation, Deliverables (AnalysisDocuments libérés)
- Supprimer un ReferenceAsset → les analyses qui l'utilisaient conservent leurs livrables (snapshot)

## 8. Schéma SQL (SQLite / Drizzle)

Je ne détaille pas le schéma SQL complet (à générer via Drizzle ORM à partir des interfaces TypeScript), mais voici les tables principales :

```sql
-- Workspaces et documents
CREATE TABLE workspaces (id, name, description, created_at, active_ontology_id);
CREATE TABLE documents (id, workspace_id, file_name, mime_type, ...);
CREATE TABLE text_passages (id, document_id, page, paragraph, text, ...);

-- Legal objects
CREATE TABLE legal_objects (id, document_id, ontology_id, document_type, ...);
CREATE TABLE clauses (id, legal_object_id, type, text, order, confidence, ...);
CREATE TABLE clause_attributes (clause_id, attribute_id, value_json, citation_json, confidence);
CREATE TABLE defined_terms (id, legal_object_id, term, definition, ...);
CREATE TABLE cross_references (id, legal_object_id, source_clause_id, target_clause_id, ...);
CREATE TABLE user_edits (id, legal_object_id, timestamp, type, target, ...);

-- Analyses
CREATE TABLE analyses (id, workspace_id, name, created_at, status, ...);
CREATE TABLE analysis_documents (analysis_id, legal_object_id, role, order, ...);
CREATE TABLE conversation_messages (id, analysis_id, role, content, timestamp, ...);

-- Livrables
CREATE TABLE deliverables (id, analysis_id, type, name, current_version, content_json, ...);
CREATE TABLE deliverable_versions (deliverable_id, version, created_at, content_json);

-- Base de référence
CREATE TABLE reference_assets (id, type, name, content_json, ontology_id, language, ...);
CREATE TABLE reference_asset_versions (asset_id, version, created_at, content_json);

-- Ontologies (peu de tables car chargées depuis JSON au démarrage)
CREATE TABLE ontology_metadata (id, version, loaded_at);
```

Les contenus riches (`clause_attributes.value_json`, `deliverables.content_json`, `reference_assets.content_json`) sont stockés en JSON dans des colonnes TEXT. C'est pragmatique pour SQLite et évite des jointures complexes. Avec une vraie migration Postgres, on pourra passer à JSONB ou éclater en tables relationnelles selon les besoins.

## 9. Exemples d'objets

### 9.1. Exemple de LegalObject (fragment)

```json
{
  "id": "lo_abc123",
  "documentId": "doc_xyz789",
  "ontologyId": "maison",
  "extractedAt": "2026-04-23T14:32:00Z",
  "extractionVersion": 1,

  "documentType": "CONTRAT",
  "documentSubtype": "NDA_MUTUEL",
  "language": "fr",
  "overallConfidence": "high",

  "metadata": {
    "title": "Accord de confidentialité mutuel",
    "parties": [
      {
        "id": "party_1",
        "name": "ACME SAS",
        "role": "other",
        "legalForm": "SAS",
        "registrationNumber": "123 456 789 RCS Paris",
        "citation": { "documentId": "doc_xyz789", "passageIds": ["p_001"], "page": 1, "extract": "ACME SAS, société..." },
        "confidence": "high"
      },
      {
        "id": "party_2",
        "name": "Bosch France SARL",
        "role": "other",
        "citation": { "documentId": "doc_xyz789", "passageIds": ["p_001"], "page": 1, "extract": "Bosch France SARL..." },
        "confidence": "high"
      }
    ],
    "governingLaw": {
      "jurisdiction": "FR",
      "citation": { "documentId": "doc_xyz789", "passageIds": ["p_045"], "page": 5, "extract": "Le présent accord est régi par le droit français..." }
    },
    "contractTerm": {
      "value": "3",
      "unit": "years",
      "citation": { "documentId": "doc_xyz789", "passageIds": ["p_020"], "page": 3, "extract": "durée de trois (3) ans..." }
    }
  },

  "clauses": [
    {
      "id": "cl_001",
      "type": "DEFINITION_INFORMATION_CONFIDENTIELLE",
      "heading": "Article 1 — Définitions",
      "sequenceNumber": "1",
      "order": 0,
      "text": "On entend par « Information Confidentielle » toute information...",
      "citation": { "documentId": "doc_xyz789", "passageIds": ["p_005", "p_006"], "page": 2, "extract": "..." },
      "attributes": {
        "scope_breadth": { "value": "BROAD", "confidence": "high", "isUserEdited": false },
        "includes_verbal": { "value": true, "confidence": "medium", "isUserEdited": false }
      },
      "confidence": "high",
      "isUserAdded": false,
      "isUserModified": false,
      "linkedDefinedTerms": ["dt_001"],
      "linkedClauses": ["cl_002", "cl_005"]
    }
  ],

  "definedTerms": [
    {
      "id": "dt_001",
      "term": "Information Confidentielle",
      "definition": "Toute information...",
      "citation": { "documentId": "doc_xyz789", "passageIds": ["p_005"], "page": 2, "extract": "..." },
      "confidence": "high",
      "referencedInClauses": ["cl_001", "cl_002", "cl_003"]
    }
  ],

  "crossReferences": []
}
```

Cet objet juridique est le **résultat de l'indexation 2**. Il est la base de toute opération métier.

## 7. Nouvelles entités v2

### 7.1. TabularReview

```typescript
interface TabularReview {
  id: string;
  analysisId: string;
  name: string;                       // Ex: "Diligence Apollo — DDQ M&A"
  createdAt: Date;
  createdBy: string;
  lastRunAt?: Date;

  workflowId?: string;                // Si issu d'un workflow OOTB
  isCustom: boolean;                  // True si colonnes ad hoc

  columns: TabularColumn[];
  rows: TabularRow[];                 // Un row par document
}

interface TabularColumn {
  id: string;
  order: number;
  label: string;                      // Ex: "Loi applicable"
  question: string;                   // Définition pour le LLM
  expectedType: 'text' | 'date' | 'number' | 'boolean' | 'enum';
  enumValues?: string[];
  isFromWorkflow: boolean;
}

interface TabularRow {
  id: string;
  documentId: string;
  legalObjectId: string;
  cells: Record<string, TabularCell>; // Indexé par columnId
}

interface TabularCell {
  columnId: string;
  rowId: string;
  value: string | number | boolean | null;
  rawValue?: string;                  // Texte brut extrait du LLM
  citation?: Citation;                // Référence ancrée (héritée de l'indexation Legal)
  confidence: 'high' | 'medium' | 'low' | 'absent';
  isUserEdited: boolean;
  lastRunAt: Date;
}
```

### 7.2. Workflow (OOTB uniquement en démonstrateur)

```typescript
interface Workflow {
  id: string;
  name: string;
  description: string;
  kind: 'tabular_review_preset' | 'audit_preset';
  applicableDocumentTypes: string[];  // Ex: ["MSA", "NDA"]
  language: 'fr' | 'en';
  definition: TabularReviewWorkflowDefinition | AuditWorkflowDefinition;
}

interface TabularReviewWorkflowDefinition {
  columns: Array<{
    label: string;
    question: string;
    expectedType: 'text' | 'date' | 'number' | 'boolean' | 'enum';
    enumValues?: string[];
  }>;
}
```

### 7.3. Redline (entité de premier rang)

Remplace `RedlineContent` (contenu d'un `Deliverable`) par une entité indépendante réutilisable depuis plusieurs opérations.

```typescript
interface Redline {
  id: string;
  analysisId: string;
  sourceDocumentId: string;
  sourceLegalObjectId: string;
  producedBy: 'audit' | 'comparison' | 'contract_draft' | 'multi_doc';
  producedFromId: string;             // ID de l'opération source

  baseTextSnapshot: string;           // Texte original du doc au moment de la production
  proposals: RedlineProposal[];
  comments: RedlineComment[];

  createdAt: Date;
  createdBy: 'ai' | 'user';
  status: 'draft' | 'reviewed' | 'finalized';
}

interface RedlineProposal {
  id: string;
  type: 'insertion' | 'deletion' | 'replacement';
  oldText?: string;
  newText?: string;
  location: { startOffset: number; endOffset: number };
  clauseContext: string;
  rationale: string;
  referenceSource: string;            // Playbook X / Standard Y / Décision projet
  referenceCitation?: Citation;
  status: 'pending' | 'accepted' | 'rejected';
  acceptedAt?: Date;
  acceptedBy?: string;
}
```

### 7.4. ContractDraft

```typescript
interface ContractDraft {
  id: string;
  analysisId: string;
  templateStandardId: string;         // Référence à un Standard de la base
  variables: Record<string, string>;  // Variables instanciées (parties, montants, dates)
  outputRedlineId: string;            // Le Redline produit
  createdAt: Date;
}
```

### 7.5. MultiDocRedline

```typescript
interface MultiDocRedline {
  id: string;
  analysisId: string;
  targetDocumentIds: string[];
  decision: string;                   // Description en langage naturel
  decisionStructured?: {
    clauseType?: string;
    targetValue?: string;
  };
  perDocumentRedlines: Array<{
    documentId: string;
    redlineId: string | null;         // null si non applicable
    notApplicable: boolean;
    notApplicableReason?: string;
  }>;
  createdAt: Date;
}
```

### 7.6. Capitalisation — pas de nouvelle entité

La capitalisation réutilise `AssetAmendment` (§6.5) avec un nouveau champ `triggerSource` :

```typescript
interface AssetAmendment {
  // ... champs existants
  triggerSource: 'redline_acceptance' | 'manual'; // NOUVEAU — trace l'origine
  triggerRedlineId?: string;          // ID du Redline dont l'acceptation a déclenché la proposition
}
```

## 10. Ce document en usage

Quand l'équipe produit ou Claude Code implémente :
- Le schéma TypeScript est **la source de vérité** — les entités backend et frontend en dérivent
- L'ontologie est **un fichier JSON séparé**, chargé au démarrage
- Les livrables ont chacun une structure de contenu dédiée, mais **partagent l'enveloppe `Deliverable`**
- La base de référence a ses propres types, avec une **enveloppe commune `ReferenceAsset`**

Suite : [04-ux-et-parcours.md](./04-ux-et-parcours.md) pour la traduction en écrans.
