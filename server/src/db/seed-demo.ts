import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import { db, initDb, sqlite } from './index.js';

console.log('🌱 Seeding demo workspace...');
initDb();

// ─── IDs ──────────────────────────────────────────────────────────────────────
const wsId   = 'ws_demo_legal';
const doc1Id = 'doc_distrib_exclusive';
const doc2Id = 'doc_spa_techvision';
const doc3Id = 'doc_nda_ma_acme';
const lo1Id  = 'lo_distrib_exclusive';
const lo2Id  = 'lo_spa_techvision';
const lo3Id  = 'lo_nda_ma_acme';

// Wipe only this demo workspace if it already exists
sqlite.exec(`
  DELETE FROM reference_assets WHERE id LIKE 'ref_demo_%';
  DELETE FROM deliverables  WHERE analysis_id IN (SELECT id FROM analyses WHERE workspace_id = '${wsId}');
  DELETE FROM analysis_documents WHERE analysis_id IN (SELECT id FROM analyses WHERE workspace_id = '${wsId}');
  DELETE FROM analyses      WHERE workspace_id = '${wsId}';
  DELETE FROM defined_terms WHERE legal_object_id IN ('${lo1Id}','${lo2Id}','${lo3Id}');
  DELETE FROM clauses       WHERE legal_object_id IN ('${lo1Id}','${lo2Id}','${lo3Id}');
  DELETE FROM legal_objects WHERE id IN ('${lo1Id}','${lo2Id}','${lo3Id}');
  DELETE FROM documents     WHERE workspace_id = '${wsId}';
  DELETE FROM workspaces    WHERE id = '${wsId}';
`);

// ─── Workspace ────────────────────────────────────────────────────────────────
sqlite.prepare(`INSERT INTO workspaces (id, name, description, created_by, active_ontology_id) VALUES (?,?,?,?,?)`)
  .run(wsId, 'Démo Juridique — Contrats Commerciaux', 'Espace de démonstration avec contrats riches', 'Clara Martin', 'maison');

// ─── Textes des documents ──────────────────────────────────────────────────────

