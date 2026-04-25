import type { ZodSchema } from 'zod';
import type { LlmGateway, LlmMessage, LlmOptions, LlmResponse } from './llm-gateway.js';

export class MockLlmProvider implements LlmGateway {
  async complete(messages: LlmMessage[], _options?: LlmOptions): Promise<LlmResponse> {
    const last = messages.findLast((m) => m.role === 'user')?.content ?? '';
    return { content: this.mockNarrative(last), usage: { inputTokens: 100, outputTokens: 200 } };
  }

  async completeStructured<T>(
    messages: LlmMessage[],
    schema: ZodSchema<T>,
    _options?: LlmOptions,
  ): Promise<T> {
    const last = messages.findLast((m) => m.role === 'user')?.content ?? '';
    const system = messages.find((m) => m.role === 'system')?.content ?? '';
    const mockJson = this.mockStructured(last, system);
    // Schema may be a passthrough (used in analysis service)
    if (typeof (schema as unknown as { parse?: unknown }).parse !== 'function') {
      return mockJson as T;
    }
    return (schema as ZodSchema<T>).parse(mockJson);
  }

  // ─── Narrative responses ─────────────────────────────────────────────────────

  private mockNarrative(prompt: string): string {
    const p = prompt.toLowerCase();

    if (p.includes('compare') || p.includes('comparer') || p.includes('comparaison') || p.includes('alignment')) {
      return `J'ai analysé les deux documents. Le NDA entrant présente **3 écarts significatifs** par rapport à votre NDA standard maison :

1. **Durée des obligations** : 2 ans dans le NDA entrant vs **5 ans** dans votre standard → écart défavorable
2. **Juridiction** : tribunaux de Londres vs **Paris** dans votre standard → à renégocier
3. **Retour/destruction** : pas d'attestation de destruction → votre standard exige une attestation écrite

J'ai généré la note comparative et le redline.`;
    }

    if (p.includes('audit') || p.includes('revue') || p.includes('revoir') || p.includes('confrontation')) {
      return `J'ai audité ce contrat par rapport à votre playbook commercial. Verdict global : **à négocier** 🟠

Points prioritaires :
1. La clause de limitation de responsabilité plafonne à **1x** le prix annuel (votre standard : 2x) → à renégocier
2. Absence de clause de non-concurrence → point ouvert
3. Clause de force majeure ne couvre pas les pandémies → à compléter

J'ai généré la note de revue.`;
    }

    if (p.includes('clausier') || p.includes('aggregation')) {
      return `J'ai constitué le clausier à partir des documents fournis. Il contient les meilleures formulations sélectionnées clause par clause.`;
    }

    return `J'ai analysé vos documents. Que souhaitez-vous faire ? Vous pouvez me demander de **comparer** des documents, d'**auditer** un contrat par rapport à un référentiel, ou de **constituer un clausier**.`;
  }

  // ─── Structured JSON responses ───────────────────────────────────────────────

  private mockStructured(prompt: string, system: string): unknown {
    const p = prompt.toLowerCase();
    const s = system.toLowerCase();

    // V2 — Intent parse for wizard NL input
    if (s.includes("interpréte des demandes") || s.includes('interprète des demandes') || s.includes('demandes en langage naturel')) {
      return this.mockParsedIntent(prompt, system);
    }

    // V2 — Refine deliverable
    if (s.includes('tu modifies un livrable') || s.includes('instruction de modification') || p.includes('instruction de modification')) {
      return this.mockRefine(prompt, system);
    }

    // NLU intent (legacy)
    if (s.includes('interpréteur') || s.includes('opération') || s.includes('operation')) {
      return this.mockIntent(p);
    }

    // Document classification
    if (s.includes('classe') || s.includes('classify')) {
      return {
        type: 'CONTRAT',
        subtype: 'NDA_MUTUEL',
        confidence: 0.95,
        reasoning: 'Document contenant des obligations mutuelles de confidentialité entre deux parties',
      };
    }

    // Legal extraction
    if (s.includes('extrais') || s.includes('extraction')) {
      return this.mockLegalExtraction();
    }

    // Alignment (comparative note)
    if (p.includes('compare') || p.includes('alignment') || p.includes('comparative')) {
      return this.mockComparativeNote(prompt);
    }

    // Confrontation (review note)
    if (p.includes('audit') || p.includes('confrontation') || p.includes('revue') || p.includes('playbook')) {
      return this.mockReviewNote(prompt);
    }

    // Redline
    if (p.includes('redline') || p.includes('suivi de modification')) {
      return this.mockRedline(prompt);
    }

    // Clausier
    if (p.includes('clausier') || p.includes('aggregation')) {
      return this.mockClausier(prompt);
    }

    return {};
  }

