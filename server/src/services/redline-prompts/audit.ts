import type { PlaybookContent } from '../../schemas/asset-content.schema.js';

export function buildAuditPrompt(docText: string, playbook?: PlaybookContent): string {
  const playbookBlock = playbook?.requirements?.length
    ? playbook.requirements.map(r =>
        `- ID: ${r.id} | Criticité: ${r.criticality.toUpperCase()} | Titre: ${r.title}\n  Règle: ${r.ruleText}${r.expectedValue ? `\n  Valeur attendue: ${r.expectedValue}` : ''}`,
      ).join('\n\n')
    : '(aucune exigence playbook fournie — analyse libre)';

  return `Tu es un avocat senior qui audit un contrat au regard d'un playbook d'exigences.

PLAYBOOK :
${playbookBlock}

DOCUMENT À AUDITER :
<document>
${docText.substring(0, 12000)}
</document>

INSTRUCTIONS :
Pour chaque exigence du playbook, identifie le passage du document concerné et propose une modification si écart.
Si aucune exigence n'est fournie, identifie les risques contractuels classiques (responsabilité, résiliation, IP, paiement, données personnelles).

FORMAT DE SORTIE — réponds UNIQUEMENT avec un tableau JSON valide, pas de wrapper, pas de markdown :
[
  {
    "id": "rdl_001",
    "action": "replace",
    "originalText": "extrait verbatim du document à modifier",
    "proposedText": "texte proposé en remplacement",
    "rationale": "Justification courte en français (1-2 phrases).",
    "severity": "critical",
    "deviatesFromElementId": "id_de_l_exigence_playbook_si_applicable"
  }
]

Valeurs autorisées :
- action : "insert" | "delete" | "replace" | "comment"
- severity : "critical" | "major" | "minor" | "info"
- originalText : "" pour insert
- proposedText : "" pour delete

Vise 5-15 propositions, ciblées sur les écarts réels. Pas de propositions cosmétiques.`;
}
