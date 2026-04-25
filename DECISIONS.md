# Décisions de conception — Module Legal Extraction

Ce document recense les écarts assumés entre la documentation de cadrage initiale (project knowledge) et l'implémentation actuelle, ainsi que les décisions structurantes prises au fil des itérations.

## État de la pré-alpha

Cette pré-alpha est un applicatif standalone destiné à la prise en main par l'équipe produit Sinequa. Elle n'est pas connectée au produit réel et n'a pas vocation à être déployée en production.

## Écarts assumés vs cadrage initial

### Stack et rendu

- **Pas de CKEditor**. Tous les livrables sont rendus en templates Angular + Tailwind, en lecture (édition via le mécanisme "Affiner" décrit plus bas). Justification : CKEditor est lourd, le plugin track-changes est premium, et la modification ciblée par instruction NL apporte plus de valeur que l'édition libre WYSIWYG en pré-alpha.
- **Modèle LLM** : `claude-sonnet-4-6` par défaut (et non Opus comme la doc le suggérait). Justification : coût et latence pour une démo, qualité largement suffisante pour les opérations.
- **Pas de service Sinequa réel** : ni indexation 1, ni corporate source, ni chrome partagée. Tout est simulé localement.

### Périmètre fonctionnel

- **9 opérations** au lieu des 3-4 du cadrage initial, suite aux retours en test :
  - Confrontation (audit unitaire) — initial
  - Alignment (comparaison) — initial
  - Aggregation (clausier) — initial
  - DD (audit en masse) — initial
  - **MA Mapping** — ajouté pour cartographier des opérations M&A
  - **Deadlines** — ajouté pour extraire toutes les échéances d'un contrat
  - **Compliance** — ajouté pour vérifier la conformité réglementaire
  - **Inconsistencies** — ajouté pour détecter les incohérences entre documents

- **10 livrables** au lieu des 6 du cadrage initial (1 par nouvelle opération, plus les 6 d'origine).

### Architecture

- **Base de référence globale**, pas par-workspace. Justification : simplification architecturale, les playbooks sont mutualisés entre workspaces.
- **Routes simplifiées** : pas de segment URL `/legal-extraction` séparé, le module occupe directement les routes du workspace.
- **Pas de barre Threads ni de pills d'autres modules** sur l'accueil workspace, parce que les modules en question (Threads, Canvas, Checklist, Financials) ne sont pas implémentés dans cette pré-alpha standalone.

### Interaction langage naturel — V2

Le panneau de chat permanent introduit dans la V1 a été supprimé. Il était décoratif. Remplacement par 3 zones NL ciblées :

1. **NL d'entrée du wizard** : un champ texte qui parse la demande et pré-remplit les étapes
2. **Bouton "Affiner"** sur chaque livrable : modification ciblée par instruction
3. **Action "Demander"** sur chaque clause : question contextuelle

La table `conversation_messages` et les routes `/messages` correspondantes ont été retirées du backend.

### RAG niveau 1 — V2

Embeddings locaux via `@xenova/transformers` (modèle `Xenova/multilingual-e5-small`). Indexation au moment de l'extraction des clauses. Premier use case implémenté : *clauses similaires entre documents d'un workspace*. Pas de dépendance API ni de coût.

## Décisions architecturales notables

- **SQLite + Drizzle ORM** côté backend, schéma compatible PostgreSQL pour migration future
- **Mock LLM par défaut** (`USE_MOCK_LLM=true`) — la démo fonctionne sans clé API
- **Express en TypeScript** (et pas NestJS), `tsx watch` en dev
- **Standalone components Angular**, signals partout, pas de NgModules
- **Tailwind CSS v4** (avec `@tailwindcss/postcss`), pas de design system externe
- **DOMPurify** côté front pour sanitiser tout HTML provenant du LLM (notamment les redlines), avec une whitelist stricte de balises et attributs

## Hors scope assumé pour la pré-alpha

- Authentification, multi-tenancy, RBAC
- Plugin Word, connecteurs externes
- Mode sombre, responsive mobile, accessibilité WCAG
- Tests unitaires automatisés (à venir post-pré-alpha)
- Workflow multi-utilisateurs et co-édition

## Roadmap post-pré-alpha (à valider avec l'équipe produit)

- Intégration au produit Sinequa réel (indexation 1, chrome, auth)
- RAG niveau 2 : index vectoriel Sinequa (au lieu d'embeddings locaux)
- Édition WYSIWYG des livrables (CKEditor ou Lexical)
- Ontologie configurable par client
- Connecteurs (iManage, SharePoint)
- Export Word/PDF avec templates clients

## Notes V2

- **Branches Git** : la branche `master` a été retirée au profit de `main` comme branche par défaut. Tout le code est désormais sur `main`.
- **Dépendances frontend manquantes** (`pdfjs-dist`, `marked`) qui étaient utilisées sans être déclarées dans `package.json` ont été ajoutées.
- **Placeholder Angular** (`src/app/app.html`, `src/app/app.css`) supprimés : le composant `App` utilise un template inline.
- **Cross-references** désormais sérialisées dans le `LegalObject` retourné par l'API, et affichées dans une section repliable du document viewer.
