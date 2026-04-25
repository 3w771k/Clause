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

    // NLU intent
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
