# 04 — UX et parcours utilisateur

Ce document décrit l'ensemble des écrans du module et les parcours utilisateur. Il s'appuie sur la chrome Sinequa observée dans les captures fournies (workspace, Canvas) pour assurer la cohérence visuelle.

## 1. Principes UX transverses

### 1.1. Cohérence avec la chrome Sinequa

Tous les écrans du module s'inscrivent dans la chrome Sinequa existante :

- **Barre latérale ultra-fine à gauche** (environ 60-80px) avec les icônes *Explorer*, *Espaces*, support (point d'interrogation), user (cercle en bas)
- **Breadcrumb en haut** : *Espaces de travail > [Workspace] > [Module] > [Élément]*
- **Actions globales en haut à droite** : boutons contextuels (*Ajouter des documents*, *Nouveau*, *Exporter*, etc.)
- **Typographie et couleurs** : cohérentes avec les captures (police moderne sans-serif, bleus / violets discrets pour les accents, fond très clair)

Le module **ne remplace pas la chrome**, il s'inscrit dedans.

### 1.2. Langage naturel omniprésent

Un champ de saisie conversationnel est toujours accessible dans une analyse (colonne gauche). Il accepte n'importe quelle formulation. Les cartes d'amorçage guidées et la conversation libre coexistent.

### 1.3. Citations cliquables partout

Toute affirmation sourcée (dans un livrable, dans la vue objet juridique, dans une réponse conversationnelle) est cliquable. Un clic ouvre un popover ou un panneau latéral affichant le passage source dans son contexte.

### 1.4. Main à l'utilisateur

Tous les contenus générés sont éditables. Les corrections utilisateur sont persistées et ne sont pas écrasées par une régénération sauf demande explicite.

### 1.5. État visible en permanence

Indicateurs de progression pour toute opération longue (indexation 2, génération de livrable). Pas de "magie silencieuse".

## 2. Parcours utilisateur type

### 2.1. Scénario de référence — Revue d'un NDA

Clara, juriste in-house, reçoit un NDA à revoir.

1. Elle se connecte à son espace Sinequa et entre dans son workspace "Contrats 2026"
2. Elle clique *Ajouter des documents* en haut à droite et dépose le NDA reçu (PDF)
3. L'indexation 1 se fait automatiquement. Le NDA apparaît dans la liste des documents
4. Elle clique sur le NDA pour l'ouvrir dans le doc viewer
5. Dans le doc viewer, elle clique *Extract legal clauses* (bouton en haut à droite)
6. L'indexation 2 se déclenche (indicateur de progression, non bloquant)
7. Elle bascule automatiquement dans le module Legal Extraction, sur une nouvelle analyse nommée par défaut "Analyse - [NDA]"
8. Elle voit l'écran d'amorçage avec 4 cartes : *Auditer contre un playbook / Comparer à un autre document / Constituer un clausier / Démarrer libre*
9. Elle clique *Comparer à un autre document*
10. Le module lui demande en conversation : *"À quel document souhaitez-vous comparer ce NDA ?"* avec des suggestions (NDA standards de la base + option *parcourir*)
11. Elle sélectionne *NDA standard maison*. Le module lance l'opération d'alignement
12. La colonne droite affiche d'abord un indicateur de progression, puis la **note comparative** générée en CKEditor
13. Elle parcourt, constate un écart sur la clause de juridiction, clique sur la citation → le passage source s'affiche
14. Dans la conversation, elle écrit : *"Ajoute une recommandation pour pousser la juridiction Paris plutôt que Londres"*
15. La note comparative se met à jour (nouvelle version, ancienne conservée)
16. Elle clique sur l'onglet *Redline* dans la colonne droite → le NDA apparaît annoté avec des track changes et commentaires en marge
17. Elle passe en revue les propositions, accepte/rejette une par une
18. Elle clique *Exporter* (non fonctionnel en pré-alpha, message "À venir")
19. Elle retourne au workspace, son analyse est persistée et accessible à nouveau

### 2.2. Scénario de référence PE — DD intensive avant acquisition

Marc, Operating Partner d'un fonds de Private Equity, vient d'entrer en exclusivité sur l'acquisition d'une cible. La data room contient 480 contrats commerciaux à passer au crible en 5 jours.

1. Marc entre dans le workspace dédié au deal *"Projet Sirius - DD"* (workspace créé par son Head of Legal Ops la veille avec la grille de DD pré-câblée pour les risques d'investissement)
2. Il dépose en masse les 480 PDF de la data room (drag & drop multi-fichiers)
3. L'indexation 1 traite les documents en arrière-plan (indicateur global de progression)
4. Une fois suffisamment de documents indexés, il clique *Nouvelle analyse* dans le module Legal Extraction
5. Sur l'écran d'amorçage, il choisit *Auditer contre un playbook / une grille*
6. Le module lui demande : *"Sur quel corpus voulez-vous lancer l'audit ?"* — il sélectionne *Tout le workspace*
7. Le module lui demande : *"Contre quelle grille de DD ?"* — il choisit *Grille DD investissement - généraliste v3*
8. Le module lance la confrontation. La colonne droite affiche un **tableau DD progressif** : ligne par contrat, colonne par risque (change of control, exclusivité, durée résiduelle, MAC, plafond responsabilité, etc.)
9. Au fur et à mesure que les analyses se complètent, les cellules se remplissent avec un code couleur (vert = OK / orange = à vérifier / rouge = red flag)
10. Marc clique sur une cellule rouge "Change of control - Contrat fournisseur Acme" → ouverture du détail : passage source cité + verdict + recommandation
11. Il filtre le tableau sur *uniquement les red flags* — 17 contrats sur 480 ressortent
12. Dans la conversation : *"Pour les contrats en red flag de change of control, donne-moi la liste des seuils de déclenchement"*
13. Le module produit un sous-tableau avec le seuil par contrat. Marc identifie 3 contrats avec seuil à 30% (très bas, donc bloquants pour la structuration du deal)
14. Il clique *Publier comme livrable de synthèse* → une **note de synthèse DD** est générée en CKEditor avec : exposition globale, top 10 risques, focus change of control
15. Il partage le lien de l'analyse à son cabinet M&A pour challenger les conclusions

**Particularités illustrées par ce scénario** :
- Volume bursty (480 docs en une passe)
- Grille de DD pré-câblée comme actif de la base de référence
- Tableau DD progressif (les analyses arrivent au fur et à mesure)
- Filtrage par sévérité, agrégation par type de risque
- Conversation pour creuser un sous-corpus
- Note de synthèse comme livrable consultable

### 2.3. Ce que ces parcours illustrent

- **Entrée par le doc viewer** → le module est déclenché depuis le contexte d'un document
- **Écran d'amorçage** → 4 cartes pour guider le premier pas
- **Langage naturel** omniprésent après le choix initial
- **Bascule sur livrable** dans la colonne droite au fur et à mesure
- **Itération** via la conversation (ajout d'un point, régénération partielle)
- **Traçabilité** via les citations cliquables
- **Export matérialisé** mais non fonctionnel

## 3. Cartographie des écrans

### 3.1. Écrans workspace (hors module Legal Extraction)

| Écran | Route | Rôle |
|---|---|---|
| **Liste des workspaces** | `/workspaces` | Vue des espaces de travail |
| **Accueil workspace** | `/workspaces/:id` | Documents + modules d'amorçage + Threads |
| **Doc viewer** | `/workspaces/:id/documents/:docId` | Consultation d'un document + action *Extract legal clauses* |

### 3.2. Écrans du module Legal Extraction

| Écran | Route | Rôle |
|---|---|---|
| **Liste des analyses** | `/workspaces/:id/legal-extraction/analyses` | Toutes les analyses du workspace |
| **Analyse active** | `/workspaces/:id/legal-extraction/analyses/:analysisId` | Zone principale avec conversation + contenu actif |
| **Base de référence** | `/workspaces/:id/legal-extraction/reference-base` | Accueil de la base |
| **Liste d'actifs** | `/workspaces/:id/legal-extraction/reference-base/:type` | Ex: tous les playbooks |
| **Détail d'un actif** | `/workspaces/:id/legal-extraction/reference-base/:type/:id` | Consultation / édition d'un actif |

### 3.3. Éléments transverses

- **Sidebar interne du module** (visible sur tous les écrans du module) : liste des analyses + base de référence
- **Panneau latéral de citation** (popover ou drawer) : s'ouvre au clic sur une citation

## 4. Détail des écrans

### 4.1. Accueil workspace

Basé directement sur la capture fournie. Composition :

**Header** :
- Breadcrumb : *Espaces de travail > Demo EAP workspace*
- Actions en haut à droite : *Ajouter des documents*, *Nouveau*, icône historique
- Titre du workspace + icône étoile (favori) + menu contextuel

**Barre Threads** :
- Champ de saisie large : *"Démarrer une conversation en posant une question sur [Workspace]"*
- Options : *Recherche web*, *Bibliothèque*, bouton envoyer

**Boutons d'amorçage des modules** (pills rondes alignées) :
- *Rédiger un canvas* (existant)
- *Générer une checklist* (existant)
- *Démarrer un workflow* (existant)
- **NOUVEAU : *Analyser juridiquement*** (Legal Extraction)

Le nouveau bouton a la même forme que les existants : pill avec icône + libellé. L'icône proposée : une balance ou un document stylisé légal. Cliquer dessus ouvre un dialog qui propose :
- *Sélectionner des documents du workspace à analyser juridiquement*
- Les 4 cartes d'amorçage (reproduites)

**Section Documents** :
- Barre de recherche + *Créer un dossier*
- Tableau des documents : Nom, Sources, Ajouté par, Ajouté le, Taille, menu "..."
- Structure par dossiers (Business, Corporate, Financials, Fiscal, Legal...)

### 4.2. Doc viewer (modification pour Legal Extraction)

Le doc viewer est un écran existant dans Sinequa. La seule modification pour Legal Extraction :

**Ajout d'une action en haut à droite** : bouton *Extract legal clauses* (icône balance + libellé).

Visuellement à côté des actions existantes du doc viewer (télécharger, partager, etc.).

**Comportement au clic** :
1. Indicateur de progression : *"Extraction légale en cours..."* (barre en haut du viewer)
2. Le traitement se fait en arrière-plan (non bloquant — l'utilisateur peut continuer à scroller le document)
3. Quand c'est terminé : notification *"Extraction terminée. Ouvrir dans Legal Extraction ?"* avec bouton *Ouvrir*
4. Si l'utilisateur a déjà navigué ailleurs, la notification reste accessible via un badge dans l'icône du module

**Variante** : si l'utilisateur a déjà une analyse ouverte qu'il souhaite enrichir avec ce document, un menu déroulant sur le bouton : *Créer une nouvelle analyse / Ajouter à [Analyse existante]*.

### 4.3. Shell du module Legal Extraction

C'est le layout global de toutes les pages du module. Il ressemble à Canvas (capture fournie) avec adaptations.

```
┌──────────────────────────────────────────────────────────────────┐
│ [breadcrumb]                 [actions contextuelles top-right]    │
├─────────────────────┬────────────────────────────────────────────┤
│                     │                                            │
│  SIDEBAR            │  ZONE PRINCIPALE                           │
│  INTERNE            │  (dépend de la route)                       │
│  (environ 260px)    │                                            │
│                     │                                            │
│  🔍 Rechercher      │                                            │
│                     │                                            │
│  ─── ANALYSES ───   │                                            │
│  ▸ NDA ACME         │                                            │
│    24 avril         │                                            │
│  ▸ DD Apollo        │                                            │
│    22 avril         │                                            │
│  ▸ Revue Bosch      │                                            │
│    18 avril         │                                            │
│  + Nouvelle analyse │                                            │
│                     │                                            │
│  ─── BASE DE RÉF ── │                                            │
│  ⚖ Playbooks  (3)   │                                            │
│  📄 Standards  (5)  │                                            │
│  📋 Grilles DD  (2) │                                            │
│  📚 Clausiers  (1)  │                                            │
│  ─ À venir ─        │                                            │
│  📖 Glossaires      │                                            │
│  📝 Templates       │                                            │
│  🏷 Red flags       │                                            │
│  ...                │                                            │
│                     │                                            │
└─────────────────────┴────────────────────────────────────────────┘
```

La sidebar est **collapsible** (bouton pour la réduire/étendre), comme dans Canvas.

**Section *Analyses*** : liste chronologique des analyses récentes avec leur nom et date. Triées par *lastActivityAt* desc. Click → navigation vers l'analyse.

**Section *Base de référence*** : les 4 types implémentés en tête, avec un compteur du nombre d'actifs. En dessous, une sous-section "À venir" avec les types signalés mais non implémentés — affichage grisé avec badge *Bientôt disponible*.

### 4.4. Écran d'amorçage d'une nouvelle analyse

Affiché dans la zone principale quand on entre dans une analyse fraîchement créée (ou via *+ Nouvelle analyse*).

```
┌──────────────────────────────────────────────────────────────────┐
│  ANALYSE : NDA ACME - 24 avril 2026        [✎ renommer] [···]   │
│  1 document extrait • [+ Ajouter un document]                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                Que souhaitez-vous faire ?                        │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │      ⚖       │  │      🔀      │  │      📊      │            │
│  │   Auditer    │  │   Comparer   │  │  Tableau     │            │
│  │   contre un  │  │   à un autre │  │  d'analyse   │            │
│  │   playbook   │  │   document   │  │  (NOUVEAU)   │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐                              │
│  │      📝      │  │      💬      │                              │
│  │   Créer un   │  │   Démarrer   │                              │
│  │   contrat    │  │   libre      │                              │
│  │   (NOUVEAU)  │  │              │                              │
│  └──────────────┘  └──────────────┘                              │
│                                                                  │
│  Ou consultez la structure extraite ›                            │
└──────────────────────────────────────────────────────────────────┘
```

**En-tête** :
- Nom de l'analyse (éditable au clic sur l'icône crayon)
- Nombre de documents extraits
- Bouton *+ Ajouter un document* → ouvre un sélecteur des documents du workspace (qui affiche aussi leur statut d'extraction — "déjà extrait" / "à extraire")
- Menu contextuel (archiver, supprimer, dupliquer)

**5 cartes d'opération** (3 + 2 grid) :
- *Auditer contre un playbook* (icône balance)
- *Comparer à un autre document* (icône flèches en miroir)
- **[NOUVEAU]** *Tableau d'analyse* (icône grille/tableau) — carte centrale, remplace *Constituer un clausier* comme carte d'amorçage. Le clausier est maintenant un workflow OOTB accessible depuis cette carte.
- **[NOUVEAU]** *Créer un contrat* (icône document crayon) — instanciation d'un Standard avec redline
- *Démarrer libre* (icône bulle de conversation)

**Note sur le Clausier** : *Constituer un clausier* disparaît comme carte d'amorçage distincte. L'utilisateur clique *Tableau d'analyse* puis choisit le workflow *Clausier MSA / NDA / etc.* dans le second niveau.

**Click sur une carte** :
- Affiche un **second niveau** dans la zone principale qui demande les éléments manquants
- Dans tous les cas, le premier message de la conversation à gauche se remplit avec l'intention formulée

**Click sur "Démarrer libre"** :
- Le focus va directement dans le champ de saisie de la conversation à gauche

**Lien "Ou consultez la structure extraite ›"** :
- Bascule vers la vue objet juridique du document principal de l'analyse (voir section 4.6)

### 4.5. Analyse active avec layout 30/70

Une fois une opération lancée, la zone principale bascule sur le layout 30/70.

```
┌──────────────────────────────────────────────────────────────────┐
│  ANALYSE : NDA ACME - 24 avril 2026        [✎] [Export] [···]   │
├──────────────────┬──────────────────────────────────────────────┤
│                  │ [📄 NDA ACME] [📄 NDA Standard] [📝 Note] [✍ Redline] │
│ CONVERSATION     │                                              │
│                  ├──────────────────────────────────────────────┤
│ ▼ Clara          │                                              │
│                  │  CONTENU ACTIF                               │
│ Compare à notre  │                                              │
│ NDA standard     │  Note comparative — NDA ACME vs NDA Standard │
│                  │  Version 2 de 2 • Modifiée il y a 2 min     │
│ ▼ Legal Extr.    │                                              │
│                  │  ────────────────────────────────────────    │
│ J'ai analysé les │                                              │
│ deux documents.  │  1. SYNTHÈSE                                 │
│ Voici les        │                                              │
│ principaux       │  Niveau global d'écart : SIGNIFICATIF        │
│ écarts :         │                                              │
│                  │  Ce NDA présente 4 écarts significatifs par   │
│ 📝 Note comp. v2 │  rapport à notre standard maison. Les points  │
│ ✍ Redline v1    │  prioritaires concernent la durée, la        │
│                  │  juridiction, les exceptions...              │
│ ▼ Clara          │                                              │
│                  │  2. TABLEAU COMPARATIF CLAUSE PAR CLAUSE     │
│ Ajoute une       │                                              │
│ recommandation   │  [tableau CKEditor]                          │
│ sur la juridic-  │                                              │
│ tion...          │  3. RECOMMANDATIONS                          │
│                  │  ...                                         │
│ ▼ Legal Extr.    │                                              │
│                  │                                              │
│ Note comparative │                                              │
│ mise à jour.     │                                              │
│                  │                                              │
│ 📝 Note comp. v3 │                                              │
│                  │                                              │
│ ─────────────    │                                              │
│                  │                                              │
│ [champ saisie ↵] │                                              │
│                  │                                              │
└──────────────────┴──────────────────────────────────────────────┘
```

**Colonne gauche (30%)** :
- Liste chronologique des messages (user / assistant)
- Les messages assistant peuvent contenir des **cartes de livrables** cliquables qui basculent la vue de droite
- Champ de saisie en bas, avec bouton envoyer
- Suggestions contextuelles au-dessus du champ ("Propose une reformulation", "Explique ce point")

**Colonne droite (70%)** :
- **En haut** : bande d'onglets typés (icône + nom) listant les documents de l'analyse + les livrables produits. L'onglet actif est surligné
- **Zone principale** : le contenu actif (document en vue objet juridique, livrable en CKEditor, tableau DD, redline)

**Navigation entre onglets** :
- Click direct sur un onglet
- Click sur une carte de livrable dans la conversation
- Raccourci clavier : Ctrl+1, Ctrl+2, etc. (bonus)

**Si trop d'onglets pour tenir en largeur** : les derniers passent dans un menu "..." à droite de la bande d'onglets.

**Onglet spécial** : en fin de liste, un onglet *+* qui ramène à l'écran d'amorçage pour lancer une nouvelle opération.

### 4.6. Vue objet juridique

Affichée dans la colonne droite quand un document est sélectionné dans les onglets.

```
┌──────────────────────────────────────────────────────────────────┐
│ [📄 NDA ACME (actif)] [📄 NDA Standard] [📝 Note] [✍ Redline]   │
├─────────────────────────────┬───────────────────────────────────┤
│ STRUCTURE EXTRAITE          │ DOCUMENT SOURCE                   │
│                             │                                   │
│ 📋 Métadonnées              │  [Rendu PDF — page 3]             │
│   Type : NDA mutuel         │                                   │
│   Parties : ACME, Bosch     │   Article 4 — Durée               │
│   Durée : 3 ans  ⚠          │                                   │
│   Juridiction : Paris       │   La présente convention est      │
│                             │   conclue pour une durée de       │
│ 📑 Clauses (14)             │   trois (3) ans à compter de sa   │
│                             │   signature...                    │
│ ▾ 1. Définitions           │                                   │
│    Information Confid.      │   Elle pourra être renouvelée     │
│    Type : DEFINITION_IC     │   par tacite reconduction...      │
│    Confiance : high         │                                   │
│    → 3 terms liés          │                                   │
│                             │                                   │
│ ▾ 4. Durée  [actif]        │                                   │
│    "Trois (3) ans..."       │                                   │
│    Attr: term_years = 3     │                                   │
│    Attr: renewal = tacite   │                                   │
│    Citation → p.3 ¶ 4.1     │                                   │
│    ⚠ Incertitude sur renou. │                                   │
│    [✎ Modifier]             │                                   │
│                             │                                   │
│ ▸ 5. Exceptions            │                                   │
│ ▸ 6. Retour/destruction    │                                   │
│ ▸ 7. Juridiction            │                                   │
│ ▸ [7 autres clauses]        │                                   │
│                             │                                   │
│ 🔗 Termes définis (5)       │                                   │
│ 📎 Renvois (3)              │                                   │
│                             │                                   │
│ ─────────────────────────   │                                   │
│ ⚠ 2 clauses incertaines     │                                   │
│ [Revoir les incertitudes →] │                                   │
│ [✎ Ajouter une clause]     │                                   │
│                             │                                   │
└─────────────────────────────┴───────────────────────────────────┘
```

**Panneau gauche — structure extraite** :
- Arborescence repliable : Métadonnées, Clauses, Termes définis, Renvois
- Clauses listées dans l'ordre d'apparition, numérotées
- Chaque clause a un pictogramme, un titre, son type, sa confiance
- Les clauses à faible confiance ont un badge ⚠
- Click sur une clause : la développe (affiche le texte complet + sous-attributs + citation)
- La clause active est surlignée

**Panneau droit — document source** :
- Rendu PDF via pdf.js
- Navigation pages (boutons prev/next, zoom)
- **Surlignage automatique** du passage correspondant à la clause active à gauche
- Quand l'utilisateur navigue dans le PDF, il peut aussi cliquer sur un passage → la clause correspondante est mise en focus à gauche (miroir)

**Actions** :
- Modifier une clause : ouvre un panneau d'édition inline (changer type, éditer attributs, éditer texte...)
- Ajouter une clause : mode de sélection dans le PDF → sélection du passage → choix du type → ajout
- Fusionner deux clauses : multi-sélection + action *Fusionner*
- Scinder une clause : curseur dans le texte + action *Scinder ici*

**Indicateur des incertitudes** :
- Compteur en bas : *"2 clauses incertaines"*
- Click : filtre l'arborescence pour ne montrer que les clauses à faible confiance

### 4.7. Base de référence — Accueil

Route `/workspaces/:id/legal-extraction/reference-base`.

```
┌──────────────────────────────────────────────────────────────────┐
│  BASE DE RÉFÉRENCE                                               │
│  Les actifs juridiques du workspace : playbooks, standards,      │
│  grilles de DD, clausiers.                                       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────┐  ┌────────────────────┐                  │
│  │  ⚖                 │  │  📄                 │                  │
│  │                    │  │                    │                  │
│  │  Playbooks         │  │  Standards         │                  │
│  │                    │  │                    │                  │
│  │  3 actifs          │  │  5 actifs          │                  │
│  │                    │  │                    │                  │
│  │  Positions de      │  │  NDA, DPA, contrat │                  │
│  │  négociation par   │  │  standards maison  │                  │
│  │  type de clause    │  │                    │                  │
│  └────────────────────┘  └────────────────────┘                  │
│                                                                  │
│  ┌────────────────────┐  ┌────────────────────┐                  │
│  │  📋                 │  │  📚                 │                  │
│  │                    │  │                    │                  │
│  │  Grilles de DD     │  │  Clausiers         │                  │
│  │                    │  │                    │                  │
│  │  2 actifs          │  │  1 actif           │                  │
│  │                    │  │                    │                  │
│  │  Check-lists de    │  │  Bibliothèques de  │                  │
│  │  due diligence     │  │  clauses-types     │                  │
│  │  réutilisables     │  │                    │                  │
│  └────────────────────┘  └────────────────────┘                  │
│                                                                  │
│  ─── Bientôt disponible ───                                      │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │ 📖 Gloss │ │ 📝 Templ │ │ 🏷 Red f │ │ ... +4   │             │
│  │ (grisé)  │ │ (grisé)  │ │ (grisé)  │ │ (grisé)  │             │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Cartes principales** : les 4 types implémentés, avec compteur et description.

**Section "Bientôt disponible"** : cartes grisées, plus petites, pour les types non implémentés (glossaires, templates de livrables, red flags, historiques, base contreparties, workflows, taxonomies custom, référentiels réglementaires). Au clic, une **fiche descriptive** explique le type et son usage envisagé — mais aucune fonctionnalité.

### 4.8. Base de référence — Liste d'actifs (par type)

Route `/workspaces/:id/legal-extraction/reference-base/playbooks` (par exemple).

```
┌──────────────────────────────────────────────────────────────────┐
│  Base de référence > Playbooks              [+ Nouveau playbook] │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🔍 Rechercher dans les playbooks              [↕ tri: récents]  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  ⚖  Playbook commercial                                   │    │
│  │                                                           │    │
│  │  v2.3 • Mis à jour le 15/03/2026 par Samia • 47 clauses   │    │
│  │  Juridiction : France • Langue : FR                       │    │
│  │  "Positions de négociation pour les contrats fournisseurs │    │
│  │   et clients standards"                                   │    │
│  │                                                           │    │
│  │  [Consulter]  [Modifier]  [Historique des versions]       │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  ⚖  Playbook data / RGPD                                  │    │
│  │                                                           │    │
│  │  v1.0 • Créé le 02/02/2026 par Marc • 23 clauses          │    │
│  │  Juridiction : UE • Langue : FR + EN                      │    │
│  │  "Positions sur les DPA et clauses data"                  │    │
│  │                                                           │    │
│  │  [Consulter]  [Modifier]  [Historique des versions]       │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ...                                                             │
└──────────────────────────────────────────────────────────────────┘
```

**Liste des actifs** sous forme de cartes avec métadonnées (version, auteur, contenu, juridiction, langue, description).

**Actions par actif** : Consulter, Modifier, Historique.

**Bouton *+ Nouveau playbook*** en haut à droite : ouvre un dialog avec deux options :
- *Importer depuis un document* (dépôt d'un Word / PDF, indexation 2 spécifique)
- *Démarrer à vide* (rédaction CKEditor)

### 4.9. Base de référence — Détail d'un actif

Route `/workspaces/:id/legal-extraction/reference-base/playbooks/:id`.

**Layout** : similaire à la vue objet juridique (structure à gauche, contenu à droite), mais adapté au type d'actif.

**Pour un playbook** :
- Gauche : arbre des sections (par type de clause)
- Droite : édition CKEditor de la section active (position idéale, fallback, red flag, argumentaire)

**Pour un standard** (NDA standard, DPA...) :
- Gauche : structure de l'objet juridique (clauses, termes)
- Droite : texte intégral du standard (éditable)

**Pour une grille de DD** :
- Gauche : arbre des catégories de questions
- Droite : édition des questions, réponses attendues, règles de risque

**Pour un clausier** :
- Gauche : arbre des types de clauses
- Droite : édition des variantes pour le type actif (texte, fréquence, contexte, commentaires)

**Header commun** :
- Nom de l'actif, version courante
- Actions : *Modifier*, *Figer une nouvelle version*, *Historique*, *Archiver*
- Métadonnées : auteur, dernière MAJ, juridiction, langue
- Bloc gouvernance : owner, approuveurs, contributeurs (avec badges utilisateurs)

**Onglets sous le header** :
- *Contenu* (par défaut, vue gauche/droite décrite ci-dessus)
- *Amendements proposés* (avec badge numérique si > 0) — voir §5.7
- *Historique des versions* (liste des versions figées avec leur résumé)
- *Analyses qui consomment cet actif* (utile pour mesurer l'adoption)

### 4.10. Écran Tabular Review *(NOUVEAU)*

Affiché quand l'utilisateur clique *Tableau d'analyse* et choisit (ou crée) une Tabular Review.

```
┌────────────────────────────────────────────────────────────────────┐
│  ANALYSE : Diligence Apollo - 12 mai 2026                          │
│  18 documents extraits • [+ Ajouter un document]                   │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  TABLEAU D'ANALYSE — Diligence Apollo                              │
│  Workflow : DDQ M&A standard ▼   [+ Colonne]   [↻ Run]   [⬇ Excel] │
│                                                                    │
│  ┌─────────────┬───────────┬──────────┬──────────┬──────────┐     │
│  │ Document    │ Loi appl. │ Cap resp.│ Change   │ Non-comp.│     │
│  │             │           │          │ of contr.│          │     │
│  ├─────────────┼───────────┼──────────┼──────────┼──────────┤     │
│  │ MSA Apollo  │ NY ⓒ      │ 12 mois ⓒ│ Oui ⓒ    │ 24 mois ⓒ│     │
│  │ MSA Beta    │ FR ⓒ      │ 24 mois ⓒ│ Oui ⓒ    │ 12 mois ⓒ│     │
│  │ MSA Gamma   │ — ⚠       │ 12 mois ⓒ│ Non ⓒ    │ — ⚠      │     │
│  │ ...         │           │          │          │          │     │
│  └─────────────┴───────────┴──────────┴──────────┴──────────┘     │
│                                                                    │
│  ⓒ = citation cliquable    ⚠ = extraction incertaine ou absente   │
└────────────────────────────────────────────────────────────────────┘
```

**Sélecteur de workflow** (haut gauche) : Clausier MSA, Clausier NDA, DDQ M&A, DDQ Real Estate, Conformité RGPD, ou *Personnalisé*.

**Bouton + Colonne** : popin pour ajouter une colonne libre (libellé + question/définition + type attendu).

**Bouton ↻ Run** : relance l'extraction sur tout le tableau, ou seulement les cellules sélectionnées.

**Cellules cliquables** : clic sur ⓒ → panneau citation (page + extrait + ouverture du doc).

**Re-run granulaire** : clic droit sur en-tête de colonne → *Relancer cette colonne* ; clic droit sur une cellule → *Relancer cette cellule*.

**Export Excel** : bouton ⬇ présent, non fonctionnel (matérialisé).

**Bouton *Publier dans la base*** : présent en haut de la Tabular Review — permet de publier la Tabular Review comme actif `clausier` dans la base de référence.

#### 4.10.1. Panneau chat text-to-SQL

Panneau latéral droit (toggle), affiché à côté du tableau.

```
┌────────────────────────┐
│  💬 Interroger         │
│                        │
│  > Contrats avec       │
│    cap < 24 mois et    │
│    juridiction NY      │
│                        │
│  Résultat : 1 contrat  │
│  ✓ MSA Apollo          │
│                        │
│  [Voir requête SQL]    │
│  [Filtrer le tableau]  │
└────────────────────────┘
```

- Question en langage naturel → SQL généré par Claude Haiku sur la table `tabular_cells`
- Résultat affiché + bouton *Filtrer le tableau* qui applique le filtre directement sur la vue
- *Voir requête SQL* : expande la requête générée (transparence, audit)
- Si non interprétable : message *"Je n'ai pas pu traduire votre question. Reformulez ou filtrez manuellement."*

### 4.11. Écran Création de contrat depuis template *(NOUVEAU)*

Accessible via la carte *Créer un contrat* dans l'écran d'amorçage.

1. **Sélection d'un Standard** : liste des Standards de la base (NDA, MSA, SPA, DPA...) avec aperçu
2. **Instanciation des variables** : formulaire généré depuis les métadonnées du Standard (parties, montants, dates, juridiction) — valeurs pré-remplies depuis le contexte projet si disponible, saisie manuelle sinon
3. **Génération** : bouton *Générer le contrat* → appel au moteur de redline, production d'un `ContractDraft` + `Redline` associé
4. **Visualisation** : le Redline s'ouvre dans CKEditor avec tracked changes simulés (insertions = clauses du template, suppressions = parties laissées vides ou à compléter)
5. **Export `.docx`** : bouton présent, non fonctionnel

### 4.12. Écran Multi-document redline coordonné *(NOUVEAU)*

Accessible depuis une nouvelle carte d'amorçage ou via la conversation.

1. **Sélection de N documents** : checkboxes sur les documents de l'analyse
2. **Saisie de la décision** : textarea en langage naturel — *"Aligner le cap de responsabilité à 12 mois sur tous les contrats"*
3. **Génération** : bouton *Appliquer la décision* → N appels en parallèle au moteur de redline, production de N `Redline`
4. **Vue des résultats** : liste des N redlines avec compteur de modifications par document ; documents marqués *"Décision non applicable"* si la clause cible est absente
5. **Validation groupée ou individuelle** : boutons *Tout accepter* et *Tout rejeter* + possibilité d'ouvrir chaque redline individuellement dans CKEditor

### 4.13. Flux de capitalisation *(NOUVEAU)*

Déclenché automatiquement quand un utilisateur **accepte** un changement dans un Redline issu d'un audit ou d'une comparaison, et que ce changement dévie d'un playbook référencé dans l'analyse.

**Toast non bloquant** (disparaît après 10 secondes) :

```
┌──────────────────────────────────────────────────────┐
│  Cette acceptation dévie du playbook commercial.     │
│  Voulez-vous capitaliser cette décision ?            │
│                                                      │
│  [Créer un playbook dérivé]                          │
│  [Enrichir le playbook existant]                     │
│  [Ignorer]                                           │
└──────────────────────────────────────────────────────┘
```

- *Créer un playbook dérivé* → crée une demande d'amendement de type *nouveau playbook dérivé*
- *Enrichir le playbook existant* → crée une demande d'amendement sur le playbook référencé (mécanisme existant §5.7), avec `triggerSource: 'redline_acceptance'` et le `triggerRedlineId` correspondant
- *Ignorer* (ou timeout 10s) → toast disparaît, le redline accepté reste valide dans l'analyse, aucune action sur le playbook

Si la demande d'amendement est ensuite **rejetée par l'approver** : le redline accepté reste valide, notification à l'utilisateur. Le playbook n'est pas modifié.

## 5. Parcours spécifiques

### 5.1. Alimentation de la base par import

1. Sur la liste d'actifs (ex: playbooks), clic *+ Nouveau playbook*
2. Dialog : *Importer depuis un document* ou *Démarrer à vide*
3. Sélection *Importer* → drag & drop ou sélection fichier
4. Upload + indexation 2 (avec schéma adapté aux playbooks : identification des sections, positions, etc.)
5. Écran de prévisualisation : structure extraite proposée, éditable avant validation
6. Validation → l'actif est créé dans la base, accessible pour les opérations

### 5.2. Publication d'un clausier depuis une analyse

1. Dans une analyse, un livrable clausier est produit et consulté
2. En haut du livrable, bouton *Publier dans la base*
3. Dialog : nom de l'actif dans la base, description, juridiction, confirmation
4. Validation → l'actif est créé (type `clausier`), visible dans la base de référence
5. Dans l'analyse, le livrable porte désormais un badge *Publié dans la base*

### 5.3. Consultation d'une citation

1. Dans un livrable, clic sur une citation (typiquement un lien ou un numéro en exposant)
2. Un **panneau latéral** (drawer) s'ouvre à droite de la zone principale, superposé partiellement
3. Il affiche :
   - Le nom du document source
   - Le passage cité (surligné dans son contexte — quelques paragraphes autour)
   - Un bouton *Ouvrir le document* pour voir le PDF entier
4. Fermeture : click en dehors ou bouton X

### 5.4. Gestion des versions d'un livrable

1. Dans l'en-tête d'un livrable, un sélecteur *Version 3 de 3 ▼*
2. Click : dropdown listant les versions avec horodatage et résumé
3. Sélection d'une version antérieure → la zone de contenu affiche cette version (en read-only par défaut)
4. Option *Restaurer cette version* → la version sélectionnée devient la version active (nouvelle version N+1 créée à partir d'elle)

### 5.5. Correction d'une clause dans la vue objet juridique

1. Dans la structure à gauche, click sur une clause
2. Elle se développe (texte + attributs + citation)
3. Bouton *Modifier* → mode édition inline
4. Options :
   - Éditer le type (dropdown des types de l'ontologie)
   - Éditer le texte (textarea)
   - Éditer chaque attribut (champs selon type)
   - Valider / annuler
5. Validation → mise à jour immédiate de l'objet juridique, badge *Modifié par l'utilisateur* sur la clause

### 5.6. Proposer un amendement à un actif depuis une analyse

C'est le parcours qui transforme la base de référence en actif vivant (cf. `10-cycle-de-vie-actifs-reference.md` §2.3).

1. Dans une analyse d'audit, le juriste consulte un verdict de confrontation (ex : *"Plafond de responsabilité 6 mois — non conforme au playbook qui exige 12 mois minimum"*)
2. Après négociation, le juriste a obtenu **9 mois** et juge que cette position devient acceptable comme nouveau fallback
3. Sur le verdict, bouton contextuel *Proposer un amendement au playbook*
4. Dialog d'amendement avec champs pré-remplis :
   - **Actif concerné** : *Playbook commercial 2026* (verrouillé, déduit de l'analyse)
   - **Portée** : dropdown (*Position de fallback / Position idéale / Red flag / Argumentaire / Nouvelle clause*)
   - **Chemin** : *clauses.liability_cap.fallback* (pré-rempli, modifiable)
   - **Valeur actuelle** : *"12 mois de CA minimum"* (lecture seule)
   - **Valeur proposée** : *"9 mois de CA minimum, 12 mois pour les contrats > 5M€"* (libre)
   - **Justification** : textarea (*"Concession obtenue dans le deal Acme — précédent acceptable selon GC"*)
5. Validation → l'amendement entre en file d'attente sur l'actif (statut `pending`)
6. Toast confirmant : *"Amendement proposé. Voir la file d'attente du playbook."* avec lien direct
7. Sur l'analyse, badge persistant *"1 amendement proposé depuis cette analyse"*

**Pré-alpha** : un seul utilisateur joue tous les rôles. Après l'étape 5, l'amendement passe automatiquement par un écran de validation (cf. §5.7) tenu par le même utilisateur. La file d'attente est matérialisée mais résolue immédiatement par le même utilisateur.

### 5.7. Gérer la file d'attente d'amendements d'un actif

1. Sur la fiche détail d'un actif (cf. §4.9), un onglet *Amendements proposés* (avec badge numérique si > 0)
2. Liste des amendements en attente, chacun avec :
   - Auteur, date, analyse d'origine (lien)
   - Portée + chemin
   - Diff visuel valeur actuelle ↔ valeur proposée
   - Justification fournie
   - Statut courant (`pending`)
3. Pour chaque amendement, 3 actions disponibles à l'utilisateur en rôle owner/approuveur :
   - **Accepter** → la modification s'applique à la version courante de l'actif. Confirmation demandée si l'amendement est structurant (proposition d'un nouveau red flag, suppression d'une position) → en ce cas, suggestion de figer une nouvelle version
   - **Rejeter** → demande un commentaire de rejet (visible par le contributeur)
   - **Différer** → l'amendement reste en file d'attente avec un commentaire (à examiner plus tard)
4. Après acceptation/rejet, l'amendement est archivé dans l'historique de l'actif (consultable via un toggle *Voir l'historique*)
5. L'utilisateur en rôle owner peut ensuite cliquer *Figer une nouvelle version* depuis la fiche actif si plusieurs amendements ont été acceptés

**Pré-alpha** : pas de notification entre utilisateurs (un seul user). En alpha : notification au contributeur lors de la réponse, notification aux utilisateurs du workspace lors du figeage d'une nouvelle version.

## 6. États d'interface

### 6.1. États de chargement

Pour toute opération asynchrone (indexation 2, génération de livrable, sauvegarde) :

- **Indicateur inline** : skeleton ou spinner à l'emplacement du contenu attendu
- **Bandeau en haut de l'écran** pour les opérations longues : *"Extraction en cours... (3/10)"* + bouton annuler
- **Toast non-bloquant** : *"Note comparative générée"* quand l'opération se termine et que l'utilisateur a navigué ailleurs

### 6.2. États vides

- **Workspace sans document** : message encourageant à déposer des documents avec le bouton *Ajouter des documents*
- **Analyse sans document extrait** : *"Aucun document dans cette analyse. Ajoutez-en un depuis le workspace avec Extract legal clauses, ou cliquez sur + Ajouter un document."*
- **Module sans analyse** : *"Bienvenue dans Legal Extraction. Créez votre première analyse depuis le workspace ou cliquez sur + Nouvelle analyse."*
- **Base de référence vide** pour un type : *"Aucun playbook. Ajoutez votre premier playbook pour commencer à auditer des contrats."*

### 6.3. États d'erreur

- **Erreur d'extraction** : message clair avec bouton *Réessayer* et lien *Signaler un problème*
- **Erreur API LLM** : *"Le service d'analyse est temporairement indisponible. Réessayer dans quelques instants."* avec bouton réessayer
- **Erreur réseau** : bannière globale *"Connexion interrompue"* avec indicateur de reconnexion

### 6.4. États de confiance

Un élément à **faible confiance** affiche :
- Un badge ⚠ orange discret
- Au survol : tooltip *"Extraction incertaine. Vérifiez cette clause."*
- Dans la vue objet juridique, accès direct au passage source pour vérification

Un élément **modifié par l'utilisateur** affiche :
- Un badge bleu *"Modifié"* discret
- Au survol : tooltip *"Modifié par [utilisateur] le [date]"*

## 7. Design system

### 7.1. Couleurs

Cohérent avec Sinequa (observé sur les captures) :

- **Fond principal** : blanc ou très pâle (`#F9FAFB` ou équivalent)
- **Surface cartes** : blanc avec ombre discrète
- **Primary** : bleu moyen ou violet (à calibrer sur les boutons *Nouveau*, *Envoyer*) — `#6366F1` ou similaire
- **Succès** : vert discret (`#10B981`)
- **Warning** : orange (`#F59E0B`)
- **Danger / red flag** : rouge (`#EF4444`)
- **Neutre foncé** (texte) : `#1F2937`
- **Neutre moyen** (légendes) : `#6B7280`
- **Neutre clair** (borders) : `#E5E7EB`

### 7.2. Typographie

Police sans-serif moderne (Inter, Roboto, ou équivalent). Hiérarchie :
- H1 : 28-32px, bold
- H2 : 22-24px, semibold
- H3 : 18px, semibold
- Body : 14-16px, regular
- Caption : 12px, medium

### 7.3. Espacements

Base 4px : `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.

### 7.4. Composants de base

- **Boutons** : pill pour actions primaires, flat pour secondaires
- **Cartes** : bordure fine + ombre discrète + hover surelevé
- **Inputs** : bordure fine, focus ring bleu
- **Badges** : rounded full, typographie 12px medium
- **Tables** : lignes discrètes, hover row, header sticky sur scroll
- **Modals / drawers** : overlay sombre semi-transparent, drop shadow sur le panneau

## 8. Récapitulatif

L'UX du module Legal Extraction est **cohérente avec Sinequa** dans ses patterns visuels et structurels, tout en apportant les spécificités métier nécessaires :

- Entrée naturelle depuis le doc viewer
- Notion d'**analyse** comme unité de travail
- Layout conversation + contenu
- Vue objet juridique comme représentation centrale
- Base de référence visible comme actif du module
- Livrables riches et éditables

L'ensemble doit pouvoir s'implémenter en Angular + Tailwind + CKEditor en **cohérence totale** avec ce que l'équipe produit voit déjà dans Canvas, Threads, etc.

Suite : [05-specifications-fonctionnelles.md](./05-specifications-fonctionnelles.md) pour le détail fonctionnel par zone et composant.