  /** V2 — Mock du parse intent (nouveau format pour le wizard NL). */
  private mockParsedIntent(prompt: string, _system: string): unknown {
    const p = prompt.toLowerCase();

    // Extraire les ids de documents disponibles depuis le prompt
    const docIds: string[] = [];
    const docMatches = prompt.matchAll(/- id: (doc_[a-zA-Z0-9_]+) \| nom: ([^|]+)\|/g);
    const docs: Array<{ id: string; name: string }> = [];
    for (const m of docMatches) {
      docs.push({ id: m[1], name: m[2].trim() });
      docIds.push(m[1]);
    }
    const assetIds: string[] = [];
    const assetMatches = prompt.matchAll(/- id: (ref_[a-zA-Z0-9_]+) \| type: ([^|]+)\| nom: ([^\n]+)/g);
    const assets: Array<{ id: string; type: string; name: string }> = [];
    for (const m of assetMatches) {
      assets.push({ id: m[1], type: m[2].trim(), name: m[3].trim() });
      assetIds.push(m[1]);
    }

    const findDoc = (kw: string) => docs.find(d => d.name.toLowerCase().includes(kw));
    const findAsset = (typeKw: string) => assets.find(a => a.type.toLowerCase().includes(typeKw) || a.name.toLowerCase().includes(typeKw));

    if (p.includes('compar') || p.includes(' vs ') || p.includes('aligne')) {
      const target = findDoc('acme') ?? docs[0];
      const ref = findDoc('standard') ?? docs.find(d => d.id !== target?.id) ?? null;
      return {
        operation: 'alignment',
        targetDocumentIds: target ? [target.id] : [],
        referenceDocumentId: ref?.id ?? null,
        referenceAssetId: null,
        suggestedName: target && ref ? `Comparaison ${target.name} / ${ref.name}` : 'Comparaison',
        reasoning: 'La demande mentionne une comparaison entre deux documents.',
        confidence: 'high',
        clarificationNeeded: null,
      };
    }
    if (p.includes('audit') || p.includes('revue') || p.includes('confronte') || p.includes('playbook')) {
      const target = findDoc('prestation') ?? findDoc('contrat') ?? docs[0];
      const asset = findAsset('playbook') ?? assets[0] ?? null;
      return {
        operation: 'confrontation',
        targetDocumentIds: target ? [target.id] : [],
        referenceDocumentId: null,
        referenceAssetId: asset?.id ?? null,
        suggestedName: target ? `Audit ${target.name}` : 'Audit',
        reasoning: 'La demande mentionne un audit contre un référentiel.',
        confidence: 'high',
        clarificationNeeded: null,
      };
    }
    if (p.includes('clausier') || p.includes('agréger') || p.includes('agreger')) {
      return {
        operation: 'aggregation',
        targetDocumentIds: docIds.slice(0, 3),
        referenceDocumentId: null,
        referenceAssetId: null,
        suggestedName: `Clausier ${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`,
        reasoning: 'La demande mentionne la constitution d\'un clausier.',
        confidence: 'high',
        clarificationNeeded: null,
      };
    }
    if (p.includes('échéance') || p.includes('echeance') || p.includes('renouvellement') || p.includes('préavis') || p.includes('preavis')) {
      return {
        operation: 'deadlines',
        targetDocumentIds: docIds,
        referenceDocumentId: null,
        referenceAssetId: null,
        suggestedName: 'Échéances contractuelles',
        reasoning: 'La demande porte sur les échéances et délais.',
        confidence: 'high',
        clarificationNeeded: null,
      };
    }
    if (p.includes('m&a') || p.includes('fusion') || p.includes('cession') || p.includes('changement de contrôle')) {
      return {
        operation: 'ma_mapping',
        targetDocumentIds: docIds,
        referenceDocumentId: null,
        referenceAssetId: findAsset('dd_grid')?.id ?? null,
        suggestedName: 'Cartographie M&A',
        reasoning: 'La demande mentionne une opération M&A.',
        confidence: 'high',
        clarificationNeeded: null,
      };
    }
    if (p.includes('conformité') || p.includes('conformite') || p.includes('rgpd') || p.includes('réglement') || p.includes('reglement')) {
      return {
        operation: 'compliance',
        targetDocumentIds: docIds,
        referenceDocumentId: null,
        referenceAssetId: null,
        suggestedName: 'Audit conformité',
        reasoning: 'La demande porte sur la conformité réglementaire.',
        confidence: 'high',
        clarificationNeeded: null,
      };
    }
    if (p.includes('incohérence') || p.includes('incoherence') || p.includes('divergence')) {
      return {
        operation: 'inconsistencies',
        targetDocumentIds: docIds,
        referenceDocumentId: null,
        referenceAssetId: null,
        suggestedName: `Incohérences — ${docIds.length} contrats`,
        reasoning: 'La demande porte sur des incohérences entre contrats.',
        confidence: 'high',
        clarificationNeeded: null,
      };
    }
    if (p.includes('due diligence') || p.includes('due-diligence') || p.includes(' dd ')) {
      return {
        operation: 'dd',
        targetDocumentIds: docIds,
        referenceDocumentId: null,
        referenceAssetId: findAsset('dd_grid')?.id ?? null,
        suggestedName: 'Due Diligence',
        reasoning: 'La demande porte sur une due diligence.',
        confidence: 'high',
        clarificationNeeded: null,
      };
    }

    return {
      operation: 'unclear',
      targetDocumentIds: [],
      referenceDocumentId: null,
      referenceAssetId: null,
      suggestedName: '',
      reasoning: 'La demande est trop générale pour être interprétée.',
      confidence: 'low',
      clarificationNeeded: 'Pourriez-vous préciser : voulez-vous comparer, auditer, constituer un clausier, ou autre ?',
    };
  }

