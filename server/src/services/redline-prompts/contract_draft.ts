import type { StandardContent } from '../../schemas/asset-content.schema.js';

export function buildContractDraftPrompt(standard: StandardContent, contextNotes: string): string {
  const sections = (standard.sections ?? []).map(s => {
    const clauses = (s.clauses ?? []).map(c =>
      `  [${c.id}] (${c.clauseTypeOntologyId})\n  ${c.text}`,
    ).join('\n\n');
    return `## ${s.heading} (id=${s.id})\n${clauses}`;
  }).join('\n\n');

  return `Tu es legal counsel. Tu rédiges un contrat à partir du STANDARD et du CONTEXTE projet.

STANDARD (${standard.documentType}) :
${sections}

CONTEXTE projet :
${contextNotes || '(aucun contexte fourni — rédige une version générique)'}

Génère le contrat sous forme d'un redline depuis le standard. Le baseTextSnapshot sera le standard concaténé.
Pour chaque clause adaptée au contexte, produit une proposal :
- action "replace" si la clause est modifiée par rapport au standard
- action "insert" si tu ajoutes une clause spécifique au contexte
- action "delete" si tu retires une clause non pertinente
- deviatesFromElementId = id de la clause du standard (ex: "${standard.sections?.[0]?.clauses?.[0]?.id ?? 'clause_xxx'}")
- rationale en français explique pourquoi l'adaptation au contexte

Retourne UNIQUEMENT un tableau JSON de proposals.`;
}
