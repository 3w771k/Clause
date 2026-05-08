import type { PlaybookContent } from '../../schemas/asset-content.schema.js';

interface LegacyPlaybookSection {
  id?: string;
  clauseType?: string;
  stakes?: string;
  positions?: {
    ideal?: { description?: string };
    fallback?: { description?: string };
    redFlag?: { description?: string };
  };
  negotiationGuidance?: string;
}

// Accepte playbook typé (Brief 6, requirements[]) OU playbook legacy (sections[])
type AnyPlaybook = PlaybookContent | { sections?: LegacyPlaybookSection[] } | undefined;

function normalizeToRequirements(pb: AnyPlaybook): Array<{ id: string; title: string; rule: string; criticality: string }> {
  if (!pb) return [];
  if ('requirements' in pb && Array.isArray(pb.requirements)) {
    return pb.requirements.map(r => ({
      id: r.id, title: r.title, rule: r.ruleText, criticality: r.criticality,
    }));
  }
  if ('sections' in pb && Array.isArray(pb.sections)) {
    return pb.sections.map((s, i) => {
      const ideal = s.positions?.ideal?.description ?? '';
      const fallback = s.positions?.fallback?.description ?? '';
      const redFlag = s.positions?.redFlag?.description ?? '';
      const rule = [
        ideal && `Idéal : ${ideal}`,
        fallback && `Repli acceptable : ${fallback}`,
        redFlag && `Red flag (à refuser) : ${redFlag}`,
      ].filter(Boolean).join('\n  ');
      return {
        id: s.id ?? `req_${i}`,
        title: s.clauseType ?? `Exigence ${i + 1}`,
        rule: rule || (s.stakes ?? ''),
        criticality: 'major',
      };
    });
  }
  return [];
}

export function buildAuditPrompt(docText: string, playbook?: AnyPlaybook): string {
  const reqs = normalizeToRequirements(playbook);
  const playbookBlock = reqs.length
    ? reqs.map(r =>
        `- ID: ${r.id} | Criticité: ${r.criticality.toUpperCase()} | ${r.title}\n  ${r.rule}`,
      ).join('\n\n')
    : '(aucune exigence playbook fournie — analyse libre des risques contractuels classiques)';

  return `Tu es un avocat senior qui audit un contrat au regard d'un playbook d'exigences.

PLAYBOOK :
${playbookBlock}

DOCUMENT À AUDITER :
<document>
${docText.substring(0, 12000)}
</document>

INSTRUCTIONS :
- Pour chaque exigence du playbook, identifie le passage du document concerné et propose une modification si écart.
- Si aucune exigence n'est fournie, identifie les risques contractuels classiques (responsabilité, résiliation, IP, paiement, données personnelles, durée).
- Réponds dans la langue du DOCUMENT. Le rationale doit être en français si playbook FR, sinon dans la langue du doc.
- originalText doit être un extrait VERBATIM du document (langue d'origine).

FORMAT — réponds UNIQUEMENT avec un tableau JSON valide, pas de wrapper, pas de markdown :
[
  {
    "id": "rdl_001",
    "action": "replace",
    "originalText": "extrait verbatim du document",
    "proposedText": "texte proposé en remplacement",
    "rationale": "Justification courte (1-2 phrases).",
    "severity": "critical",
    "deviatesFromElementId": "${reqs[0]?.id ?? 'req_xxx'}"
  }
]

Valeurs autorisées :
- action : "insert" | "delete" | "replace" | "comment"
- severity : "critical" | "major" | "minor" | "info"
- originalText : "" pour insert
- proposedText : "" pour delete

Vise 5-15 propositions ciblées. Si tu ne trouves rien d'amendable, retourne au moins 3 propositions de "comment" pour signaler les points d'attention.`;
}
