# 06 — Livrables

Les 7 livrables du module couvrent l'ensemble des sorties attendues par les juristes. Ce document détaille leur structure, leur rendu, leurs comportements.

## 1. Cartographie

| # | Livrable | Code | Format principal | Opération source |
|---|---|---|---|---|
| 1 | Note de revue | `review_note` | Document CKEditor | Confrontation (audit unitaire) |
| 2 | Note comparative | `comparative_note` | Document CKEditor | Alignement (comparaison) |
| 3 | **Redline** | `redline` | CKEditor avec tracked changes | Confrontation, alignement, contract draft, multi-doc |
| 4 | Note de synthèse DD | `dd_synthesis` | Document CKEditor | Confrontation (audit DD) |
| 5 | Tableau DD | `dd_table` | Grille interactive | Confrontation (audit DD) |
| 6 | Clausier | `clausier` | Vue spécialisée de Tabular Review | Workflow OOTB clausier |
| 7 | **Tabular Review** *(NOUVEAU — primitive)* | `tabular_review` | Grille N×M avec citations par cellule | Tabularisation (ad hoc ou workflow OOTB) |

**Note sur le Clausier** : le Clausier n'est plus un livrable distinct à part entière. Il devient une **sortie publiable d'une Tabular Review** lancée avec un workflow *Clausier MSA / NDA / etc.*. Le bouton *Publier dans la base* (qui transforme un clausier en actif de la base de référence) est conservé et s'applique à toute Tabular Review.

**Note sur le Redline** : le Redline est promu **entité de premier rang** (cf. `03-modele-de-donnees.md` §7.3). Il est produit et réutilisé par plusieurs opérations (audit, comparaison, contract draft, multi-doc redline).

Les deux livrables DD (`dd_synthesis` et `dd_table`) viennent typiquement en paire. Les autres sont indépendants.

## 2. Note de revue

### 2.1. Objet

Restituer une revue juridique complète d'un document unique (contrat entrant, NDA, politique), positionner chaque clause par rapport à un référentiel (playbook), donner les recommandations de négociation.

### 2.2. Structure

**1. Synthèse exécutive**
- Verdict global (🟢 acceptable / 🟠 à négocier / 🔴 à refuser)
- Top 3-5 points prioritaires (bullets)
- Position recommandée pour la négociation (1-2 paragraphes)

**2. Caractéristiques du contrat**
- Titre
- Parties
- Durée
- Montants / conditions financières
- Loi applicable
- Structure générale

**3. Analyse clause par clause**
Pour chaque clause examinée (ordre : priorité, puis nature) :
- Nom de la clause (type)
- Verdict : 🟢 / 🟠 / 🔴 / ⚪ (absent)
- Position playbook : ce qu'on voudrait
- Position contrat : ce qu'on a (citation)
- Écart : description
- Recommandation de négociation : concrète et actionnable

Chaque analyse est dans un bloc encadré (style card) dans CKEditor.

**4. Points transverses**
Observations qui ne se rattachent pas à une clause unique : ex. cohérence interne, renvois manquants, ambiguïtés.

**5. Annexe citations**
Liste numérotée de toutes les citations référencées dans le document, cliquables vers le passage source.

### 2.3. Prompt LLM de génération

