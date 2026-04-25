# Clause — Backend

Backend Node.js + TypeScript du module Legal Extraction.

## Scripts

```bash
npm run dev       # Démarrage en développement (tsx watch)
npm run build     # Compilation TypeScript
npm start         # Démarrage en production (compilé)
npm run db:seed   # Initialisation de la base + seed de démo
npm run db:reset  # Reset complet et re-seed
```

## Variables d'environnement (`.env`)

| Variable               | Défaut                  | Description                         |
| ---------------------- | ----------------------- | ----------------------------------- |
| `PORT`                 | `3000`                  | Port d'écoute du serveur            |
| `FRONT_URL`            | `http://localhost:4200` | URL du front pour CORS              |
| `ANTHROPIC_API_KEY`    | *(requis si LLM réel)*  | Clé API Anthropic                   |
| `USE_MOCK_LLM`         | `true`                  | Si `false`, utilise Anthropic réel  |
| `EMBEDDINGS_CACHE_DIR` | `./.cache/transformers` | Dossier de cache du modèle ML       |

## Stack

- **Express 4** : routage HTTP
- **better-sqlite3** : base embarquée
- **drizzle-orm** : ORM TypeScript
- **@anthropic-ai/sdk** : client LLM
- **@xenova/transformers** : embeddings ML locaux
- **zod** : validation des schémas
- **multer** : upload de fichiers
- **pdf-parse, mammoth** : extraction de texte PDF / DOCX

## Endpoints principaux

| Méthode | Endpoint                                      | Description                                        |
| ------- | --------------------------------------------- | -------------------------------------------------- |
| GET     | `/api/workspaces`                             | Liste des workspaces                               |
| GET     | `/api/workspaces/:id/documents`               | Liste des documents d'un workspace                 |
| POST    | `/api/workspaces/:id/documents`               | Upload + indexation 1 d'un document                |
| POST    | `/api/workspaces/:id/documents/:id/extract`   | Lance l'indexation 2 (extraction légale)           |
| POST    | `/api/workspaces/:id/analyses`                | Crée une analyse                                   |
| POST    | `/api/intent/parse`                           | Parse une demande NL en intent structurée          |
| GET     | `/api/clauses/:id/similar`                    | Clauses similaires (RAG niveau 1)                  |
| POST    | `/api/clauses/:id/ask`                        | Question NL sur une clause                         |
| GET     | `/api/deliverables/:id`                       | Récupère un livrable                               |
| POST    | `/api/deliverables/:id/refine`                | Affine un livrable selon une instruction NL       |
| GET     | `/api/deliverables/:id/export/docx`           | Export Word d'un livrable                          |
| GET     | `/api/reference-base`                         | Liste des actifs de référence                      |

## Architecture

```
src/
├── index.ts                 # Bootstrap Express
├── routes/                  # Controllers REST
├── services/                # Logique métier (extraction, 9 opérations)
├── llm/                     # Gateway LLM
│   ├── llm-gateway.ts       # Interface
│   ├── anthropic-provider.ts # Implémentation Anthropic
│   ├── mock-provider.ts     # Mock pour démo sans clé API
│   └── index.ts             # Sélection du provider
├── embeddings/              # Service d'embeddings (V2)
│   └── embedding.service.ts
├── db/                      # Schéma + seed
│   ├── schema.ts            # Tables Drizzle
│   ├── seed.ts              # Données de démo
│   └── index.ts             # Init DB
├── ontologies/
│   └── maison.json          # Ontologie maison (34 types de clauses)
└── types/
    └── api.ts               # Schemas zod partagés
```
