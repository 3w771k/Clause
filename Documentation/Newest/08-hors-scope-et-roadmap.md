# 08 — Hors scope et roadmap

Ce document recense ce qui est **explicitement hors du périmètre pré-alpha** et projette l'horizon produit au-delà. L'objectif : que Claude Code sache où s'arrêter, et que l'équipe produit voie la trajectoire envisagée.

## 1. Hors scope pré-alpha — liste exhaustive

### 1.1. Intégration produit

**Pont workspace ↔ corporate source Sinequa** : le module est standalone. Pas de connexion à la corporate source (l'index source des documents Sinequa côté client). Les documents sont déposés directement dans le workspace de démo.

**Interopérabilité entre modules** : pas d'appel du module Legal Extraction par Threads, Checklist, Canvas, Financials, et réciproquement. L'agentic viendra plus tard.

**Authentification / multi-tenancy** : un utilisateur codé en dur, un workspace de démo. Pas de gestion de droits, pas de RBAC, pas d'isolation entre tenants.

**Logs d'audit et traçabilité système** : pas de piste d'audit fine (qui a fait quoi, quand, sur quel document) au-delà des UserEdits basiques sur les LegalObjects.

**Statistiques d'usage** : pas de dashboard de monitoring, pas de rétention de métriques utilisateur.

### 1.2. Connecteurs externes

**Plugin Word / Outlook** : pas de plugin pour déclencher le module depuis ces outils.

**Connecteurs iManage, SharePoint, NetDocuments, HighQ** : non implémentés.

**Connecteurs VDR** (Datasite, Intralinks, Ansarada, Imprima, Firmex) : non implémentés. Conséquence : pas de démonstration en condition réelle pour le segment Private Equity en pré-alpha — pour les démos PE, prévoir un dataset de DD réaliste injecté manuellement dans le workspace.

**Connecteurs CLM** (Ironclad, DocuSign CLM, Agiloft, ContractPodAi) : non implémentés.

**API publique du module** : pas d'API exposée pour des usages tiers.

**Webhooks, notifications externes** : non.

Voir `09-positionnement-marche.md` §5 pour la stratégie de priorisation des connecteurs alpha → beta → GA et le lien avec les segments commerciaux.

### 1.3. Export et livraison

**Export Word fonctionnel** : les boutons *Exporter* sont présents mais affichent *"Fonctionnalité à venir"*. Pas de génération .docx effective.

**Export PDF fonctionnel** : idem.

**Export Excel du tableau DD** : idem. Option *"CSV simple"* éventuellement fonctionnelle comme fallback basique.

**Templates d'export paramétrables** : pas de système de templates (viendra avec le module d'export).

**Envoi direct par email, signatures électroniques** : non.

### 1.4. Drafting from scratch

**Rédaction de contrats ex nihilo** : pas de fonctionnalité de drafting depuis zéro. Le module analyse / compare / structure, il ne rédige pas de nouveaux contrats.

**Génération de clauses à la volée** : pas de bouton *"Génère-moi une clause de X"* hors d'un contexte d'analyse existante.