const distribText = `CONTRAT DE DISTRIBUTION EXCLUSIVE

Conclu entre :

LUMINEX GROUP SAS, société par actions simplifiée au capital de 2 500 000 euros, immatriculée au RCS de Paris sous le numéro 441 872 630 RCS Paris, dont le siège social est sis 18 avenue Kléber, 75116 Paris, représentée par son Président-Directeur Général, M. Thomas Renard,
ci-après dénommée « le Fournisseur »,

Et :

IBERIAN TRADE PARTNERS S.L., société à responsabilité limitée de droit espagnol, au capital de 1 200 000 euros, dont le siège est situé Calle Gran Vía 42, 28013 Madrid, Espagne, immatriculée au Registro Mercantil de Madrid sous le numéro B-87654321, représentée par son Directeur Général, M. Carlos Méndez,
ci-après dénommée « le Distributeur »,

Ensemble dénommées « les Parties ».

PRÉAMBULE

Le Fournisseur fabrique et commercialise une gamme de solutions d'éclairage professionnel à LED haute performance sous la marque LUMINEX™. Le Distributeur dispose d'un réseau de distribution établi sur le territoire ibérique. Dans ce contexte, les Parties ont souhaité formaliser leurs relations commerciales par le présent contrat de distribution exclusive.

Article 1 — Objet

Le Fournisseur concède au Distributeur, qui accepte, le droit exclusif de distribuer et commercialiser les Produits LUMINEX™ définis à l'Annexe 1 sur le Territoire défini à l'Article 2, pour une durée définie à l'Article 9, et aux conditions du présent contrat.

Article 2 — Territoire et exclusivité

Le présent contrat confère au Distributeur une exclusivité de distribution sur le territoire de l'Espagne et du Portugal (ci-après le « Territoire »). Le Fournisseur s'interdit de nommer tout autre distributeur ou agent sur le Territoire pendant la durée du contrat, et de vendre directement aux clients finaux situés sur le Territoire sauf accord préalable écrit du Distributeur.

Article 3 — Objectifs minimaux de vente

Le Distributeur s'engage à atteindre des objectifs minimaux de vente (ci-après les « OMV ») définis à l'Annexe 2 pour chaque exercice annuel. Le non-respect des OMV pendant deux exercices consécutifs constitue une cause de résiliation du contrat à la discrétion du Fournisseur, après mise en demeure restée sans effet pendant 60 jours.

Article 4 — Prix et conditions financières

Les prix de vente au Distributeur sont ceux figurant dans la liste de prix en vigueur au moment de chaque commande, telle que communiquée par le Fournisseur avec un préavis minimum de 60 jours avant toute modification. Le Distributeur bénéficie d'une remise de 30 % sur le prix catalogue public. Les commandes sont payables à 45 jours fin de mois date de facture. Tout retard de paiement entraîne de plein droit l'application d'un intérêt de retard égal à 3 fois le taux d'intérêt légal en vigueur, ainsi qu'une indemnité forfaitaire de recouvrement de 40 euros par facture impayée.

Article 5 — Obligations du Fournisseur

Le Fournisseur s'engage à :
(i) livrer les Produits dans les délais convenus (délai standard : 15 jours ouvrés à compter de la réception de la commande) ;
(ii) maintenir une disponibilité des stocks d'au moins 85 % des références du catalogue ;
(iii) fournir au Distributeur une documentation commerciale et technique complète dans les langues espagnole et portugaise ;
(iv) assurer une formation initiale et annuelle des équipes commerciales du Distributeur ;
(v) répondre aux demandes de support technique dans un délai de 48 heures ouvrées.

Article 6 — Obligations du Distributeur

Le Distributeur s'engage à :
(i) employer au minimum 3 commerciaux dédiés à la gamme LUMINEX™ ;
(ii) maintenir un stock minimum de 60 jours de vente pour les 20 références principales ;
(iii) respecter les prix conseillés publics à plus ou moins 15 % sans l'accord préalable du Fournisseur ;
(iv) ne pas distribuer de produits concurrents directs dans les catégories LED professionnel haute performance ;
(v) adresser au Fournisseur un reporting mensuel des ventes et des stocks.

Article 7 — Non-concurrence

Pendant toute la durée du contrat et pour une période de 24 mois suivant sa résiliation ou son expiration, le Distributeur s'interdit de distribuer, commercialiser ou promouvoir des produits directement concurrents des Produits LUMINEX™ dans le segment de l'éclairage professionnel à LED sur le Territoire. Cette restriction s'applique également à toute société contrôlée par le Distributeur ou dans laquelle le Distributeur détient une participation supérieure à 20 %.

Article 8 — Propriété intellectuelle

La marque LUMINEX™ et l'ensemble des droits de propriété intellectuelle afférents aux Produits demeurent la propriété exclusive du Fournisseur. Le Distributeur bénéficie d'une licence non exclusive, non transférable, limitée au Territoire, pour l'utilisation de la marque aux seules fins de la distribution et de la promotion des Produits. Cette licence prend fin automatiquement à l'expiration ou à la résiliation du présent contrat.

Article 9 — Durée et renouvellement

Le présent contrat est conclu pour une durée initiale de 3 ans à compter du 1er avril 2026. Il est renouvelable par tacite reconduction pour des périodes successives d'un an, sauf dénonciation par l'une ou l'autre des Parties par lettre recommandée avec accusé de réception au moins 6 mois avant l'échéance.

Article 10 — Résiliation

Chaque Partie peut résilier le présent contrat : (i) de plein droit en cas de manquement grave de l'autre Partie non remédié dans les 30 jours suivant mise en demeure ; (ii) en cas d'ouverture d'une procédure collective à l'encontre de l'autre Partie ; (iii) en cas de changement de contrôle non autorisé au sens de l'Article 13.

Article 11 — Limitation de responsabilité

La responsabilité totale du Fournisseur au titre du présent contrat, toutes causes confondues, est plafonnée au montant des sommes effectivement versées par le Distributeur au cours des 12 derniers mois précédant le fait générateur. Sont expressément exclus tout dommage indirect, perte d'exploitation, manque à gagner, préjudice commercial ou atteinte à la réputation. Ces limitations ne s'appliquent pas en cas de dol ou de faute lourde.

Article 12 — Confidentialité

Les Parties s'engagent à maintenir strictement confidentiels les termes du présent contrat, les informations relatives aux prix, aux volumes, aux données clients et à toute information technique ou commerciale désignée comme confidentielle. Cette obligation de confidentialité subsistera pendant 5 ans après l'expiration ou la résiliation du contrat.

Article 13 — Changement de contrôle

Toute cession de contrôle du Distributeur, directe ou indirecte, est soumise à l'accord préalable et écrit du Fournisseur. En l'absence de cet accord, le Fournisseur dispose du droit de résilier le présent contrat avec un préavis de 30 jours.

Article 14 — Loi applicable et règlement des litiges

Le présent contrat est soumis au droit français. Les Parties s'engagent à tenter de résoudre à l'amiable tout différend dans un délai de 30 jours à compter de la notification du litige. En cas d'échec, le litige sera soumis à l'arbitrage de la Chambre de Commerce Internationale de Paris selon son règlement, par un tribunal arbitral composé de 3 arbitres, siégeant à Paris, en langue française.

Fait à Paris, le 25 mars 2026.`;

