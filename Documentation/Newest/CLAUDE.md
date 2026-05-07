# CLAUDE.md — Instructions pour Claude Code

## Évolution v2 — Tabular Review

Ce document a été mis à jour pour intégrer l'évolution v2. Le document delta de référence est :
`/Users/chriswazen/Downloads/EVOLUTION-v2-tabular-review.md`

**Branche active** : `feature/tabular-review-v2` (ne jamais pousser sur `master` directement).

**Résumé des nouvelles primitives** :
- Tabular Review (grille N docs × M colonnes, citations par cellule)
- Workflows OOTB (Clausier MSA/NDA, DDQ M&A, DDQ Real Estate, Conformité RGPD)
- Redline comme entité de premier rang (moteur mutualisé)
- Multi-document redline coordonné
- Création de contrat depuis template (Contract Draft)
- Chat text-to-SQL sur résultats Tabular Review
- Flux de capitalisation (redline accepté → amendment request)

**Décisions irréversibles** :
- CKEditor 5 intégration complète pour le Redline (pas de simulation HTML)
- Text-to-SQL via SQLite sur table `tabular_cells` normalisée
- Clausier = workflow OOTB de Tabular Review (le composant `clausier.component` reste sur master en legacy, ne pas l'utiliser en v2)
- Standards de la base mockés en seed (`standard-nda-fr`, `standard-msa-fr`)

Ce document donne les instructions, conventions et garde-fous à respecter lors de l'implémentation du module Legal Extraction.

## Mission

Construire une **pré-alpha standalone** du module Legal Extraction. L'objectif n'est **pas** un produit fini, mais un artefact fonctionnel et cohérent qui permette à l'équipe produit Sinequa de prendre en main la vision, la challenger, et de décider de son intégration au produit.

**Critères de réussite** :
- Les 3 cas d'usage fonctionnent de bout en bout sur au moins 2-3 exemples de documents légaux
- L'UX est cohérente avec les captures fournies du produit Sinequa (workspace, Canvas)
- Le code est propre, documenté, prêt à être repris par l'équipe produit
- Les hors-scope sont matérialisés (boutons, écrans, messages) sans être implémentés

**Ce qui n'est PAS un critère** :
- Robustesse industrielle (gestion de volumes, scalabilité, SLA)
- Couverture exhaustive des cas limites (les principaux suffisent)
- Performance fine tunée
- Sécurité production (auth, RBAC, chiffrement)

## Priorités d'implémentation

Si tu dois faire des arbitrages de temps, voici l'ordre de priorité :

1. **Le cas d'usage *comparaison* est le plus démontrable** — implémente-le en premier et le plus complètement. Il donne l'effet "wow" le plus immédiat.
2. **Le cas d'usage *audit* en version unitaire** ensuite — c'est le plus utile au quotidien.
3. **Le cas d'usage *clausier*** ensuite — plus complexe, plus de marge à prendre sur la fidélité.
4. **Le cas d'usage *audit en mode DD*** en dernier — montrer la vue tableau avec un volume modeste (5-10 contrats).

**Le rendu UX est plus important que la précision technique de l'extraction**. Un objet juridique approximatif mais bien affiché vaut mieux qu'une extraction parfaite dans un écran brouillon.

## Contraintes techniques fortes

### Stack

- **Frontend Angular 17+** avec signals, standalone components, standalone CLI. Pas de NgModules classiques sauf si nécessaire.
- **CKEditor 5** pour tous les livrables textuels ET le redline. Utilise le build standard + plugin track-changes si accessible. Sinon, simule les track changes avec des spans colorés.
- **Tailwind CSS** pour le styling — cohérent avec les captures fournies du produit Sinequa qui utilise une approche utilitaire.
- **Backend Node.js + Express** en version légère. Ou NestJS si tu préfères (mais Express suffit pour une pré-alpha).
- **Persistance SQLite** via Prisma ou Drizzle ORM — permet un setup zéro configuration.
- **LLM via API Anthropic Claude** (modèle claude-sonnet-4 ou claude-opus-4). Clé d'API à fournir via variable d'environnement.

### Ce qu'il faut respecter à la lettre

- **Les captures Sinequa fournies** (workspace avec Threads + boutons d'amorçage, Canvas avec sidebar + zone principale) définissent l'UX. Inspire-toi visuellement directement.
- **La chrome Sinequa** : barre latérale ultra-fine à gauche, breadcrumb en haut, actions en haut à droite. Ne pas réinventer.
- **Le pattern module = sidebar interne + zone principale** (vu dans Canvas) s'applique à Legal Extraction aussi.
- **Les 4 cartes d'amorçage** (Auditer / Comparer / Constituer un clausier / Démarrer libre) sont sur le pattern Canvas (*Déposer un fichier / Démarrer à partir d'un document vide / Choisir un modèle*).

### Choix techniques laissés à ta discrétion

Certains choix d'implémentation sont laissés à ton jugement selon la faisabilité :

- **Extraction réelle vs mock** : utilise l'API Claude pour l'extraction (prompts structurés qui retournent du JSON schéma). Si tu rencontres des problèmes de fiabilité, accepte un hybride où certains champs sont mockés pour la démo. Documente tes choix.
- **Redline technique** : CKEditor 5 a un plugin track-changes premium. S'il n'est pas disponible dans le build libre, simule avec un rendu HTML custom (spans `.ins` et `.del` colorés, commentaires en marge via popover). L'important est la démonstration visuelle.
- **Parser PDF** : pour le doc viewer, utilise `pdf.js` pour le rendu. Pour l'OCR (indexation 1 simulée), un bypass acceptable en pré-alpha — on suppose que le document est déjà textuel.
- **Versioning des livrables** : implémente une version basique (tableau de versions en mémoire ou persisté). Le diff visuel n'est pas prioritaire.

## Conventions de code

### Angular

- Standalone components partout
- Signals pour l'état local
- Services injectables pour l'état partagé (via `providedIn: 'root'` par défaut)
- Typage strict, pas de `any` sauf justifié avec commentaire
- Imports explicites (pas de wildcards `import *`)
- Nommage : kebab-case pour les fichiers, PascalCase pour les classes, camelCase pour les variables

### Organisation des fichiers

```
src/
├── app/
│   ├── core/                          # Services transverses, modèles
│   │   ├── models/                    # Interfaces TypeScript
│   │   ├── services/                  # Services partagés
│   │   └── guards/                    # Guards (si auth simulée)
│   ├── features/
│   │   ├── workspace/                 # Écran workspace (accueil, doc viewer)
│   │   ├── legal-extraction/          # Le module lui-même
│   │   │   ├── analysis/              # Gestion d'une analyse
│   │   │   ├── legal-object-view/     # Vue objet juridique
│   │   │   ├── conversation/          # Conversation langage naturel
│   │   │   ├── deliverables/          # Les 6 livrables
│   │   │   └── reference-base/        # Base de référence
│   │   └── shared/                    # Composants UI partagés
│   └── layout/                        # Chrome Sinequa (sidebar, breadcrumb, etc.)
└── styles/
    └── tailwind.config.js
```

### Backend

- Routes REST simples
- Pas de GraphQL en pré-alpha (overkill)
- Endpoints v1 : `/api/workspaces`, `/api/documents`, `/api/analyses`, `/api/legal-objects`, `/api/deliverables`, `/api/reference-base`
- Endpoints v2 nouveaux :
  - `/api/analyses/:id/tabular-reviews` (CRUD + run)
  - `/api/analyses/:id/tabular-reviews/:trId/columns/:colId/rerun`
  - `/api/analyses/:id/tabular-reviews/:trId/rows/:rowId/cells/:colId/rerun`
  - `/api/analyses/:id/tabular-reviews/:trId/query` (chat text-to-SQL)
  - `/api/workflows` (lecture des workflows OOTB, read-only)
  - `/api/analyses/:id/multi-doc-redline`
  - `/api/analyses/:id/contract-drafts`
- Service de prompt dédié pour les appels LLM, avec templates par opération
- `TabularQueryService` utilise Claude Haiku pour la traduction NL → SQL
- Gestion d'erreur qui renvoie des messages compréhensibles

### Git

- Commits fréquents, messages en français ou anglais (consistent)
- Branches par feature si tu travailles en parallèle
- Un `README.md` à la racine avec les instructions de setup (install, env, run)

## Ce qui compte le plus dans le résultat final

Dans l'ordre :

1. **Cohérence visuelle avec le produit Sinequa existant** — les captures fournies sont la référence
2. **Fluidité du parcours utilisateur** de bout en bout — aucun chemin qui coince
3. **Qualité du rendu des livrables** dans CKEditor — c'est la valeur perçue du module
4. **Richesse de la vue objet juridique** — elle matérialise l'indexation 2, c'est critique
5. **Propreté du code** — il va être repris par l'équipe produit

## Ce qui ne compte pas (ne perds pas de temps dessus)

- L'optimisation des prompts LLM au millième près. Un prompt "qui marche raisonnablement" suffit.
- La gestion d'erreur exhaustive. Quelques cas couverts, message générique pour le reste.
- La persistance fine. Tout peut être en mémoire ou SQLite, pas besoin de migration strategy.
- L'authentification, les droits, la sécurité. Un user codé en dur suffit.
- Les tests unitaires exhaustifs. Quelques tests sur les services critiques (extraction, génération de livrables).
- La responsivité mobile. Desktop uniquement.
- L'accessibilité. Pas un sujet pré-alpha.
- L'internationalisation. FR en dur avec quelques libellés EN dans le code suffit.

## Hors scope absolu

Ne pas commencer à implémenter :

- Pont workspace ↔ corporate source
- Connecteurs externes (iManage, SharePoint, etc.)
- Plugin Word / Outlook
- Export réel en Word / PDF / Excel (matérialiser le bouton uniquement)
- Drafting from scratch
- Veille réglementaire
- Workflow multi-utilisateurs
- Ontologie configurable par client
- Audit log complet

Voir [08-hors-scope-et-roadmap.md](./08-hors-scope-et-roadmap.md).

## Approche itérative (v2)

**Itération 1** : squelette end-to-end (inchangée)
- Chrome Sinequa en place
- Workspace avec documents de démo
- Entrée dans le module via "Extract legal clauses"
- Indexation 2 mockée
- Écran d'amorçage avec les 5 cartes (v2)
- Un seul livrable stub

**Itération 2** : enrichissement + Tabular Review primitive
- Indexation 2 réelle via LLM
- Vue objet juridique complète
- Conversation langage naturel opérationnelle
- 3 livrables fonctionnels (note comparative, note de revue, redline CKEditor)
- **Tabular Review primitive avec colonnes ad hoc** (Phase B)

**Itération 3** : complétude v2
- Les 7 livrables
- Base de référence fonctionnelle
- **Workflows OOTB, redline transverse, multi-doc redline** (Phase B suite)
- **Chat text-to-SQL** (Phase C)
- **Contract Draft + flux de capitalisation** (Phases D + E)
- Cas limites principaux
- Polissage UX

Cette approche permet de toujours avoir quelque chose de démontrable à chaque commit.

## Documents de démo

Prévoir dans le repo un dossier `demo-data/` avec :
- 2-3 NDA (un français, un anglais, un mutuel)
- 2-3 contrats commerciaux (prestation, distribution, licence)
- 1-2 politiques (DPA, code de conduite)
- Pour la base de référence :
  - 1 playbook commercial fictif (Word)
  - 1 NDA standard maison fictif (Word)
  - 1 grille de DD fictive
  - 1 clausier fictif

Ces documents seront ceux qui permettront à l'équipe produit de tester la pré-alpha. Ils doivent être **suffisamment réalistes** pour être crédibles, **fictifs** (pas de vraies données client), et **variés** pour montrer la polyvalence du module.

## En cas de doute

Si une décision n'est pas tranchée dans la doc, applique les principes :

1. **Cohérence avec Sinequa existant** d'abord
2. **Simplicité de démonstration** ensuite
3. **Clarté du code** toujours

Documente les choix non-triviaux dans le code ou dans un `DECISIONS.md`.

**À noter** : les docs `09-positionnement-marche.md` et `10-cycle-de-vie-actifs-reference.md` sont des documents de **cadrage produit et marché**, pas d'implémentation directe. Tu n'as pas à les lire pour coder, mais ils éclairent certaines décisions UX (rôles de gouvernance, scénario PE, workflow d'amendement) qui sont implémentées dans `04` et `05`.

## Livrable final attendu

Un repo Git (ou archive) contenant :
- Frontend Angular fonctionnel
- Backend Node.js fonctionnel
- SQLite pré-alimentée avec les docs de démo et la base de référence
- README de setup et d'utilisation
- Quelques captures d'écran dans `docs/screenshots/` pour documenter le résultat
- Un script de démarrage (`npm run dev` ou équivalent) qui lance tout

L'ensemble doit pouvoir être cloné, installé, et démarré en moins de 10 minutes par un développeur ayant Node + npm.
