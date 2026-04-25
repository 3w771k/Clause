# Clause — Module Legal Extraction (pré-alpha)

Pré-alpha standalone du module **Legal Extraction** destiné à intégrer la suite **AI Workplace** de Sinequa.

> Ce repo contient un applicatif autonome (frontend Angular + backend Node) qui démontre les capacités du module : extraction structurée de documents juridiques, audit, comparaison, clausier, et 5 autres opérations métier. Il est destiné à servir de base de discussion à l'équipe produit Sinequa.

Pour le contexte produit complet, les choix d'architecture, et les écarts vs cadrage initial, voir [DECISIONS.md](./DECISIONS.md).

## Prérequis

- Node.js 20+
- npm 10+
- ~200 Mo d'espace disque (pour le modèle d'embeddings téléchargé une fois)

## Démarrage rapide

```bash
# 1. Installer les dépendances (frontend + backend)
npm install
cd server && npm install && cd ..

# 2. Configurer le serveur
cd server
cp .env.example .env
# (Optionnel) Renseigner ANTHROPIC_API_KEY et passer USE_MOCK_LLM=false pour utiliser un vrai LLM
cd ..

# 3. Initialiser la base de données et les données de démo
cd server && npm run db:seed && cd ..
# La première exécution télécharge le modèle d'embeddings (~120 Mo, une fois)

# 4. Lancer le backend (port 3000)
cd server && npm run dev
# Dans un autre terminal :

# 5. Lancer le frontend (port 4200)
npm start
```

Ouvrir http://localhost:4200 dans le navigateur.

## Structure du repo

```
/                          # Frontend Angular
├── src/app/
│   ├── core/              # Modèles, services, types
│   ├── features/          # Workspaces, analyses, livrables, base de référence
│   └── layout/            # Shell (chrome Sinequa)
├── public/                # Assets
└── server/                # Backend Node
    ├── src/
    │   ├── routes/        # Endpoints REST
    │   ├── services/      # Logique métier (extraction, opérations)
    │   ├── llm/           # Gateway LLM (Anthropic + mock)
    │   ├── embeddings/    # Service d'embeddings (xenova/transformers)
    │   ├── db/            # Schéma Drizzle, seed
    │   └── ontologies/    # Ontologie maison (JSON)
    └── data/              # Base SQLite (générée)
```

## Scénarios de démo

Le seed contient un workspace de démo avec :

- 3 documents (NDA mutuel ACME, NDA standard maison, contrat de prestation)
- 3 actifs de référence (playbook commercial, NDA standard, grille DD M&A)
- 2 analyses pré-créées (comparaison de NDA, audit du contrat de prestation)

### Scénario 1 — Comparaison de NDA

1. Ouvrir le workspace de démo
2. Cliquer sur l'analyse "Comparaison NDA ACME vs Standard"
3. Consulter la note comparative et le redline

### Scénario 2 — Clauses similaires (V2 — RAG)

1. Ouvrir le document "NDA ACME"
2. Cliquer sur la clause de confidentialité pour la déplier
3. Cliquer sur "Voir les clauses similaires"
4. Le panneau affiche les clauses sémantiquement les plus proches dans les autres documents du workspace, avec leur score de similarité

### Scénario 3 — Création d'une analyse en NL (V2 — NL)

1. Sur la page workspace, cliquer "Nouvelle analyse"
2. Dans le champ NL en haut, taper "Compare le NDA ACME avec notre NDA standard"
3. Cliquer "Lancer" — le wizard saute à l'étape de confirmation pré-remplie
4. Valider, l'analyse se lance

## Modes LLM

Par défaut `USE_MOCK_LLM=true` : toutes les opérations utilisent un mock provider qui retourne des résultats plausibles mais codés en dur. Permet de démontrer toute l'UI sans coût ni clé API.

Pour activer Claude réel, dans `server/.env` :

```
USE_MOCK_LLM=false
ANTHROPIC_API_KEY=sk-ant-...
```

## Embeddings

Le service d'embeddings utilise `@xenova/transformers` qui fait tourner un modèle ML directement dans Node.js. La première fois que le serveur ou le seed s'exécute, le modèle (`Xenova/multilingual-e5-small`, ~120 Mo) est téléchargé puis mis en cache localement (`server/.cache/transformers/`). Les exécutions suivantes sont instantanées.

## Liens

- [DECISIONS.md](./DECISIONS.md) — décisions de conception et écarts vs cadrage
- [server/README.md](./server/README.md) — détails du backend