Schéma (extrait) :
```
Tu rédiges une NOTE DE REVUE d'un contrat juridique pour un juriste d'entreprise 
ou un collaborateur de cabinet. Le ton : professionnel, précis, orienté action.

ENTRÉES :
- Objet juridique extrait du contrat : [JSON]
- Playbook de référence : [JSON]
- Résultats de la confrontation clause par clause : [JSON avec verdicts]

SORTIE : HTML structuré compatible CKEditor, avec la structure suivante :

<h1>Note de revue — {titre du contrat}</h1>
<p class="meta">{date} — {auteur}</p>

<h2>1. Synthèse exécutive</h2>
<p class="verdict verdict-{acceptable|to_negotiate|to_refuse}">Verdict : {label}</p>
<ul class="priorities">
  <li>...</li>
</ul>
<p class="position">Position recommandée : ...</p>

<h2>2. Caractéristiques du contrat</h2>
<dl>
  <dt>Parties</dt><dd>...</dd>
  ...
</dl>

<h2>3. Analyse clause par clause</h2>
<div class="clause-analysis verdict-{...}">
  <h3>{clause type}</h3>
  <p class="verdict-label">VERDICT : {label}</p>
  <div class="playbook-position">Playbook : {text}</div>
  <div class="contract-position">Contrat : {text} <cite data-citation-id="{id}">[1]</cite></div>
  <div class="gap">Écart : {text}</div>
  <div class="recommendation">Recommandation : {text}</div>
</div>
...

<h2>4. Points transverses</h2>
<ul>...</ul>

<h2>5. Annexe : citations</h2>
<ol class="citations">
  <li id="cit-1" data-citation-id="{id}">{extrait} — {doc}, p.{page}</li>
  ...
</ol>

CONTRAINTES :
- Chaque affirmation qui s'appuie sur le contrat DOIT être suivie d'une citation 
  avec data-citation-id.
- Jamais d'affirmation inventée. Si non sourcé, le dire explicitement.
- Ton : professionnel, direct, pas de jargon inutile.
- Longueur cible : 2-5 pages imprimées (1500-3500 mots).
```

### 2.4. Rendu CKEditor

**Plugins nécessaires** :
- Base CKEditor 5
- Table
- Link
- List
- BlockQuote
- CustomCSSClasses (pour les styles de verdict)

**CSS custom** :
```css
.clause-analysis {
  border-left: 4px solid var(--border-color);
  padding: 12px 16px;
  margin: 16px 0;
  background: var(--bg-subtle);
  border-radius: 4px;
}
.clause-analysis.verdict-to_negotiate { border-left-color: #F59E0B; }
.clause-analysis.verdict-red_flag { border-left-color: #EF4444; }
.clause-analysis.verdict-ok { border-left-color: #10B981; }

cite[data-citation-id] {
  background: #EEF2FF;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  color: #6366F1;
  font-style: normal;
  font-size: 0.85em;
}
cite[data-citation-id]:hover { background: #E0E7FF; }
```

### 2.5. Interactions

- Clic sur un chip de citation → ouvre le citation panel
- Édition libre du texte via CKEditor (préservée entre versions)
- Bouton *Régénérer depuis le playbook* en en-tête (crée nouvelle version basée sur playbook actuel)

## 3. Note comparative

### 3.1. Objet

Restituer la comparaison de deux documents, typiquement un document cible et un document de référence (standard maison, autre version, précédent).

### 3.2. Structure

**1. Synthèse**
- Niveau global d'écart (🟢 minimal / 🟠 modéré / 🟠 significatif / 🔴 majeur)
- Top écarts (bullets)
- Recommandation de négociation (1-2 paragraphes)

**2. Tableau comparatif clause par clause**

Tableau CKEditor avec colonnes fixes :

| Type de clause | Document A | Document B | Écart | Commentaire |
|---|---|---|---|---|

Chaque ligne = un type de clause. Les cellules *Document A* et *Document B* contiennent le résumé de la clause + citation. La colonne *Écart* affiche :
- 🟢 Équivalent
- 🔵 Éditorial (formulation différente, fond identique)
- 🟠 Substantiel (fond différent, impact modéré)
- 🔴 Défavorable (fond différent, impact défavorable au camp cible)

**3. Clauses d'un seul côté**
Deux sous-sections :
- *Présentes uniquement dans A* (document cible)
- *Présentes uniquement dans B* (document de référence)

Chaque clause listée avec son type + extrait + citation.

**4. Recommandations point par point**
Liste ordonnée par priorité des actions à mener (garder, négocier, ajouter, retirer).

**5. Annexe citations**

### 3.3. Prompt LLM

Similaire à la note de revue mais adapté à la comparaison. Le prompt reçoit les deux objets juridiques et le résultat de l'alignement clause à clause.

