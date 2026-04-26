import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import { db, initDb, sqlite } from './index.js';
import { embedPassage, vectorToBuffer } from '../embeddings/embedding.service.js';

console.log('🌱 Seeding database...');

initDb();

// Clear all tables
try { sqlite.exec(`DELETE FROM clause_embeddings`); } catch {}
try { sqlite.exec(`DELETE FROM conversation_messages`); } catch {}
sqlite.exec(`
  DELETE FROM reference_asset_versions;
  DELETE FROM reference_assets;
  DELETE FROM deliverable_versions;
  DELETE FROM deliverables;
  DELETE FROM analysis_documents;
  DELETE FROM analyses;
  DELETE FROM cross_references;
  DELETE FROM defined_terms;
  DELETE FROM clauses;
  DELETE FROM legal_objects;
  DELETE FROM text_passages;
  DELETE FROM documents;
  DELETE FROM workspaces;
`);

// ─── IDs ──────────────────────────────────────────────────────────────────────
const wsId = 'ws_demo_001';
const doc1Id = 'doc_nda_acme';
const doc2Id = 'doc_nda_standard';
const doc3Id = 'doc_contrat_prestation';
const lo1Id = 'lo_nda_acme';
const lo2Id = 'lo_nda_standard';
const lo3Id = 'lo_prestation';
const analysis1Id = 'ana_nda_comparison';
const analysis2Id = 'ana_audit_prestation';
const asset1Id = 'ref_playbook_commercial';
const asset2Id = 'ref_nda_standard';
const asset3Id = 'ref_dd_grid_ma';

// ─── Workspace ────────────────────────────────────────────────────────────────
sqlite.prepare(`
  INSERT INTO workspaces (id, name, description, created_by, active_ontology_id)
  VALUES (?, ?, ?, ?, ?)
`).run(wsId, 'Workspace Démo — Juridique 2026', 'Espace de travail de démonstration pour Legal Extraction', 'Clara Martin', 'maison');

// ─── Documents ────────────────────────────────────────────────────────────────

const ndaAcmeText = `ACCORD DE CONFIDENTIALITÉ MUTUEL

Entre les soussignés :

ACME SAS, société par actions simplifiée au capital de 500 000 euros, dont le siège social est situé 12 rue de la Paix, 75001 Paris, immatriculée au Registre du Commerce et des Sociétés de Paris sous le numéro 123 456 789 RCS Paris, représentée par son Directeur Général, M. Jean Dupont,
ci-après désignée « ACME »,

D'une part,

Et :

BOSCH FRANCE SARL, société à responsabilité limitée au capital de 1 000 000 euros, dont le siège social est situé 47 avenue de l'Europe, 92270 Bois-Colombes, immatriculée au Registre du Commerce et des Sociétés de Nanterre sous le numéro 987 654 321 RCS Nanterre, représentée par son Directeur Général, Mme Sophie Bernard,
ci-après désignée « BOSCH »,

D'autre part.

ACME et BOSCH étant ci-après collectivement désignées les « Parties » et individuellement une « Partie ».

PRÉAMBULE

Dans le cadre de discussions préliminaires en vue d'un potentiel partenariat commercial, les Parties sont susceptibles de s'échanger des informations confidentielles. Les Parties souhaitent définir les conditions dans lesquelles ces informations seront traitées.

Article 1 — Définitions

On entend par « Information Confidentielle » toute information, quelle qu'en soit la nature (technique, commerciale, financière, juridique, stratégique ou autre), communiquée par une Partie (ci-après la « Partie Divulgatrice ») à l'autre Partie (ci-après la « Partie Réceptrice »), sous quelque forme que ce soit (écrite, orale, électronique, visuelle ou autre), y compris les informations communiquées lors de visites de sites, réunions ou présentations, que ces informations soient ou non expressément qualifiées de confidentielles.

Article 2 — Obligations de confidentialité

Chaque Partie Réceptrice s'engage à :
(i) garder strictement confidentielles les Informations Confidentielles reçues de la Partie Divulgatrice ;
(ii) ne pas divulguer lesdites Informations Confidentielles à des tiers sans l'accord préalable et écrit de la Partie Divulgatrice ;
(iii) n'utiliser les Informations Confidentielles qu'aux seules fins de l'évaluation du partenariat envisagé ;
(iv) n'en donner accès qu'aux membres de son personnel ou à ses conseils ayant besoin d'en connaître dans le cadre strict de cet objectif ;
(v) appliquer aux Informations Confidentielles un niveau de protection au moins équivalent à celui qu'elle applique à ses propres informations confidentielles, et en tout état de cause un niveau de protection raisonnable.

Article 3 — Exceptions

Les obligations de confidentialité prévues à l'article 2 ne s'appliquent pas aux informations qui :
(a) étaient connues de la Partie Réceptrice avant leur divulgation par la Partie Divulgatrice, sans obligation de confidentialité ;
(b) sont ou deviennent publiquement connues autrement que du fait d'une violation du présent Accord par la Partie Réceptrice ;
(c) sont reçues légitimement d'un tiers sans restriction de confidentialité ;
(d) sont développées indépendamment par la Partie Réceptrice sans utilisation des Informations Confidentielles ;
(e) doivent être divulguées en vertu d'une obligation légale ou réglementaire, sous réserve d'en informer préalablement la Partie Divulgatrice dans les meilleurs délais et de ne divulguer que les informations strictement requises.

Article 4 — Durée

Le présent Accord est conclu pour une durée de deux (2) ans à compter de sa date de signature. Les obligations de confidentialité prévues au présent Accord demeureront en vigueur pendant une période de deux (2) ans suivant l'expiration ou la résiliation du présent Accord.

Article 5 — Retour et destruction des informations

À la demande écrite de la Partie Divulgatrice, ou à l'expiration du présent Accord, la Partie Réceptrice s'engage à restituer ou à détruire, à son choix, l'ensemble des Informations Confidentielles reçues, ainsi que toutes les copies, extraits ou reproductions qui en auraient été faits.

Article 6 — Absence de licence

Le présent Accord ne confère à aucune des Parties aucun droit de propriété intellectuelle sur les Informations Confidentielles de l'autre Partie.

Article 7 — Droit applicable et juridiction compétente

Le présent Accord est soumis au droit anglais. En cas de litige né de l'interprétation ou de l'exécution du présent Accord, les Parties s'engagent à rechercher une solution amiable. À défaut, les litiges seront soumis à la compétence exclusive des tribunaux de Londres (Royaume-Uni).

Fait à Paris, le 15 janvier 2026, en deux exemplaires originaux.

Pour ACME SAS                          Pour BOSCH FRANCE SARL
M. Jean Dupont                         Mme Sophie Bernard
Directeur Général                      Directeur Général`;

