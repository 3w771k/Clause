# 01 — Vision et contexte

## 1. Le produit AI Workplace

AI Workplace est une suite de produits Sinequa permettant à des équipes métier de déposer des documents dans des workspaces, de les indexer, et d'y appliquer des modules d'analyse assistés par IA. Les modules existants dans la vision du workspace sont :

- **Threads** — assistant conversationnel RAG sur les documents du workspace
- **Checklist** — réponses structurées à une liste de questions définies par l'utilisateur
- **Canvas** — éditeur de texte assisté par IA (rédaction longue)
- **Financials** — extraction structurée de données financières

**Legal Extraction** est un nouveau module à ajouter à cette liste. Sa vocation : apporter au workspace les capacités spécifiques au traitement de documents juridiques — contrats, NDA, politiques, memos — que les autres modules ne peuvent pas traiter nativement.

## 2. Le besoin marché

De plus en plus de clients, notamment dans le secteur légal, demandent à Sinequa des capacités :

- d'**audit de contrats** (revue unitaire ou en masse)
- de **création de clausier** (bibliothèque de clauses types)
- de **comparaison de politiques contractuelles et de NDA**

Ces usages ne peuvent pas être adressés avec les modules génériques existants parce qu'ils supposent une **compréhension métier spécifique** — l'identification des clauses, leur typage, leur structuration en objets juridiques, l'alignement sémantique entre documents, la production de livrables aux formats attendus par la profession (note de revue, redline, clausier).

Le module Legal Extraction répond à ces besoins en apportant une **couche métier legal** au-dessus de l'indexation Sinequa générique.

## 3. Les trois cibles

