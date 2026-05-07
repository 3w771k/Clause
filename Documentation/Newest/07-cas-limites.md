# 07 — Cas limites et gestion d'erreurs

Ce document recense les cas limites, erreurs, et comportements dégradés que le module doit gérer. Les principes directeurs : **transparence** (jamais masquer un problème), **rattrapage permanent** (toujours un chemin de correction pour l'utilisateur), **dégradation gracieuse** (partiel vaut mieux que rien).

## 1. Principes généraux

### 1.1. Transparence

Le module ne cache jamais un problème à l'utilisateur. Toute incertitude, tout échec partiel, toute approximation est **signalée visuellement** — typiquement via badges de confiance, bannières d'état, messages d'erreur explicites.

Jamais d'affirmation présentée comme certaine quand elle ne l'est pas. Jamais de livrable généré "en silence" à partir d'une extraction ratée.

### 1.2. Rattrapage permanent

Pour chaque point d'incertitude ou d'erreur, l'utilisateur dispose **d'un chemin de correction** :
- Clause mal extraite → mode édition
- Extraction échouée → bouton *Réessayer*
- Livrable décalé → demande de régénération via conversation
- Verdict à faible confiance → édition directe du verdict

Jamais de cul-de-sac.

### 1.3. Dégradation gracieuse

Si une opération ne peut être complétée à 100%, produire la meilleure version partielle possible et signaler clairement ce qui manque.

Exemple : sur un document de 50 clauses, si 5 échouent à l'extraction → livrable produit sur 45 clauses avec bannière *"5 clauses n'ont pas pu être extraites. Voir les détails."*

## 2. Cas limites d'indexation 2

| **Cadre de référence** Cette section décrit le **comportement UX** lorsqu'un document concerné par les limites d'extraction arrive dans le module. Pour le cadre de positionnement (ce qui marche / moyennement / pas par famille de document), voir `02-architecture-technique.md` §3.4. |
| --- |

### 2.1. Document non juridique ou hors domaine

**Cas** : user dépose un document qui n'est pas juridique (facture, note interne, présentation). Le classifier LLM retourne `AUTRE` avec haute confiance, ou un type mais avec très faible confiance.

**Comportement** :
- L'extraction s'arrête à l'étape 1 (classification)
- Status passé à `failed` avec message *"Ce document ne semble pas être un document juridique standard (contrat, politique, memo). Voulez-vous forcer l'extraction ?"*
- Bouton *Forcer l'extraction* : lance le pipeline malgré tout, avec warning clair sur les résultats
- Bouton *Non merci* : retour à l'état précédent

### 2.2. Document très court ou vide

**Cas** : document sans contenu extractible (PDF image sans OCR, fichier vide, fichier corrompu).

**Comportement** :
- Détection à l'indexation 1 : si `extractedText.length < 500 caractères`, marquer le document comme *"Texte limité extrait"*
- À la demande d'indexation 2 : message d'alerte *"Ce document contient très peu de texte. L'extraction pourrait ne pas être fiable. Continuer ?"*
- Si l'utilisateur continue : extraction lancée avec mention du manque dans le résultat

### 2.3. Document très long (>100 pages)

**Cas** : document qui dépasse la taille du contexte LLM en une seule passe.

**Comportement** :
- Pipeline en chunks :
  - Classification globale sur un résumé du doc (premières/dernières pages + TOC si dispo)
  - Extraction des clauses par chunks de 30-40 pages, fusion des résultats
  - Extraction des attributs en parallèle par clause
- Barre de progression détaillée : *"Extraction chunk 3/5..."*
- Temps d'extraction potentiellement long : message proactif *"L'extraction de ce document peut prendre plusieurs minutes."*

### 2.4. Langue non supportée

**Cas** : document en langue autre que FR/EN (ex: allemand, espagnol).

**Comportement** :
- Détection de langue à l'indexation 1
- Si langue non FR/EN : bannière en-tête du document *"Document en [langue]. L'extraction légale est disponible uniquement en français et anglais en pré-alpha."*
- Bouton *Forcer en anglais* : tente l'extraction en traitant le doc comme anglais (effort best-effort, averti)

### 2.5. Document manuscrit / dégradé / scanné mal

**Cas** : OCR donne un texte peu lisible.

**Comportement** :
- Détection heuristique : taux de caractères non ASCII élevé, motifs OCR foireux
- Badge *"Qualité OCR faible"* sur le document
- Extraction lancée malgré tout avec warning
- Chaque clause extraite aura naturellement une confiance plus basse → badges ⚠ omniprésents

### 2.6. Échec API LLM

**Cas** : timeout, rate limit, erreur réseau, clé API invalide.

**Comportement** :
- Status `failed` avec message d'erreur technique utile
- Bouton *Réessayer*
- En cas de rate limit : retry auto avec backoff (3 tentatives)
- Si échec persistant : message clair avec lien vers la page de support

### 2.7. Extraction partielle (certaines clauses ratent)

**Cas** : sur un document de N clauses, K extractions d'attributs échouent.

**Comportement** :
- Le LegalObject est créé avec les K clauses extraites avec succès
- Les clauses ratées sont stockées en état `extractionFailed: true` avec le texte brut
- Dans la UI : badge *"Non analysée"*, bouton *Relancer sur cette clause*
- Possibilité pour l'utilisateur de compléter manuellement

## 3. Cas limites d'opérations métier

### 3.1. Confrontation (audit) : référentiel mal adapté

**Cas** : user lance un audit avec un playbook qui ne correspond pas au type de document (ex : playbook commercial sur un NDA).

**Détection** : mismatch entre `applicableDocumentTypes` du playbook et le `documentType` du document cible.

**Comportement** :
- Warning avant lancement : *"Ce playbook est destiné aux contrats commerciaux. Vous auditez un NDA. Les résultats pourraient être peu pertinents. Continuer ?"*
- Si user continue : audit lancé, certaines clauses du playbook sont *absentes* dans le NDA → nombreux verdicts ⚪ (absent)
- Bannière dans la note de revue : *"Ce playbook couvre N types de clauses. M types ne sont pas pertinents pour ce document."*

### 3.2. Confrontation : clauses manquantes des deux côtés

**Cas** : une clause est dans le playbook mais absente du document, ou inversement.

**Comportement** :
- Absente du document : verdict ⚪ dans la note de revue, recommandation *"Ajouter une clause de [type]"*
- Absente du playbook : mentionnée dans la section *"Points transverses non couverts par le playbook"*

### 3.3. Alignement (comparaison) : documents très différents

**Cas** : user compare deux docs très différents (ex : un NDA à un contrat de prestation), le matching clause à clause donne peu de paires.

**Comportement** :
- Note comparative produite mais bannière *"Peu de clauses communes identifiées (3 sur 24). La comparaison pourrait ne pas être pertinente."*
- La section *Clauses d'un seul côté* est beaucoup plus fournie que d'habitude
- Suggérer en fin de note : *"Voulez-vous plutôt lancer une analyse distincte sur chaque document ?"*

### 3.4. Agrégation (clausier) : corpus trop petit

**Cas** : user demande un clausier à partir de 1-2 contrats.

**Comportement** :
- Warning : *"Un clausier nécessite généralement au moins 5-10 contrats pour être représentatif. Vous en avez 2. Continuer ?"*
- Si continue : clausier produit mais avec peu de variantes par type (souvent une seule)

### 3.5. Agrégation : corpus hétérogène

**Cas** : user demande un clausier à partir de types de documents très différents (mix NDA + contrats + politiques).

**Comportement** :
- Détection du mélange
- Warning : *"Votre corpus contient plusieurs types de documents (N NDA, M contrats, K politiques). Souhaitez-vous les traiter ensemble ou constituer un clausier par type ?"*
- Options : *Un clausier global / Un clausier par type / Filtrer le corpus*

### 3.6. Génération de livrable qui ne respecte pas le schéma

**Cas** : le LLM retourne un livrable mal formé (HTML invalide, JSON cassé pour tableau DD).

**Comportement** :
- Validation zod stricte en sortie
- Si invalide : retry avec prompt corrigé (*"Le format précédent n'était pas valide, respecte strictement le schéma suivant..."*)
- Si 3 échecs consécutifs : échec de la génération, message à l'utilisateur *"La génération a échoué. Réessayer / Contacter le support."*

## 4. Cas limites conversationnels

### 4.1. Demande trop vague

**Cas** : user écrit *"Analyse ces documents"* sans plus de précision.

**Comportement** : NLU retourne `operation: 'unclear'` avec `clarificationNeeded: "Que souhaitez-vous faire ? Auditer contre un référentiel, comparer entre eux, extraire un clausier ?"`.

L'assistant répond avec les 3 options en chips cliquables.

### 4.2. Demande hors périmètre

**Cas** : user demande une action qui n'est pas dans le scope (ex: *"Rédige-moi un NDA depuis zéro"*).

**Comportement** :
- NLU classe en `operation: 'query'` avec intention inconnue
- Assistant répond : *"Le module Legal Extraction analyse des documents existants. Pour rédiger un document depuis zéro, utilisez plutôt le module Canvas. Je peux toutefois vous aider à extraire des clauses types à partir de vos précédents, ou comparer un brouillon à votre standard si vous le déposez."*

### 4.3. Demande ambiguë sur les documents

**Cas** : user écrit *"Compare ce contrat au standard"* alors qu'il y a 3 contrats dans l'analyse et 2 standards dans la base.

**Comportement** : clarification avec options cliquables :
> *"Quel contrat comparer à quel standard ?"*
> *"Contrat : [liste des 3]"*
> *"Standard : [liste des 2]"*

### 4.4. Demande hors séquence

**Cas** : user demande une confrontation alors qu'aucun document n'est extrait dans l'analyse.

**Comportement** : assistant répond : *"Il n'y a pas encore de document extrait dans cette analyse. Ajoutez d'abord un document depuis le workspace avec l'action Extract legal clauses."*

Bouton cliquable *"Aller au workspace"*.

### 4.5. Conversation qui dérive

**Cas** : user discute de sujets non juridiques (météo, humour, off-topic).

**Comportement** :
- L'assistant répond brièvement mais rappelle le contexte : *"Bien volontiers, mais je suis spécialisé dans l'analyse juridique. Avez-vous une question sur vos documents ?"*
- Pas de blocage dur, juste une redirection amicale

## 5. Cas limites de l'UI

### 5.1. Analyse très volumineuse

**Cas** : une analyse avec 100+ documents, 50+ livrables, 1000+ messages.

**Comportement** :
- Virtualisation de la liste des messages dans la conversation
- Virtualisation du tableau DD si >20 lignes
- Lazy loading des onglets (contenu chargé à l'activation de l'onglet)
- Pas de limite imposée, dégradation de performance progressive

### 5.2. Perte de connexion

**Cas** : l'utilisateur perd sa connexion pendant une opération.

**Comportement** :
- Bannière globale *"Connexion interrompue"* avec indicateur de reconnexion
- Les opérations en cours sont marquées `pending` côté backend et restent visibles dès reconnexion
- Message user non envoyé est conservé dans le champ (pas effacé)

### 5.3. Session expirée

**Cas** : l'utilisateur est déconnecté par le backend (session timeout). **Pas applicable en pré-alpha** (auth simulée) — mais à prévoir pour la suite.

### 5.4. Modification concurrente d'un livrable

**Cas** : l'utilisateur édite un livrable dans CKEditor, pendant qu'une régénération par conversation arrive (N+1).

**Comportement** :
- Si CKEditor a des modifications non sauvegardées : dialog *"Votre livrable a été modifié en arrière-plan. Sauvegarder vos changements comme nouvelle version avant de charger la mise à jour ?"*
- Options : *Sauvegarder mes changements* / *Ignorer mes changements* / *Annuler la mise à jour*

### 5.5. Navigation pendant une opération longue

**Cas** : user lance une génération de livrable et navigue ailleurs dans le module.

**Comportement** :
- Opération continue en arrière-plan
- Indicateur discret (spinner) dans l'onglet de l'analyse dans la sidebar
- Toast à la fin : *"Note comparative prête. Ouvrir ?"*
- Si l'utilisateur revient dans l'analyse : le livrable est déjà là

## 6. Cas limites de la base de référence

### 6.1. Import d'un actif mal structuré

**Cas** : user dépose un Word pour un playbook, mais le fichier ne suit pas une structure claire.

**Comportement** :
- Indexation 2 lancée malgré tout
- Résultat peu structuré : peut-être 1 seule section contenant tout
- Écran de prévisualisation : warning *"La structure automatique n'a pas pu être identifiée. Vous pouvez éditer manuellement avant validation."*
- L'utilisateur peut alors structurer manuellement dans l'éditeur

### 6.2. Conflit de nom

**Cas** : user tente de créer un actif avec un nom déjà pris.

**Comportement** :
- Validation côté UI : pas de deux actifs du même type avec le même nom dans le même workspace
- Message : *"Un playbook nommé '[nom]' existe déjà. Utilisez un autre nom ou modifiez l'existant."*

### 6.3. Archive d'un actif utilisé

**Cas** : user archive un playbook, alors qu'une analyse l'utilise actuellement.

**Comportement** :
- Archivage autorisé mais warning : *"Ce playbook est utilisé dans [N] analyses récentes. Les analyses conservent leur résultat mais ne pourront plus le régénérer avec cet actif."*
- Les analyses concernées voient le playbook marqué *"Archivé"* dans leurs métadonnées de livrable

### 6.4. Suppression d'un actif utilisé

**Cas** : user tente de supprimer définitivement un actif utilisé.

**Comportement** :
- Interdiction par défaut : *"Impossible de supprimer. Cet actif est utilisé dans [N] livrables. Archivez-le plutôt."*
- Option *Forcer la suppression* avec confirmation : les livrables conservent leur contenu mais perdent leur lien vers l'actif

## 7. Cas limites de citations

### 7.1. Citation pointant vers un passage inexistant

**Cas** : une citation dans un livrable référence un passage qui n'existe plus (document supprimé, ré-indexé).

**Comportement** :
- Chip citation affiché avec état dégradé (couleur grisée)
- Au clic : message *"Le passage source n'est plus disponible (document modifié ou supprimé)."*
- Bouton *Voir la dernière version stockée* si le texte extrait est encore en base

### 7.2. Document source supprimé

**Cas** : user supprime un document qui était référencé dans des livrables.

**Comportement** :
- Warning à la suppression : *"Ce document est référencé dans [N] livrables. Supprimer quand même ?"*
- Si confirmé : document supprimé, citations dans les livrables marquées *"Source supprimée"*
- Le texte de la citation (déjà copié au moment de la génération) reste visible dans le livrable

### 7.3. Citation multi-passages

**Cas** : une citation couvre plusieurs passages non contigus.

**Comportement** :
- Le citation panel affiche chaque passage avec son emplacement (page, paragraphe)
- Navigation entre les passages via boutons *Précédent / Suivant*

## 8. Cas limites du versioning

### 8.1. Bande passante de versions

**Cas** : un livrable a 50+ versions (beaucoup d'itérations).

**Comportement** :
- Dropdown de versions limité aux 10 plus récentes par défaut
- Bouton *Voir l'historique complet* en bas du dropdown → ouvre un modal avec l'historique complet
- Stockage : les versions anciennes peuvent être compactées (textes seuls sans HTML formaté) si besoin d'optimisation (pas obligatoire pré-alpha)

### 8.2. Version corrompue

**Cas** : une version est détectée comme malformée (parsing HTML impossible, JSON cassé).

**Comportement** :
- La version est affichée en read-only avec bannière *"Cette version semble corrompue."*
- Bouton *Voir le contenu brut* pour récupérer du texte
- Impossibilité de *Restaurer* cette version
- Les versions ultérieures restent utilisables

## 9. Messages d'erreur : règles de formulation

### 9.1. Structure type

Tous les messages d'erreur suivent :
1. **Ce qui s'est passé** (factuel, neutre)
2. **Pourquoi** (si pertinent, brièvement)
3. **Ce que l'utilisateur peut faire** (action concrète)

**Exemple bon** :
> *"L'extraction légale a échoué. La taille du document (124 pages) dépasse la limite de traitement actuelle. Vous pouvez découper le document et réessayer, ou contacter le support."*

**Exemple mauvais** :
> *"Erreur 500 — internal server error"*

### 9.2. Ton

- Professionnel et neutre
- Jamais culpabilisant envers l'utilisateur
- Jamais technique (sauf option *Détails techniques*)
- Jamais humoristique ou ironique

### 9.3. Actions recouvrables

Chaque erreur propose au moins une action :
- *Réessayer*
- *Annuler*
- *Contacter le support*
- *Voir les détails techniques*

## 10. Logging et observabilité (pré-alpha simplifié)

En pré-alpha, pas de système de logs avancé. Minimum :

- **Console backend** : log des erreurs API LLM, des timeouts, des exceptions
- **Console frontend** : log des erreurs de parsing, des échecs d'appels API
- **Fichier plat** : `server/logs/errors.log` cumulatif en cas de besoin
- Pas de monitoring type Sentry / Datadog (viendra plus tard)

Pour l'équipe produit qui prendra la pré-alpha en main : la console suffit pour debug.

## 11. Cas limites v2 — Tabular Review, Multi-doc Redline, Capitalisation

### 11.1. Cellule incertaine en Tabular Review

**Cas** : le LLM ne parvient pas à extraire avec confiance la valeur demandée.

**Comportement** : affichage ⚠ dans la cellule, citation pointant vers le passage le plus probable, tooltip *"Extraction incertaine. Cliquez pour relancer ou saisir manuellement."*, bouton de re-run.

### 11.2. Cellule absente

**Cas** : la donnée n'existe pas dans le document (ex : pas de clause de change of control).

**Comportement** : cellule avec badge `—`, tooltip *"Information non trouvée dans le document"*. La cellule ne bloque pas le run des autres colonnes.

### 11.3. Document non extrait dans une Tabular Review

**Cas** : l'utilisateur tente d'ajouter à la Tabular Review un document dont l'indexation Legal n'a pas encore été faite.

**Comportement** : dialog proposant *"Lancer l'extraction Legal sur ce document avant de l'ajouter au tableau ?"* — bouton *Extraire puis ajouter* / *Ignorer ce document*.

### 11.4. Re-run avec corpus modifié entre-temps

**Cas** : l'utilisateur ajoute ou retire des documents entre deux runs.

**Comportement** : seuls les documents actuellement dans l'analyse sont concernés. Les cellules des documents retirés sont supprimées. Les nouvelles lignes sont initialisées vides et remplies lors du prochain run.

### 11.5. Requête text-to-SQL non interprétable

**Cas** : la question posée dans le panneau chat ne peut pas être traduite en SQL sur la table des cellules.

**Comportement** : message *"Je n'ai pas pu traduire votre question en filtre. Reformulez ou cliquez sur les colonnes pour filtrer manuellement."* La requête SQL tentée est affichable via *Voir requête SQL* pour faciliter le diagnostic.

### 11.6. Multi-doc redline avec documents hétérogènes

**Cas** : la décision (ex: *"Aligner le cap de responsabilité à 12 mois"*) ne s'applique pas à certains documents car la clause cible est absente.

**Comportement** : ces documents sont listés avec le statut *"Décision non applicable"* et la raison (ex: *"Clause de limitation de responsabilité introuvable"*). Ils ne sont pas modifiés. L'utilisateur voit les N documents concernés et les M documents ignorés.

### 11.7. Capitalisation rejetée par l'approver

**Cas** : l'utilisateur a créé une demande d'amendement depuis un toast de capitalisation, mais l'approver la rejette.

**Comportement** : le redline accepté dans l'analyse reste valide. Le playbook n'est pas modifié. L'utilisateur reçoit une notification *"Votre proposition d'amendement au playbook commercial a été rejetée. Voir les détails."* La demande d'amendement est archivée dans l'historique de l'actif.

### 11.8. Conflit de capitalisation simultané

**Cas** : deux utilisateurs créent simultanément des demandes d'amendement contradictoires sur le même playbook.

**Comportement** : la queue d'amendements reçoit les deux demandes. L'approver les voit dans l'ordre d'arrivée et tranche. Le conflit est visible dans le diff visuel de chaque demande.

## 13. Récapitulatif des principes

| Principe | Traduction opérationnelle |
|---|---|
| Transparence | Badges de confiance, bannières d'état, messages explicites |
| Rattrapage | Chemin de correction pour chaque erreur |
| Dégradation gracieuse | Résultats partiels plutôt que rien |
| Validation stricte | zod sur les sorties LLM, retry si malformé |
| Journalisation | Console logs, fichier en backup |
| Messages utiles | Quoi / Pourquoi / Action possible |

Suite : [08-hors-scope-et-roadmap.md](./08-hors-scope-et-roadmap.md) pour les limites et l'horizon.