const ndaStandardText = `ACCORD DE CONFIDENTIALITÉ MUTUEL — NDA STANDARD MAISON

Entre les soussignés :

[SOCIÉTÉ], société [FORME JURIDIQUE] au capital de [MONTANT] euros, dont le siège social est situé [ADRESSE], immatriculée au Registre du Commerce et des Sociétés de [VILLE] sous le numéro [RCS], représentée par son [FONCTION], M./Mme [NOM],
ci-après désignée « [SOCIÉTÉ] »,

D'une part,

Et :

[CONTREPARTIE], [DESCRIPTION], représentée par [REPRÉSENTANT],
ci-après désignée « [CONTREPARTIE] »,

D'autre part.

[SOCIÉTÉ] et [CONTREPARTIE] étant ci-après collectivement désignées les « Parties ».

Article 1 — Définitions

« Information Confidentielle » désigne toute information de nature technique, commerciale, financière, stratégique ou autre, communiquée par une Partie à l'autre, sous quelque forme que ce soit, que cette information soit ou non marquée comme confidentielle.

Article 2 — Obligations de confidentialité

Chaque Partie s'engage à maintenir la confidentialité des Informations Confidentielles de l'autre Partie avec le même niveau de soin que celui qu'elle applique à ses propres informations confidentielles, mais en tout état de cause avec un soin raisonnable, à ne les utiliser qu'aux fins convenues, et à ne les divulguer qu'aux personnes ayant besoin d'en connaître.

Article 3 — Exceptions

Les obligations ne s'appliquent pas aux informations (a) connues préalablement, (b) tombées dans le domaine public sans faute de la Partie Réceptrice, (c) reçues légitimement d'un tiers, (d) développées indépendamment, ou (e) dont la divulgation est requise par la loi.

Article 4 — Durée

Le présent Accord est conclu pour une durée de cinq (5) ans. Les obligations de confidentialité survivent à l'expiration du présent Accord pendant une période supplémentaire de cinq (5) ans.

Article 5 — Retour et destruction

À première demande de la Partie Divulgatrice, la Partie Réceptrice s'engage à restituer ou détruire dans un délai de dix (10) jours ouvrés l'ensemble des Informations Confidentielles et à fournir une attestation écrite de destruction.

Article 6 — Loi applicable et juridiction

Le présent Accord est régi par le droit français. Tout litige sera soumis à la compétence exclusive des tribunaux de Paris (France), sauf accord exprès des Parties pour recourir à l'arbitrage.

Fait à [VILLE], le [DATE].`;

const prestationText = `CONTRAT DE PRESTATION DE SERVICES INFORMATIQUES

Entre les soussignés :

TECHSOLUTIONS SAS, société par actions simplifiée au capital de 200 000 euros, dont le siège social est situé 8 allée des Techniques, 69003 Lyon, immatriculée au RCS Lyon sous le numéro 456 789 123 RCS Lyon, représentée par son Président, M. Pierre Lefort,
ci-après désignée « le Prestataire »,

Et :

GLOBALCORP SA, société anonyme au capital de 10 000 000 euros, dont le siège social est situé 1 place du Business, 75008 Paris, représentée par son Directeur des Systèmes d'Information, M. Marc Durand,
ci-après désignée « le Client ».

Article 1 — Objet

Le Prestataire s'engage à fournir au Client des services de développement logiciel, d'intégration de systèmes et de maintenance corrective et évolutive de la plateforme CRM du Client, tels que définis dans le cahier des charges annexé (Annexe A).

Article 2 — Obligations du Prestataire

Le Prestataire s'engage à :
- Affecter une équipe de 5 développeurs qualifiés pour la réalisation des travaux ;
- Respecter les délais fixés dans le planning annexé (Annexe B) ;
- Remettre des livrables conformes aux spécifications techniques définies ;
- Respecter les procédures de développement sécurisé du Client ;
- Signaler sans délai tout incident susceptible d'impacter les délais ou la qualité.

Le Prestataire est soumis à une obligation de résultat pour les livrables définis en Annexe A.

Article 3 — Obligations du Client

Le Client s'engage à :
- Mettre à disposition les accès nécessaires aux environnements de développement ;
- Désigner un référent projet disponible ;
- Valider les livrables dans les délais convenus ;
- Régler les factures dans les délais stipulés à l'article 5.

Article 4 — Propriété intellectuelle

Les développements spécifiques réalisés dans le cadre du présent contrat sont la propriété exclusive du Client à compter de leur livraison et paiement intégral. Le Prestataire conserve la propriété de ses outils, méthodes et composants génériques préexistants, pour lesquels il concède au Client une licence d'utilisation non exclusive.

Article 5 — Prix et facturation

La rémunération du Prestataire est fixée à un forfait de 480 000 euros HT pour l'ensemble de la mission, payable en 12 mensualités de 40 000 euros HT. Les factures sont payables à 30 jours date de facture. Tout retard de paiement donnera lieu à des pénalités de retard calculées au taux de 3 fois le taux d'intérêt légal en vigueur.

Article 6 — Limitation de responsabilité

La responsabilité globale du Prestataire est limitée au montant total des sommes effectivement perçues au titre du présent contrat au cours des 12 derniers mois précédant le fait générateur. En aucun cas le Prestataire ne saurait être tenu responsable des dommages indirects, pertes de profits, pertes de données ou pertes d'exploitation.

Article 7 — Confidentialité

Chaque Partie s'engage à maintenir confidentielles les informations de l'autre Partie pendant toute la durée du contrat et pour une période de 3 ans suivant son expiration.

Article 8 — Durée et résiliation

Le présent contrat est conclu pour une durée de 18 mois à compter de sa date d'entrée en vigueur. Il peut être résilié par l'une ou l'autre des Parties moyennant un préavis de 3 mois. En cas de manquement grave non remédié dans les 30 jours suivant mise en demeure, l'autre Partie peut résilier le contrat avec effet immédiat.

Article 9 — Loi applicable et juridiction

Le présent contrat est soumis au droit français. En cas de litige, les Parties s'engagent à rechercher une solution amiable. À défaut, le litige sera soumis aux tribunaux compétents de Paris.

Fait à Lyon, le 10 mars 2026.`;