```
Tu rédiges une NOTE COMPARATIVE entre deux documents juridiques.

ENTRÉES :
- Objet juridique A (cible) : [JSON]
- Objet juridique B (référence) : [JSON]
- Alignement clause à clause : [JSON avec pairs et verdicts]

SORTIE : HTML CKEditor structuré (cf. sections 1 à 5 ci-dessus).

TABLEAU : utilise <table class="comparative-table"> avec <thead> et <tbody>.
Les cellules contiennent du HTML simple (texte + <cite>).

CONTRAINTES :
- Chaque ligne du tableau DOIT correspondre à un type de clause présent dans 
  au moins un des deux documents.
- Si une clause est absente d'un côté, mettre "— Absente —" dans la cellule.
- Les verdicts d'écart utilisent les 4 niveaux définis.
- Chaque affirmation comparative est sourcée des deux côtés.
```

### 3.4. Rendu spécifique

Le tableau comparatif est **scrollable horizontalement** si la largeur dépasse l'espace disponible.

CSS pour les cellules de verdict :
```css
td.gap-equivalent { background: #ECFDF5; color: #065F46; }
td.gap-editorial { background: #EFF6FF; color: #1E40AF; }
td.gap-substantive { background: #FFFBEB; color: #92400E; }
td.gap-unfavorable { background: #FEF2F2; color: #991B1B; }
```

## 4. Note de synthèse DD

### 4.1. Objet

Restituer les conclusions d'une due diligence sur un corpus de N contrats (typiquement M&A, refinancement, JV). Complémentaire du tableau DD.

### 4.2. Structure

**1. Périmètre**
- Nombre de contrats analysés
- Typologie (contrats commerciaux, employment, leases...)
- Grille DD utilisée
- Période couverte

**2. Principaux risques identifiés**
Pour chaque risque majeur :
- Nature du risque
- Contrats affectés (liste, N affectés)
- Impact potentiel (financier / opérationnel / juridique)

**3. Sections thématiques**
Une section par thème transverse de la DD :
- Change of control
- Exclusivités
- Pénalités
- Durées / résiliations
- Propriété intellectuelle
- Données personnelles
- Litiges
- (selon grille)

Dans chaque section : constats + contrats concernés.

**4. Recommandations**
Actions à mener :
- Points à inclure en conditions suspensives
- Renégociations préalables à closing
- Provisions à constituer
- Points à intégrer en garantie de passif

**5. Renvoi au tableau DD**
Lien vers le livrable `dd_table` associé pour le détail ligne par ligne.

### 4.3. Prompt LLM

```
Tu rédiges une NOTE DE SYNTHÈSE DE DUE DILIGENCE à destination d'un associé 
de cabinet (ou du directeur juridique côté in-house) dans le contexte d'une 
opération M&A / refinancement / JV.

ENTRÉES :
- Périmètre de la DD : [contexte opération]
- Grille DD utilisée : [JSON]
- Résultats DD sur l'ensemble du corpus : [JSON : par contrat, par question, 
  avec niveau de risque]

SORTIE : HTML structuré CKEditor selon la structure en 5 sections.

CONTRAINTES :
- Ton : haute direction juridique, synthétique, priorisé
- Les risques sont rangés par ordre de priorité (impact potentiel)
- Chaque constat fait référence aux contrats concernés avec leur ID
- Longueur : 3-8 pages selon taille du corpus
```

## 5. Tableau DD

### 5.1. Objet

La vision complète et structurée de la DD : N contrats en lignes × questions en colonnes.

### 5.2. Structure

**Métadonnées** :
- Périmètre DD
- Grille utilisée
- Date de génération

**Colonnes** : issues de la grille DD
- Col 1 : ID / nom contrat
- Col 2 : type de contrat (auto)
- Cols 3+ : une par question de la grille

**Lignes** : une par contrat

**Cellules** :
- Valeur : synthèse de la réponse (ex : "CoC < 50% avec changement d'actionnariat")
- Niveau de risque : 🟢 / 🟠 / 🔴 / ⚪ (NA)
- Citation (au clic)
- Confiance
- Annotation utilisateur (si ajoutée)

**Footer** :
- Compteurs par niveau de risque
- Répartition par colonne (mini-bar chart optionnel)

### 5.3. Composant (rappel)

Pas de CKEditor. Grille interactive virtualisée. Voir [05-specifications-fonctionnelles.md §4.5](./05-specifications-fonctionnelles.md).

### 5.4. Interactions

