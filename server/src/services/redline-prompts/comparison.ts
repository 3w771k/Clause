export function buildComparisonPrompt(docText: string, refText: string): string {
  return `Tu es un avocat senior qui produit un redline transformant le DOCUMENT vers la RÉFÉRENCE.

RÉFÉRENCE (texte cible) :
<reference>
${refText.substring(0, 6000)}
</reference>

DOCUMENT (à modifier) :
<document>
${docText.substring(0, 6000)}
</document>

INSTRUCTIONS :
Identifie les divergences entre DOCUMENT et RÉFÉRENCE et produis des propositions de modification pour aligner DOCUMENT sur RÉFÉRENCE.
Couvre : clauses manquantes, formulations différentes, ordres ou enjeux divergents.

FORMAT DE SORTIE — réponds UNIQUEMENT avec un tableau JSON valide, pas de wrapper, pas de markdown :
[
  {
    "id": "rdl_001",
    "action": "replace",
    "originalText": "extrait verbatim du DOCUMENT",
    "proposedText": "texte issu de la RÉFÉRENCE ou amélioré",
    "rationale": "Justification courte en français (1-2 phrases).",
    "severity": "major"
  }
]

Valeurs autorisées :
- action : "insert" | "delete" | "replace" | "comment"
- severity : "critical" | "major" | "minor" | "info"
- originalText : "" pour insert
- proposedText : "" pour delete

Vise 5-15 propositions ciblées sur les vraies divergences. Pas de proposals cosmétiques.`;
}