const spaText = `SHARE PURCHASE AGREEMENT — ACQUISITION DE TECHVISION SAS

ENTRE :

NEXATECH HOLDINGS BV, société de droit néerlandais, immatriculée à la Chambre de Commerce d'Amsterdam sous le numéro 72345678, dont le siège social est situé Herengracht 450, 1017 CA Amsterdam, Pays-Bas, représentée par son CEO, M. Willem Van Der Berg,
ci-après désignée « l'Acquéreur »,

ET :

M. Antoine Fleury (né le 12 mars 1978, de nationalité française), résidant 45 allée des Chênes, 92200 Neuilly-sur-Seine,
Mme Isabelle Fleury (née le 3 septembre 1980, de nationalité française), résidant à la même adresse,
ci-après collectivement désignés les « Cédants »,

Ensemble désignés les « Parties ».

PRÉAMBULE

TechVision SAS est une société par actions simplifiée au capital de 500 000 euros, immatriculée au RCS de Nanterre sous le numéro 532 891 240, éditrice d'une plateforme SaaS de gestion des données ESG adoptée par plus de 120 entreprises dont plusieurs sociétés du CAC 40 (ci-après la « Société »). Les Cédants détiennent collectivement 100 % du capital et des droits de vote de la Société. L'Acquéreur souhaite acquérir l'intégralité des actions de la Société dans les conditions prévues aux présentes.

Article 1 — Cession des actions

Sous réserve de la réalisation des Conditions Suspensives définies à l'Article 3, les Cédants cèdent à l'Acquéreur, qui accepte, l'intégralité des 50 000 actions ordinaires représentant 100 % du capital et des droits de vote de la Société au Prix défini à l'Article 2.

Article 2 — Prix de cession et mécanisme d'ajustement

2.1 Prix initial
Le prix de cession est fixé à 18 500 000 euros (dix-huit millions cinq cent mille euros) sur la base d'une valeur d'entreprise de 20 000 000 euros (valeur EBITDA x 8, EBITDA normatif de 2 500 000 euros) et d'une trésorerie nette de 1 500 000 euros à la date de signature.

2.2 Mécanisme d'earn-out
Un complément de prix pouvant atteindre 3 000 000 euros sera versé sur 3 ans selon l'atteinte des objectifs suivants : (i) ARR > 5,5 M€ au 31/12/2026 → 1 000 000 € ; (ii) ARR > 7 M€ au 31/12/2027 → 1 000 000 € ; (iii) ARR > 9 M€ au 31/12/2028 → 1 000 000 €. L'ARR est calculé conformément à la méthodologie définie en Annexe 3.

2.3 Ajustement de prix de clôture
Un ajustement de prix sera effectué post-clôture sur la base des comptes de clôture arrêtés à la Date de Réalisation, selon le mécanisme locked-box défini à l'Article 4.

Article 3 — Conditions suspensives

La réalisation de la cession est soumise à l'accomplissement, au plus tard le 30 juin 2026, des conditions suivantes : (i) approbation de l'opération par les autorités de concurrence compétentes (Autorité de la Concurrence française et Commission Européenne si seuils déclenchés) ; (ii) absence de Changement Défavorable Significatif au sens défini à l'Annexe 5 ; (iii) obtention de l'accord des principaux clients représentant au moins 70 % du chiffre d'affaires récurrent aux fins de la cession.

Article 4 — Locked-box et anti-leakage

Les Parties sont convenues d'un mécanisme de locked-box à compter du 31 décembre 2025 (la « Date de Référence »). À compter de la Date de Référence, les Cédants garantissent qu'aucune Valeur Fuitée n'a été extraite de la Société, définie comme tout dividende, remboursement de compte courant, management fees, augmentation de rémunération hors pratique normale, ou toute autre distribution non prévue aux présentes. Toute Valeur Fuitée non autorisée donnera lieu à une réduction équivalente du prix de cession.

Article 5 — Déclarations et garanties des Cédants

Les Cédants font les déclarations et garanties suivantes au bénéfice de l'Acquéreur, à la date de signature et à la Date de Réalisation :
(i) Capacité et pouvoirs : les Cédants ont pleine capacité pour conclure et exécuter le présent accord ;
(ii) Titres : les Cédants sont propriétaires des Actions, libres de tout gage, nantissement ou sûreté quelconque ;
(iii) Comptes : les derniers comptes annuels clos donnent une image fidèle et sincère de la situation financière de la Société ;
(iv) Propriété intellectuelle : la Société détient l'intégralité des droits sur son logiciel, sans litige en cours ou menacé ;
(v) Données personnelles : la Société respecte le RGPD et aucune violation de données n'a été notifiée à la CNIL au cours des 3 dernières années ;
(vi) Contrats clients : aucun client générant plus de 5 % du chiffre d'affaires n'a notifié sa résiliation ou exprimé une intention de résilier.

Article 6 — Limitation de garantie

6.1 Franchise
Aucune réclamation au titre de la garantie ne sera recevable si le montant individual est inférieur à 25 000 euros. La franchise globale est fixée à 200 000 euros.

6.2 Plafond
Le montant total des indemnisations au titre de la garantie est plafonné à 5 550 000 euros (soit 30 % du Prix Initial).

6.3 Durée
Les garanties expirent 18 mois après la Date de Réalisation, à l'exception des garanties relatives au titre (5 ans) et aux questions fiscales et sociales (délai de prescription légal applicable).

Article 7 — Garantie d'actif et de passif

Les Cédants garantissent solidairement l'Acquéreur contre tout passif, perte, coût ou charge résultant de tout fait, acte ou omission antérieur à la Date de Réalisation non divulgué dans le Data Room ou dans les déclarations des Cédants, dans les limites définies à l'Article 6.

Article 8 — Non-concurrence et non-sollicitation

Pendant une durée de 36 mois à compter de la Date de Réalisation, les Cédants s'interdisent de : (i) créer, participer ou s'intéresser directement ou indirectement à toute activité concurrente dans le secteur des logiciels de reporting ESG en Europe ; (ii) approcher ou débaucher tout salarié clé de la Société identifié à l'Annexe 7 ; (iii) solliciter les clients de la Société.

Article 9 — Gouvernance post-acquisition

Pendant une période de 12 mois suivant la Date de Réalisation, M. Antoine Fleury s'engage à exercer les fonctions de Directeur Général de la Société, avec un objectif de transition en douceur vers l'équipe de management de l'Acquéreur. Une convention de management sera conclue séparément.

Article 10 — Loi applicable et arbitrage

Le présent accord est régi par le droit français. Tout différend sera soumis à l'arbitrage de la CCI selon son Règlement d'arbitrage en vigueur, par un tribunal de 3 arbitres siégeant à Paris en langue française. La procédure d'arbitrage sera soumise au droit français. En cas d'urgence, les Parties peuvent saisir le juge des référés compétent pour obtenir des mesures conservatoires.

Signé à Paris et Amsterdam, le 10 avril 2026.`;