**Assistant de rédaction** : non (c'est le rôle de Canvas).

### 1.5. Veille réglementaire

**Veille juridique automatique** : pas de détection de changement réglementaire impactant les contrats.

**Alerte sur les clauses non-conformes à un nouveau texte** : non.

**Intégration Lexbase / Dalloz / LexisNexis** : non.

### 1.6. Gouvernance avancée

**Workflow d'amendement collaboratif sur les actifs de référence** : **partiellement implémenté**. Un utilisateur peut proposer un amendement à un playbook depuis une analyse (cf. `04` §5.6 et `05` §6.5-6.6). Une file d'attente d'amendements est matérialisée par actif. Le contrat d'objet et les endpoints sont implémentés. **Limite pré-alpha** : un seul utilisateur fictif joue tous les rôles (owner, approuveur, contributeur), donc la validation est instantanée. Le multi-utilisateurs réel arrive en alpha.

**Workflow de validation multi-utilisateurs sur les livrables** (junior rédige, senior valide) : non.

**Co-édition simultanée** sur un livrable : non. Un utilisateur à la fois.

**Commentaires threaded sur les livrables** (au-delà des commentaires redline) : non.

**Versioning avancé avec branches** : versioning linéaire simple uniquement.

**Comparaison visuelle entre versions d'un livrable** : pas de diff visuel entre v3 et v5. Les versions sont consultables séparément.

**Suppression d'une version** : non, les versions sont append-only.

**Notifications inter-utilisateurs** lors d'une proposition d'amendement ou d'un figeage de nouvelle version : non (un seul utilisateur fictif).

**Audit log fin** sur les actions de gouvernance : non (les actions sont tracées dans l'historique de l'actif mais pas dans un log dédié).

Voir `10-cycle-de-vie-actifs-reference.md` §5 pour la trajectoire complète pré-alpha → alpha → beta → GA.

### 1.7. Ontologies et schémas

**Ontologie configurable par client** : ontologie maison + ontologie de marché en alternative, mais pas d'éditeur d'ontologie.

**Ajout de types de clauses custom** via UI : non. Passer par modification du fichier JSON d'ontologie côté code.

**Schéma des sous-attributs extensible** : figé.

**Multi-ontologies dans un même workspace** : une ontologie active par workspace.

**Alignement sémantique entre ontologies** : pas de mapping auto entre maison et marché.

### 1.8. Types d'actifs signalés mais non implémentés

Affichés dans la base de référence sous *"Bientôt disponible"* (grisés, avec fiche descriptive) :

- **Glossaires** : bibliothèques de définitions / termes juridiques standards
- **Historiques** : ensembles de précédents versionnés pour rétroactivité
- **Matrices de red flags** : listes de points rédhibitoires par typologie
- **Templates de livrables** : modèles personnalisables des 6 livrables
- **Base contreparties** : mémoire par client/adversaire des positions déjà acceptées/refusées
- **Workflows** : automatisations (ex: audit auto à chaque nouveau doc)
- **Taxonomies custom** : ontologies cliente
- **Référentiels réglementaires** : textes officiels (RGPD, DSA, etc.) comme référentiels de conformité

**Chacun de ces types** est matérialisé par une carte grisée dans la page d'accueil de la base de référence. Clic → fiche descriptive expliquant le concept sans implémentation.

### 1.9. Passage à l'échelle

**Volumes industriels** : pas de test de charge. Cible démo : jusqu'à 30 documents dans une analyse, jusqu'à 10 analyses simultanées par workspace. Au-delà, comportement non garanti.

**Performance** : pas d'optimisation fine. Les requêtes LLM sont faites à la demande, pas de préchauffage, pas de cache intelligent. Acceptable pour la démo.

**Scalabilité infra** : SQLite monolithique côté backend. Pas de clustering, pas de queue asynchrone type Kafka/RabbitMQ.

### 1.10. Langues et juridictions

**Langues supportées** : FR et EN uniquement. Pas d'allemand, espagnol, italien, portugais, néerlandais, japonais, chinois...

**Juridictions** : ontologie et playbooks orientés FR / EU / UK / US. Pas d'adaptations spécifiques (Suisse, Canada, Asie...).

**Traduction automatique** : pas de traduction FR ↔ EN des livrables ou des extraits.

### 1.11. Mobile et accessibilité

**Responsive mobile** : desktop uniquement. Pas de layout adapté mobile/tablette.

**Accessibilité** : pas de conformité WCAG. Raccourcis clavier basiques seulement.

**Mode sombre** : non (sauf si Sinequa existant en propose un, alors cohérence).

### 1.12. ML et entraînement

**Fine-tuning du LLM** : non. Utilisation des modèles de fondation avec prompts zero/few-shot.

**Apprentissage à partir des corrections utilisateur** : les corrections sont persistées (UserEdits) mais pas utilisées pour améliorer les extractions futures.

**Embeddings custom** : pas d'embeddings fine-tunés pour le domaine juridique.

**Matching auto ontologie ↔ juridiction** : pas de règles auto pour sélectionner l'ontologie selon la juridiction détectée.

### 1.13. Tests et qualité

**Couverture de tests** : tests unitaires sur les services critiques uniquement (extraction, génération livrables). Pas d'e2e complets.

**Benchmark qualité extraction** : pas de jeu de test officiel avec métriques F1 ou équivalent. Qualité validée à l'œil.

**Validation clients** : pas de session UAT (user acceptance testing) structurée.

### 1.14. Fonctionnalités utiles non prioritaires

- **Annotations libres sur un document** (surlignage, notes) en dehors de la vue objet juridique
- **Partage d'une analyse par lien**
- **Duplication d'analyse**
- **Fusion de deux analyses**
- **Import d'un LegalObject existant au lieu de ré-extraire**
- **Comparaison de N documents** (>2) — la pré-alpha gère la comparaison 2 à 2
- **Detection de conflits entre clauses internes au même document**
- **Graphe de renvois cliquable**
- **Visualisation timeline du contrat** (dates, durées, événements)

Ces fonctionnalités **ne sont pas nécessaires en pré-alpha**, même si certaines seraient de vrais gains UX.

## 2. Ce qui est matérialisé sans être implémenté

Pour donner à l'équipe produit la **vision complète** du module, certains éléments sont **visibles dans l'UI mais non fonctionnels**. Il est important de les matérialiser (pas juste les omettre) pour que la pré-alpha reflète la cible.

### 2.1. Matérialisations visibles

| Élément | Matérialisation | Comportement |
|---|---|---|
| Bouton *Exporter* | Présent dans tous les livrables | Affiche *"À venir dans la prochaine version"* ou copie presse-papiers |
| Types d'actifs non implémentés | Cartes grisées dans la base | Clic → fiche descriptive, pas d'action |
| *Plugin Word* | Mention dans la roadmap en bas du module | — |
| Interopérabilité modules | Non matérialisée (pas de bouton *Envoyer à Threads*) | — |
| Workflow multi-user | Non matérialisée | — |
| Branches de versions | Non matérialisée | Versioning linéaire seulement |

### 2.2. Pourquoi matérialiser

- Donne une **vue complète** du produit cible, pas une vue rabotée
- Permet à l'équipe produit de **discuter chaque fonctionnalité** avec un support visuel
- Crée un **cadre cohérent** pour les itérations futures
- Évite de re-découvrir à chaque itération des fonctionnalités oubliées

## 3. Roadmap produit — trajectoire envisagée

### 3.1. Jalon 1 — Démonstrateur (cette livraison — v2)

**Objectif** : applicatif standalone démontrable intégrant les nouvelles primitives v2.

**Contenu** :
- Tabular Review (primitive) + workflows OOTB (Clausier MSA/NDA, DDQ M&A, DDQ Real Estate, Conformité RGPD)
- Redline transverse (moteur mutualisé audit + comparaison + contract draft + multi-doc)
- Multi-document redline coordonné
- Création de contrat depuis template (Contract Draft)
- Chat structuré sur résultats Tabular Review (text-to-SQL)
- Capitalisation des décisions validées vers les playbooks (flux d'amendement existant)
- 7 livrables consultables et éditables
- 4 types d'actifs dans la base, mécanisme d'amendement matérialisé (single-user)
- Scénarios de référence couvrant les trois segments

**Durée cible** : Phases A→F selon l'ordre d'implémentation du README.

**Livraison** : repo Git avec front + back + données de démo.

### 3.2. Jalon 2 — Alpha intégrée

**Objectif** : intégrer le module au produit Sinequa réel et activer le multi-utilisateurs.

**Contenu** :
- Connexion à la corporate source (documents déjà indexés par l'indexation 1 réelle de Sinequa)
- Chrome Sinequa réelle (pas juste une imitation)
- Authentification Sinequa
- Droits d'accès hérités
- **Workflow d'amendement multi-utilisateurs réel** : owner / approuveur / contributeur distincts, file d'attente, notifications inter-utilisateurs
- **Audit log fin** sur les actions de gouvernance
- **Premiers connecteurs prioritaires** : pont workspace ↔ corporate source Sinequa, iManage ou SharePoint selon le segment commercial visé
- Persistance en base Sinequa réelle (Elasticsearch / DB relationnelle côté Sinequa)

**Durée estimée** : 2-3 mois d'équipe intégration.

**Livraison** : première version utilisable par des équipes pilotes chez des clients Sinequa.

### 3.2bis. Jalon 2b — Features GA différées

**Contenu non implémenté dans le démonstrateur, jalon GA** :
- **Workflows utilisateurs réutilisables** (création par l'utilisateur d'un workflow custom persistant)
- **Word Add-in natif** (Office.js) — redline en navigateur via CKEditor dans le démonstrateur
- **Couche structurée interrogeable câblée à Threads** — préparée (table SQL des cellules), non exposée à Threads

### 3.3. Jalon 3 — Beta avec premiers pilotes

**Objectif** : mise en situation réelle chez 2-3 clients Sinequa pilotes (cabinets, in-house, et idéalement un fonds PE).

**Contenu** :
- Robustesse sur volumes réels (100+ documents par analyse)
- Ontologie configurable par client
- Premiers types d'actifs supplémentaires (glossaires, red flags matrices)
- Export Word / PDF fonctionnel
- Workflow d'approbation à plusieurs niveaux (juriste → Legal Ops → GC)
- **Plugin Word natif** (via Office.js) — débloque l'usage continu
- **Connecteur VDR** (au moins un parmi Datasite / Intralinks / Ansarada) — débloque le segment PE
- **Indicateurs d'adoption des actifs** : taux d'usage des playbooks, taux de correction manuelle, taux d'abandon d'analyse (cf. `02-architecture-technique.md` §3.4.5)

**Durée estimée** : 3-4 mois.

**Livraison** : produit en utilisation pilote, feedbacks collectés pour itérations.

### 3.4. Jalon 4 — GA (general availability)

**Bibliothèque de précédents auto-alimentée** : extension du flux de capitalisation — chaque décision validée alimente automatiquement un actif de précédents, sans intervention manuelle. Voir §3.2bis pour les features GA différées depuis le démonstrateur.

**Objectif** : disponibilité générale, commercialisable.

**Contenu** :
- Scalabilité industrielle
- Toutes langues Sinequa
- Connecteurs externes complets (iManage, NetDocuments, SharePoint, HighQ, CLM)
- Plugin Outlook
- Module d'export complet
- Base contreparties
- Templates livrables personnalisables
- Co-édition multi-utilisateur
- Audit log complet
- Conformité AI Act

**Durée estimée** : 6-9 mois post-beta.

### 3.5. Au-delà — couche agentic

**Objectif** : interopérabilité des modules Sinequa via une couche agentic.

**Contenu** :
- Orchestration cross-modules (ex: *"Checklist des risques selon l'analyse juridique du contrat"*)
- Workflows automatiques déclenchés par événements (nouveau doc, échéance contractuelle)
- Veille réglementaire automatique avec re-audit impacté
- Agents spécialisés par domaine (agent audit, agent négociation, agent clausier)

Cette couche **dépasse largement le module Legal Extraction** et concerne l'ensemble de la suite AI Workplace.

## 4. Dépendances externes identifiées

### 4.1. Licences

- **CKEditor 5** : licence Sinequa existante (à vérifier : couvre-t-elle le plugin track-changes ?)
- **API LLM** : Anthropic Claude (à budgétiser selon volume d'usage attendu)

### 4.2. Composants existants Sinequa à intégrer

- **Chrome Sinequa** : sidebar, breadcrumb, patterns modules
- **Indexation 1** : moteur d'indexation existant (pour l'alpha)
- **Auth Sinequa**
- **Corporate source** : modèle d'accès aux documents indexés

### 4.3. Composants à développer ou acquérir

- **Module d'export** : pandoc côté back ou équivalent pour .docx / .pdf
- **Intégration plugin Word** : API Office.js
- **Connecteurs externes** : SDK iManage, SharePoint, etc.

## 5. Risques identifiés

### 5.1. Risques techniques

| Risque | Impact | Mitigation |
|---|---|---|
| Qualité extraction LLM insuffisante sur contrats complexes | Qualité perçue | Human-in-the-loop systématique, badges confiance |
| Hallucinations LLM dans les livrables | Confiance du juriste | Citations obligatoires, validation zod |
| Latence excessive sur gros docs | UX dégradée | Chunks, progression visible |
| Couverture ontologique lacunaire | Extractions incomplètes | Itération continue de l'ontologie |

### 5.2. Risques produit

| Risque | Impact | Mitigation |
|---|---|---|
| Rejet par les cabinets pour cause billable hours | Adoption marché | Positionnement ROI sur le temps senior, pas junior |
| Positionnement vs. concurrents spécialisés (Luminance, Kira, Della) | Différenciation | Miser sur l'intégration workspace Sinequa |
| Responsabilité juridique sur les conclusions | Déontologie | Human-in-the-loop, mentions "vérification requise" |

### 5.3. Risques de delivery

| Risque | Impact | Mitigation |
|---|---|---|
| Pré-alpha pas assez démonstrable | Décalage équipe produit | Itération CLAUDE.md, démo intermédiaires |
| Pré-alpha trop ambitieuse | Délais, qualité | Priorisation stricte (cf. CLAUDE.md) |
| Dérive du périmètre | Dilution | Ce document = garde-fou |

## 5bis. Différenciation concurrentielle

Analyse comparative conduite contre **Mike** (open-source, AGPL-3.0), **Harvey AI** et **Legora** :

| Eux | Nous |
|---|---|
| Citation regénérée par le LLM à chaque run, fragile | Citation ancrée à l'indexation Legal, stable, voyage avec la donnée dans toutes les vues |
| Bibliothèque de précédents en silo, dette d'organisation à terme | Capitalisation directe dans des playbooks nommés, gouvernés (owner/approver), via le flux d'amendement existant |
| Chat sur résultat = nouvelle passe LLM lente et coûteuse | Chat sur résultat = text-to-SQL sur données structurées, déterministe, rapide, économique |

Ces différences sont **structurelles** (pas des features isolées) : elles reposent sur l'architecture d'indexation et le modèle de données.

## 6. Ce que ce démonstrateur doit démontrer (rappel v2)

Ce sont les critères par rapport auxquels le démonstrateur sera jugé **réussi** :

1. **Le concept d'indexation 2** est visible, tangible, compréhensible
2. **Tabular Review** : tableau se remplit avec citations cliquables, colonnes ad hoc fonctionnelles, re-run granulaire opérationnel
3. **Chat text-to-SQL** : question NL → filtre sur le tableau + requête SQL consultable
4. **Flux de capitalisation** : acceptation d'un redline → toast → demande d'amendement créée
5. **Redline transverse** : audit, comparaison, contract draft et multi-doc redline consomment le même moteur
6. **Les 7 livrables** sont consultables et éditables
7. **La base de référence** est un actif vivant, pas un placeholder
8. **L'UX** s'inscrit naturellement dans Sinequa
9. **Aucune régression** sur les parcours v1 (audit, comparaison, clausier-via-workflow OOTB)

Si ces 6 éléments sont atteints, la pré-alpha aura rempli sa mission : devenir un artefact de discussion pour transformer une vision en roadmap produit.

## 7. Fin du kit Claude Code

Ce document clôt la série documentaire destinée à Claude Code. Les 10 documents (README + CLAUDE + 01 à 08) forment un kit cohérent et auto-suffisant pour construire la pré-alpha.

En cas de doute lors de l'implémentation, retour aux principes :
1. Cohérence avec Sinequa existant
2. Simplicité de démonstration
3. Clarté du code
4. Transparence et rattrapage pour l'utilisateur

Bonne construction.