  /** V2 — Mock du refine livrable : préfixe la synthèse par "[Affiné] ". */
  private mockRefine(_prompt: string, system: string): unknown {
    const m = system.match(/Structure JSON courante :\s*([\s\S]+)$/);
    if (!m) return {};
    let current: unknown;
    try {
      current = JSON.parse(m[1].trim());
    } catch {
      return {};
    }
    if (current && typeof current === 'object') {
      const c = current as Record<string, unknown>;
      const stamp = ' [Affiné par instruction utilisateur]';
      if (typeof c['summary'] === 'string') c['summary'] = `${c['summary']}${stamp}`;
      else if (typeof c['executiveSummary'] === 'string') c['executiveSummary'] = `${c['executiveSummary']}${stamp}`;
      else if (c['synthesis'] && typeof c['synthesis'] === 'object') {
        const synth = c['synthesis'] as Record<string, unknown>;
        if (typeof synth['negotiationRecommendation'] === 'string') {
          synth['negotiationRecommendation'] = `${synth['negotiationRecommendation']}${stamp}`;
        }
      }
    }
    return current;
  }

  private mockIntent(prompt: string): unknown {
    if (prompt.includes('compare') || prompt.includes('comparer') || prompt.includes('comparaison')) {
      return { operation: 'alignment', targetDocuments: [], referenceAssets: [], deliverableTypes: ['comparative_note', 'redline'], clarificationNeeded: null, confidence: 'high' };
    }
    if (prompt.includes('audit') || prompt.includes('revue') || prompt.includes('revoir') || prompt.includes('confronte')) {
      return { operation: 'confrontation', targetDocuments: [], referenceAssets: [], deliverableTypes: ['review_note'], clarificationNeeded: null, confidence: 'high' };
    }
    if (prompt.includes('clausier')) {
      return { operation: 'aggregation', targetDocuments: [], referenceAssets: [], deliverableTypes: ['clausier'], clarificationNeeded: null, confidence: 'high' };
    }
    return { operation: 'unclear', targetDocuments: [], referenceAssets: [], deliverableTypes: [], clarificationNeeded: 'Que souhaitez-vous faire ? Auditer contre un référentiel, comparer entre documents, ou extraire un clausier ?', confidence: 'low' };
  }