const ndaMaText = `ACCORD DE CONFIDENTIALITÉ — OPÉRATION M&A ACME / TECHVISION

Conclu entre :

NEXATECH HOLDINGS BV (décrite ci-dessus, ci-après « l'Acquéreur potentiel »),

Et :

TECHVISION SAS (décrite ci-dessus, ci-après la « Cible »),

Et :

M. Antoine Fleury et Mme Isabelle Fleury (décrits ci-dessus, ci-après les « Actionnaires »),

(Ensemble désignés les « Parties »)

Dans le cadre d'une réflexion sur une acquisition potentielle de TechVision SAS par Nexatech Holdings BV (l'« Opération »), les Parties ont besoin de s'échanger des informations confidentielles. Le présent accord a pour objet d'encadrer la protection de ces informations.

Article 1 — Informations Confidentielles

Constituent des « Informations Confidentielles » toutes informations de toute nature communiquées directement ou indirectement par une Partie (la « Partie Divulgatrice ») à une autre Partie (la « Partie Réceptrice ») dans le cadre des discussions relatives à l'Opération, qu'elles soient communiquées oralement, par écrit, sous format électronique ou sous toute autre forme, qu'elles soient ou non désignées comme confidentielles, y compris : informations financières (comptes, prévisionnels, conditions commerciales), informations techniques (code source, architecture système, roadmap produit), informations commerciales (liste clients, contrats, pricing), et informations stratégiques.

Article 2 — Obligations des Parties

Chaque Partie Réceptrice s'engage à : (i) utiliser les Informations Confidentielles exclusivement aux fins de l'évaluation de l'Opération ; (ii) ne les divulguer qu'à ses dirigeants, employés, conseils (avocats, banquiers, auditeurs) ayant besoin d'en connaître, lesquels seront liés par des obligations de confidentialité au moins équivalentes ; (iii) appliquer le même niveau de protection qu'à ses propres informations les plus sensibles, mais au minimum un niveau de protection raisonnable.

Article 3 — Restriction sur les démarches concurrentes (standstill)

L'Acquéreur potentiel s'engage, pendant une période de 12 mois suivant la signature du présent accord, à ne pas acquérir d'actions ou d'actifs de la Cible autrement que dans le cadre de l'Opération et selon les modalités qui seraient convenues entre les Parties.

Article 4 — Durée

Le présent accord est conclu pour une durée de 18 mois. Les obligations de confidentialité survivent à l'expiration du présent accord pendant une période de 3 ans.

Article 5 — Retour des informations

En cas d'abandon de l'Opération, chaque Partie Réceptrice s'engage, sur demande de la Partie Divulgatrice, à restituer ou à détruire dans les 10 jours ouvrés l'ensemble des Informations Confidentielles et copies, et à en certifier la destruction par écrit.

Article 6 — Loi applicable

Le présent accord est soumis au droit français. Tout litige sera soumis à la compétence exclusive des tribunaux de Paris.

Fait à Paris, le 5 janvier 2026.`;