- **Clic cellule** : drawer avec détail (valeur longue + citation + confiance + annotation éditable)
- **Clic en-tête colonne** : tri / filtres
- **Recherche globale** : filtre les lignes dont une cellule contient le terme
- **Filtrage par risque** : afficher uniquement les 🔴, etc.
- **Sélection multiple** : annoter plusieurs contrats en une fois
- **Export CSV** : bouton (non fonctionnel en pré-alpha)

### 5.5. Format de persistance

```typescript
interface DdTableContent {
  type: 'dd_table';
  gridId: string;
  columns: DdTableColumn[];
  rows: DdTableRow[];
  summary: DdTableSummary;
}
```

Pas de HTML : structure pure JSON. Le rendu est géré côté frontend par le composant dédié.

## 6. Redline

### 6.1. Objet

Le document cible redliné : modifications suggérées, commentaires explicatifs, source de la proposition.

### 6.2. Structure

**En-tête** :
- Nom du document cible
- Référence sur laquelle le redline s'appuie (playbook ou standard)
- N de suggestions
- Compteurs (pending / accepted / rejected)
- Boutons *Accepter tout* / *Rejeter tout*

**Corps** :
Le document cible, intégral, avec modifications intégrées :
- Insertions : souligné vert
- Suppressions : barré rouge
- Remplacements : suppression puis insertion

**Panneau commentaires** (latéral droit) :
Liste des commentaires en marge :
- Auteur (AI / User)
- Date
- Texte du commentaire
- Référence vers le passage ciblé
- Actions de modification (si auteur AI)

### 6.3. Génération

Le prompt de redline doit :
1. Partir du texte original du doc cible
2. Identifier les passages à modifier
3. Pour chaque passage : proposer la nouvelle formulation + commentaire explicatif

**Format de sortie** : JSON avec structure `RedlineContent`

Le backend convertit ensuite le JSON en HTML avec track-changes via un service dédié (ou utilise directement le plugin track-changes de CKEditor si disponible).

### 6.4. Plugin CKEditor track-changes

**Option A — plugin premium** : si la licence Sinequa permet, utiliser le plugin officiel.

**Option B — simulation** : rendu custom :
```html
<p>
  Le contrat est conclu pour une durée de 
  <span class="del" data-change-id="c1">cinq (5)</span>
  <span class="ins" data-change-id="c1">trois (3)</span>
  ans à compter...
</p>
```

Avec JS pour gérer accept/reject :
```javascript
function acceptChange(changeId) {
  // supprime le span .del, retire la classe du span .ins
}
function rejectChange(changeId) {
  // supprime le span .ins, retire la classe du span .del
}
```

Les commentaires sont positionnés via un composant overlay qui lit les coordonnées des passages marqués.

### 6.5. Comportement

**Acceptation d'une modification** :
1. Application visuelle immédiate (texte final)
2. Mise à jour du statut dans le backend (`status: 'accepted'`)
3. Recalcul des compteurs
4. Journal d'actions utilisateur

**Rejet** : similaire, statut `rejected`.

**Modification avant acceptation** :
1. Clic *Modifier* sur une suggestion
2. Édition du texte proposé dans un modal ou inline
3. Validation → suggestion mise à jour (texte modifié, statut reste pending)

## 7. Clausier

### 7.1. Objet

Bibliothèque organisée de clauses-types issues d'un corpus de contrats. Destiné à être consommé pour rédiger de nouveaux contrats, servir de guide de cohérence, ou à être versé dans la base de référence.

### 7.2. Structure

**Page de garde** :
- Titre
- Description
- Date de création
- Corpus source (N contrats, typologie, période)
- Ontologie utilisée
- Langue
- Stats générales (nombre de clauses, nombre de types, nombre de variantes)

**Table des matières** :
Auto-générée depuis les sections (par type de clause).

**Sections (une par type de clause)** :

Pour chaque type :
- Titre (ex : *Limitation de responsabilité*)
- Définition / enjeux : description du rôle de cette clause
- **Variantes** : plusieurs formulations rencontrées dans le corpus