  private mockLegalExtraction(): unknown {
    return {
      documentType: 'CONTRAT',
      documentSubtype: 'NDA_MUTUEL',
      language: 'fr',
      overallConfidence: 'high',
      metadata: { parties: ['Partie A', 'Partie B'], date: null, duration: null, governingLaw: 'droit français' },
      clauses: [
        { id: 'mock_cl_1', type: 'DEFINITION_IC', heading: 'Définitions', sequenceNumber: '1', text: 'On entend par Information Confidentielle toute information communiquée entre les Parties.', attributes: {}, confidence: 'high', linkedDefinedTerms: [] },
        { id: 'mock_cl_2', type: 'OBLIGATIONS_CONFIDENTIALITE', heading: 'Obligations de confidentialité', sequenceNumber: '2', text: 'Chaque Partie s\'engage à maintenir la confidentialité des Informations Confidentielles reçues.', attributes: {}, confidence: 'high', linkedDefinedTerms: [] },
        { id: 'mock_cl_3', type: 'DUREE_CONFIDENTIALITE', heading: 'Durée', sequenceNumber: '3', text: 'Le présent Accord est conclu pour une durée de 3 ans.', attributes: { duration_years: 3 }, confidence: 'high', linkedDefinedTerms: [] },
      ],
      definedTerms: [
        { id: 'mock_dt_1', term: 'Information Confidentielle', definition: 'Toute information communiquée entre les Parties dans le cadre du présent Accord.', confidence: 'high' },
      ],
    };
  }

  private mockComparativeNote(prompt: string): unknown {
    const docAId = this.extractId(prompt, 'document cible') ?? 'doc_target';
    const docBId = this.extractId(prompt, 'document référence') ?? 'doc_reference';
    return {
      type: 'comparative_note',
      synthesis: {
        overallGapLevel: 'significant',
        topGaps: [
          'Durée des obligations de confidentialité : 2 ans vs 5 ans',
          'Juridiction : Londres vs Paris',
          'Attestation de destruction non prévue',
        ],
        negotiationRecommendation: 'Ce document est acceptable sous réserve de 3 modifications prioritaires : (1) aligner la durée à 5 ans, (2) obtenir une juridiction parisienne, (3) exiger une attestation écrite de destruction.',
      },
      clauseComparison: [
        { clauseType: 'DEFINITION_IC', documentA: { text: 'Toute information communiquée sous quelque forme que ce soit', citation: null }, documentB: { text: 'Toute information de nature technique, commerciale ou financière', citation: null }, gap: 'equivalent', commentary: 'Définitions larges et équivalentes.' },
        { clauseType: 'DUREE_CONFIDENTIALITE', documentA: { text: '2 ans à compter de la signature', citation: null }, documentB: { text: '5 ans à compter de la signature', citation: null }, gap: 'unfavorable', commentary: 'Écart significatif : 2 ans vs 5 ans. À renégocier impérativement.' },
        { clauseType: 'LOI_APPLICABLE', documentA: { text: 'Droit anglais', citation: null }, documentB: { text: 'Droit français', citation: null }, gap: 'substantive', commentary: 'Le droit anglais est moins familier et potentiellement moins favorable. À négocier.' },
        { clauseType: 'JURIDICTION', documentA: { text: 'Tribunaux de Londres (Royaume-Uni)', citation: null }, documentB: { text: 'Tribunaux de Paris (France)', citation: null }, gap: 'unfavorable', commentary: 'Juridiction étrangère coûteuse. À renégocier : Paris ou arbitrage CCI Paris.' },
      ],
      onlyInA: [],
      onlyInB: [],
      pointByPointRecommendations: [
        'Négocier la durée des obligations à 5 ans minimum',
        'Refuser le droit anglais — exiger le droit français',
        'Refuser la juridiction de Londres — exiger Paris ou arbitrage CCI',
        'Ajouter une attestation de destruction',
      ],
      annexCitations: [],
    };
  }

  private mockRedline(_prompt: string): unknown {
    return {
      type: 'redline',
      targetDocumentId: 'mock_target',
      baseHtml: `<h2>Article 4 — Durée</h2>
<p>Le présent Accord est conclu pour une durée de <span class="del" data-change-id="m1">deux (2)</span><span class="ins" data-change-id="m1">cinq (5)</span> ans à compter de sa date de signature.</p>
<h2>Article 7 — Droit applicable</h2>
<p>Le présent Accord est soumis au <span class="del" data-change-id="m2">droit anglais</span><span class="ins" data-change-id="m2">droit français</span>. Les litiges seront soumis à la compétence des tribunaux de <span class="del" data-change-id="m3">Londres</span><span class="ins" data-change-id="m3">Paris</span>.</p>`,
      changes: [
        { id: 'm1', type: 'replacement', originalText: 'deux (2)', newText: 'cinq (5)', location: { startOffset: 0, endOffset: 8 }, clauseContext: 'Article 4 — Durée', rationale: 'Durée insuffisante (2 ans). Standard maison : 5 ans minimum.', referenceSource: 'NDA Standard Maison v2 — Art. 4', status: 'pending' },
        { id: 'm2', type: 'replacement', originalText: 'droit anglais', newText: 'droit français', location: { startOffset: 0, endOffset: 13 }, clauseContext: 'Article 7 — Loi applicable', rationale: 'Droit anglais défavorable post-Brexit.', referenceSource: 'NDA Standard Maison v2 — Art. 6', status: 'pending' },
        { id: 'm3', type: 'replacement', originalText: 'Londres', newText: 'Paris', location: { startOffset: 0, endOffset: 7 }, clauseContext: 'Article 7 — Juridiction', rationale: 'Juridiction étrangère coûteuse.', referenceSource: 'NDA Standard Maison v2 — Art. 6', status: 'pending' },
      ],
      comments: [],
    };
  }

