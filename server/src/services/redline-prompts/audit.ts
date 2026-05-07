import type { PlaybookContent } from '../../schemas/asset-content.schema.js';

export function buildAuditPrompt(docText: string, playbook?: PlaybookContent): string {
  const playbookBlock = playbook?.requirements?.length
    ? playbook.requirements.map(r =>
        `- [${r.id}] ${r.criticality.toUpperCase()} — ${r.title}\n  Règle: ${r.ruleText}${r.expectedValue ? `\n  Attendu: ${r.expectedValue}` : ''}`,
      ).join('\n\n')
    : '(aucune exigence playbook fournie)';

  return `Tu es senior legal counsel. Tu produis un redline d'audit du document ci-dessous au regard du playbook.

PLAYBOOK (exigences à vérifier) :
${playbookBlock}

DOCUMENT :
<document>
${docText.substring(0, 12000)}
</document>

Pour chaque exigence du playbook, identifie où elle s'applique dans le document et propose une modification si écart.
Retourne UNIQUEMENT un tableau JSON de proposals avec ces champs :
- id (string unique format "rdl_XXXX")
- action ("insert"|"delete"|"replace"|"comment")
- originalText (extrait verbatim du document, "" pour insert)
- proposedText (texte proposé, "" pour delete)
- rationale (1-2 phrases en français, justification)
- severity ("critical"|"major"|"minor"|"info")
- deviatesFromElementId (id de l'exigence playbook source, ex: "${playbook?.requirements?.[0]?.id ?? 'req_xxx'}")

Pas d'objet wrapper, juste le tableau JSON.`;
}
