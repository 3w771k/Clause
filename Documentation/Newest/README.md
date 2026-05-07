# Legal Extraction — Documentation technique pré-alpha

Ce dossier contient la documentation complète du module **Legal Extraction** destiné à être intégré au produit Sinequa (AI Workplace). Les documents sont conçus pour être consommés par Claude Code afin de construire une **pré-alpha standalone** qui servira de base de travail à l'équipe produit.

## Contexte

Le module Legal Extraction est un nouveau module du workspace Sinequa, au même niveau que les modules existants (Threads, Checklist, Canvas, Financials). Sa mission : **transformer des documents juridiques déposés en objets juridiques structurés** et permettre aux professionnels du droit (cabinets d'avocats et directions juridiques) de réaliser trois grandes familles d'opérations sur ces objets — audit de contrat, constitution de clausier, comparaison de documents.

La pré-alpha vise un **applicatif standalone**, non branché au produit Sinequa, suffisamment abouti pour que l'équipe produit puisse s'en saisir, le challenger, et le transformer en roadmap d'intégration.

## Comment lire cette documentation

Les documents sont numérotés selon l'ordre de lecture recommandé. Chaque document est autosuffisant mais s'appuie sur les précédents.

| Doc | Titre | Pour quoi |
|-----|-------|-----------|
| [CLAUDE.md](./CLAUDE.md) | Instructions Claude Code | Conventions, priorités, garde-fous pour l'implémentation |
| [01](./01-vision-et-contexte.md) | Vision et contexte | Le produit, les cibles, les cas d'usage |
| [02](./02-architecture-technique.md) | Architecture technique | Stack Angular, architecture applicative, services, APIs |
| [03](./03-modele-de-donnees.md) | Modèle de données | Objet juridique, ontologie, actifs de la base, schémas |
| [04](./04-ux-et-parcours.md) | UX et parcours utilisateur | Tous les écrans, parcours, états |
| [05](./05-specifications-fonctionnelles.md) | Spécifications fonctionnelles | Spec détaillée de chaque zone et composant |
| [06](./06-livrables.md) | Livrables | Les 6 livrables, structure, rendu CKEditor |
| [07](./07-cas-limites.md) | Cas limites | Gestion d'erreur et edge cases |
| [08](./08-hors-scope-et-roadmap.md) | Hors scope et roadmap | Limites pré-alpha, horizon produit |
| [09](./09-positionnement-marche.md) | Positionnement marché | Jobs to be done, buyer map, concurrence, intégration |
| [10](./10-cycle-de-vie-actifs-reference.md) | Cycle de vie des actifs de référence | Trajectoire des playbooks, standards, grilles, clausiers |

## Stack technique en un coup d'œil

- **Frontend** : Angular 17+ (signals, standalone components) — cohérent avec la stack Sinequa
- **Éditeur riche** : CKEditor 5 (licence Sinequa existante) pour les livrables textuels et le redline
- **Backend pré-alpha** : Node.js léger (Express ou NestJS) servant d'orchestrateur API
- **LLM** : API Anthropic Claude (priorité) ou OpenAI en fallback, pour l'indexation 2 et la génération de livrables
- **Persistance** : SQLite pour la pré-alpha (simple, portable) ; structure de données prête pour migration PostgreSQL
- **État** : Angular signals + services avec pattern store léger

Voir [02-architecture-technique.md](./02-architecture-technique.md) pour le détail.

## Principes fondamentaux à garder en tête

1. **Les documents déposés deviennent des objets juridiques**. Toute la valeur du module repose sur cette transformation (indexation 2).
2. **L'interaction se fait en langage naturel** dans tous les cas. Pas de formulaires de configuration, pas de wizards.
3. **Traçabilité absolue** : chaque affirmation d'un livrable pointe vers une citation sourcée dans un document source.
4. **Human-in-the-loop** : le module propose, le juriste valide, corrige, exporte. Jamais de livrable "automatique" qui part sans revue humaine.
5. **Cohérence avec l'UX Sinequa** : le module s'inscrit dans la chrome existante (sidebar fine, breadcrumb, patterns de modules), il ne la réinvente pas.
6. **La référence est attachée à la donnée extraite à l'indexation Legal, pas regénérée à l'usage.** Toutes les vues (tableau, clausier, redline, comparaison, chat) consomment ce même socle sourcé. Une citation ne dépend pas du chemin qui l'a produite.

## Périmètre fonctionnel de la pré-alpha

**IN** :
- 3 cas d'usage complets : audit (unitaire + DD), clausier, comparaison
- **Tabular Review (primitive)** : vue tabulaire éditable N docs × M colonnes, citations cliquables par cellule
- **Workflows out-of-the-box** : Clausier MSA (FR/EN), Clausier NDA (FR), DDQ M&A, DDQ Real Estate, Conformité RGPD
- **Création de contrat depuis template** : instanciation d'un Standard de la base avec redline dans CKEditor
- **Multi-document redline coordonné** : une décision en langage naturel propagée sur N documents
- **Chat structuré sur résultats Tabular Review** via text-to-SQL (panneau latéral, requête SQL consultable)
- **Capitalisation des redlines validés vers les playbooks** via le flux d'amendement existant
- 7 livrables consultables et éditables à l'écran (dont Tabular Review comme nouvelle primitive)
- Base de référence avec 4 types d'actifs implémentés
- **Mécanisme d'amendement matérialisé** : proposition d'amendement depuis une analyse, file d'attente par actif, validation (single-user en pré-alpha, multi-user en alpha)
- **Trois scénarios de référence couvrant les segments cibles** : NDA in-house, DD intensive PE, revue cabinet
- Toutes typologies de documents légaux acceptées
- Français + anglais
- Ontologie maison + ontologie de marché en alternative

**OUT** (matérialisé mais non fonctionnel ou signalé comme horizon) :
- Module d'export effectif (Word, PDF, Excel) — bouton présent, non fonctionnel
- **Workflows utilisateurs réutilisables** (création par l'utilisateur) — jalon GA
- **Word Add-in natif** — jalon GA ; redline rendu dans CKEditor en navigateur dans le démonstrateur
- **Couche structurée interrogeable câblée à Threads** — préparée architecturalement (table SQL des cellules), non exposée à Threads dans le démonstrateur
- Pont vers la corporate source
- Interopérabilité avec les autres modules Sinequa
- Drafting from scratch
- Volumes industriels (>30 documents par analyse)
- Multi-utilisateurs réel (un seul utilisateur fictif en pré-alpha)
- Connecteurs externes (iManage, SharePoint, VDR, plugin Word)

Voir [08-hors-scope-et-roadmap.md](./08-hors-scope-et-roadmap.md) pour la liste exhaustive.

## Ordre d'implémentation suggéré (v2)

**Phase A — Fondations**
1. Mettre à jour la documentation Markdown (un commit par fichier)
2. Étendre le modèle de données (nouvelles entités TypeScript + tables SQLite) → doc 03
3. Créer le moteur de redline transverse (`RedlineEngineService`) ; refactorer audit et comparaison pour le consommer

**Phase B — Tabular Review**
4. Backend : `TabularReviewService` (CRUD + run global), endpoints REST, persistance cellules en table normalisée SQLite
5. Frontend : composant `TabularReviewComponent`, nouvelle carte d'amorçage *Tableau d'analyse* → doc 04 §4.10
6. Workflows OOTB : chargement au boot, API lecture seule, sélecteur dans l'UI
7. Re-run granulaire : endpoints + clic droit colonne/cellule

**Phase C — Chat structuré**
8. Backend : `TabularQueryService` (NL → SQL sur la table des cellules via Claude Haiku)
9. Frontend : `TabularChatPanelComponent` (panneau latéral)

**Phase D — Création de contrat et Multi-doc redline**
10. Création de contrat depuis template (nouvelle carte, formulaire, moteur redline)
11. Multi-document redline (sélection N docs, décision NL, N redlines cohérents)

**Phase E — Capitalisation**
12. Toast de capitalisation déclenché à l'acceptation d'un redline qui dévie d'un playbook
13. Branchement vers la queue d'amendement existante

**Phase F — Polish**
14. Cas limites (doc 07)
15. Cohérence visuelle
16. Mise à jour CLAUDE.md

## Livrables de la pré-alpha

Au sortir de cette implémentation, on doit pouvoir :

- Ouvrir le workspace de démonstration avec des documents juridiques déposés (NDA, contrats, politiques)
- Cliquer *Extract legal clauses* sur un document → l'indexation 2 se déclenche → arriver dans le module sur une nouvelle analyse
- Voir l'objet juridique extrait, éditer sa structure
- Formuler une demande en langage naturel (*"Compare à notre NDA standard"*)
- Voir se matérialiser les livrables (note comparative + redline) dans CKEditor, éditables
- Consulter et alimenter la base de référence (playbooks, standards, grilles DD, clausiers)
- Tester les 3 cas d'usage de bout en bout

L'équipe produit pourra alors prendre en main l'artefact, le discuter, l'itérer.