// ─── Insertion des documents ──────────────────────────────────────────────────
const insertDoc = sqlite.prepare(`
  INSERT INTO documents (id, workspace_id, file_name, mime_type, size_bytes, uploaded_by, extracted_text, language, legal_extraction_status, legal_object_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

insertDoc.run(doc1Id, wsId, 'Contrat-Distribution-Exclusive-Luminex-Iberian.pdf',  'application/pdf', 68400, 'Clara Martin', distribText, 'fr', 'done', lo1Id);
insertDoc.run(doc2Id, wsId, 'SPA-Acquisition-TechVision-Nexatech-2026.pdf',         'application/pdf', 92100, 'Clara Martin', spaText,    'fr', 'done', lo2Id);
insertDoc.run(doc3Id, wsId, 'NDA-MA-Nexatech-TechVision-Confidentiel.pdf',          'application/pdf', 34800, 'Clara Martin', ndaMaText,  'fr', 'done', lo3Id);

// ─── Legal Objects ────────────────────────────────────────────────────────────
const insertLo = sqlite.prepare(`
  INSERT INTO legal_objects (id, document_id, ontology_id, document_type, document_subtype, language, overall_confidence, metadata_json, extraction_version)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

insertLo.run(lo1Id, doc1Id, 'maison', 'CONTRAT', 'DISTRIBUTION_EXCLUSIVE', 'fr', 'high', JSON.stringify({
  parties: [
    { name: 'Luminex Group SAS', role: 'Fournisseur', citation: { page: 1 } },
    { name: 'Iberian Trade Partners S.L.', role: 'Distributeur', citation: { page: 1 } }
  ],
  date: { value: '2026-03-25', confidence: 'high' },
  duration: { value: '3 ans renouvelables par tacite reconduction', confidence: 'high' },
  governingLaw: { value: 'Droit français — Arbitrage CCI Paris', confidence: 'high' }
}), 1);

insertLo.run(lo2Id, doc2Id, 'maison', 'CONTRAT', 'SPA_ACQUISITION', 'fr', 'high', JSON.stringify({
  parties: [
    { name: 'Nexatech Holdings BV', role: 'Acquéreur', citation: { page: 1 } },
    { name: 'Antoine Fleury / Isabelle Fleury', role: 'Cédants', citation: { page: 1 } }
  ],
  date: { value: '2026-04-10', confidence: 'high' },
  duration: { value: 'Exécution unique — clôture au plus tard 30/06/2026', confidence: 'high' },
  governingLaw: { value: 'Droit français — Arbitrage CCI Paris', confidence: 'high' }
}), 1);

insertLo.run(lo3Id, doc3Id, 'maison', 'CONTRAT', 'NDA_MUTUEL', 'fr', 'high', JSON.stringify({
  parties: [
    { name: 'Nexatech Holdings BV', role: 'Acquéreur potentiel', citation: { page: 1 } },
    { name: 'TechVision SAS', role: 'Cible', citation: { page: 1 } },
    { name: 'Antoine Fleury / Isabelle Fleury', role: 'Actionnaires', citation: { page: 1 } }
  ],
  date: { value: '2026-01-05', confidence: 'high' },
  duration: { value: '18 mois', confidence: 'high' },
  governingLaw: { value: 'Droit français — Tribunaux de Paris', confidence: 'high' }
}), 1);

// ─── Clauses — Contrat de Distribution ───────────────────────────────────────
const insertClause = sqlite.prepare(`
  INSERT INTO clauses (id, legal_object_id, type, heading, sequence_number, clause_order, text, citation_json, attributes_json, confidence, linked_defined_terms)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const cit1 = (page: number) => JSON.stringify({ page });
const noTerms = JSON.stringify([]);

// Distribution — clauses
insertClause.run(uuidv4(), lo1Id, 'PARTIES',      'Identification des parties', '0', 0,
  'Luminex Group SAS (Fournisseur) et Iberian Trade Partners S.L. (Distributeur).',
  cit1(1), JSON.stringify({ nb_parties: 2, denominations: 'Fournisseur / Distributeur' }), 'high', noTerms);

insertClause.run(uuidv4(), lo1Id, 'OBJET',        'Article 1 — Objet', '1', 1,
  'Le Fournisseur concède au Distributeur le droit exclusif de distribuer et commercialiser les Produits LUMINEX™ sur le Territoire pour une durée définie.',
  cit1(1), JSON.stringify({ objet_principal: 'Distribution exclusive de produits LED professionnels', secteur: 'Éclairage professionnel', nature_obligation: 'Obligation de faire' }), 'high', noTerms);

insertClause.run(uuidv4(), lo1Id, 'TERRITOIRE',   'Article 2 — Territoire', '2', 2,
  'Le présent contrat confère au Distributeur une exclusivité de distribution sur le territoire de l\'Espagne et du Portugal.',
  cit1(1), JSON.stringify({ pays: 'Espagne, Portugal', type_exclusivite: 'Territoriale', restrictions_vente_directe: 'Oui, sauf accord préalable' }), 'high', noTerms);

insertClause.run(uuidv4(), lo1Id, 'EXCLUSIVITE',  'Article 2 — Exclusivité', '2', 3,
  'Le Fournisseur s\'interdit de nommer tout autre distributeur ou agent sur le Territoire pendant la durée du contrat, et de vendre directement aux clients finaux situés sur le Territoire sauf accord préalable écrit du Distributeur.',
  cit1(1), JSON.stringify({ type: 'Exclusive mutuelle', perimetre: 'Distribution et vente directe', exceptions: 'Accord préalable écrit du Distributeur requis' }), 'high', noTerms);

insertClause.run(uuidv4(), lo1Id, 'PRIX_REMUNERATION', 'Article 4 — Prix', '4', 4,
  'Les prix de vente au Distributeur sont ceux figurant dans la liste de prix en vigueur. Le Distributeur bénéficie d\'une remise de 30 % sur le prix catalogue public.',
  cit1(2), JSON.stringify({ mode_remuneration: 'Prix catalogue avec remise', taux_remise: '30%', preavis_modification_prix: '60 jours' }), 'high', noTerms);

insertClause.run(uuidv4(), lo1Id, 'MODALITES_PAIEMENT', 'Article 4 — Paiement', '4', 5,
  'Les commandes sont payables à 45 jours fin de mois date de facture. Tout retard de paiement entraîne un intérêt de retard égal à 3 fois le taux légal et une indemnité forfaitaire de 40 euros.',
  cit1(2), JSON.stringify({ delai_paiement_jours: 45, mode: 'Fin de mois date de facture', penalites_retard: '3× taux légal + 40€ forfait', escompte: null }), 'high', noTerms);

insertClause.run(uuidv4(), lo1Id, 'OBLIGATIONS_PRESTATAIRE', 'Article 5 — Obligations du Fournisseur', '5', 6,
  'Livraison en 15 jours ouvrés, disponibilité stocks 85%, documentation en ES/PT, formation annuelle, support technique 48h.',
  cit1(2), JSON.stringify({ obligation_principale: 'Livraison, stocks, support', delai_livraison: '15 jours ouvrés', sla_disponibilite: '85% des références', formation: 'Initiale + annuelle' }), 'high', noTerms);

insertClause.run(uuidv4(), lo1Id, 'OBLIGATIONS_CLIENT', 'Article 6 — Obligations du Distributeur', '6', 7,
  '3 commerciaux dédiés minimum, stock 60 jours sur 20 références clés, respect prix conseillés ±15%, exclusivité catégorie, reporting mensuel.',
  cit1(2), JSON.stringify({ obligation_principale: 'Vente, stocks, exclusivité', nb_commerciaux_dedies: 3, stock_minimum_jours: 60, reporting_periodicite: 'Mensuel' }), 'high', noTerms);

insertClause.run(uuidv4(), lo1Id, 'NON_CONCURRENCE', 'Article 7 — Non-concurrence', '7', 8,
  'Pendant la durée + 24 mois post-résiliation : interdiction de distribuer des produits concurrents dans le segment LED professionnel haute performance sur le Territoire.',
  cit1(3), JSON.stringify({ duree_post_contrat_mois: 24, perimetre: 'LED professionnel haute performance', territoire: 'Espagne et Portugal', etendue_aux_filiales: 'Oui (participation > 20%)' }), 'high', noTerms);

insertClause.run(uuidv4(), lo1Id, 'PROPRIETE_INTELLECTUELLE', 'Article 8 — Propriété intellectuelle', '8', 9,
  'La marque LUMINEX™ demeure propriété exclusive du Fournisseur. Licence non exclusive, non transférable, limitée au Territoire pour distribution et promotion.',
  cit1(3), JSON.stringify({ titulaire: 'Fournisseur (Luminex Group SAS)', type_licence: 'Non exclusive, non transférable', perimetre_licence: 'Distribution et promotion sur Territoire', fin_licence: 'Automatique à expiration/résiliation' }), 'high', noTerms);

insertClause.run(uuidv4(), lo1Id, 'DUREE_CONTRAT', 'Article 9 — Durée', '9', 10,
  'Contrat conclu pour 3 ans à compter du 1er avril 2026, renouvelable par tacite reconduction par périodes d\'un an, sauf dénonciation 6 mois avant l\'échéance.',
  cit1(3), JSON.stringify({ duree_initiale: '3 ans', date_debut: '2026-04-01', renouvellement: 'Tacite reconduction annuelle', preavis_denonciation: '6 mois', preavis_forme: 'LRAR' }), 'high', noTerms);

insertClause.run(uuidv4(), lo1Id, 'RESILIATION_FAUTE', 'Article 10 — Résiliation', '10', 11,
  'Résiliation de plein droit : manquement grave non remédié en 30 jours, procédure collective, changement de contrôle non autorisé.',
  cit1(3), JSON.stringify({ delai_mise_en_demeure_jours: 30, causes_resiliation_immediate: 'Procédure collective, changement contrôle', preavis_convenance: null }), 'high', noTerms);

insertClause.run(uuidv4(), lo1Id, 'LIMITATION_RESPONSABILITE', 'Article 11 — Limitation de responsabilité', '11', 12,
  'Plafond : sommes versées sur les 12 derniers mois. Exclusion : dommages indirects, perte d\'exploitation, manque à gagner. Exception : dol ou faute lourde.',
  cit1(4), JSON.stringify({ plafond_base: '12 derniers mois de facturation', exclusions: 'Dommages indirects, perte exploitation, manque à gagner', exceptions_plafond: 'Dol et faute lourde', type_plafond: 'Relatif (variable)' }), 'high', noTerms);

insertClause.run(uuidv4(), lo1Id, 'CONFIDENTIALITE', 'Article 12 — Confidentialité', '12', 13,
  'Confidentialité des termes du contrat, prix, volumes, données clients, informations techniques. Durée : 5 ans post-expiration.',
  cit1(4), JSON.stringify({ duree_post_contrat_ans: 5, perimetre: 'Termes contrat, prix, clients, données techniques', standard: 'Même niveau que propres informations confidentielles' }), 'high', noTerms);

insertClause.run(uuidv4(), lo1Id, 'CHANGEMENT_CONTROLE', 'Article 13 — Changement de contrôle', '13', 14,
  'Toute cession de contrôle du Distributeur est soumise à accord préalable écrit du Fournisseur. Défaut d\'accord → résiliation sous 30 jours.',
  cit1(4), JSON.stringify({ accord_prealable_requis: true, consequence_defaut: 'Résiliation préavis 30 jours', perimetre: 'Cession directe ou indirecte de contrôle' }), 'high', noTerms);

insertClause.run(uuidv4(), lo1Id, 'ARBITRAGE', 'Article 14 — Arbitrage', '14', 15,
  'Arbitrage CCI Paris, 3 arbitres, langue française, droit français applicable.',
  cit1(4), JSON.stringify({ mode_resolution: 'Arbitrage CCI', siege: 'Paris', nombre_arbitres: 3, langue: 'Français', tentative_amiable_prealable: true, delai_amiable_jours: 30 }), 'high', noTerms);

insertClause.run(uuidv4(), lo1Id, 'LOI_APPLICABLE', 'Article 14 — Loi applicable', '14', 16,
  'Le présent contrat est soumis au droit français.',
  cit1(4), JSON.stringify({ loi: 'Droit français', pays: 'France' }), 'high', noTerms);

// ─── Clauses — SPA Acquisition TechVision ─────────────────────────────────────

insertClause.run(uuidv4(), lo2Id, 'PARTIES', 'Parties', '0', 0,
  'Nexatech Holdings BV (Acquéreur) et Antoine Fleury / Isabelle Fleury (Cédants).',
  cit1(1), JSON.stringify({ nb_parties: 3, denominations: 'Acquéreur / Cédants' }), 'high', noTerms);

insertClause.run(uuidv4(), lo2Id, 'OBJET', 'Article 1 — Cession', '1', 1,
  'Cession de 100% des actions TechVision SAS par les Cédants à l\'Acquéreur sous conditions suspensives.',
  cit1(1), JSON.stringify({ objet_principal: 'Acquisition 100% des titres TechVision SAS', nature_juridique: 'Cession de droits sociaux', pourcentage_cedé: '100%' }), 'high', noTerms);

insertClause.run(uuidv4(), lo2Id, 'PRIX_REMUNERATION', 'Article 2 — Prix', '2', 2,
  'Prix initial : 18 500 000 € sur valeur d\'entreprise de 20 M€ (EBITDA x 8). Earn-out jusqu\'à 3 M€ sur 3 ans selon ARR.',
  cit1(2), JSON.stringify({ montant_principal: 18500000, devise: 'EUR', base_valorisation: 'EBITDA × 8 (EBITDA normatif 2,5 M€)', earn_out_max: 3000000, mecanisme_prix: 'Locked-box + earn-out ARR' }), 'high', noTerms);

insertClause.run(uuidv4(), lo2Id, 'GARANTIES', 'Article 5 — Déclarations et garanties', '5', 3,
  'Garanties sur capacité, titres libres, comptes fidèles, PI complète, conformité RGPD, aucune résiliation client majeure.',
  cit1(3), JSON.stringify({ perimetre: 'Capacité, titres, comptes, PI, RGPD, contrats clients', date_garanties: 'Signature et réalisation', couverture_rgpd: true }), 'high', noTerms);

insertClause.run(uuidv4(), lo2Id, 'LIMITATION_RESPONSABILITE', 'Article 6 — Limitation de garantie', '6', 4,
  'Franchise individuelle 25 000€, franchise globale 200 000€, plafond 5 550 000€ (30% prix). Durée 18 mois (titre 5 ans, fiscal : prescription légale).',
  cit1(3), JSON.stringify({ franchise_individuelle: 25000, franchise_globale: 200000, plafond_montant: 5550000, plafond_pourcentage_prix: '30%', duree_garantie_generale_mois: 18, duree_garantie_titre_ans: 5, exceptions_plafond: 'Titre, questions fiscales et sociales' }), 'high', noTerms);

insertClause.run(uuidv4(), lo2Id, 'INDEMNISATION', 'Article 7 — GAP', '7', 5,
  'Garantie d\'actif et de passif solidaire des Cédants pour tout passif non divulgué antérieur à la réalisation.',
  cit1(4), JSON.stringify({ type: 'Garantie actif-passif', solidarité: true, fait_generateur: 'Passif non divulgué antérieur à réalisation', plafond_applicable: 'Article 6' }), 'high', noTerms);

insertClause.run(uuidv4(), lo2Id, 'NON_CONCURRENCE', 'Article 8 — Non-concurrence', '8', 6,
  '36 mois post-réalisation : interdiction activité concurrente dans logiciels ESG en Europe, non-sollicitation clients et salariés clés.',
  cit1(4), JSON.stringify({ duree_mois: 36, perimetre_activite: 'Logiciels de reporting ESG', territoire: 'Europe', non_sollicitation_salaries: true, non_sollicitation_clients: true }), 'high', noTerms);

insertClause.run(uuidv4(), lo2Id, 'ARBITRAGE', 'Article 10 — Arbitrage', '10', 7,
  'Arbitrage CCI, 3 arbitres, Paris, droit français. Juge des référés compétent pour mesures conservatoires.',
  cit1(4), JSON.stringify({ mode_resolution: 'Arbitrage CCI', siege: 'Paris', nombre_arbitres: 3, mesures_conservatoires: 'Juge des référés compétent' }), 'high', noTerms);

// ─── Clauses — NDA M&A ────────────────────────────────────────────────────────

insertClause.run(uuidv4(), lo3Id, 'PARTIES', 'Parties', '0', 0,
  'Nexatech Holdings BV, TechVision SAS, Antoine et Isabelle Fleury.',
  cit1(1), JSON.stringify({ nb_parties: 3, denominations: 'Acquéreur potentiel / Cible / Actionnaires' }), 'high', noTerms);

insertClause.run(uuidv4(), lo3Id, 'DEFINITION_IC', 'Article 1 — Informations Confidentielles', '1', 1,
  'Toutes informations de toute nature communiquées dans le cadre des discussions relatives à l\'Opération, incluant informations financières, techniques, commerciales et stratégiques.',
  cit1(1), JSON.stringify({ scope_breadth: 'TRES_LARGE', includes_verbal: true, includes_marked_only: false, perimetre_specifique: 'Données financières, code source, clients, pricing, stratégie' }), 'high', noTerms);

insertClause.run(uuidv4(), lo3Id, 'OBLIGATIONS_CONFIDENTIALITE', 'Article 2 — Obligations', '2', 2,
  'Utilisation exclusivement pour évaluation de l\'Opération, divulgation limitée aux conseils liés, même niveau de protection que propres informations sensibles.',
  cit1(1), JSON.stringify({ finalite_usage: 'Évaluation opération M&A uniquement', destinataires_autorises: 'Dirigeants, conseils (avocats, banquiers, auditeurs)', standard_protection: 'Même niveau que propres informations sensibles, a minima raisonnable' }), 'high', noTerms);

insertClause.run(uuidv4(), lo3Id, 'DUREE_CONFIDENTIALITE', 'Article 4 — Durée', '4', 3,
  'Accord de 18 mois. Obligations de confidentialité survivant 3 ans post-expiration.',
  cit1(2), JSON.stringify({ duree_accord_mois: 18, duree_post_expiration_ans: 3, perpetual: false }), 'high', noTerms);

insertClause.run(uuidv4(), lo3Id, 'RETOUR_DESTRUCTION', 'Article 5 — Retour', '5', 4,
  'Sur demande en cas d\'abandon : restitution ou destruction en 10 jours ouvrés, avec certification écrite.',
  cit1(2), JSON.stringify({ delai_jours_ouvres: 10, certification_exigee: true, destruction_copies: true }), 'high', noTerms);

insertClause.run(uuidv4(), lo3Id, 'LOI_APPLICABLE', 'Article 6 — Loi applicable', '6', 5,
  'Le présent accord est soumis au droit français. Juridiction exclusive : tribunaux de Paris.',
  cit1(2), JSON.stringify({ loi: 'Droit français', pays: 'France' }), 'high', noTerms);

insertClause.run(uuidv4(), lo3Id, 'JURIDICTION', 'Article 6 — Juridiction', '6', 6,
  'Juridiction exclusive des tribunaux de Paris (France).',
  cit1(2), JSON.stringify({ mode_resolution: 'Judiciaire', juridiction: 'Tribunaux de Paris', pays: 'France', tentative_amiable: false }), 'high', noTerms);

// ─── Référentiel : Playbook Distribution Commerciale ─────────────────────────

const refId = 'ref_demo_playbook_distribution';
sqlite.prepare(`
  INSERT INTO reference_assets (id, type, name, description, language, governance_status, content_json)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  refId,
  'playbook',
  'Playbook — Contrats de Distribution',
  'Positions de négociation pour contrats de distribution exclusive B2B',
  'fr',
  'validated',
  JSON.stringify({
    scope: 'Distribution exclusive produits B2B — France et étranger',
    sections: [
      {
        clauseType: 'Territoire et exclusivité',
        stakes: 'Clause structurante : définit le périmètre d\'activité et la valeur de l\'exclusivité. Un territoire trop large sans contrepartie OMV fragilise la position du fournisseur.',
        positions: {
          ideal: { description: 'Exclusivité conditionnée à l\'atteinte d\'OMV croissants, avec mécanisme de downgrade vers non-exclusivité en cas de sous-performance 2 années consécutives.' },
          fallback: { description: 'Exclusivité ferme sur 2 ans, puis revue contradictoire annuelle avec clause de résiliation si OMV < 80%.' },
          redFlag: { description: 'Exclusivité sans OMV, sans revue, et sans possibilité de vente directe en cas de défaillance du distributeur.' }
        },
        sourceClauseIds: []
      },
      {
        clauseType: 'Limitation de responsabilité',
        stakes: 'Plafonne l\'exposition financière. Sans plafond explicite, une inexécution contractuelle peut engager une responsabilité illimitée. L\'exclusion des dommages indirects est notre ligne rouge.',
        positions: {
          ideal: { description: 'Plafond fixé aux sommes reçues sur les 12 derniers mois. Exclusion complète des dommages indirects (perte d\'exploitation, manque à gagner). Exception limitée : dol et faute lourde.' },
          fallback: { description: 'Plafond à 2× le chiffre d\'affaires annuel moyen sur 3 ans. Exclusion dommages indirects maintenue.' },
          redFlag: { description: 'Absence de plafond, ou plafond supérieur à la valeur totale du contrat, ou absence d\'exclusion des dommages indirects.' }
        },
        sourceClauseIds: []
      },
      {
        clauseType: 'Non-concurrence post-contractuelle',
        stakes: 'Protège le réseau clients et le savoir-faire transmis. Trop longue → risque de nullité (>24 mois généralement). Trop courte → le distributeur peut facilement changer de fournisseur et emporter nos clients.',
        positions: {
          ideal: { description: '24 mois, périmètre limité aux produits directement concurrents sur le territoire contractuel, compensation financière si durée > 12 mois.' },
          fallback: { description: '18 mois sans compensation, périmètre strictement limité à la catégorie de produits.' },
          redFlag: { description: 'Durée > 36 mois, périmètre large (secteur entier), sans délimitation géographique, ou sans compensation.' }
        },
        sourceClauseIds: []
      },
      {
        clauseType: 'Changement de contrôle',
        stakes: 'Protège contre la reprise du distributeur par un concurrent. Sans cette clause, le contrat d\'exclusivité peut se retrouver entre les mains d\'un acteur hostile.',
        positions: {
          ideal: { description: 'Accord préalable écrit obligatoire pour tout changement de contrôle. Droit de résiliation immédiate sans indemnité si refus ou défaut de notification.' },
          fallback: { description: 'Notification préalable 60 jours + droit de résiliation sous 30 jours après la notification.' },
          redFlag: { description: 'Aucune clause change of control, ou simple notification post-facto sans droit de sortie.' }
        },
        sourceClauseIds: []
      },
      {
        clauseType: 'Règlement des litiges',
        stakes: 'L\'arbitrage CCI est plus confidentiel et plus adapté aux litiges commerciaux internationaux. Le choix du droit applicable peut faire une différence significative sur la qualification des clauses pénales.',
        positions: {
          ideal: { description: 'Arbitrage CCI Paris, 3 arbitres, droit français, langue française. Tentative de médiation préalable obligatoire de 30 jours.' },
          fallback: { description: 'Juridiction exclusive Paris (France), droit français.' },
          redFlag: { description: 'Droit étranger sans lien avec les parties, juridiction hors UE pour un litige franco-français, ou absence totale de clause.' }
        },
        sourceClauseIds: []
      }
    ]
  })
);

console.log('✅ Demo workspace seeded successfully');
console.log('   Workspace:', wsId);
console.log('   Documents:', [doc1Id, doc2Id, doc3Id].join(', '));
console.log('   Reference asset:', refId);