Le module adresse **trois cibles** qui partagent la même base fonctionnelle mais ont des workflows et des attentes différents : les **cabinets d'avocats**, les **directions juridiques d'entreprise**, et les **fonds de Private Equity** (déclinaison spécifique de l'in-house traitée à part en raison de ses workflows DD intensifs et de ses connecteurs prioritaires).

### 3.1. Cabinets d'avocats

**Logique économique** : facturation au temps passé (billable hours) ou au forfait. L'IA est à la fois une opportunité (prendre des dossiers plus gros, rendre plus vite) et une menace (éroder les heures facturables junior). Toute solution doit composer avec cette tension.

**Personas clés** :

- **Associés (partners)** : dirigent les dossiers, arbitrent les risques, signent les deliverables. Ils ne tapent pas dans l'outil au quotidien mais exigent des livrables impeccables et une traçabilité parfaite pour couvrir leur responsabilité professionnelle.
- **Collaborateurs (associates)** : utilisateurs intensifs. Ils font la due diligence, les recherches, les premiers drafts. Ils cherchent à gagner du temps sur les tâches répétitives sans perdre en qualité.
- **Professional Support Lawyers (PSL) / knowledge lawyers** : gèrent les précédents, les clausiers internes, les templates. Alliés naturels d'un outil comme Legal Extraction parce que leur mission est déjà de capitaliser le savoir du cabinet.
- **CIO / Innovation Lead** : décideur tech, responsable de l'adoption.

**Workflows typiques** :
- Due diligence M&A (analyser des data rooms de 500-5000 contrats en 2-6 semaines)
- Revue de contrats côté client (achats, distribution, licences)
- Drafting assisté à partir de précédents
- Recherche jurisprudentielle et doctrinale
- Memos et consultations juridiques

**Contrainte culturelle forte** : chaque cabinet a sa "doctrine maison", ses formulations préférées, ses précédents fétiches. Un outil qui ne respecte pas ça est perçu comme inutile.

### 3.2. Directions juridiques d'entreprise (in-house legal)

**Logique économique** : centre de coût qui doit démontrer sa valeur. L'IA est une promesse de faire plus avec moins, de reprendre la main sur le travail envoyé aux cabinets externes, et de répondre plus vite aux demandes business internes.

**Personas clés** :

- **General Counsel / Directeur Juridique** : pilote, arbitre le budget, négocie avec les cabinets externes. Veut des dashboards, du reporting de risque, des réponses rapides pour le board.
- **Juristes opérationnels** : répartis par domaine (contrats commerciaux, corporate, social, IP, data/privacy, compliance). Besoins variables selon le domaine.
- **Contract Manager / Legal Ops** : rôle en forte croissance, très friand d'outils, orienté process et data. Souvent le meilleur sponsor interne.
- **Clients internes** (commerciaux, achats, RH, finance) : pas juristes mais soumettent des demandes au service juridique.

**Workflows typiques** :
- Revue et négociation de contrats entrants
- Maintien d'un clausier / playbook interne (clauses acceptables, fallback, red flags)
- Gestion du cycle de vie contractuel
- Réponses aux sollicitations internes
- Arbitrage des dossiers entre traitement interne et externalisation

**Contrainte culturelle forte** : le juridique interne est souvent perçu comme un frein par le business. Un outil qui aide à dire "oui plus vite" est un champion. Un outil qui ajoute de la friction meurt.

#### 3.2.1. Cas particulier : les fonds de Private Equity

Les fonds de Private Equity (PE) sont une **déclinaison à part de l'in-house**. Ils ont une direction juridique interne — souvent petite (1 à 5 personnes même dans les grands fonds) — mais une activité fondamentalement différente d'une direction juridique d'entreprise classique.

**Logique économique propre** : le coût d'un outil legal est noyé dans les frais de transaction d'un deal. Le ROI ne se mesure pas en euros économisés sur des cabinets externes mais en **vélocité de DD** : capacité à conclure ou abandonner un deal plus vite. Une semaine gagnée sur une exclusivité, c'est plusieurs millions d'euros d'option préservés.

**Workflow dominant — la due diligence pré-acquisition** :
- Volume bursty extrême : 0 contrat la semaine N, 2000 contrats la semaine N+1
- Fenêtre serrée : 2 à 6 semaines entre l'ouverture de la data room et le SPA
- Documents qu'on ne possède pas : on audite les contrats d'une **cible**, pas les siens
- Externalisation forte vers les cabinets M&A mandatés, mais tendance à internaliser une partie du screening en amont

**Personas spécifiques** :
- **Operating Partner / Head of Legal Ops** du fonds : champion naturel d'un outil de DD, souvent l'acheteur économique
- **Investment team (associés, principals)** : utilisateurs ponctuels mais exigeants — ils veulent des red flags lisibles en 2 minutes, pas un rapport de 80 pages
- **General Counsel du fonds** : superviseur, garant des risques, signe les transactions

**Particularités du playbook PE** : ce n'est pas un playbook de négociation (on ne renégocie pas les contrats de la cible) mais un playbook de **détection de risques d'investissement** — change of control, exclusivités, MAC clauses, durées résiduelles, garanties, plafonds de responsabilité. Très proche d'une grille de DD enrichie.

**Intégration critique** : les fonds PE travaillent sur des **VDR** (virtual data rooms — Datasite, Intralinks, Ansarada, Imprima, Firmex). Sans connecteur VDR, l'outil restera un usage manuel, ce qui est rédhibitoire pour ce segment.

| **Implication produit** Le segment PE est servi par le **même module** que les autres in-house, mais avec une configuration spécifique : grille de DD pré-câblée pour les risques d'investissement, ergonomie tournée vers le screening rapide de masse, connecteurs VDR prioritaires en alpha. Voir [09-positionnement-marche.md](./09-positionnement-marche.md) pour le détail du positionnement et la stratégie d'intégration. |
| --- |

### 3.3. Ce qui distingue les trois cibles

| Dimension | Cabinets | Directions juridiques | Fonds de Private Equity |
|---|---|---|---|
| Volume de dossiers | Élevé, très variés | Plus stable, plus répétitif | Bursty extrême (0 puis 2000) |
| Exigence de qualité livrable | Extrême (responsabilité pro) | Élevée mais pragmatique | Lisibilité red flags > exhaustivité |
| Besoin de self-service non-juriste | Faible | Fort | Fort (investment team) |
| Sensibilité au coût | Investissement stratégique | ROI à prouver vite | Coût noyé dans frais de transaction |
| Données | Multi-clients, cloisonnement strict | Mono-entreprise, silos internes | Cible (pas les siennes) — accès VDR |
| Usage dominant | Recherche + drafting | Revue + standardisation | Screening DD + agrégation risques |
| Métrique de succès | Heures économisées + différenciation | Vitesse de réponse au business | Vélocité de DD, go/no-go plus rapide |
| Connecteur critique | iManage / NetDocuments / HighQ | SharePoint / Teams / CLM | VDR (Datasite, Intralinks, Ansarada) |

**Implication pour le module** : le module ne doit pas être un compromis entre les trois. Il doit être **suffisamment configurable** pour que chaque cible trouve son compte — même module de base, usages adaptés via la base de référence, les templates et les connecteurs prioritaires par segment.

## 4. Les trois cas d'usage cibles

Le module adresse **trois cas d'usage** qui recouvrent les besoins exprimés par le marché. Ces trois cas d'usage correspondent à **trois opérations métier fondamentales** sur les objets juridiques extraits.

### 4.1. Audit de contrat — opération de *confrontation*

**Principe** : confronter un document (ou un corpus) à un **référentiel** — un playbook, une grille de DD — et produire un diagnostic clause par clause.

**Déclinaison unitaire (in-house ou cabinet)** : un juriste reçoit un contrat (fournisseur, client, NDA) et doit dire si c'est acceptable, ce qu'il faut négocier, et formaliser sa position. Volume : 1 contrat.

**Déclinaison DD (cabinet M&A)** : dans une data room, auditer N contrats (50 à 5000) pour identifier les risques impactant le deal — change of control, exclusivités, durées, pénalités. Volume de masse.

**Livrables** : note de revue + redline pour l'unitaire ; tableau Excel + note de synthèse pour la DD.

### 4.2. Création de clausier — opération d'*agrégation*

**Principe** : agréger les clauses extraites d'un corpus de contrats pour constituer une bibliothèque organisée, navigable, valorisable.

**Déclinaison cabinet** : clausier de capitalisation. Les PSL extraient les "meilleures clauses" des précédents pour constituer un patrimoine de rédaction (ex : clausier SPA à partir de 80 deals signés).

**Déclinaison in-house** : clausier plus normatif, pour consolider des positions de référence et détecter les dérives.

**Livrable** : document clausier structuré, navigable, publiable dans la base de référence du module.

### 4.3. Comparaison de documents — opération d'*alignement*

**Principe** : aligner deux documents (ou plus) clause par clause et identifier les écarts sémantiques et structurels.

**Déclinaison in-house** : NDA entrant vs NDA standard maison. Politique fournisseur vs politique interne. Cas canonique, très fréquent.

**Déclinaison cabinet** : comparaison de versions négociées, comparaison d'un entrant avec un précédent similaire, comparaison d'offres dans un appel d'offres.

**Livrables** : note comparative + redline du document cible.

## 5. Les opérations métier — synthèse

| Opération | Input | Output principal | Cas d'usage |
|---|---|---|---|
| **Confrontation** (audit) | 1 doc cible + 1 référentiel | Verdicts clause par clause + Redline | Audit |
| **Alignement** (comparaison) | 2 docs | Diff sémantique structuré + Redline | Comparaison |
| **Tabularisation** (anciennement agrégation) | N docs + colonnes (ad hoc ou workflow OOTB) | Tabular Review sourcée par cellule | Clausier, DDQ, Conformité |
| **Instanciation** (contract draft) *(NOUVEAU)* | Template Standard + contexte projet | Redline + `.docx` | Création de contrat |
| **Coordination** (multi-doc redline) *(NOUVEAU)* | N docs + décision en NL | N Redlines cohérents | Harmonisation de corpus |

Les **workflows out-of-the-box** (Clausier MSA, Clausier NDA, DDQ M&A, DDQ Real Estate, Conformité RGPD) sont des préconfigurations de l'opération de Tabularisation : ils définissent les colonnes et les questions, l'utilisateur n'a qu'à lancer le run.

Ces opérations sont **orthogonales aux livrables**. Toutes les vues (tableau, clausier, redline, comparaison, chat text-to-SQL) consomment le même socle d'extractions sourcées — elles ne produisent pas leurs propres citations, elles consomment celles ancrées à l'indexation Legal.

## 6. L'architecture en couches

Le module s'inscrit dans une architecture à plusieurs couches :

```
┌─────────────────────────────────────────────────────────────┐
│ WORKSPACE SINEQUA                                           │
│                                                             │
│ Documents déposés par l'utilisateur                         │
│          │                                                  │
│          ▼                                                  │
│ Indexation 1 — Sinequa (OCR, texte, passages,               │
│                vectorisation, métadonnées documentaires)    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          │
                  [action utilisateur :
                   "Extract legal clauses"]
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ MODULE LEGAL EXTRACTION                                     │
│                                                             │
│ Indexation 2 — Métier (document → objet juridique :         │
│                parties, clauses typées, sous-attributs,     │
│                définitions, renvois)                        │
│          │                                                  │
│          ▼                                                  │
│ Opérations métier sur les objets juridiques                 │
│ (confrontation / agrégation / alignement)                   │
│          │                                                  │
│          ▼                                                  │
│ Livrables consultables à l'écran                            │
│ (note de revue, redline, tableau DD, etc.)                  │
│                                                             │
│ Base de référence persistante du module                     │
│ (playbooks, standards, grilles DD, clausiers)               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.1. L'indexation 1 (Sinequa)

Existe déjà dans le produit. Elle traite un document déposé et produit :
- Le contenu textuel (OCR si besoin, selon le mode de conversion choisi par l'utilisateur)
- Un découpage en passages
- Une vectorisation
- Des métadonnées documentaires (auteur, date, type, emplacement, droits d'accès)
- Une classification basique du document

**Elle ne produit PAS de structure métier** — elle ne sait pas qu'un contrat a des clauses, une politique des dispositions, un memo des arguments.

### 6.2. L'indexation 2 (Legal Extraction)

Nouvelle couche propre au module. Elle est **déclenchée explicitement par l'utilisateur** via l'action *Extract legal clauses* (au niveau doc viewer ou module). Elle prend un document déjà indexé (couche 1) et produit :

- Un **objet juridique structuré** : type de document, métadonnées métier, parties, dates, clauses typées avec sous-attributs normalisés, définitions, renvois
- Des **citations vers le document source** pour chaque élément extrait (traçabilité)
- Des **scores de confiance** pour chaque élément (rattrapage manuel par l'utilisateur)

Cette indexation est **le cœur du module**. Tout le reste repose dessus.

### 6.3. Les opérations métier

Une fois les objets juridiques produits, les opérations métier s'appliquent dessus :

- **Confrontation** d'un objet à un référentiel (playbook, grille de DD)
- **Agrégation** de N objets pour produire une synthèse (clausier)
- **Alignement** de 2 objets pour produire un diff (comparaison)

Chaque opération produit un ou plusieurs livrables.

### 6.4. La couche structurée interrogeable

L'extraction Legal produit une **couche structurée persistante** : les cellules d'une Tabular Review sont stockées en table SQL normalisée. Cette couche est :
- Consommée directement par le **chat text-to-SQL** (panneau latéral de la Tabular Review)
- Consultable par les vues existantes (tableau, clausier, redline)
- **Préparée architecturalement** pour être exposée à Threads à terme (jalon GA) — non câblée dans le démonstrateur

### 6.5. La base de référence

**Couche persistante** propre au module, partagée entre utilisateurs (avec gouvernance). Elle héberge les actifs juridiques de référence :

- Playbooks
- Documents standards (NDA standard, DPA standard, etc.) — consommés par ContractDraft
- Grilles de due diligence → évoluent en **Workflows OOTB** de Tabularisation
- Clausiers — produits par les workflows Clausier MSA/NDA
- (autres types à venir : glossaires, historiques, matrices, templates...)

La base **alimente les opérations métier** : un audit consomme un playbook, une comparaison peut se faire contre un standard, un clausier produit peut être versé dans la base. En v2, les **décisions validées** (redlines acceptés qui dévient d'un playbook) remontent dans la base via le **flux de capitalisation**.

## 7. Différenciation concurrentielle

L'approche du module se distingue des concurrents de référence (Mike, Harvey AI, Legora) sur trois points structurels :

| Eux | Nous |
|---|---|
| Citation regénérée par le LLM à chaque run, fragile | Citation ancrée à l'indexation Legal, stable, voyage avec la donnée dans toutes les vues |
| Bibliothèque de précédents en silo, dette d'organisation à terme | Capitalisation directe dans des playbooks nommés, gouvernés (owner/approver), via le flux d'amendement existant |
| Chat sur résultat = nouvelle passe LLM lente et coûteuse | Chat sur résultat = text-to-SQL sur données structurées, déterministe, rapide, économique |

Ces différences sont **visibles dans l'implémentation** : la citation n'est pas un artefact de rendu, c'est une propriété structurelle de la cellule ou de la clause. Le flux de capitalisation n'est pas une fonctionnalité isolée, c'est un point d'entrée supplémentaire dans la queue d'amendement existante.

## 7. Principes fondamentaux du module

### 7.1. Interaction en langage naturel

L'utilisateur **formule ses demandes en langage naturel**, pas via des formulaires ou des wizards. Exemples :

- *"Revois ce contrat par rapport à notre playbook commercial"*
- *"Compare ce NDA à notre NDA standard et fais-moi la liste des écarts"*
- *"Sur tous les contrats de cette data room, identifie les clauses de change of control et dis-moi lesquelles se déclenchent à moins de 50%"*
- *"À partir de ces 80 SPA, constitue un clausier organisé par type de clause"*

Le module **interprète la demande** et identifie ce qu'il faut faire (opération, documents concernés, référentiel à utiliser, livrable à produire). Il peut demander des précisions en cas d'ambiguïté.

### 7.2. Human-in-the-loop

Le module **propose, le juriste valide**. Aucun livrable ne quitte le module sans validation humaine. Le juriste peut :

- Corriger la structure extraite (vue objet juridique)
- Modifier les livrables avant export
- Ajuster les verdicts d'audit
- Rejeter les suggestions du redline

C'est un principe **déontologique** (responsabilité du juriste sur ses livrables) et **juridique** (AI Act, supervision humaine obligatoire pour usages à haut risque).

### 7.3. Traçabilité absolue

Chaque affirmation d'un livrable est **rattachée à une citation** dans un document source. Pas d'hallucination, pas d'affirmation non sourcée. Clic sur une citation → affichage du passage source en contexte.

Les éléments à faible confiance sont **signalés visuellement**, pas masqués.

### 7.4. Cohérence avec Sinequa

Le module s'inscrit dans l'UX **existante** du produit Sinequa :
- Chrome commune (sidebar fine, breadcrumb, actions en haut à droite)
- Patterns de modules (cf. Canvas)
- Conventions visuelles (boutons, cartes, typographie)

Il **ne réinvente pas** l'UX. Il étend l'écosystème existant avec une couche métier legal.

### 7.5. Indépendance des modules en pré-alpha

Le module est **indépendant** des autres modules Sinequa (Threads, Checklist, Canvas, Financials). Il ne les appelle pas, ils ne l'appellent pas. L'interopérabilité inter-modules viendra avec la couche agentic, post-pré-alpha.

## 8. Ce que la pré-alpha doit démontrer

La pré-alpha est un **applicatif standalone**, non branché au produit Sinequa. Son but : **donner à l'équipe produit un artefact tangible** qui matérialise la vision complète du module et serve de base de travail pour décider de l'intégration.

Ce que la pré-alpha doit montrer :

1. Que le concept d'**indexation 2** produit des objets juridiques exploitables
2. Que les **3 cas d'usage** (audit, clausier, comparaison) fonctionnent de bout en bout
3. Que les **6 livrables** sont consultables, éditables, cohérents
4. Que la **base de référence** est un actif vivant, alimentable, consommable
5. Que l'**UX** s'inscrit naturellement dans l'écosystème Sinequa
6. Que l'**interaction en langage naturel** est fluide et adaptée au métier

Ce que la pré-alpha ne cherche pas à montrer :

- La robustesse sur des volumes industriels
- La couverture de tous les types de contrats et juridictions
- La performance production
- La sécurité / multi-tenancy avancée
- L'intégration avec la corporate source

Ces dimensions seront traitées lors des phases ultérieures (alpha, beta, GA) par les équipes produit et ingénierie.

## 9. La suite

- [02-architecture-technique.md](./02-architecture-technique.md) — Stack, architecture applicative, services
- [03-modele-de-donnees.md](./03-modele-de-donnees.md) — L'objet juridique, l'ontologie, les actifs
- [04-ux-et-parcours.md](./04-ux-et-parcours.md) — Tous les écrans et parcours
- [09-positionnement-marche.md](./09-positionnement-marche.md) — Jobs to be done, buyer map, concurrence, intégration
- [10-cycle-de-vie-actifs-reference.md](./10-cycle-de-vie-actifs-reference.md) — Trajectoire des playbooks et autres actifs