  private mockReviewNote(_prompt: string): unknown {
    return {
      type: 'review_note',
      summary: 'Contrat à renégocier : 2 points bloquants identifiés par rapport au playbook.',
      contractDocumentId: 'mock_contract',
      referenceAssetId: 'mock_playbook',
      globalVerdict: 'a_negocier',
      priorityPoints: [
        'Cap de responsabilité insuffisant (1x vs 2x requis)',
        'Clause de force majeure incomplète',
      ],
      sections: [
        { clauseType: 'LIMITATION_RESPONSABILITE', clauseLabel: 'Limitation de responsabilité', contractText: 'La responsabilité totale de chaque partie est limitée à 1x le prix annuel du contrat.', playbookRequirement: 'Cap à 2x le prix annuel minimum. Carve-outs pour faute lourde, IP, RGPD.', gapLevel: 'major', comment: 'Cap insuffisant. Le standard exige 2x. Renégocier.', suggestedLanguage: 'La responsabilité totale est limitée à deux (2) fois le montant hors taxe des sommes versées au cours des 12 derniers mois.' },
        { clauseType: 'FORCE_MAJEURE', clauseLabel: 'Force majeure', contractText: 'Cas de force majeure : guerre, catastrophe naturelle, grève générale.', playbookRequirement: 'Inclure : pandémie, cyberattaque, défaillance opérateur télécoms.', gapLevel: 'minor', comment: 'Liste des cas de force majeure incomplète. Ajouter pandémie et cyberattaque.', suggestedLanguage: null },
        { clauseType: 'PROPRIETE_INTELLECTUELLE', clauseLabel: 'Propriété intellectuelle', contractText: 'Les développements spécifiques appartiennent au Client.', playbookRequirement: 'IP des développements spécifiques au client. IP de base reste au prestataire.', gapLevel: 'none', comment: 'Conforme au playbook.', suggestedLanguage: null },
      ],
    };
  }

  private mockClausier(_prompt: string): unknown {
    return {
      type: 'clausier',
      title: 'Clausier NDA — Sélection des meilleures formulations',
      scope: 'Accords de confidentialité (NDA mutuels et unilatéraux)',
      createdFromDocumentIds: [],
      entries: [
        { clauseType: 'DEFINITION_IC', clauseLabel: 'Définition des Informations Confidentielles', bestVersion: 'On entend par « Information Confidentielle » toute information de nature technique, commerciale, financière, stratégique ou autre, communiquée par une Partie à l\'autre, sous quelque forme que ce soit (écrite, orale, électronique, visuelle ou autre), y compris lors de visites de site.', sourceDocumentId: 'doc_nda_standard', sourceDocumentName: 'NDA Standard Maison v2', alternativeVersions: [], notes: 'Formulation large recommandée pour une protection maximale.' },
        { clauseType: 'DUREE_CONFIDENTIALITE', clauseLabel: 'Durée des obligations de confidentialité', bestVersion: 'Le présent Accord est conclu pour une durée de cinq (5) ans. Les obligations de confidentialité demeureront en vigueur pendant une période de cinq (5) ans suivant l\'expiration ou la résiliation du présent Accord.', sourceDocumentId: 'doc_nda_standard', sourceDocumentName: 'NDA Standard Maison v2', alternativeVersions: [{ text: 'Durée de 2 ans (formulation courte).', sourceDocumentId: 'doc_nda_acme' }], notes: '5 ans recommandé pour les accords stratégiques.' },
      ],
    };
  }

  private extractId(prompt: string, label: string): string | null {
    const match = prompt.match(new RegExp(`${label}[^(]*\\(([^)]+)\\)`));
    return match?.[1] ?? null;
  }
}