**Variantes** :
Pour chaque variante :
- Label distinctif (ex : *"Cap au prix annuel avec exclusions IP/RGPD"*)
- Fréquence : N occurrences (sur M contrats), typiquement avec % 
- Contexte : quand cette variante est utilisée (ex : *"Deals > 5M€, secteur industrie"*)
- Texte représentatif : la formulation (dans un bloc encadré)
- Sources : citations vers les contrats d'origine
- Commentaire : éventuelles recommandations

**Annexe** :
- Liste des contrats sources analysés

### 7.3. Prompt LLM de génération

La génération est complexe : elle combine **clustering** (regrouper les clauses similaires) + **rédaction** (produire la structure finale).

```
Tu construis un CLAUSIER à partir d'un corpus de clauses extraites de plusieurs 
contrats.

ENTRÉES :
- Pour chaque type de clause : liste des occurrences avec texte + contexte contrat
- Ontologie : [JSON types]

PROCESSUS :
1. Pour chaque type, regroupe les occurrences en VARIANTES distinctes selon la 
   logique métier (pas seulement la forme).
2. Pour chaque variante, identifie :
   - Un label distinctif
   - La fréquence
   - Le contexte d'usage
   - Un texte représentatif (choisir la formulation la plus claire)
   - Éventuelles observations / recommandations

SORTIE : JSON avec structure ClausierContent (voir schéma).

CONTRAINTES :
- Ne pas créer plus de 5 variantes par type (sauf exceptions).
- Le texte représentatif est une occurrence réelle du corpus (copiée, avec 
  citation), PAS une synthèse artificielle.
- La description / enjeux de chaque type vient de l'ontologie.
```

### 7.4. Rendu CKEditor

Après génération JSON, conversion en HTML :
- Page de garde en header
- TOC avec ancres
- Sections avec blocs variants

CSS :
```css
.clausier-variant {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 16px;
  margin: 16px 0;
  background: white;
}
.clausier-variant-label {
  font-weight: 600;
  color: var(--primary);
}
.clausier-variant-frequency {
  font-size: 0.85em;
  color: var(--muted);
}
.clausier-variant-text {
  background: var(--bg-subtle);
  border-left: 3px solid var(--primary);
  padding: 12px;
  margin: 12px 0;
  font-family: Georgia, serif;  /* Style "texte contractuel" */
}
```

### 7.5. Publication dans la base

Bouton *Publier dans la base de référence* en en-tête du livrable.

**Dialog** :
- Nom de l'actif dans la base (pré-rempli avec le nom du clausier)
- Description éditable
- Juridiction
- Langue
- Tags (optionnel)
- Boutons *Publier* / *Annuler*

**À la publication** :
1. Création d'un `ReferenceAsset` de type `clausier`
2. Copie du contenu du livrable
3. Lien `publishedFrom` vers le livrable
4. Badge *"Publié dans la base"* apparaît sur le livrable
5. Toast de confirmation avec lien vers l'actif créé

## 8. Tabular Review *(NOUVEAU — livrable #7 et primitive)*

### 8.1. Objet

La Tabular Review est une **vue tabulaire éditable** sur N documents extraits × M colonnes définies ad hoc ou via un workflow OOTB. Chaque cellule porte une valeur + une citation ancrée à l'indexation Legal + un niveau de confiance.

C'est **la primitive centrale** de la v2 : les workflows Clausier, DDQ, et Conformité sont tous des Tabular Reviews préconfigurées.

### 8.2. Structure

**En-tête** :
- Nom de la Tabular Review
- Sélecteur de workflow (Clausier MSA / NDA, DDQ M&A, DDQ Real Estate, Conformité RGPD, Personnalisé)
- Compteur de documents et de colonnes
- Boutons : *+ Colonne*, *↻ Run*, *⬇ Excel* (matérialisé), *Publier dans la base*

**Grille principale** :
- Colonne fixe *Document* (nom + type)
- Colonnes dynamiques (une par `TabularColumn`)
- Chaque cellule : valeur affichée + chip ⓒ (citation cliquable) ou badge ⚠ (incertitude/absent)

**Panneau chat text-to-SQL** (latéral droit, toggle) :
- Question en langage naturel
- Résultat + bouton *Filtrer le tableau*
- Requête SQL générée visible (*Voir requête SQL*)

### 8.3. Comportements clés