// Insert documents
const insertDoc = sqlite.prepare(`
  INSERT INTO documents (id, workspace_id, file_name, mime_type, size_bytes, uploaded_by, extracted_text, language, legal_extraction_status, legal_object_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

insertDoc.run(doc1Id, wsId, 'NDA-ACME-Bosch-2026.pdf', 'application/pdf', 45200, 'Clara Martin', ndaAcmeText, 'fr', 'completed', lo1Id);
insertDoc.run(doc2Id, wsId, 'NDA-Standard-Maison-v2.pdf', 'application/pdf', 32100, 'Clara Martin', ndaStandardText, 'fr', 'completed', lo2Id);
insertDoc.run(doc3Id, wsId, 'Contrat-Prestation-TechSolutions-2026.pdf', 'application/pdf', 58900, 'Clara Martin', prestationText, 'fr', 'completed', lo3Id);

// Insert passages for doc 1
const insertPassage = sqlite.prepare(`
  INSERT INTO text_passages (id, document_id, page, paragraph, text, start_offset, end_offset)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

// NDA ACME passages
insertPassage.run(uuidv4(), doc1Id, 1, 1, 'ACCORD DE CONFIDENTIALITÉ MUTUEL', 0, 35);
insertPassage.run(uuidv4(), doc1Id, 1, 2, 'ACME SAS, société par actions simplifiée au capital de 500 000 euros, dont le siège social est situé 12 rue de la Paix, 75001 Paris', 37, 170);
insertPassage.run(uuidv4(), doc1Id, 1, 3, 'BOSCH FRANCE SARL, société à responsabilité limitée au capital de 1 000 000 euros, dont le siège social est situé 47 avenue de l\'Europe, 92270 Bois-Colombes', 171, 350);
const p1_art1 = uuidv4();
insertPassage.run(p1_art1, doc1Id, 2, 4, 'On entend par « Information Confidentielle » toute information, quelle qu\'en soit la nature (technique, commerciale, financière, juridique, stratégique ou autre), communiquée par une Partie à l\'autre Partie, sous quelque forme que ce soit (écrite, orale, électronique, visuelle ou autre)', 400, 700);
const p1_art2 = uuidv4();
insertPassage.run(p1_art2, doc1Id, 2, 5, 'Chaque Partie Réceptrice s\'engage à garder strictement confidentielles les Informations Confidentielles reçues de la Partie Divulgatrice ; ne pas divulguer lesdites Informations Confidentielles à des tiers sans l\'accord préalable et écrit de la Partie Divulgatrice', 701, 1000);
const p1_art3 = uuidv4();
insertPassage.run(p1_art3, doc1Id, 3, 6, 'Les obligations de confidentialité prévues à l\'article 2 ne s\'appliquent pas aux informations qui étaient connues de la Partie Réceptrice avant leur divulgation ; sont ou deviennent publiquement connues ; sont reçues légitimement d\'un tiers', 1001, 1300);
const p1_art4 = uuidv4();
insertPassage.run(p1_art4, doc1Id, 3, 7, 'Le présent Accord est conclu pour une durée de deux (2) ans à compter de sa date de signature. Les obligations de confidentialité demeureront en vigueur pendant une période de deux (2) ans suivant l\'expiration', 1301, 1550);
const p1_art7 = uuidv4();
insertPassage.run(p1_art7, doc1Id, 4, 8, 'Le présent Accord est soumis au droit anglais. En cas de litige, les litiges seront soumis à la compétence exclusive des tribunaux de Londres (Royaume-Uni).', 1551, 1750);

// ─── Legal Objects ────────────────────────────────────────────────────────────

const insertLo = sqlite.prepare(`
  INSERT INTO legal_objects (id, document_id, ontology_id, document_type, document_subtype, language, overall_confidence, metadata_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// LO 1 — NDA ACME
insertLo.run(lo1Id, doc1Id, 'maison', 'CONTRAT', 'NDA_MUTUEL', 'fr', 'high', JSON.stringify({
  title: 'Accord de Confidentialité Mutuel — ACME / Bosch France',
  parties: [
    { id: 'p1', name: 'ACME SAS', role: 'other', legalForm: 'SAS', registrationNumber: '123 456 789 RCS Paris', representative: 'Jean Dupont', citation: { documentId: doc1Id, passageIds: [], page: 1, extract: 'ACME SAS, société par actions simplifiées...' }, confidence: 'high' },
    { id: 'p2', name: 'Bosch France SARL', role: 'other', legalForm: 'SARL', registrationNumber: '987 654 321 RCS Nanterre', representative: 'Sophie Bernard', citation: { documentId: doc1Id, passageIds: [], page: 1, extract: 'BOSCH FRANCE SARL...' }, confidence: 'high' }
  ],
  signatureDate: { date: '2026-01-15', citation: { documentId: doc1Id, passageIds: [], page: 4, extract: 'Fait à Paris, le 15 janvier 2026' } },
  governingLaw: { jurisdiction: 'UK', citation: { documentId: doc1Id, passageIds: [p1_art7], page: 4, extract: 'soumis au droit anglais' } },
  competentJurisdiction: { jurisdiction: 'Tribunaux de Londres', citation: { documentId: doc1Id, passageIds: [p1_art7], page: 4, extract: 'tribunaux de Londres (Royaume-Uni)' } },
  contractTerm: { value: '2', unit: 'years', citation: { documentId: doc1Id, passageIds: [p1_art4], page: 3, extract: 'durée de deux (2) ans' } }
}));

// LO 2 — NDA Standard Maison
insertLo.run(lo2Id, doc2Id, 'maison', 'CONTRAT', 'NDA_MUTUEL', 'fr', 'high', JSON.stringify({
  title: 'NDA Standard Maison — Version 2',
  parties: [],
  governingLaw: { jurisdiction: 'FR', citation: { documentId: doc2Id, passageIds: [], page: 2, extract: 'régi par le droit français' } },
  competentJurisdiction: { jurisdiction: 'Tribunaux de Paris', citation: { documentId: doc2Id, passageIds: [], page: 2, extract: 'tribunaux de Paris (France)' } },
  contractTerm: { value: '5', unit: 'years', citation: { documentId: doc2Id, passageIds: [], page: 1, extract: 'durée de cinq (5) ans' } }
}));

// LO 3 — Contrat de prestation
insertLo.run(lo3Id, doc3Id, 'maison', 'CONTRAT', 'PRESTATION_SERVICES', 'fr', 'high', JSON.stringify({
  title: 'Contrat de Prestation de Services Informatiques — TechSolutions / GlobalCorp',
  parties: [
    { id: 'p1', name: 'TechSolutions SAS', role: 'supplier', legalForm: 'SAS', registrationNumber: '456 789 123 RCS Lyon', representative: 'Pierre Lefort', citation: { documentId: doc3Id, passageIds: [], page: 1, extract: 'TECHSOLUTIONS SAS...' }, confidence: 'high' },
    { id: 'p2', name: 'GlobalCorp SA', role: 'customer', legalForm: 'SA', representative: 'Marc Durand', citation: { documentId: doc3Id, passageIds: [], page: 1, extract: 'GLOBALCORP SA...' }, confidence: 'high' }
  ],
  contractTerm: { value: '18', unit: 'months', citation: { documentId: doc3Id, passageIds: [], page: 2, extract: 'durée de 18 mois' } },
  totalValue: { amount: 480000, currency: 'EUR', citation: { documentId: doc3Id, passageIds: [], page: 2, extract: 'forfait de 480 000 euros HT' } },
  governingLaw: { jurisdiction: 'FR', citation: { documentId: doc3Id, passageIds: [], page: 3, extract: 'droit français' } }
}));

// ─── Clauses ─────────────────────────────────────────────────────────────────

const insertClause = sqlite.prepare(`
  INSERT INTO clauses (id, legal_object_id, type, heading, sequence_number, clause_order, text, citation_json, attributes_json, confidence, linked_defined_terms)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const dt1Id = uuidv4(); // defined term IC

// NDA ACME clauses
insertClause.run(uuidv4(), lo1Id, 'DEFINITION_IC', 'Article 1 — Définitions', '1', 0,
  'On entend par « Information Confidentielle » toute information, quelle qu\'en soit la nature (technique, commerciale, financière, juridique, stratégique ou autre), communiquée par une Partie à l\'autre Partie, sous quelque forme que ce soit (écrite, orale, électronique, visuelle ou autre), y compris les informations communiquées lors de visites de sites, réunions ou présentations, que ces informations soient ou non expressément qualifiées de confidentielles.',
  JSON.stringify({ documentId: doc1Id, passageIds: [p1_art1], page: 2, extract: 'On entend par « Information Confidentielle »...' }),
  JSON.stringify({ scope_breadth: { value: 'BROAD', confidence: 'high', isUserEdited: false }, includes_verbal: { value: true, confidence: 'high', isUserEdited: false }, includes_marked_only: { value: false, confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([dt1Id]));

insertClause.run(uuidv4(), lo1Id, 'OBLIGATIONS_CONFIDENTIALITE', 'Article 2 — Obligations de confidentialité', '2', 1,
  'Chaque Partie Réceptrice s\'engage à garder strictement confidentielles les Informations Confidentielles reçues de la Partie Divulgatrice ; ne pas divulguer lesdites Informations Confidentielles à des tiers sans l\'accord préalable et écrit de la Partie Divulgatrice ; n\'utiliser les Informations Confidentielles qu\'aux seules fins de l\'évaluation du partenariat envisagé ; n\'en donner accès qu\'aux membres de son personnel ou à ses conseils ayant besoin d\'en connaître ; appliquer un niveau de protection au moins équivalent à celui qu\'elle applique à ses propres informations confidentielles.',
  JSON.stringify({ documentId: doc1Id, passageIds: [p1_art2], page: 2, extract: 'Chaque Partie Réceptrice s\'engage...' }),
  JSON.stringify({ standard_of_care: { value: 'SAME_AS_OWN', confidence: 'high', isUserEdited: false }, need_to_know: { value: true, confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([dt1Id]));

insertClause.run(uuidv4(), lo1Id, 'EXCEPTIONS_CONFIDENTIALITE', 'Article 3 — Exceptions', '3', 2,
  'Les obligations de confidentialité prévues à l\'article 2 ne s\'appliquent pas aux informations qui étaient connues de la Partie Réceptrice avant leur divulgation par la Partie Divulgatrice ; sont ou deviennent publiquement connues autrement que du fait d\'une violation du présent Accord ; sont reçues légitimement d\'un tiers sans restriction de confidentialité ; sont développées indépendamment par la Partie Réceptrice ; doivent être divulguées en vertu d\'une obligation légale ou réglementaire.',
  JSON.stringify({ documentId: doc1Id, passageIds: [p1_art3], page: 3, extract: 'Les obligations ne s\'appliquent pas...' }),
  JSON.stringify({ includes_prior_knowledge: { value: true, confidence: 'high', isUserEdited: false }, includes_public_domain: { value: true, confidence: 'high', isUserEdited: false }, includes_legal_obligation: { value: true, confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([]));

const clauseDureeAcme = uuidv4();
insertClause.run(clauseDureeAcme, lo1Id, 'DUREE_CONFIDENTIALITE', 'Article 4 — Durée', '4', 3,
  'Le présent Accord est conclu pour une durée de deux (2) ans à compter de sa date de signature. Les obligations de confidentialité demeureront en vigueur pendant une période de deux (2) ans suivant l\'expiration ou la résiliation du présent Accord.',
  JSON.stringify({ documentId: doc1Id, passageIds: [p1_art4], page: 3, extract: 'durée de deux (2) ans' }),
  JSON.stringify({ duration_years: { value: 2, confidence: 'high', isUserEdited: false }, perpetual: { value: false, confidence: 'high', isUserEdited: false }, post_termination: { value: true, confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([]));

insertClause.run(uuidv4(), lo1Id, 'RETOUR_DESTRUCTION', 'Article 5 — Retour et destruction des informations', '5', 4,
  'À la demande écrite de la Partie Divulgatrice, ou à l\'expiration du présent Accord, la Partie Réceptrice s\'engage à restituer ou à détruire l\'ensemble des Informations Confidentielles ainsi que toutes les copies, extraits ou reproductions qui en auraient été faits.',
  JSON.stringify({ documentId: doc1Id, passageIds: [], page: 3, extract: 'restituer ou détruire...' }),
  JSON.stringify({ destruction_required: { value: true, confidence: 'high', isUserEdited: false }, certification_required: { value: false, confidence: 'medium', isUserEdited: false } }),
  'medium', JSON.stringify([]));

insertClause.run(uuidv4(), lo1Id, 'LOI_APPLICABLE', 'Article 7 — Droit applicable et juridiction compétente', '7', 5,
  'Le présent Accord est soumis au droit anglais.',
  JSON.stringify({ documentId: doc1Id, passageIds: [p1_art7], page: 4, extract: 'soumis au droit anglais' }),
  JSON.stringify({ governing_law: { value: 'Droit anglais (UK)', confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([]));

insertClause.run(uuidv4(), lo1Id, 'JURIDICTION', 'Article 7 — Juridiction', '7', 6,
  'En cas de litige né de l\'interprétation ou de l\'exécution du présent Accord, les Parties s\'engagent à rechercher une solution amiable. À défaut, les litiges seront soumis à la compétence exclusive des tribunaux de Londres (Royaume-Uni).',
  JSON.stringify({ documentId: doc1Id, passageIds: [p1_art7], page: 4, extract: 'tribunaux de Londres' }),
  JSON.stringify({ dispute_resolution: { value: 'TRIBUNAL', confidence: 'high', isUserEdited: false }, jurisdiction_location: { value: 'Londres, Royaume-Uni', confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([]));

// NDA Standard clauses (simplified)
insertClause.run(uuidv4(), lo2Id, 'DEFINITION_IC', 'Article 1 — Définitions', '1', 0,
  '« Information Confidentielle » désigne toute information de nature technique, commerciale, financière, stratégique ou autre, communiquée par une Partie à l\'autre, sous quelque forme que ce soit, que cette information soit ou non marquée comme confidentielle.',
  JSON.stringify({ documentId: doc2Id, passageIds: [], page: 1, extract: '« Information Confidentielle » désigne...' }),
  JSON.stringify({ scope_breadth: { value: 'BROAD', confidence: 'high', isUserEdited: false }, includes_verbal: { value: true, confidence: 'high', isUserEdited: false }, includes_marked_only: { value: false, confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([]));

insertClause.run(uuidv4(), lo2Id, 'OBLIGATIONS_CONFIDENTIALITE', 'Article 2 — Obligations de confidentialité', '2', 1,
  'Chaque Partie s\'engage à maintenir la confidentialité des Informations Confidentielles de l\'autre Partie avec le même niveau de soin que celui qu\'elle applique à ses propres informations confidentielles, mais en tout état de cause avec un soin raisonnable, à ne les utiliser qu\'aux fins convenues, et à ne les divulguer qu\'aux personnes ayant besoin d\'en connaître.',
  JSON.stringify({ documentId: doc2Id, passageIds: [], page: 1, extract: 'maintenir la confidentialité...' }),
  JSON.stringify({ standard_of_care: { value: 'SAME_AS_OWN', confidence: 'high', isUserEdited: false }, need_to_know: { value: true, confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([]));

insertClause.run(uuidv4(), lo2Id, 'EXCEPTIONS_CONFIDENTIALITE', 'Article 3 — Exceptions', '3', 2,
  'Les obligations ne s\'appliquent pas aux informations (a) connues préalablement, (b) tombées dans le domaine public sans faute de la Partie Réceptrice, (c) reçues légitimement d\'un tiers, (d) développées indépendamment, ou (e) dont la divulgation est requise par la loi.',
  JSON.stringify({ documentId: doc2Id, passageIds: [], page: 1, extract: 'Les obligations ne s\'appliquent pas...' }),
  JSON.stringify({ includes_prior_knowledge: { value: true, confidence: 'high', isUserEdited: false }, includes_public_domain: { value: true, confidence: 'high', isUserEdited: false }, includes_legal_obligation: { value: true, confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([]));

insertClause.run(uuidv4(), lo2Id, 'DUREE_CONFIDENTIALITE', 'Article 4 — Durée', '4', 3,
  'Le présent Accord est conclu pour une durée de cinq (5) ans. Les obligations de confidentialité survivent à l\'expiration du présent Accord pendant une période supplémentaire de cinq (5) ans.',
  JSON.stringify({ documentId: doc2Id, passageIds: [], page: 1, extract: 'durée de cinq (5) ans' }),
  JSON.stringify({ duration_years: { value: 5, confidence: 'high', isUserEdited: false }, perpetual: { value: false, confidence: 'high', isUserEdited: false }, post_termination: { value: true, confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([]));

insertClause.run(uuidv4(), lo2Id, 'RETOUR_DESTRUCTION', 'Article 5 — Retour et destruction', '5', 4,
  'À première demande de la Partie Divulgatrice, la Partie Réceptrice s\'engage à restituer ou détruire dans un délai de dix (10) jours ouvrés l\'ensemble des Informations Confidentielles et à fournir une attestation écrite de destruction.',
  JSON.stringify({ documentId: doc2Id, passageIds: [], page: 2, extract: 'restituer ou détruire dans un délai de dix (10) jours' }),
  JSON.stringify({ destruction_required: { value: true, confidence: 'high', isUserEdited: false }, certification_required: { value: true, confidence: 'high', isUserEdited: false }, delay_days: { value: 10, confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([]));

insertClause.run(uuidv4(), lo2Id, 'LOI_APPLICABLE', 'Article 6 — Loi applicable', '6', 5,
  'Le présent Accord est régi par le droit français.',
  JSON.stringify({ documentId: doc2Id, passageIds: [], page: 2, extract: 'régi par le droit français' }),
  JSON.stringify({ governing_law: { value: 'Droit français (FR)', confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([]));

insertClause.run(uuidv4(), lo2Id, 'JURIDICTION', 'Article 6 — Juridiction', '6', 6,
  'Tout litige sera soumis à la compétence exclusive des tribunaux de Paris (France), sauf accord exprès des Parties pour recourir à l\'arbitrage.',
  JSON.stringify({ documentId: doc2Id, passageIds: [], page: 2, extract: 'tribunaux de Paris (France)' }),
  JSON.stringify({ dispute_resolution: { value: 'TRIBUNAL', confidence: 'high', isUserEdited: false }, jurisdiction_location: { value: 'Paris, France', confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([]));

// Contrat prestation clauses
insertClause.run(uuidv4(), lo3Id, 'OBJET', 'Article 1 — Objet', '1', 0,
  'Le Prestataire s\'engage à fournir au Client des services de développement logiciel, d\'intégration de systèmes et de maintenance corrective et évolutive de la plateforme CRM du Client.',
  JSON.stringify({ documentId: doc3Id, passageIds: [], page: 1, extract: 'services de développement logiciel...' }),
  JSON.stringify({ scope_description: { value: 'Développement logiciel, intégration systèmes, maintenance CRM', confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([]));

insertClause.run(uuidv4(), lo3Id, 'OBLIGATIONS_PRESTATAIRE', 'Article 2 — Obligations du Prestataire', '2', 1,
  'Le Prestataire s\'engage à affecter une équipe de 5 développeurs qualifiés, respecter les délais fixés dans le planning, remettre des livrables conformes aux spécifications techniques. Le Prestataire est soumis à une obligation de résultat pour les livrables définis en Annexe A.',
  JSON.stringify({ documentId: doc3Id, passageIds: [], page: 1, extract: 'obligation de résultat...' }),
  JSON.stringify({ obligation_type: { value: 'RESULTAT', confidence: 'high', isUserEdited: false }, sla_defined: { value: true, confidence: 'medium', isUserEdited: false } }),
  'high', JSON.stringify([]));

insertClause.run(uuidv4(), lo3Id, 'PROPRIETE_INTELLECTUELLE', 'Article 4 — Propriété intellectuelle', '4', 2,
  'Les développements spécifiques réalisés dans le cadre du présent contrat sont la propriété exclusive du Client à compter de leur livraison et paiement intégral. Le Prestataire conserve la propriété de ses outils, méthodes et composants génériques préexistants.',
  JSON.stringify({ documentId: doc3Id, passageIds: [], page: 2, extract: 'propriété exclusive du Client' }),
  JSON.stringify({ ownership_model: { value: 'CLIENT_OWNS_ALL', confidence: 'high', isUserEdited: false }, background_ip_retained: { value: true, confidence: 'high', isUserEdited: false }, work_for_hire: { value: true, confidence: 'medium', isUserEdited: false } }),
  'high', JSON.stringify([]));

insertClause.run(uuidv4(), lo3Id, 'PRIX_REMUNERATION', 'Article 5 — Prix et facturation', '5', 3,
  'La rémunération du Prestataire est fixée à un forfait de 480 000 euros HT pour l\'ensemble de la mission, payable en 12 mensualités de 40 000 euros HT.',
  JSON.stringify({ documentId: doc3Id, passageIds: [], page: 2, extract: 'forfait de 480 000 euros HT' }),
  JSON.stringify({ price_model: { value: 'FORFAIT', confidence: 'high', isUserEdited: false }, currency: { value: 'EUR', confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([]));

insertClause.run(uuidv4(), lo3Id, 'MODALITES_PAIEMENT', 'Article 5 — Modalités de paiement', '5', 4,
  'Les factures sont payables à 30 jours date de facture. Tout retard de paiement donnera lieu à des pénalités de retard calculées au taux de 3 fois le taux d\'intérêt légal en vigueur.',
  JSON.stringify({ documentId: doc3Id, passageIds: [], page: 2, extract: 'payables à 30 jours' }),
  JSON.stringify({ payment_days: { value: 30, confidence: 'high', isUserEdited: false }, late_penalty: { value: true, confidence: 'high', isUserEdited: false }, late_penalty_rate: { value: 3, confidence: 'medium', isUserEdited: false } }),
  'high', JSON.stringify([]));

insertClause.run(uuidv4(), lo3Id, 'LIMITATION_RESPONSABILITE', 'Article 6 — Limitation de responsabilité', '6', 5,
  'La responsabilité globale du Prestataire est limitée au montant total des sommes effectivement perçues au titre du présent contrat au cours des 12 derniers mois précédant le fait générateur. En aucun cas le Prestataire ne saurait être tenu responsable des dommages indirects, pertes de profits, pertes de données ou pertes d\'exploitation.',
  JSON.stringify({ documentId: doc3Id, passageIds: [], page: 2, extract: 'limitée au montant total des sommes' }),
  JSON.stringify({ cap_type: { value: 'ANNUEL', confidence: 'high', isUserEdited: false }, cap_reference: { value: 'PRIX_ANNUEL', confidence: 'high', isUserEdited: false }, indirect_damages_excluded: { value: true, confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([]));

insertClause.run(uuidv4(), lo3Id, 'CONFIDENTIALITE', 'Article 7 — Confidentialité', '7', 6,
  'Chaque Partie s\'engage à maintenir confidentielles les informations de l\'autre Partie pendant toute la durée du contrat et pour une période de 3 ans suivant son expiration.',
  JSON.stringify({ documentId: doc3Id, passageIds: [], page: 3, extract: 'maintenir confidentielles...' }),
  JSON.stringify({ duration_years: { value: 3, confidence: 'high', isUserEdited: false }, mutual: { value: true, confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([]));

insertClause.run(uuidv4(), lo3Id, 'DUREE_RESILIATION', 'Article 8 — Durée et résiliation', '8', 7,
  'Le présent contrat est conclu pour une durée de 18 mois à compter de sa date d\'entrée en vigueur. Il peut être résilié par l\'une ou l\'autre des Parties moyennant un préavis de 3 mois. En cas de manquement grave non remédié dans les 30 jours suivant mise en demeure, l\'autre Partie peut résilier le contrat avec effet immédiat.',
  JSON.stringify({ documentId: doc3Id, passageIds: [], page: 3, extract: 'durée de 18 mois' }),
  JSON.stringify({ initial_term_value: { value: 18, confidence: 'high', isUserEdited: false }, initial_term_unit: { value: 'months', confidence: 'high', isUserEdited: false }, notice_period_days: { value: 90, confidence: 'high', isUserEdited: false }, termination_for_convenience: { value: true, confidence: 'high', isUserEdited: false }, termination_for_cause: { value: true, confidence: 'high', isUserEdited: false } }),
  'high', JSON.stringify([]));

// ─── Defined Terms ────────────────────────────────────────────────────────────
const insertDt = sqlite.prepare(`INSERT INTO defined_terms (id, legal_object_id, term, definition, citation_json, confidence, referenced_in_clauses) VALUES (?, ?, ?, ?, ?, ?, ?)`);
insertDt.run(dt1Id, lo1Id, 'Information Confidentielle', 'Toute information, quelle qu\'en soit la nature (technique, commerciale, financière, juridique, stratégique ou autre), communiquée par une Partie à l\'autre Partie sous quelque forme que ce soit', JSON.stringify({ documentId: doc1Id, passageIds: [p1_art1], page: 2, extract: 'On entend par « Information Confidentielle »...' }), 'high', JSON.stringify([]));
insertDt.run(uuidv4(), lo1Id, 'Partie Divulgatrice', 'La Partie qui communique des Informations Confidentielles à l\'autre Partie', JSON.stringify({ documentId: doc1Id, passageIds: [p1_art1], page: 2, extract: 'ci-après la « Partie Divulgatrice »' }), 'high', JSON.stringify([]));
insertDt.run(uuidv4(), lo1Id, 'Partie Réceptrice', 'La Partie qui reçoit des Informations Confidentielles de l\'autre Partie', JSON.stringify({ documentId: doc1Id, passageIds: [p1_art1], page: 2, extract: 'ci-après la « Partie Réceptrice »' }), 'high', JSON.stringify([]));

// ─── Analyses ─────────────────────────────────────────────────────────────────
const insertAnalysis = sqlite.prepare(`INSERT INTO analyses (id, workspace_id, name, created_by, last_activity_at) VALUES (?, ?, ?, ?, ?)`);
insertAnalysis.run(analysis1Id, wsId, 'Comparaison NDA ACME vs Standard Maison', 'Clara Martin', '2026-04-24T10:30:00');
insertAnalysis.run(analysis2Id, wsId, 'Audit Contrat Prestation TechSolutions', 'Clara Martin', '2026-04-22T14:00:00');

const insertAnaDoc = sqlite.prepare(`INSERT INTO analysis_documents (id, analysis_id, legal_object_id, role, order_in_analysis) VALUES (?, ?, ?, ?, ?)`);
insertAnaDoc.run(uuidv4(), analysis1Id, lo1Id, 'target', 0);
insertAnaDoc.run(uuidv4(), analysis1Id, lo2Id, 'reference', 1);
insertAnaDoc.run(uuidv4(), analysis2Id, lo3Id, 'target', 0);

const delivId1 = 'del_comparative_note_001';

// ─── Deliverables ─────────────────────────────────────────────────────────────

const comparativeNoteContent = {
  type: 'comparative_note',
  synthesis: {
    overallGapLevel: 'significant',
    topGaps: [
      'Durée des obligations de confidentialité : 2 ans (NDA entrant) vs 5 ans (standard maison)',
      'Juridiction : Londres (NDA entrant) vs Paris (standard maison)',
      'Attestation de destruction non prévue dans le NDA entrant'
    ],
    negotiationRecommendation: 'Ce NDA est acceptable sous réserve de 3 modifications prioritaires : (1) aligner la durée à 5 ans, (2) obtenir une juridiction parisienne ou a minima une clause d\'arbitrage en France, (3) exiger une attestation écrite de destruction.'
  },
  clauseComparison: [
    {
      clauseType: 'DEFINITION_IC',
      documentA: { text: 'Toute information, quelle qu\'en soit la nature (technique, commerciale, financière, juridique, stratégique ou autre), communiquée sous quelque forme que ce soit, y compris oralement', citation: { documentId: doc1Id, passageIds: [p1_art1], page: 2, extract: 'On entend par « Information Confidentielle »...' } },
      documentB: { text: 'Toute information de nature technique, commerciale, financière, stratégique ou autre, communiquée par une Partie à l\'autre, sous quelque forme que ce soit', citation: { documentId: doc2Id, passageIds: [], page: 1, extract: '« Information Confidentielle » désigne...' } },
      gap: 'equivalent',
      commentary: 'Les deux définitions sont larges et équivalentes. Celle du NDA entrant est légèrement plus détaillée (mention explicite des échanges oraux et des visites de site).'
    },
    {
      clauseType: 'OBLIGATIONS_CONFIDENTIALITE',
      documentA: { text: 'Niveau de protection au moins équivalent à celui de ses propres informations confidentielles', citation: { documentId: doc1Id, passageIds: [p1_art2], page: 2, extract: 'niveau de protection au moins équivalent' } },
      documentB: { text: 'Même niveau de soin que celui appliqué à ses propres informations, mais au minimum un soin raisonnable', citation: { documentId: doc2Id, passageIds: [], page: 1, extract: 'même niveau de soin' } },
      gap: 'editorial',
      commentary: 'Formulations légèrement différentes mais fond identique : standard de diligence raisonnable avec référence aux propres informations.'
    },
    {
      clauseType: 'DUREE_CONFIDENTIALITE',
      documentA: { text: '2 ans à compter de la signature + survie 2 ans post-expiration', citation: { documentId: doc1Id, passageIds: [p1_art4], page: 3, extract: 'durée de deux (2) ans' } },
      documentB: { text: '5 ans + survie 5 ans post-expiration', citation: { documentId: doc2Id, passageIds: [], page: 1, extract: 'durée de cinq (5) ans' } },
      gap: 'unfavorable',
      commentary: 'Écart significatif : 2 ans vs 5 ans. À renégocier impérativement. La durée de 2 ans est insuffisante pour protéger des informations stratégiques sur le long terme.'
    },
    {
      clauseType: 'RETOUR_DESTRUCTION',
      documentA: { text: 'Restitution ou destruction à la demande, sans délai précis ni attestation', citation: { documentId: doc1Id, passageIds: [], page: 3, extract: 'restituer ou détruire...' } },
      documentB: { text: 'Restitution ou destruction dans les 10 jours ouvrés, avec attestation écrite de destruction obligatoire', citation: { documentId: doc2Id, passageIds: [], page: 2, extract: 'dans un délai de dix (10) jours ouvrés' } },
      gap: 'unfavorable',
      commentary: 'Deux faiblesses : (1) absence de délai précis dans le NDA entrant, (2) pas d\'attestation de destruction prévue. Le standard maison est plus protecteur.'
    },
    {
      clauseType: 'LOI_APPLICABLE',
      documentA: { text: 'Droit anglais', citation: { documentId: doc1Id, passageIds: [p1_art7], page: 4, extract: 'soumis au droit anglais' } },
      documentB: { text: 'Droit français', citation: { documentId: doc2Id, passageIds: [], page: 2, extract: 'régi par le droit français' } },
      gap: 'substantive',
      commentary: 'Écart substantiel. Le droit anglais est moins familier pour votre équipe juridique et potentiellement moins favorable sur certains aspects (exécution, injonctions). À négocier : droit français ou a minima droit d\'un pays tiers neutre.'
    },
    {
      clauseType: 'JURIDICTION',
      documentA: { text: 'Tribunaux de Londres (Royaume-Uni)', citation: { documentId: doc1Id, passageIds: [p1_art7], page: 4, extract: 'tribunaux de Londres' } },
      documentB: { text: 'Tribunaux de Paris (France)', citation: { documentId: doc2Id, passageIds: [], page: 2, extract: 'tribunaux de Paris (France)' } },
      gap: 'unfavorable',
      commentary: 'Juridiction étrangère coûteuse et défavorable. Après Brexit, les jugements des tribunaux anglais ne bénéficient plus de la reconnaissance automatique dans l\'UE. À renégocier : Paris ou arbitrage CCI Paris.'
    }
  ],
  onlyInA: [],
  onlyInB: [],
  pointByPointRecommendations: [
    'Négocier la durée des obligations à 5 ans minimum (art. 4)',
    'Refuser le droit anglais comme loi applicable — exiger le droit français (art. 7)',
    'Refuser la juridiction de Londres — exiger Paris ou arbitrage CCI (art. 7)',
    'Ajouter un délai de 10 jours et une attestation de destruction (art. 5)',
    'Valider les autres clauses, conformes au standard'
  ],
  annexCitations: []
};

const redlineContent = {
  type: 'redline',
  targetDocumentId: doc1Id,
  baseHtml: `<h1>ACCORD DE CONFIDENTIALITÉ MUTUEL</h1>
<p>Entre les soussignés : <strong>ACME SAS</strong> et <strong>BOSCH FRANCE SARL</strong>.</p>
<h2>Article 4 — Durée</h2>
<p>Le présent Accord est conclu pour une durée de <span class="del" data-change-id="c1">deux (2)</span><span class="ins" data-change-id="c1">cinq (5)</span> ans à compter de sa date de signature. Les obligations de confidentialité demeureront en vigueur pendant une période de <span class="del" data-change-id="c2">deux (2)</span><span class="ins" data-change-id="c2">cinq (5)</span> ans suivant l'expiration ou la résiliation du présent Accord.</p>
<h2>Article 5 — Retour et destruction des informations</h2>
<p>À la demande écrite de la Partie Divulgatrice, ou à l'expiration du présent Accord, la Partie Réceptrice s'engage à restituer ou à détruire<span class="ins" data-change-id="c3">, dans un délai de dix (10) jours ouvrés,</span> l'ensemble des Informations Confidentielles<span class="ins" data-change-id="c3"> et à fournir à la Partie Divulgatrice une attestation écrite de destruction</span>.</p>
<h2>Article 7 — Droit applicable et juridiction compétente</h2>
<p>Le présent Accord est soumis au <span class="del" data-change-id="c4">droit anglais</span><span class="ins" data-change-id="c4">droit français</span>. En cas de litige, les litiges seront soumis à la compétence exclusive des tribunaux de <span class="del" data-change-id="c5">Londres (Royaume-Uni)</span><span class="ins" data-change-id="c5">Paris (France)</span>.</p>`,
  changes: [
    { id: 'c1', type: 'replacement', originalText: 'deux (2)', newText: 'cinq (5)', location: { startOffset: 0, endOffset: 8 }, clauseContext: 'Article 4 — Durée', rationale: 'Durée insuffisante (2 ans). Standard maison : 5 ans minimum.', referenceSource: 'NDA Standard Maison v2 — Art. 4', status: 'pending' },
    { id: 'c2', type: 'replacement', originalText: 'deux (2)', newText: 'cinq (5)', location: { startOffset: 10, endOffset: 18 }, clauseContext: 'Article 4 — Durée (survie post-résiliation)', rationale: 'Aligner la survie post-résiliation sur le standard (5 ans)', referenceSource: 'NDA Standard Maison v2 — Art. 4', status: 'pending' },
    { id: 'c3', type: 'insertion', newText: ', dans un délai de dix (10) jours ouvrés, ... et à fournir une attestation écrite de destruction', location: { startOffset: 0, endOffset: 0 }, clauseContext: 'Article 5 — Retour et destruction', rationale: 'Ajouter délai et attestation de destruction conformément au standard maison', referenceSource: 'NDA Standard Maison v2 — Art. 5', status: 'pending' },
    { id: 'c4', type: 'replacement', originalText: 'droit anglais', newText: 'droit français', location: { startOffset: 0, endOffset: 13 }, clauseContext: 'Article 7 — Loi applicable', rationale: 'Droit anglais défavorable post-Brexit. Standard maison : droit français.', referenceSource: 'NDA Standard Maison v2 — Art. 6', status: 'pending' },
    { id: 'c5', type: 'replacement', originalText: 'Londres (Royaume-Uni)', newText: 'Paris (France)', location: { startOffset: 0, endOffset: 21 }, clauseContext: 'Article 7 — Juridiction', rationale: 'Juridiction étrangère coûteuse. Standard maison : Paris.', referenceSource: 'NDA Standard Maison v2 — Art. 6', status: 'pending' }
  ],
  comments: [
    { id: 'cm1', anchor: { startOffset: 0, endOffset: 0 }, author: 'ai', authorName: 'Legal Extraction', text: 'Ce NDA présente 3 écarts majeurs vs votre standard. Les modifications proposées sont prioritaires.', createdAt: '2026-04-24T10:30:00', thread: [] }
  ]
};

const insertDeliverable = sqlite.prepare(`INSERT INTO deliverables (id, analysis_id, type, name, source_operation, content_json, source_document_ids, reference_asset_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
insertDeliverable.run(delivId1, analysis1Id, 'comparative_note', 'Note comparative — NDA ACME vs Standard Maison', 'alignment', JSON.stringify(comparativeNoteContent), JSON.stringify([doc1Id, doc2Id]), JSON.stringify([]));
insertDeliverable.run('del_redline_001', analysis1Id, 'redline', 'Redline — NDA ACME', 'alignment', JSON.stringify(redlineContent), JSON.stringify([doc1Id, doc2Id]), JSON.stringify([]));

const insertVersion = sqlite.prepare(`INSERT INTO deliverable_versions (id, deliverable_id, version, created_by, summary, content_json) VALUES (?, ?, ?, ?, ?, ?)`);
insertVersion.run(uuidv4(), delivId1, 1, 'ai', 'Génération initiale', JSON.stringify(comparativeNoteContent));
insertVersion.run(uuidv4(), 'del_redline_001', 1, 'ai', 'Génération initiale', JSON.stringify(redlineContent));

// ─── Reference Assets ─────────────────────────────────────────────────────────

const playbookContent = {
  scope: 'Contrats commerciaux (prestation, distribution, licence SaaS)',
  applicableDocumentTypes: ['CONTRAT/PRESTATION_SERVICES', 'CONTRAT/DISTRIBUTION', 'CONTRAT/LICENCE_LOGICIEL'],
  sections: [
    {
      clauseType: 'LIMITATION_RESPONSABILITE',
      stakes: 'Clause critique. Un plafond trop bas expose à une récupération insuffisante en cas de préjudice. Un plafond trop élevé peut dissuader des fournisseurs stratégiques.',
      positions: {
        ideal: { description: 'Cap à 2x le prix annuel du contrat, sans exclusion des dommages directs. Carve-outs pour faute lourde, dol, décès/lésions corporelles, IP, RGPD.', attributes: { cap_reference: 'PRIX_ANNUEL', cap_multiplier: 2 } },
        fallback: { description: 'Cap à 1x le prix annuel acceptable. Pas en dessous.', conditions: 'Acceptable si le fournisseur est indispensable ou en position de marché dominante', attributes: { cap_reference: 'PRIX_ANNUEL', cap_multiplier: 1 } },
        redFlag: { description: 'Cap inférieur à 1x le prix annuel, ou exclusion totale de responsabilité, ou exclusion des IP/RGPD du carve-out', examples: ['Responsabilité limitée à 50k€ dans un contrat de 5M€', 'Exclusion des dommages directs'], rationale: 'Exposition inacceptable en cas de sinistre majeur' }
      },
      negotiationGuidance: 'Commencer par proposer 2x. Si refus, valider 1x en contrepartie d\'améliorations ailleurs (SLA, garanties). Refuser tout cap <1x.'
    },
    {
      clauseType: 'PROPRIETE_INTELLECTUELLE',
      stakes: 'La PI est un actif stratégique. Il faut s\'assurer que les développements spécifiques restent la propriété du client.',
      positions: {
        ideal: { description: 'Client propriétaire de tous les développements spécifiques, avec cession complète. Fournisseur conserve sa PI préexistante et reçoit une licence d\'utilisation restreinte.', attributes: { ownership_model: 'CLIENT_OWNS_ALL', background_ip_retained: true } },
        fallback: { description: 'Licence exclusive large sur les développements spécifiques si cession totale refusée', conditions: 'Uniquement si le fournisseur intègre de la PI générique indissociable' },
        redFlag: { description: 'Fournisseur conserve la propriété des développements spécifiques ou licence non-exclusive uniquement', examples: ['Le Prestataire conserve tous droits sur les livrables'], rationale: 'Le client paie et ne possède pas le résultat' }
      }
    },
    {
      clauseType: 'DUREE_RESILIATION',
      stakes: 'La flexibilité de sortie est essentielle pour adapter le contrat à l\'évolution du business.',
      positions: {
        ideal: { description: 'Résiliation pour convenance avec préavis de 3 mois. Résiliation immédiate pour faute grave.', attributes: { termination_for_convenience: true, notice_period_days: 90 } },
        fallback: { description: 'Préavis de 6 mois acceptable pour des contrats longs (>3 ans)', conditions: 'Avec clause de dégressivité des pénalités de sortie' },
        redFlag: { description: 'Impossibilité de résilier pour convenance, ou préavis >12 mois, ou pénalités de résiliation excessives', examples: ['Résiliation uniquement pour cause exclusive', 'Indemnité de résiliation = solde total restant'], rationale: 'Enfermement inacceptable' }
      }
    }
  ]
};

const ndaStandardAssetContent = {
  documentType: 'CONTRAT/NDA_MUTUEL',
  description: 'NDA standard maison pour les discussions préliminaires avec des tiers',
  usageContext: 'À utiliser avec tout nouveau partenaire avant partage d\'informations confidentielles. Version française, droit français, juridiction Paris.',
  structuredContent: { legalObjectId: lo2Id },
  fullText: ndaStandardText
};

const ddGridContent = {
  operationType: 'M&A',
  applicableDocumentTypes: ['CONTRAT/PRESTATION_SERVICES', 'CONTRAT/DISTRIBUTION', 'CONTRAT/LICENCE_LOGICIEL', 'CONTRAT/NDA_MUTUEL'],
  questions: [
    { id: 'q1', category: 'Changement de contrôle', question: 'Existe-t-il une clause de changement de contrôle ?', relatedClauseTypes: ['CHANGEMENT_CONTROLE'], answerFormat: { type: 'boolean' }, riskRules: [{ condition: 'Absent', level: 'orange', rationale: 'Absence de protection en cas de CoC de la contrepartie' }] },
    { id: 'q2', category: 'Changement de contrôle', question: 'Quel est le seuil déclencheur de la clause de CoC (%)?', relatedClauseTypes: ['CHANGEMENT_CONTROLE'], answerFormat: { type: 'numeric' }, riskRules: [{ condition: '<50%', level: 'red', rationale: 'Seuil trop bas, risque de déclenchement incontrôlé' }, { condition: '>=50%', level: 'green', rationale: 'Standard acceptable' }] },
    { id: 'q3', category: 'Limitation de responsabilité', question: 'Quel est le cap de responsabilité (en multiple du prix annuel) ?', relatedClauseTypes: ['LIMITATION_RESPONSABILITE'], answerFormat: { type: 'numeric' }, riskRules: [{ condition: '<1x', level: 'red', rationale: 'Cap insuffisant' }, { condition: '1x-2x', level: 'orange', rationale: 'Acceptable' }, { condition: '>2x', level: 'green', rationale: 'Favorable' }] },
    { id: 'q4', category: 'Durée & Résiliation', question: 'Durée initiale du contrat (en mois) ?', relatedClauseTypes: ['DUREE_RESILIATION'], answerFormat: { type: 'numeric' }, riskRules: [{ condition: '>36 mois sans résiliation pour convenance', level: 'red', rationale: 'Enfermement long terme' }] },
    { id: 'q5', category: 'Propriété intellectuelle', question: 'Le client est-il propriétaire des développements spécifiques ?', relatedClauseTypes: ['PROPRIETE_INTELLECTUELLE'], answerFormat: { type: 'boolean' }, riskRules: [{ condition: 'Non', level: 'red', rationale: 'Client ne possède pas ce qu\'il a payé' }] },
    { id: 'q6', category: 'Données personnelles', question: 'Un DPA est-il en place ou annexé ?', relatedClauseTypes: ['DONNEES_RGPD'], answerFormat: { type: 'boolean' }, riskRules: [{ condition: 'Non, et données personnelles traitées', level: 'red', rationale: 'Non-conformité RGPD' }] }
  ]
};

const insertAsset = sqlite.prepare(`INSERT INTO reference_assets (id, type, name, description, created_by, ontology_id, jurisdiction, language, current_version, governance_status, content_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
insertAsset.run(asset1Id, 'playbook', 'Playbook commercial — Contrats fournisseurs', 'Positions de négociation pour les contrats commerciaux fournisseurs : prestation de services, distribution, licences SaaS', 'Clara Martin', 'maison', 'FR', 'fr', 2, 'validated', JSON.stringify(playbookContent));
insertAsset.run(asset2Id, 'standard', 'NDA Standard Maison — v2', 'Accord de confidentialité mutuel standard pour les discussions préliminaires', 'Clara Martin', 'maison', 'FR', 'fr', 2, 'validated', JSON.stringify(ndaStandardAssetContent));
insertAsset.run(asset3Id, 'dd_grid', 'Grille DD — M&A Standard', 'Grille de due diligence pour les opérations M&A : analyse contractuelle pré-closing', 'Clara Martin', 'maison', 'Multi', 'fr', 1, 'validated', JSON.stringify(ddGridContent));

console.log('✅ Database seeded successfully');
console.log(`   Workspace: ${wsId}`);
console.log(`   Documents: ${doc1Id}, ${doc2Id}, ${doc3Id}`);
console.log(`   Legal Objects: ${lo1Id}, ${lo2Id}, ${lo3Id}`);
console.log(`   Analyses: ${analysis1Id}, ${analysis2Id}`);
console.log(`   Reference Assets: ${asset1Id}, ${asset2Id}, ${asset3Id}`);

console.log('🔢 Indexation vectorielle des clauses du seed (peut prendre 1-3 min la première fois)...');
const allClauses = sqlite.prepare(`SELECT id, type, heading, text FROM clauses`).all() as Array<{ id: string; type: string; heading: string | null; text: string }>;
const insertEmbedding = sqlite.prepare(`
  INSERT OR REPLACE INTO clause_embeddings (clause_id, vector, model, created_at)
  VALUES (?, ?, 'multilingual-e5-small', datetime('now'))
`);
let indexed = 0;
for (const c of allClauses) {
  const textToEmbed = `[${c.type}] ${c.heading ?? ''}\n${c.text}`.trim();
  try {
    const vec = await embedPassage(textToEmbed);
    insertEmbedding.run(c.id, vectorToBuffer(vec));
    indexed++;
  } catch (err) {
    console.error(`  ✗ Échec embedding clause ${c.id}:`, err);
  }
}
console.log(`✅ ${indexed}/${allClauses.length} clauses indexées.`);
