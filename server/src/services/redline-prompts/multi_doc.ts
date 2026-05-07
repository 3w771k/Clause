interface SourceRedlineSummary {
  proposals: Array<{ originalText: string; proposedText: string; rationale: string; severity: string }>;
}

export function buildMultiDocPrompt(targetDocText: string, sourceRedline: SourceRedlineSummary | null): string {
  const proposalsBlock = sourceRedline?.proposals?.length
    ? sourceRedline.proposals.slice(0, 30).map((p, i) =>
        `${i + 1}. [${p.severity}] "${p.originalText.substring(0, 200)}" → "${p.proposedText.substring(0, 200)}"\n   raison: ${p.rationale}`,
      ).join('\n\n')
    : '(aucune décision source — produit un redline vide)';

  return `Tu transposes intelligemment une décision source à un document cible. Tu n'appliques pas aveuglément :
- Si l'équivalent textuel n'existe pas dans le doc cible, tu adaptes (rationale doit l'expliquer).
- Si le doc cible a déjà la formulation souhaitée, tu ne crées pas de proposal.

DÉCISION SOURCE (à propager) :
${proposalsBlock}

DOCUMENT CIBLE :
<document>
${targetDocText.substring(0, 10000)}
</document>

Retourne UNIQUEMENT un tableau JSON de proposals au même format (id, action, originalText, proposedText, rationale, severity).
Le rationale doit indiquer "Propagé depuis décision source — adapté au contexte de ce document."`;
}