**Génération des cellules** : chaque cellule est renseignée par un appel LLM ciblé (question de la colonne × document du row). Le LLM retourne `value + rawValue + citation + confidence`.

**Re-run granulaire** :
- Clic droit sur en-tête colonne → *Relancer cette colonne* (toutes les cellules de la colonne)
- Clic droit sur une cellule → *Relancer cette cellule*
- Bouton *↻ Run* global → relance uniquement les cellules vides ou incertaines

**Cellule absente** : badge `—` avec tooltip *"Information non trouvée dans le document"*.

**Cellule incertaine** : badge ⚠ avec citation pointant vers le passage le plus probable + bouton de re-run.

**Cellule éditée manuellement** : badge bleu *Modifié* — la valeur manuelle n'est pas écrasée par un re-run automatique sauf demande explicite.

### 8.4. Publication comme actif de la base

Le bouton *Publier dans la base* crée un actif `clausier` dans la base de référence à partir du contenu de la Tabular Review. La structure et les citations voyagent avec l'actif.

### 8.5. Priorité d'implémentation

Tabular Review est **Phase B** dans l'ordre d'implémentation v2 (cf. README.md §Ordre d'implémentation).

## 9. Gestion transverse des livrables

### 8.1. Versioning uniforme

Tous les livrables suivent le même modèle :
- Chaque livrable a un `currentVersion` et un array `versions`
- Création livrable → version 1
- Modification via conversation → nouvelle version automatique
- Édition CKEditor manuelle → pas de nouvelle version (modifications en live)
- *Figer version* → snapshot du content courant devient nouvelle version

### 8.2. Export (matérialisé mais non fonctionnel)

Bouton *Exporter* dans chaque livrable, avec dropdown :
- *En Word (.docx)* — affiche "À venir dans la prochaine version"
- *En PDF* — idem
- *Copier vers presse-papiers* — **peut être fonctionnel** (copie HTML → texte riche)
- *Lien de partage* — "À venir"

L'export fonctionnel viendra dans une itération ultérieure avec module d'export dédié (typiquement pandoc côté backend pour Word/PDF).

### 8.3. Archive / suppression

- *Archiver* : le livrable disparaît de la bande d'onglets mais reste en base
- *Désarchiver* : depuis un écran de liste des livrables archivés (accessible via menu de l'analyse)
- *Supprimer définitivement* : suppression en base avec confirmation

### 8.4. Duplication

Bouton *Dupliquer* dans le menu d'actions :
- Crée un nouveau livrable avec le contenu courant
- Nom par défaut : *"[Nom original] — copie"*
- Version 1

Utile pour travailler sur une variation sans toucher à l'original.

## 9. Cohérence visuelle entre livrables

Tous les livrables CKEditor partagent :
- Typographie
- Styles d'en-têtes (H1, H2, H3)
- Style des citations (chip inline cliquable)
- Style des badges de verdict (couleurs et iconographie)
- Espacement et marges

Un **styleguide CKEditor unifié** est défini dans un CSS partagé, importé par tous les composants de livrable.

## 11. Récapitulatif

| # | Livrable | Format | CKEditor | Complexité impl. |
|---|---|---|---|---|
| 1 | Note de revue | HTML structuré | Oui | Moyenne |
| 2 | Note comparative | HTML + table | Oui | Moyenne |
| 3 | Redline | CKEditor tracked changes | Oui (intégration complète) | Élevée |
| 4 | Note synthèse DD | HTML structuré | Oui | Moyenne |
| 5 | Tableau DD | JSON → grille | Non (composant custom) | Élevée |
| 6 | Clausier | Vue de TabularReview | Non (grille) | Faible (workflow OOTB) |
| 7 | **Tabular Review** | Grille N×M + chat SQL | Non (composant custom) | Élevée |

**Priorité d'implémentation v2** :
1. Redline transverse (moteur mutualisé) — Phase A
2. Tabular Review + workflows OOTB — Phase B
3. Chat text-to-SQL — Phase C
4. Contract Draft + Multi-doc Redline — Phase D
5. Capitalisation — Phase E

Suite : [07-cas-limites.md](./07-cas-limites.md) pour la gestion des edge cases.
